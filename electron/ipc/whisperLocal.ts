import { ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

import type { WhisperLocalStartPayload } from '../../src/lib/types'
import {
  buildWhisperLocalArgs,
  parseWhisperJsonOrSrtOutput,
  validateWhisperLocalConfig,
  whisperLocalOutputArtifactPaths,
  type WhisperLocalRunnerConfig,
} from '../../src/lib/whisperLocalRunner'
import type { WhisperLocalIpcFinished } from '../../src/lib/whisperLocalIpcMap'
import { whisperLocalExitLooksCanceled, whisperLocalProgressFromStreamChunks } from '../../src/lib/whisperLocalIpcMap'

const STDIO_CAP = 512 * 1024
/** whisper 出力ファイルの読み取り上限（main のみ） */
const WHISPER_OUTPUT_MAX_BYTES = 8 * 1024 * 1024

type ReadArtifactOk = { ok: true; raw: string; rawOutputKind: 'json' | 'srt' | 'vtt' }
type ReadArtifactErr = { ok: false; message: string }

async function readWhisperOutputArtifact(outBase: string): Promise<ReadArtifactOk | ReadArtifactErr> {
  for (const c of whisperLocalOutputArtifactPaths(outBase)) {
    try {
      const st = await stat(c.path)
      if (!st.isFile() || st.size === 0) continue
      if (st.size > WHISPER_OUTPUT_MAX_BYTES) {
        return { ok: false, message: '出力が大きすぎます' }
      }
      const raw = await readFile(c.path, 'utf8')
      const trimmed = raw.trim()
      if (!trimmed) continue
      return { ok: true, raw: trimmed, rawOutputKind: c.kind }
    } catch {
      continue
    }
  }
  return { ok: false, message: '出力ファイルが見つかりません' }
}

type ActiveRun = { runId: string; child: ChildProcessWithoutNullStreams; userCanceled: boolean }

let active: ActiveRun | null = null

function appendCapped(buf: string, chunk: Buffer): string {
  const next = buf + chunk.toString('utf8')
  if (next.length <= STDIO_CAP) return next
  return next.slice(next.length - STDIO_CAP)
}

function sendProgress(sender: WebContents, runId: string, progress: number, detail?: string): void {
  try {
    // TODO: whisper.cpp stderr の行から実進捗を parse して送る
    sender.send('whisperLocal:progress', { runId, progress, detail })
  } catch {
    /* ignore */
  }
}

function isPayload(v: unknown): v is WhisperLocalStartPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.runId === 'string' &&
    o.runId.length > 0 &&
    typeof o.binaryPath === 'string' &&
    typeof o.modelPath === 'string' &&
    typeof o.sourceMediaPath === 'string'
  )
}

/**
 * `whisperLocal:start` と同一の spawn〜成果物読取〜パース（Phase E-11: Electron スモーク entry から再利用）。
 * `registerWhisperLocalIpc` とは独立に呼べるが、同時実行は `active` でブロックされる。
 */
export async function invokeWhisperLocalStart(
  sender: WebContents,
  payload: WhisperLocalStartPayload,
): Promise<WhisperLocalIpcFinished> {
  const { runId } = payload

  if (active) {
    return { ok: false, runId, kind: 'busy', errorMessage: '他のジョブが実行中です' }
  }

  const cfg: WhisperLocalRunnerConfig = {
    binaryPath: payload.binaryPath.trim(),
    modelPath: payload.modelPath.trim(),
    language: payload.options?.language?.trim() || undefined,
    translateToJapanese: payload.options?.translateToJapanese === true,
    outputFormat:
      payload.outputFormat === 'srt' || payload.outputFormat === 'vtt' ? payload.outputFormat : 'json',
    preferGpu: payload.preferGpu === true,
  }

  const v = validateWhisperLocalConfig(cfg)
  if (!v.ok) {
    return { ok: false, runId, kind: 'validation', errorMessage: v.reason }
  }

  const workDir = path.join(app.getPath('temp'), `vela-whisper-${runId}`)
  await mkdir(workDir, { recursive: true })
  const outBase = path.join(workDir, 'out')
  const args = buildWhisperLocalArgs(cfg, payload.sourceMediaPath.trim(), outBase)
  const bin = cfg.binaryPath!.trim()

  sendProgress(sender, runId, 0, 'starting')

  let stderrBuf = ''
  let stdoutBuf = ''
  let streamChunks = 0

  const result = await new Promise<WhisperLocalIpcFinished>((resolve) => {
    let settled = false
    const finish = (r: WhisperLocalIpcFinished): void => {
      if (settled) return
      settled = true
      resolve(r)
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
    } catch {
      finish({ ok: false, runId, kind: 'spawn', errorMessage: '起動に失敗しました' })
      return
    }

    const run: ActiveRun = { runId, child, userCanceled: false }
    active = run

    child.stderr.on('data', (c: Buffer) => {
      stderrBuf = appendCapped(stderrBuf, c)
      streamChunks += 1
      sendProgress(sender, runId, whisperLocalProgressFromStreamChunks(streamChunks), 'stderr')
    })
    child.stdout.on('data', (c: Buffer) => {
      stdoutBuf = appendCapped(stdoutBuf, c)
      streamChunks += 1
      sendProgress(sender, runId, whisperLocalProgressFromStreamChunks(streamChunks), 'stdout')
    })

    child.on('error', () => {
      if (active?.runId === runId) active = null
      finish({ ok: false, runId, kind: 'spawn', errorMessage: '起動に失敗しました' })
    })

    child.on('exit', (code, signal) => {
      void (async () => {
        const snap = active
        active = null
        if (settled) return

        const wasCanceled = whisperLocalExitLooksCanceled(snap?.userCanceled ?? false, signal)
        if (wasCanceled) {
          sendProgress(sender, runId, 0, 'canceled')
          finish({ ok: false, runId, kind: 'canceled', errorMessage: 'キャンセルしました' })
          return
        }

        if (code !== 0 && code !== null) {
          sendProgress(sender, runId, 0, 'failed')
          const hint = stderrBuf.trim() ? ` (${stderrBuf.slice(-120)})` : ''
          finish({
            ok: false,
            runId,
            kind: 'process',
            errorMessage: (`終了コード ${code}` + hint).slice(0, 280),
            exitCode: code ?? undefined,
          })
          return
        }

        const artifact = await readWhisperOutputArtifact(outBase)
        if (!artifact.ok) {
          sendProgress(sender, runId, 0, 'failed')
          finish({
            ok: false,
            runId,
            kind: 'read_output',
            errorMessage: artifact.message,
            exitCode: code ?? 0,
          })
          return
        }

        const parsed = parseWhisperJsonOrSrtOutput(artifact.raw, artifact.rawOutputKind)
        if (parsed.parseError || parsed.segments.length === 0) {
          sendProgress(sender, runId, 1, 'parse')
          finish({
            ok: false,
            runId,
            kind: 'parse',
            errorMessage: parsed.parseError ?? 'パースに失敗しました',
            exitCode: code ?? 0,
          })
          return
        }

        sendProgress(sender, runId, 1, 'completed')
        finish({
          ok: true,
          runId,
          exitCode: code ?? 0,
          segments: parsed.segments,
          language: parsed.language,
          durationSec: parsed.durationSec,
          rawOutputKind: artifact.rawOutputKind,
        })
      })().catch(() => {
        finish({ ok: false, runId, kind: 'process', errorMessage: '内部エラー' })
      })
    })
  })

  await rm(workDir, { recursive: true, force: true }).catch(() => {})
  void stdoutBuf
  void stderrBuf
  return result
}

export function registerWhisperLocalIpc(): void {
  ipcMain.handle('whisperLocal:getStatus', () => ({
    busy: active !== null,
    runId: active?.runId,
  }))

  ipcMain.handle('whisperLocal:cancel', async (_, runId: unknown) => {
    if (typeof runId !== 'string' || !runId) return { ok: false as const, reason: 'bad_run_id' as const }
    if (!active || active.runId !== runId) return { ok: false as const, reason: 'no_match' as const }
    active.userCanceled = true
    active.child.kill('SIGTERM')
    return { ok: true as const }
  })

  ipcMain.handle('whisperLocal:start', async (event, raw: unknown): Promise<WhisperLocalIpcFinished> => {
    const badRunId =
      typeof raw === 'object' && raw !== null && 'runId' in raw && typeof (raw as { runId: unknown }).runId === 'string'
        ? (raw as { runId: string }).runId
        : 'unknown'

    if (!isPayload(raw)) {
      return { ok: false, runId: badRunId, kind: 'validation', errorMessage: 'リクエストが不正です' }
    }
    const payload = raw

    if (active) {
      return { ok: false, runId: payload.runId, kind: 'busy', errorMessage: '他のジョブが実行中です' }
    }

    return invokeWhisperLocalStart(event.sender, payload)
  })
}
