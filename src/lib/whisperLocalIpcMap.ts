/**
 * Whisper local main IPC の結果・進捗を engine / UI 向けにマッピングする純粋ヘルパー（Phase E-7）。
 */

import type { SubtitleSegment } from './types'

export type WhisperLocalIpcFailureKind =
  | 'validation'
  | 'busy'
  | 'spawn'
  | 'process'
  | 'read_output'
  | 'parse'
  | 'canceled'

export type WhisperLocalIpcFinished =
  | {
      ok: true
      runId: string
      exitCode: number
      segments: SubtitleSegment[]
      language?: string
      durationSec?: number
      rawOutputKind?: 'json' | 'srt' | 'vtt'
    }
  | {
      ok: false
      runId: string
      kind: WhisperLocalIpcFailureKind
      errorMessage: string
      exitCode?: number
      /** デバッグ用: 直近 2KB の stderr（GUIログビューアで表示） */
      stderrTail?: string
    }

export interface WhisperLocalProgressIpcPayload {
  runId: string
  /** 0〜1 */
  progress: number
  detail?: string
}

/**
 * whisper.cpp stderr の行から進捗パーセントを抽出する。
 * 対応パターン:
 *   - `whisper_print_progress_callback: progress = 42 %`
 *   - `progress = 42%`
 *   - `[42%]`  など
 * 該当しない場合は undefined。
 */
export function parseWhisperProgressFromStderrLine(line: string): number | undefined {
  const patterns = [
    /progress\s*=\s*(\d+)\s*%/i,
    /\[(\d+)%\]/,
    /(\d+)\s*%\s*done/i,
  ]
  for (const re of patterns) {
    const m = re.exec(line)
    if (m) {
      const pct = parseInt(m[1]!, 10)
      if (pct >= 0 && pct <= 100) return pct / 100
    }
  }
  return undefined
}

/**
 * stderr バッファ末尾から最新の進捗値を取得する。
 * パース成功時は 0.1〜0.99 の範囲で返す（完了は IPC finished で 1.0 にする）。
 * パース失敗時はチャンク数ベースのフォールバック値を返す。
 */
export function whisperLocalProgressFromStderr(stderrBuf: string, chunkCount: number): number {
  const lines = stderrBuf.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = parseWhisperProgressFromStderrLine(lines[i] ?? '')
    if (p !== undefined) {
      return Math.max(0.1, Math.min(0.99, p))
    }
  }
  return whisperLocalProgressFromStreamChunks(chunkCount)
}

/** stderr チャンク数から仮の進捗（whisper.cpp stderr parse に失敗した場合のフォールバック） */
export function whisperLocalProgressFromStreamChunks(chunkCount: number): number {
  if (chunkCount <= 0) return 0.1
  return Math.min(0.92, 0.12 + chunkCount * 0.04)
}

export function mapWhisperLocalIpcFinishedToEngineFields(
  finished: WhisperLocalIpcFinished,
): {
  segments: SubtitleSegment[]
  errorMessage?: string
  stderrTail?: string
  canceled?: boolean
  language?: string
  durationSec?: number
  rawOutputKind?: 'json' | 'srt' | 'vtt'
} {
  if (finished.ok) {
    return {
      segments: finished.segments,
      language: finished.language,
      durationSec: finished.durationSec,
      rawOutputKind: finished.rawOutputKind,
    }
  }
  if (finished.kind === 'canceled') return { segments: [], canceled: true }
  return { segments: [], errorMessage: finished.errorMessage, stderrTail: finished.stderrTail }
}

/** main の exit: userCanceled または SIGTERM でキャンセル扱い */
export function whisperLocalExitLooksCanceled(userCanceled: boolean, signal: NodeJS.Signals | null): boolean {
  if (userCanceled) return true
  return signal === 'SIGTERM'
}
