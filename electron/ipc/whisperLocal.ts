import { ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

import { allowlistMediaPaths } from '../mediaPathAllowlist'
import type { WhisperLocalStartPayload } from '../../src/lib/types'
import {
  buildWhisperLocalArgs,
  parseWhisperJsonOrSrtOutput,
  validateWhisperLocalConfig,
  whisperLocalOutputArtifactPaths,
  type WhisperLocalRunnerConfig,
} from '../../src/lib/whisperLocalRunner'
import type { WhisperLocalIpcFinished } from '../../src/lib/whisperLocalIpcMap'
import {
  whisperLocalExitLooksCanceled,
  whisperLocalProgressFromStderr,
} from '../../src/lib/whisperLocalIpcMap'

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
  if (sender.isDestroyed()) return
  try {
    sender.send('whisperLocal:progress', { runId, progress, detail })
  } catch {
    /* ignore */
  }
}

/** 長尺チャンク分割の閾値（秒）。これを超えたらチャンク化する */
const CHUNK_THRESHOLD_SEC = 600
/** 1 チャンクの長さ（秒） */
const CHUNK_DURATION_SEC = 300

/**
 * FFmpeg で音声の総尺を取得する（秒）。取得失敗時は undefined。
 * spawn は ffmpeg -i のみなので副作用なし。
 */
async function getMediaDurationSec(mediaPath: string, ffmpegBin: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    let stderr = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(ffmpegBin, ['-i', mediaPath], { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch {
      resolve(undefined)
      return
    }
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8') })
    child.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
      if (!m) { resolve(undefined); return }
      const h = parseInt(m[1]!, 10)
      const min = parseInt(m[2]!, 10)
      const s = parseFloat(m[3]!)
      resolve(h * 3600 + min * 60 + s)
    })
    child.on('error', () => resolve(undefined))
  })
}

/**
 * FFmpeg で音声を WAV に変換してチャンク抽出する。
 * 戻り値はチャンクファイルパスの配列（start 昇順）。
 */
async function extractAudioChunks(
  mediaPath: string,
  totalSec: number,
  workDir: string,
  ffmpegBin: string,
): Promise<Array<{ path: string; startSec: number; endSec: number }>> {
  const chunks: Array<{ path: string; startSec: number; endSec: number }> = []
  let start = 0
  let idx = 0
  while (start < totalSec) {
    const end = Math.min(start + CHUNK_DURATION_SEC, totalSec)
    const chunkPath = path.join(workDir, `chunk_${String(idx).padStart(3, '0')}.wav`)
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y', '-i', mediaPath,
        '-ss', String(start), '-t', String(end - start),
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        chunkPath,
      ]
      const child = spawn(ffmpegBin, args, { stdio: 'ignore' })
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg chunk exit ${code}`))))
      child.on('error', reject)
    })
    chunks.push({ path: chunkPath, startSec: start, endSec: end })
    start = end
    idx++
  }
  return chunks
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

type SpawnResult =
  | { ok: true; segments: ReturnType<typeof parseWhisperJsonOrSrtOutput>['segments']; language?: string; durationSec?: number; rawOutputKind: 'json' | 'srt' | 'vtt' }
  | { ok: false; kind: 'spawn' | 'process' | 'read_output' | 'parse' | 'canceled'; errorMessage: string; exitCode?: number; stderrTail?: string }

/**
 * 単一ファイルに対して Whisper を spawn し、成果物を読み取ってパース結果を返す内部ヘルパー。
 * progress は progressBase〜progressEnd の範囲でスケーリングして送出する。
 */
async function spawnWhisperOnFile(
  sender: WebContents,
  runId: string,
  bin: string,
  cfg: WhisperLocalRunnerConfig,
  inputPath: string,
  outBase: string,
  progressBase: number,
  progressEnd: number,
): Promise<SpawnResult> {
  const args = buildWhisperLocalArgs(cfg, inputPath, outBase)
  let stderrBuf = ''
  let stdoutBuf = ''
  let streamChunks = 0

  const raw = await new Promise<SpawnResult>((resolve) => {
    let settled = false
    const finish = (r: SpawnResult): void => { if (!settled) { settled = true; resolve(r) } }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as ChildProcessWithoutNullStreams
    } catch {
      finish({ ok: false, kind: 'spawn', errorMessage: '起動に失敗しました' })
      return
    }

    const run: ActiveRun = { runId, child, userCanceled: false }
    active = run

    const scale = (p: number) => progressBase + (progressEnd - progressBase) * p

    child.stderr.on('data', (c: Buffer) => {
      stderrBuf = appendCapped(stderrBuf, c)
      streamChunks += 1
      sendProgress(sender, runId, scale(whisperLocalProgressFromStderr(stderrBuf, streamChunks)), 'stderr')
    })
    child.stdout.on('data', (c: Buffer) => {
      stdoutBuf = appendCapped(stdoutBuf, c)
      streamChunks += 1
      sendProgress(sender, runId, scale(whisperLocalProgressFromStderr(stderrBuf, streamChunks)), 'stdout')
    })

    child.on('error', () => {
      if (active?.runId === runId) active = null
      finish({ ok: false, kind: 'spawn', errorMessage: '起動に失敗しました' })
    })

    child.on('exit', (code, signal) => {
      void (async () => {
        const snap = active
        active = null
        if (settled) return

        if (whisperLocalExitLooksCanceled(snap?.userCanceled ?? false, signal)) {
          finish({ ok: false, kind: 'canceled', errorMessage: 'キャンセルしました' })
          return
        }

        const stderrTail = stderrBuf.trim() ? stderrBuf.slice(-2048) : undefined

        if (code !== 0 && code !== null) {
          const hint = stderrTail ? ` (${stderrTail.slice(-120)})` : ''
          finish({
            ok: false, kind: 'process',
            errorMessage: (`終了コード ${code}` + hint).slice(0, 280),
            exitCode: code ?? undefined, stderrTail,
          })
          return
        }

        const artifact = await readWhisperOutputArtifact(outBase)
        if (!artifact.ok) {
          finish({ ok: false, kind: 'read_output', errorMessage: artifact.message, exitCode: code ?? 0, stderrTail })
          return
        }

        const parsed = parseWhisperJsonOrSrtOutput(artifact.raw, artifact.rawOutputKind)
        if (parsed.parseError || parsed.segments.length === 0) {
          finish({ ok: false, kind: 'parse', errorMessage: parsed.parseError ?? 'パースに失敗しました', exitCode: code ?? 0, stderrTail })
          return
        }

        finish({ ok: true, segments: parsed.segments, language: parsed.language, durationSec: parsed.durationSec, rawOutputKind: artifact.rawOutputKind })
      })().catch(() => finish({ ok: false, kind: 'process', errorMessage: '内部エラー' }))
    })
  })

  void stdoutBuf
  return raw
}

/**
 * `whisperLocal:start` と同一の spawn〜成果物読取〜パース。長尺ファイルは自動チャンク化する。
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
    outputFormat: payload.outputFormat === 'srt' || payload.outputFormat === 'vtt' ? payload.outputFormat : 'json',
    preferGpu: payload.preferGpu === true,
  }

  const v = validateWhisperLocalConfig(cfg)
  if (!v.ok) {
    return { ok: false, runId, kind: 'validation', errorMessage: v.reason }
  }

  const bin = cfg.binaryPath!.trim()
  const sourceMedia = payload.sourceMediaPath.trim()
  const workDir = path.join(app.getPath('temp'), `vela-whisper-${runId}`)
  await mkdir(workDir, { recursive: true })

  sendProgress(sender, runId, 0, 'starting')

  try {
    const ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const totalSec = await getMediaDurationSec(sourceMedia, ffmpegBin)

    let result: WhisperLocalIpcFinished

    if (totalSec !== undefined && totalSec > CHUNK_THRESHOLD_SEC) {
      // 長尺チャンク化モード
      sendProgress(sender, runId, 0.02, 'chunking')
      let chunks: Awaited<ReturnType<typeof extractAudioChunks>>
      try {
        chunks = await extractAudioChunks(sourceMedia, totalSec, workDir, ffmpegBin)
      } catch (e) {
        result = {
          ok: false, runId, kind: 'process',
          errorMessage: `チャンク分割失敗: ${e instanceof Error ? e.message : String(e)}`,
        }
        await rm(workDir, { recursive: true, force: true }).catch(() => {})
        return result
      }

      const allSegments: import('../../src/lib/types').SubtitleSegment[] = []
      let language: string | undefined
      let firstRawOutputKind: 'json' | 'srt' | 'vtt' = 'json'
      let chunkCanceled = false

      for (let i = 0; i < chunks.length; i++) {
        const cur = active as ActiveRun | null
        if (chunkCanceled || cur?.userCanceled) {
          result = { ok: false, runId, kind: 'canceled', errorMessage: 'キャンセルしました' }
          await rm(workDir, { recursive: true, force: true }).catch(() => {})
          return result
        }
        const chunk = chunks[i]!
        const chunkOutBase = path.join(workDir, `chunk_${i}_out`)
        const progressBase = 0.05 + (i / chunks.length) * 0.9
        const progressEnd = 0.05 + ((i + 1) / chunks.length) * 0.9
        sendProgress(sender, runId, progressBase, `chunk ${i + 1}/${chunks.length}`)

        const sr = await spawnWhisperOnFile(sender, runId, bin, cfg, chunk.path, chunkOutBase, progressBase, progressEnd)
        if (!sr.ok) {
          if (sr.kind === 'canceled') {
            chunkCanceled = true
            result = { ok: false, runId, kind: 'canceled', errorMessage: 'キャンセルしました' }
          } else {
            result = { ok: false, runId, kind: sr.kind, errorMessage: sr.errorMessage, exitCode: sr.exitCode, stderrTail: sr.stderrTail }
          }
          await rm(workDir, { recursive: true, force: true }).catch(() => {})
          return result
        }

        if (i === 0) { language = sr.language; firstRawOutputKind = sr.rawOutputKind }
        for (const seg of sr.segments) {
          allSegments.push({
            ...seg,
            id: `${seg.id}-c${i}`,
            startSec: seg.startSec + chunk.startSec,
            endSec: seg.endSec + chunk.startSec,
          })
        }
      }

      sendProgress(sender, runId, 1, 'completed')
      result = {
        ok: true, runId, exitCode: 0,
        segments: allSegments.sort((a, b) => a.startSec - b.startSec),
        language,
        durationSec: totalSec,
        rawOutputKind: firstRawOutputKind,
      }
    } else {
      // 通常モード（単一ファイル）
      const outBase = path.join(workDir, 'out')
      const sr = await spawnWhisperOnFile(sender, runId, bin, cfg, sourceMedia, outBase, 0, 1)
      if (!sr.ok) {
        if (sr.kind === 'canceled') {
          sendProgress(sender, runId, 0, 'canceled')
          result = { ok: false, runId, kind: 'canceled', errorMessage: 'キャンセルしました' }
        } else {
          sendProgress(sender, runId, 0, 'failed')
          result = { ok: false, runId, kind: sr.kind, errorMessage: sr.errorMessage, exitCode: sr.exitCode, stderrTail: sr.stderrTail }
        }
      } else {
        sendProgress(sender, runId, 1, 'completed')
        result = {
          ok: true, runId, exitCode: 0,
          segments: sr.segments,
          language: sr.language,
          durationSec: sr.durationSec,
          rawOutputKind: sr.rawOutputKind,
        }
      }
    }

    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    return result
  } catch {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    return { ok: false, runId, kind: 'process', errorMessage: '内部エラー' }
  }
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
    allowlistMediaPaths([payload.binaryPath, payload.modelPath, payload.sourceMediaPath])

    if (active) {
      return { ok: false, runId: payload.runId, kind: 'busy', errorMessage: '他のジョブが実行中です' }
    }

    return invokeWhisperLocalStart(event.sender, payload)
  })
}
