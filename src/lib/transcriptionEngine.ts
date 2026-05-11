/**
 * 文字起こしエンジンの共通 I/F。mock は実装済み。`whisper-local` は後続（whisper.cpp / faster-whisper / 同梱バイナリ等）。
 */

import { buildMockTranscriptionSegments, validateTranscriptionSourcePath } from './mockTranscription'
import {
  WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED,
  validateWhisperLocalConfig,
  type WhisperLocalRunnerConfig,
} from './whisperLocalRunner'
import type { SubtitleSegment, TranscriptionEngineId, TranscriptionJobStatus, TranscriptionOptions } from './types'

export type { TranscriptionEngineId } from './types'

export interface TranscriptionEngineRequest {
  sourceMediaPath: string
  options: TranscriptionOptions
  maxDurationSec?: number
}

export interface TranscriptionEngineResult {
  segments: SubtitleSegment[]
  language?: string
  /** 推論が把握した尺（mock では概算） */
  durationSec?: number
  /** リクエスト不正・エンジン失敗時 */
  errorMessage?: string
  /** ユーザー取消で resolve した場合 */
  canceled?: boolean
}

export interface TranscriptionProgressEvent {
  progress: number
  status: TranscriptionJobStatus
  /** デバッグ用メッセージ（任意） */
  detail?: string
}

export interface TranscriptionEngineRunDeps {
  makeId: () => string
  /** 将来: ユーザー設定・preload 経由。未設定時は whisper-local は検証で失敗 */
  whisperLocalConfig?: WhisperLocalRunnerConfig
}

export interface TranscriptionEngineRunHandle {
  cancel(): void
  finished: Promise<TranscriptionEngineResult>
}

/**
 * Phase E-4: mock エンジン。タイマーで `queued` → `running` → `completed` を模し、純粋関数 `buildMockTranscriptionSegments` で結果を生成。
 */
export function runMockTranscriptionEngine(
  request: TranscriptionEngineRequest,
  onProgress: (e: TranscriptionProgressEvent) => void,
  deps: TranscriptionEngineRunDeps,
): TranscriptionEngineRunHandle {
  const invalid = validateTranscriptionSourcePath(request.sourceMediaPath)
  if (!invalid.ok) {
    return {
      cancel: () => {},
      finished: Promise.resolve({
        segments: [],
        errorMessage: invalid.reason,
      }),
    }
  }

  let canceled = false
  let settled = false
  const timeouts: ReturnType<typeof setTimeout>[] = []
  let finish: ((v: TranscriptionEngineResult) => void) | undefined

  const tryResolve = (result: TranscriptionEngineResult): void => {
    if (settled) return
    settled = true
    for (const t of timeouts) clearTimeout(t)
    timeouts.length = 0
    finish?.(result)
  }

  const cancel = (): void => {
    canceled = true
    tryResolve({ segments: [], canceled: true })
  }

  const finished = new Promise<TranscriptionEngineResult>((resolve) => {
    finish = resolve

    const schedule = (delayMs: number, fn: () => void): void => {
      const id = setTimeout(fn, delayMs)
      timeouts.push(id)
    }

    schedule(0, () => {
      if (settled) return
      if (canceled) {
        tryResolve({ segments: [], canceled: true })
        return
      }
      onProgress({ progress: 0.18, status: 'running' })
    })
    schedule(70, () => {
      if (settled || canceled) return
      onProgress({ progress: 0.52, status: 'running' })
    })
    schedule(150, () => {
      if (settled || canceled) return
      onProgress({ progress: 0.82, status: 'running' })
    })
    schedule(260, () => {
      if (settled) return
      if (canceled) {
        tryResolve({ segments: [], canceled: true })
        return
      }
      const segments = buildMockTranscriptionSegments(
        request.maxDurationSec,
        request.options,
        request.sourceMediaPath,
        deps.makeId,
      )
      onProgress({ progress: 1, status: 'completed' })
      const cap = request.maxDurationSec
      tryResolve({
        segments,
        language: request.options.language,
        durationSec: typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : undefined,
      })
    })
  })

  return { cancel, finished }
}

/**
 * ローカル Whisper（Phase E-5 skeleton）。設定・main IPC・spawn は未接続。
 * 将来: `deps.whisperLocalConfig` + main `spawn` の結果をここで Promise 化する。
 */
export function runWhisperLocalTranscriptionEngine(
  request: TranscriptionEngineRequest,
  onProgress: (e: TranscriptionProgressEvent) => void,
  deps: TranscriptionEngineRunDeps,
): TranscriptionEngineRunHandle {
  const pathCheck = validateTranscriptionSourcePath(request.sourceMediaPath)
  if (!pathCheck.ok) {
    return {
      cancel: () => {},
      finished: Promise.resolve({ segments: [], errorMessage: pathCheck.reason }),
    }
  }

  onProgress({ progress: 0, status: 'running' })

  const cfg = deps.whisperLocalConfig ?? {}
  const v = validateWhisperLocalConfig(cfg)
  if (!v.ok) {
    return {
      cancel: () => {},
      finished: Promise.resolve({
        segments: [],
        errorMessage: `${v.reason} ローカル Whisper は準備中です。`,
      }),
    }
  }

  return {
    cancel: () => {},
    finished: Promise.resolve({
      segments: [],
      errorMessage: WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED,
    }),
  }
}

/** エンジン ID に応じた runner（UI / store は当面 `mock` のみ） */
export function runTranscriptionEngine(
  engineId: TranscriptionEngineId,
  request: TranscriptionEngineRequest,
  onProgress: (e: TranscriptionProgressEvent) => void,
  deps: TranscriptionEngineRunDeps,
): TranscriptionEngineRunHandle {
  if (engineId === 'whisper-local') {
    return runWhisperLocalTranscriptionEngine(request, onProgress, deps)
  }
  return runMockTranscriptionEngine(request, onProgress, deps)
}

/** 字幕トラック名（mock / 将来エンジン共通の既定） */
export function transcriptionTrackNameFromSourcePath(sourceMediaPath: string, engineId: TranscriptionEngineId): string {
  const base = sourceMediaPath.split(/[/\\]/).pop()?.trim() || 'media'
  if (engineId === 'mock') return `文字起こし: ${base} (mock)`
  return `文字起こし: ${base}`
}
