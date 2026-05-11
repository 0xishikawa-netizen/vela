/**
 * Whisper 前の mock 文字起こし（純粋関数）。実推論・モデル読み込みは行わない。
 */

import { sanitizeSubtitleSegment } from './subtitleFormat'
import type { SubtitleSegment, TranscriptionJob, TranscriptionJobStatus, TranscriptionOptions } from './types'

export function validateTranscriptionSourcePath(path: string): { ok: true } | { ok: false; reason: string } {
  const t = typeof path === 'string' ? path.trim() : ''
  if (!t) return { ok: false, reason: 'メディアパスが空です' }
  return { ok: true }
}

export function isTranscriptionJobTerminal(status: TranscriptionJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled'
}

/** パスから 1〜3 を決定的に選択（同一パスは同じ本数） */
export function mockTranscriptionSegmentCountFromPath(path: string): 1 | 2 | 3 {
  const s = path.trim()
  if (!s) return 1
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  const m = (Math.abs(h) % 3) + 1
  return m as 1 | 2 | 3
}

/** タイムライン尺が取れないときの mock 上限（秒） */
export const MOCK_TRANSCRIPTION_DEFAULT_CAP_SEC = 6

export function transcriptionMockTimelineCapSec(maxDurationSec: number | undefined): number {
  if (typeof maxDurationSec === 'number' && Number.isFinite(maxDurationSec) && maxDurationSec > 0.2) {
    return Math.min(Math.max(maxDurationSec, 0.2), 86400 * 7)
  }
  return MOCK_TRANSCRIPTION_DEFAULT_CAP_SEC
}

export function buildMockTranscriptionSegments(
  maxDurationSec: number | undefined,
  options: TranscriptionOptions,
  pathForDeterminism: string,
  makeId: () => string,
): SubtitleSegment[] {
  const cap = transcriptionMockTimelineCapSec(maxDurationSec)
  const n = mockTranscriptionSegmentCountFromPath(pathForDeterminism)
  const prefix = options.translateToJapanese ? '[mock 仮訳] ' : '[mock] '
  const langNote = options.language?.trim() ? ` (${options.language})` : ''
  const bodies = [
    `${prefix}こんにちは。${langNote}`,
    `${prefix}これは文字起こしのモック結果です。`,
    `${prefix}Whisper 実装は後続フェーズです。`,
  ]
  const slot = Math.max((cap - 0.12) / n, 0.15)
  const out: SubtitleSegment[] = []
  for (let i = 0; i < n; i++) {
    const startSec = Math.min(cap - 0.08, i * slot)
    let endSec = Math.min(cap, startSec + slot * 0.92)
    if (endSec <= startSec) endSec = Math.min(cap, startSec + 0.12)
    const raw: SubtitleSegment = {
      id: makeId(),
      startSec,
      endSec,
      text: bodies[i % bodies.length] ?? `${prefix}segment ${i + 1}`,
      confidence: 0.42 + i * 0.01,
    }
    out.push(sanitizeSubtitleSegment(raw))
  }
  return out
}

export function applyTranscriptionCancel(job: TranscriptionJob, nowIso: string): TranscriptionJob {
  if (isTranscriptionJobTerminal(job.status)) return job
  return {
    ...job,
    status: 'canceled',
    progress: job.progress,
    updatedAt: nowIso,
    errorMessage: undefined,
  }
}

/** テスト用: mock 進捗ステップから progress を得る */
export function mockTranscriptionProgressForStep(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 0) return 1
  return Math.min(1, Math.max(0, (stepIndex + 1) / totalSteps))
}
