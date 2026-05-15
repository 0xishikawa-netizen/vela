import type { AudioClip } from './types'
import {
  generateWaveformPeaksFromChannels,
  sliceWaveformPeaksForClipData,
  type WaveformPeaks,
} from './waveformAlgo'

export type { WaveformPeaks } from './waveformAlgo'
export {
  generateWaveformPeaksFromChannels,
  sliceWaveformPeaksForClipData,
  sliceWaveformPeaksSegments,
} from './waveformAlgo'

const peakCache = new Map<string, WaveformPeaks>()

/** `readAudioFileForWaveform` と揃えた上限（これを超えると FFmpeg 側 `getWaveform` にフォールバック） */
export const WAVEFORM_MAX_DECODE_BYTES = 24 * 1024 * 1024

/** FFmpeg 経路では先頭約 30 秒相当の peaks のみ（既存 `generateWaveform` と一致） */
export const WAVEFORM_FFMPEG_CAPTURE_SEC = 30

function wfDebugEnabled(): boolean {
  return String(import.meta.env.VELA_WAVEFORM_DEBUG ?? '') === '1'
}

function wfDebugSafePath(p: string): string {
  const base = p.split(/[/\\]/).pop() ?? p
  return base.length > 96 ? `${base.slice(0, 93)}...` : base
}

function wfLog(msg: string, extra?: Record<string, unknown>): void {
  if (!wfDebugEnabled()) return
  const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''
  console.info(`[vela-waveform] ${msg}${tail}`)
}

export function waveformPeakCacheSize(): number {
  return peakCache.size
}

export function clearWaveformPeakCache(): void {
  const n = peakCache.size
  peakCache.clear()
  wfLog('cache cleared', { hadEntries: n })
}

export function makeWaveformCacheKey(filePath: string, mtimeMs?: number): string {
  if (mtimeMs != null && Number.isFinite(mtimeMs)) return `${filePath}\n${mtimeMs}`
  return filePath
}

/** `number[]` を 0〜1 に正規化し `WaveformPeaks` に包む（FFmpeg 経路用） */
export function waveformPeaksFromFfmpegSamples(raw: number[], durationSec: number): WaveformPeaks {
  const arr = Array.isArray(raw) ? raw.filter((n) => typeof n === 'number' && Number.isFinite(n)) : []
  if (arr.length === 0) return { peaks: [0.06], duration: Math.max(1e-4, durationSec), sampleCount: 1 }
  const m = Math.max(...arr.map((v) => Math.abs(v)), 1e-9)
  const peaks = arr.map((v) => Math.min(1, Math.abs(v) / m))
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : WAVEFORM_FFMPEG_CAPTURE_SEC
  return { peaks, duration: d, sampleCount: peaks.length }
}

/**
 * `AudioBuffer` からバケット化した peaks を生成。
 * 計算本体は **`generateWaveformPeaksFromChannels`**（単体確認用）。
 */
export function generateWaveformPeaksFromAudioBuffer(
  audioBuffer: AudioBuffer,
  options?: { targetBuckets?: number },
): WaveformPeaks {
  const ch = audioBuffer.numberOfChannels
  const dur = Number.isFinite(audioBuffer.duration) ? audioBuffer.duration : NaN
  if (!Number.isFinite(dur) || ch < 1) {
    return {
      peaks: [0.05],
      duration: Number.isFinite(dur) && dur > 0 ? dur : 1e-4,
      sampleCount: 1,
    }
  }
  const channels: Float32Array[] = []
  for (let c = 0; c < ch; c++) channels.push(audioBuffer.getChannelData(c)!)
  return generateWaveformPeaksFromChannels(channels, dur, options)
}

/**
 * peaks がカバーする `duration` 秒に対し、`clip` のソース範囲に対応する部分を切り出す（フェードは slice に影響しない）。
 */
export function sliceWaveformPeaksForClip(data: WaveformPeaks, clip: AudioClip): number[] {
  return sliceWaveformPeaksForClipData(data, clip.sourceStart, clip.sourceEnd)
}

type ReadWaveformFileResult =
  | { ok: true; data: Uint8Array; mtimeMs: number; fileSize: number }
  | { ok: false; reason: 'too_large' | 'error' | 'not_allowlisted'; mtimeMs?: number; fileSize?: number }

export type WaveformLoadDeps = {
  readAudioFileForWaveform?: (path: string) => Promise<ReadWaveformFileResult>
  getWaveform?: (path: string) => Promise<number[]>
  getMediaDurationSec?: (path: string) => Promise<number | undefined>
}

let sharedDecodeCtx: AudioContext | null = null

function getSharedDecodeContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedDecodeCtx || sharedDecodeCtx.state === 'closed') {
    try {
      sharedDecodeCtx = new Ctor()
    } catch {
      return null
    }
  }
  return sharedDecodeCtx
}

async function ffmpegWaveformFallback(
  trim: string,
  deps: WaveformLoadDeps,
  mtimeMs: number | undefined,
  meta: Record<string, unknown>,
): Promise<WaveformPeaks | null> {
  const ctx = wfDebugSafePath(trim)
  if (!deps.getWaveform) {
    wfLog(`fail no getWaveform path=${ctx}`, meta)
    return null
  }
  const ck = makeWaveformCacheKey(trim, mtimeMs)
  const hit = peakCache.get(ck)
  if (hit) {
    wfLog(`cache hit path=${ctx} route=ffmpeg`, {
      mtimeMs,
      peaks: hit.peaks.length,
      duration: hit.duration,
      ...meta,
    })
    return hit
  }

  let mediaDur = WAVEFORM_FFMPEG_CAPTURE_SEC
  try {
    if (deps.getMediaDurationSec) {
      const d = await deps.getMediaDurationSec(trim)
      if (typeof d === 'number' && Number.isFinite(d) && d > 0) mediaDur = Math.min(d, WAVEFORM_FFMPEG_CAPTURE_SEC)
    }
  } catch {
    mediaDur = WAVEFORM_FFMPEG_CAPTURE_SEC
  }

  try {
    wfLog(`decode route=ffmpeg fallback path=${ctx}`, { mtimeMs, mediaDurSec: mediaDur, ...meta })
    const raw = await deps.getWaveform(trim)
    const peaksData = waveformPeaksFromFfmpegSamples(Array.isArray(raw) ? raw : [], mediaDur)
    peakCache.set(ck, peaksData)
    wfLog(`ffmpeg ok path=${ctx}`, {
      peaks: peaksData.peaks.length,
      duration: peaksData.duration,
      ...meta,
    })
    return peaksData
  } catch (e) {
    wfLog(`ffmpeg threw path=${ctx}`, { failed: String((e as Error)?.message ?? e).slice(0, 160), ...meta })
    return null
  }
}

/**
 * ファイルパスから peaks を得る（メモリキャッシュ → 小容量は Web Audio、大容量は FFmpeg の順）。
 * 失敗時は `null`（呼び出し側で落とさない）。
 */
export async function loadWaveformPeaksForPath(filePath: string, deps: WaveformLoadDeps): Promise<WaveformPeaks | null> {
  const trim = filePath.trim()
  if (!trim) return null

  const ctxPath = wfDebugSafePath(trim)
  let mtimeHint: number | undefined

  try {
    if (deps.readAudioFileForWaveform) {
      let r: ReadWaveformFileResult
      try {
        r = await deps.readAudioFileForWaveform(trim)
      } catch (e) {
        wfLog(`read threw path=${ctxPath}`, { failed: String((e as Error)?.message ?? e).slice(0, 120) })
        return await ffmpegWaveformFallback(trim, deps, undefined, { after: 'read-throw' })
      }

      if (r.ok === true) {
        const { data, mtimeMs, fileSize } = r
        const ck = makeWaveformCacheKey(trim, mtimeMs)
        const hit = peakCache.get(ck)
        if (hit) {
          wfLog(`cache hit path=${ctxPath} route=cached`, {
            mtimeMs,
            fileSize,
            peaks: hit.peaks.length,
            duration: hit.duration,
          })
          return hit
        }

        const ctx = getSharedDecodeContext()
        if (!ctx) {
          wfLog(`no AudioContext path=${ctxPath}`, { fileSize, mtimeMs })
          return await ffmpegWaveformFallback(trim, deps, mtimeMs, { fileSize, reason: 'no-audio-context' })
        }

        const ub = data instanceof Uint8Array ? data : new Uint8Array(data)
        const ab =
          ub.byteOffset === 0 && ub.byteLength === ub.buffer.byteLength
            ? ub.buffer.slice(0)
            : ub.buffer.slice(ub.byteOffset, ub.byteOffset + ub.byteLength)

        try {
          wfLog(`decodeAudioData path=${ctxPath}`, { fileSize, mtimeMs })
          const abForDecode: ArrayBuffer =
            ab instanceof SharedArrayBuffer
              ? (() => {
                  const u = new Uint8Array(ab)
                  const out = new ArrayBuffer(u.byteLength)
                  new Uint8Array(out).set(u)
                  return out
                })()
              : ab
          const audioBuf = await ctx.decodeAudioData(abForDecode)
          const peaksData = generateWaveformPeaksFromAudioBuffer(audioBuf)
          if (peaksData.peaks.length > 0) {
            peakCache.set(ck, peaksData)
            wfLog(`decode ok path=${ctxPath}`, {
              peaks: peaksData.peaks.length,
              duration: peaksData.duration,
              fileSize,
              mtimeMs,
            })
            return peaksData
          }
        } catch (e) {
          wfLog(`decode threw path=${ctxPath}`, {
            failed: String((e as Error)?.message ?? e).slice(0, 120),
            fileSize,
            mtimeMs,
          })
        }
        return await ffmpegWaveformFallback(trim, deps, mtimeMs, { fileSize, reason: 'decode-fail-or-empty' })
      }

      if (!r.ok && r.reason === 'not_allowlisted') {
        wfLog(`read not_allowlisted path=${ctxPath}`)
        return null
      }

      mtimeHint = r.mtimeMs
      if (r.reason === 'too_large') {
        wfLog(`read too_large path=${ctxPath}`, { mtimeMs: r.mtimeMs, fileSize: r.fileSize })
        const ck = makeWaveformCacheKey(trim, r.mtimeMs)
        const hit = peakCache.get(ck)
        if (hit) {
          wfLog(`cache hit path=${ctxPath} route=cached`, { peaks: hit.peaks.length, duration: hit.duration })
          return hit
        }
        return await ffmpegWaveformFallback(trim, deps, r.mtimeMs, {
          fileSize: r.fileSize,
          reason: 'too_large',
        })
      }

      wfLog(`read error path=${ctxPath}`, { mtimeMs: r.mtimeMs, fileSize: r.fileSize })
    }
    return await ffmpegWaveformFallback(trim, deps, mtimeHint, { reason: 'read-skip-or-error' })
  } catch (e) {
    wfLog(`load threw path=${ctxPath}`, { failed: String((e as Error)?.message ?? e).slice(0, 120) })
    return await ffmpegWaveformFallback(trim, deps, mtimeHint, { reason: 'outer-catch' })
  }
}
