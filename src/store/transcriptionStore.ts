import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TranscriptionEngineId, TranscriptionJob, TranscriptionOptions } from '../lib/types'
import { validateTranscriptionSourcePath } from '../lib/mockTranscription'
import { runTranscriptionEngine } from '../lib/transcriptionEngine'
import { settingsToRunnerConfig } from '../lib/whisperLocalSettings'
import { useWhisperLocalSettingsStore } from './whisperLocalSettingsStore'

const jobRunCancels = new Map<string, () => void>()

function registerJobCancel(jobId: string, cancel: () => void): void {
  jobRunCancels.set(jobId, cancel)
}

function unregisterJobCancel(jobId: string): void {
  jobRunCancels.delete(jobId)
}

function clearAllJobCancels(): void {
  for (const [, cancel] of jobRunCancels) cancel()
  jobRunCancels.clear()
}

function isoNow(): string {
  return new Date().toISOString()
}

interface TranscriptionStore {
  jobs: TranscriptionJob[]

  startTranscription: (
    engineId: TranscriptionEngineId,
    sourceMediaPath: string,
    options: TranscriptionOptions,
    meta?: { maxDurationSec?: number },
  ) => string
  startMockTranscription: (
    sourceMediaPath: string,
    options: TranscriptionOptions,
    meta?: { maxDurationSec?: number },
  ) => string
  cancelTranscription: (jobId: string) => void
  clearTranscriptionJobs: () => void
}

function patchJob(jobs: TranscriptionJob[], jobId: string, patch: Partial<TranscriptionJob>): TranscriptionJob[] {
  return jobs.map((j) => (j.id === jobId ? { ...j, ...patch, updatedAt: isoNow() } : j))
}

export const useTranscriptionStore = create<TranscriptionStore>((set, get) => ({
  jobs: [],

  startMockTranscription: (sourceMediaPath, options, meta) =>
    get().startTranscription('mock', sourceMediaPath, options, meta),

  startTranscription: (engineId, sourceMediaPath, options, meta) => {
    const jobId = uuid()
    const now = isoNow()

    const invalid = validateTranscriptionSourcePath(sourceMediaPath)
    if (!invalid.ok) {
      set((s) => ({
        jobs: [
          ...s.jobs,
          {
            id: jobId,
            sourceMediaPath: sourceMediaPath.trim(),
            status: 'failed',
            progress: 0,
            language: options.language,
            options,
            createdAt: now,
            updatedAt: now,
            errorMessage: invalid.reason,
            engine: engineId,
          },
        ],
      }))
      return jobId
    }

    const trimmed = sourceMediaPath.trim()
    const job: TranscriptionJob = {
      id: jobId,
      sourceMediaPath: trimmed,
      status: 'queued',
      progress: 0,
      language: options.language,
      options,
      createdAt: now,
      updatedAt: now,
      engine: engineId,
    }
    set((s) => ({ jobs: [...s.jobs, job] }))

    const wBase = settingsToRunnerConfig(useWhisperLocalSettingsStore.getState().settings)
    const whisperLocalConfig =
      engineId === 'whisper-local'
        ? {
            ...wBase,
            language: options.language?.trim() || wBase.language,
            translateToJapanese: options.translateToJapanese === true,
          }
        : undefined

    const handle = runTranscriptionEngine(
      engineId,
      { sourceMediaPath: trimmed, options, maxDurationSec: meta?.maxDurationSec },
      (ev) => {
        const cur = get().jobs.find((j) => j.id === jobId)
        if (!cur || cur.status === 'canceled') return
        set((s) => ({
          jobs: patchJob(s.jobs, jobId, {
            status: ev.status,
            progress: ev.progress,
          }),
        }))
      },
      { makeId: () => uuid(), whisperLocalConfig },
    )

    registerJobCancel(jobId, handle.cancel)

    void handle.finished.then((result) => {
      unregisterJobCancel(jobId)
      const cur = get().jobs.find((j) => j.id === jobId)
      if (!cur || cur.status === 'canceled') return

      if (result.errorMessage) {
        set((s) => ({
          jobs: patchJob(s.jobs, jobId, {
            status: 'failed',
            progress: 0,
            errorMessage: result.errorMessage,
            stderrTail: result.stderrTail,
            resultSegments: undefined,
            resultRawOutputKind: undefined,
          }),
        }))
        return
      }

      if (result.canceled) {
        set((s) => ({
          jobs: patchJob(s.jobs, jobId, {
            status: 'canceled',
            progress: cur.progress,
          }),
        }))
        return
      }

      set((s) => ({
        jobs: patchJob(s.jobs, jobId, {
          status: 'completed',
          progress: 1,
          resultSegments: result.segments,
          language: result.language ?? cur.language,
          resultRawOutputKind: result.rawOutputKind,
        }),
      }))
    })

    return jobId
  },

  cancelTranscription: (jobId) => {
    const cancelRun = jobRunCancels.get(jobId)
    if (cancelRun) cancelRun()
    unregisterJobCancel(jobId)
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'canceled') return j
        return { ...j, status: 'canceled', updatedAt: isoNow() }
      }),
    }))
  },

  clearTranscriptionJobs: () => {
    clearAllJobCancels()
    set({ jobs: [] })
  },
}))
