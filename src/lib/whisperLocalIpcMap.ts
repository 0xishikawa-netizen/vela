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
    }

export interface WhisperLocalProgressIpcPayload {
  runId: string
  /** 0〜1。stderr の厳密 parse は未実装（main の TODO） */
  progress: number
  detail?: string
}

/** stderr チャンク数から仮の進捗（将来: whisper.cpp の行 parse に置換） */
export function whisperLocalProgressFromStreamChunks(chunkCount: number): number {
  if (chunkCount <= 0) return 0.1
  return Math.min(0.92, 0.12 + chunkCount * 0.04)
}

export function mapWhisperLocalIpcFinishedToEngineFields(
  finished: WhisperLocalIpcFinished,
): {
  segments: SubtitleSegment[]
  errorMessage?: string
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
  return { segments: [], errorMessage: finished.errorMessage }
}

/** main の exit: userCanceled または SIGTERM でキャンセル扱い */
export function whisperLocalExitLooksCanceled(userCanceled: boolean, signal: NodeJS.Signals | null): boolean {
  if (userCanceled) return true
  return signal === 'SIGTERM'
}
