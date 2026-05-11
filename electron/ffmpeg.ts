import ffmpeg from 'fluent-ffmpeg'
import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Project,
  ExportSettings,
  MediaFile,
  VideoClip,
  ImageClip,
  AudioClip,
  HwVideoEncoder,
} from '../src/lib/types'
import { resolveFfmpegBinary, resolveFfprobeBinary } from './paths'
import { buildTelopAssContent } from '../src/lib/telopAss'
import { computeTimelineEndSeconds } from '../src/lib/projectSanitize'
import {
  audioMasterVolumeNormalized,
  collectAllAudioClips,
  effectivePanForAudioClip,
  resolveNormalizedAudioFadeLengths,
  stemMixGainForAudioClip,
} from '../src/lib/audioMix'
import { pickXfadeTransitionName } from '../src/lib/xfadeTransition'
import {
  collectAllTelopClips,
  collectVisualClipEntries,
  hasVisualClipTimelineOverlap,
  sortVisualClipsForExport,
} from '../src/lib/visualTimeline'
import { buildColorGradeFfmpegFilterParts } from '../src/lib/colorGradeFfmpeg'
import { normalizeExportPlatform, resolveExportVideoEncoder } from '../src/lib/exportVideoEncoder'
import {
  formatExportDiagnosticsLogBlock,
  formatExportErrorSummary,
  parseFfmpegExitCode,
  previewFilterComplex,
  redactOrTrimArgv,
  tailStderr,
  type ExportDiagnostics,
  type ExportDiagnosticsRunBuffer,
  type ExportDiagnosticsRunMeta,
} from '../src/lib/exportDiagnostics'

ffmpeg.setFfmpegPath(resolveFfmpegBinary())

/** 直近の書き出しラン（IPC 保存用）。チャンク単体実行（fixture）でも main を引かないよう ffmpeg 内に置く。 */
let exportDiagnosticsRun: ExportDiagnosticsRunBuffer | null = null

export function beginExportDiagnosticsRun(meta: ExportDiagnosticsRunMeta): void {
  exportDiagnosticsRun = { meta, attempts: [] }
}

function pushExportDiagnosticsAttempt(d: ExportDiagnostics): void {
  if (!exportDiagnosticsRun) return
  exportDiagnosticsRun.attempts.push({ ...d })
}

export function getLastExportDiagnosticsRun(): ExportDiagnosticsRunBuffer | null {
  return exportDiagnosticsRun
}

function clearExportDiagnosticsRun(): void {
  exportDiagnosticsRun = null
}
ffmpeg.setFfprobePath(resolveFfprobeBinary())

function parseFps(rate?: string): number | undefined {
  if (!rate) return undefined
  const parts = rate.split('/')
  if (parts.length === 2) {
    const a = Number(parts[0])
    const b = Number(parts[1])
    if (b && Number.isFinite(a)) return a / b
  }
  const n = Number(rate)
  return Number.isFinite(n) ? n : undefined
}

export function getMediaInfo(filePath: string): Promise<MediaFile> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err)
      const v = meta.streams.find((s) => s.codec_type === 'video')
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
      const rawDur = meta.format.duration as unknown
      const durationSec =
        typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur >= 0
          ? rawDur
          : typeof rawDur === 'string' && rawDur.trim() !== ''
            ? (() => {
                const n = parseFloat(rawDur)
                return Number.isFinite(n) && n >= 0 ? n : undefined
              })()
            : undefined
      resolve({
        path: filePath,
        name: filePath.split('/').pop() || filePath.split('\\').pop() || '',
        type: imageExts.includes(ext) ? 'image' : v ? 'video' : 'audio',
        duration: durationSec,
        width: v?.width,
        height: v?.height,
        fps: v?.r_frame_rate ? parseFps(v.r_frame_rate) : undefined,
        size: meta.format.size || 0,
      })
    })
  })
}

export function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timeSeconds: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(timeSeconds)
      .frames(1)
      .size('320x180')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

export async function generateWaveform(inputPath: string): Promise<number[]> {
  const tmp = path.join(os.tmpdir(), `vela-wave-${randomUUID()}.f32`)
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('aresample=8000')
        .format('f32le')
        .audioChannels(1)
        .outputOptions(['-t', '30'])
        .output(tmp)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })
    const buf = await readFile(tmp)
    const samples: number[] = []
    for (let i = 0; i < buf.length; i += 200) {
      samples.push(Math.abs(buf.readFloatLE(i)))
    }
    return samples.length ? samples : [0.1]
  } catch {
    return []
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
}

function presetFilter(f: string): string {
  const map: Record<string, string> = {
    cinematic:
      "curves=r='0/0 0.5/0.45 1/0.9':g='0/0 0.5/0.5 1/0.95':b='0/0.05 0.5/0.55 1/1'",
    vintage: 'curves=vintage,vignette',
    sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
    bw: 'hue=s=0',
    warm: "curves=r='0/0 0.5/0.58 1/1':b='0/0 0.5/0.42 1/0.9'",
    cool: "curves=b='0/0 0.5/0.58 1/1':r='0/0 0.5/0.42 1/0.9'",
    vivid: 'eq=saturation=1.5:contrast=1.1',
    matte: "curves=r='0/0.08 1/0.92':g='0/0.05 1/0.93':b='0/0.1 1/0.88'",
    fade: "curves=r='0/0.1 1/0.9':g='0/0.1 1/0.9':b='0/0.1 1/0.9'",
    none: '',
  }
  return map[f] || ''
}

/**
 * FFmpeg フィルタ文字列へ埋め込むファイルパスをエスケープする。
 * - 区切りは `/` に統一（Windows でも libass/ffmpeg は受け付ける）。
 * - 単一引用符は `'` → `'\''`（フィルタ内でパス全体を `'...'` で囲む前提）。
 *
 * **用途の違いに注意:**
 * - `lut3d=file='…'` は **file= が正しい**（別フィルタ）。
 * - 将来 **`subtitles`** で SRT 等を焼くときは **`subtitles=file='…'`** 形式が適切なことが多い。
 * - **`ass` フィルタでは `file=` を付けない**（パスは `ass='…'` 先頭または `filename=` 系。`ass=file='…'` は誤りでクラッシュしうる）。
 *   ASS への適用は常に **`buildAssBurnInFilter`** 経由に寄せる。
 */
function escPathForFfmpegFile(abs: string): string {
  return abs
    .replace(/\\/g, '/')
    .replace("'", "'\\''")
}

/** Phase A fixture の SIGSEGV 切り分け・手動再実行用 */
function isPhaseAExportDebug(): boolean {
  return process.env.VELA_PHASE_A_DEBUG === '1' || process.env.VELA_EXPORT_DEBUG === '1'
}

function extractExportErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function extractFfmpegStderr(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'stderr' in err) {
    const s = (err as { stderr: unknown }).stderr
    if (typeof s === 'string' && s.length > 0) return s
  }
  return undefined
}

function logExportFailureDiagnostics(
  err: unknown,
  ctx: {
    attemptPhase: 'primary' | 'software_retry'
    vcodec: string
    primaryVcodec?: string
    diagBase: Partial<ExportDiagnostics>
    filterComplexStr: string
    cmd: unknown
  },
): void {
  const msg = extractExportErrorMessage(err)
  const stderrRaw = extractFfmpegStderr(err)
  const exitCode = parseFfmpegExitCode(msg) ?? parseFfmpegExitCode(stderrRaw ?? '')
  let argvFull: string[] | undefined
  try {
    const getArgs = (ctx.cmd as { _getArguments?: () => string[] })._getArguments
    if (typeof getArgs === 'function') {
      argvFull = [resolveFfmpegBinary(), ...getArgs()]
    }
  } catch {
    /* noop */
  }
  const diag: ExportDiagnostics = {
    ...ctx.diagBase,
    attemptPhase: ctx.attemptPhase,
    resolvedVideoEncoderFinal: ctx.vcodec,
    resolvedVideoEncoderFirst:
      ctx.attemptPhase === 'primary' ? ctx.vcodec : ctx.primaryVcodec,
    hardwareFallbackAttempted: ctx.attemptPhase === 'software_retry',
    ffmpegExitCode: exitCode ?? null,
    stderrTail: tailStderr(stderrRaw ?? msg),
    filterComplexPreview: previewFilterComplex(ctx.filterComplexStr),
    filterComplexCharCount: ctx.filterComplexStr.length,
    hasFilterComplex: true,
  }
  if (isPhaseAExportDebug()) {
    diag.filterComplexFull = ctx.filterComplexStr
    diag.argvFull = argvFull
    diag.argvPreview = argvFull ? redactOrTrimArgv(argvFull) : undefined
  } else if (argvFull?.length) {
    diag.argvPreview = redactOrTrimArgv(argvFull)
  }
  console.error(formatExportDiagnosticsLogBlock(diag))
  pushExportDiagnosticsAttempt(diag)
}

/**
 * ASS を映像へ焼きこむときの **`[in]….[out]` 用フィルタ断片（ラベルは呼び出し側）**。
 *
 * **再発防止（必読）:**
 * - **`ass=file='/path'` は NG**（subtitles の `file=` と混同しやすい）。`ass` では無効オプション扱いとなり **FFmpeg static で SIGSEGV** することがある。
 * - 正しくは **`ass='/path'`**（本関数は `'…'` 内に `escPathForFfmpegFile` を渡す）。
 * - **`subtitles` と文字列は流用しない**（オプション形式が異なる）。
 *
 * **`format=yuv420p` を前後に置く理由:** upstream（trim/scale/fps 等）の pix_fmt が一定でないときでも libass 入力を yuv420p に揃え、焼いたあとエンコード前に再び yuv420p にしておく（静止画・異解像度連結時の揺らぎを抑える）。
 *
 * **`shaping=0`:** HarfBuzz 複雑シェイプより simple を優先し **安定性優先の暫定**。プレビューとの差や用途で **`shaping`** を変えうるので、変更はこの関数のみ触ること。
 */
function buildAssBurnInFilter(assAbsolutePath: string): string {
  const esc = escPathForFfmpegFile(path.resolve(assAbsolutePath))
  return `format=yuv420p,ass='${esc}':shaping=0,format=yuv420p`
}

/**
 * `atrim`・`volume` 後のソース尺 `audDur` に対する `afade=in/out` 用のカンマ前置きサフィックス。
 * フェード長の丸め・ in+out の同率縮小は **`resolveNormalizedAudioFadeLengths`**（プレビューの `calculateAudioFadeGain` と共有）。
 * `curve=` は付けず FFmpeg 既定（プレビュー線形ゲイン積とは厳密一致しない。意図的）。
 */
function audioFadeAffixes(ac: AudioClip, audDur: number): string {
  const d = Math.max(1e-4, audDur)
  const { fadeInSec: fin, fadeOutSec: fout } = resolveNormalizedAudioFadeLengths(
    ac.fadeIn,
    ac.fadeOut,
    d,
  )
  let parts = ''
  if (fin > 1e-5) parts += `,afade=t=in:st=0:d=${fin.toFixed(4)}`
  if (fout > 1e-5) {
    const stOut = Math.max(0, d - fout)
    const dOut = Math.min(fout, Math.max(1e-5, d - stOut))
    parts += `,afade=t=out:st=${stOut.toFixed(4)}:d=${dOut.toFixed(4)}`
  }
  return parts
}

function lut3dForPath(abs: string | undefined): string {
  if (!abs || !abs.trim()) return ''
  const p = escPathForFfmpegFile(path.resolve(abs))
  return `lut3d=file='${p}':interp=tetrahedral`
}

type VisualClip = VideoClip | ImageClip

function segmentOutputDuration(clip: VisualClip): number {
  if (clip.type === 'video') {
    const v = clip as VideoClip
    const src = (v.sourceEnd ?? 0) - (v.sourceStart ?? 0)
    return src / (v.speed && v.speed > 0 ? v.speed : 1)
  }
  return clip.timelineDuration
}

/**
 * クリップ単体の映像フィルタを **カンマ結合** するための断片配列。
 *
 * **順序**: trim/setpts → **scale** → **presetFilter** → **ColorGrade**（**`eq`** → **`hue`** → **`colorbalance`（温度）**）→ **lut3d** → fade in/out → **fps**
 * （テロップ ASS は別ラベルで `buildAssBurnInFilter`、音声は別入力・別チェーン）。
 */
function buildClipVideoFilterParts(clip: VisualClip, scaleStr: string, fpsVal: number): string[] {
  const parts: string[] = []
  if (clip.type === 'video') {
    const vc = clip as VideoClip
    if (vc.sourceStart !== undefined && vc.sourceEnd !== undefined) {
      parts.push(`trim=start=${vc.sourceStart}:end=${vc.sourceEnd},setpts=PTS-STARTPTS`)
    }
    if (vc.speed && vc.speed !== 1) {
      parts.push(`setpts=${(1 / vc.speed).toFixed(3)}*PTS`)
    }
  }
  parts.push(scaleStr)
  const vf = clip.type === 'video' ? (clip as VideoClip).filter : (clip as ImageClip).filter
  const pf = presetFilter(vf ?? 'none')
  if (pf) parts.push(pf)
  const cgRaw = clip.type === 'video' ? (clip as VideoClip).colorGrade : (clip as ImageClip).colorGrade
  for (const p of buildColorGradeFfmpegFilterParts(cgRaw)) {
    parts.push(p)
  }
  const lutP = clip.type === 'video' ? (clip as VideoClip).lutPath : (clip as ImageClip).lutPath
  const lutf = lut3dForPath(lutP)
  if (lutf) parts.push(lutf)
  const tin = clip.transitionIn
  if (tin && tin.duration > 0 && tin.type !== 'none' && (tin.type === 'fade' || tin.type === 'dissolve')) {
    parts.push(`fade=t=in:st=0:d=${tin.duration}`)
  }
  const tout = clip.transitionOut
  if (tout && tout.duration > 0 && tout.type !== 'none' && (tout.type === 'fade' || tout.type === 'dissolve')) {
    const fadeStart = clip.timelineDuration - tout.duration
    parts.push(`fade=t=out:st=${Math.max(0, fadeStart)}:d=${tout.duration}`)
  }
  parts.push(`fps=${fpsVal}`)
  return parts
}

export function exportVideo(
  project: Project,
  settings: ExportSettings,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let assTmp: string | null = null
      const keepTmpAss = isPhaseAExportDebug()
      try {
        const { width, height, fps, bitrate } = settings.preset
        /** 書き出し先と同ディレクトリ（ASS の一時ファイル・Phase A debug ログ用） */
        const assHostDir = path.dirname(path.resolve(settings.outputPath))
        const crossfade = settings.crossfadeAdjacent === true
        const crossDur = Math.max(0.05, settings.crossfadeDurationSec ?? 0.35)
        const audioPostMix: 'none' | 'loudnorm' | 'dynaudnorm' =
          settings.audioPostMix ??
          (settings.loudnessNormalize === true ? 'loudnorm' : 'none')
        const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`

        const videoClips = sortVisualClipsForExport(collectVisualClipEntries(project))

        if (videoClips.length === 0) {
          reject(new Error('書き出しできる映像クリップがありません。'))
          return
        }

        /** 出力の基準尺（映像・音声のトリム／パッドの共通値） */
        const timelineEndSec = Math.max(computeTimelineEndSeconds(project), 0.1)

        /** 重なり時は tpad+overlay のみ。隣接 xfade / concat のトランジションとは排他（xfade は未適用）。 */
        const useOverlay = hasVisualClipTimelineOverlap(videoClips)

        const clipInputs: { clip: VisualClip; idx: number; labelIndex: number }[] = []
        let inputIdx = 0
        for (const clip of videoClips) {
          clipInputs.push({ clip, idx: inputIdx, labelIndex: clipInputs.length })
          inputIdx++
        }

        const audioClips = collectAllAudioClips(project)
        const audioInputStart = inputIdx

        beginExportDiagnosticsRun({
          timelineDurationSec: timelineEndSec,
          format: settings.format,
          outputPath: settings.outputPath,
          includeAudio: settings.includeAudio,
          crossfadeAdjacent: settings.crossfadeAdjacent,
          crossfadeDurationSec: settings.crossfadeDurationSec,
          audioPostMix,
          videoEncoder: settings.videoEncoder,
          presetWidth: width,
          presetHeight: height,
          presetFps: fps,
          presetBitrate: bitrate,
          presetCodec: settings.preset.codec,
          useOverlay,
          visualClipCount: videoClips.length,
          audioClipCount: audioClips.length,
        })

        function buildInputCmd() {
          let c = ffmpeg()
          for (const clip of videoClips) {
            if (clip.type === 'image') {
              c = c.input(clip.sourcePath).inputOptions(['-loop', '1', '-t', String(clip.timelineDuration)])
            } else {
              c = c.input(clip.sourcePath)
            }
          }
          for (const ac of audioClips) {
            c = c.input(ac.sourcePath)
          }
          return c
        }

        const filterParts: string[] = []
        const n = clipInputs.length
        const D = clipInputs.map(({ clip }) => segmentOutputDuration(clip))

        clipInputs.forEach(({ clip, idx }, i) => {
          filterParts.push(`[${idx}:v]${buildClipVideoFilterParts(clip, scale, fps).join(',')}[v${i}]`)
        })

        let videoOutLabel: string
        if (useOverlay) {
          const fpsR = `${Number(fps)}/1`
          filterParts.push(
            `color=c=black:s=${width}x${height}:r=${fpsR}:d=${timelineEndSec.toFixed(4)}[ovbase]`,
          )
          let acc = 'ovbase'
          for (let i = 0; i < n; i++) {
            const clip = clipInputs[i]!.clip
            const ts = clip.timelineStart
            const te = clip.timelineStart + clip.timelineDuration
            const stopPad = Math.max(0, timelineEndSec - te)
            const outTag = i === n - 1 ? 'ovfinal' : `ovacc${i}`
            filterParts.push(
              `[v${i}]tpad=start_mode=add:start_duration=${ts.toFixed(4)}:stop_mode=add:stop_duration=${stopPad.toFixed(4)}:color=black[vpad${i}]`,
            )
            filterParts.push(`[${acc}][vpad${i}]overlay=0:0:format=auto:shortest=0[${outTag}]`)
            acc = outTag
          }
          videoOutLabel = 'ovfinal'
        } else if (n === 1) {
          videoOutLabel = 'v0'
        } else if (crossfade) {
          let currentLabel = 'v0'
          let currentLen = D[0]!
          for (let i = 0; i < n - 1; i++) {
            const d = Math.min(crossDur, currentLen * 0.5 - 0.01, D[i + 1]! * 0.5 - 0.01)
            const dSafe = Math.max(0.05, d)
            const outLab = i === n - 2 ? 'vx' : `xf${i}`
            if (dSafe < 0.08 || dSafe > currentLen - 0.01) {
              const cat = i === n - 2 ? 'vx' : `c${i}`
              filterParts.push(`[${currentLabel}][v${i + 1}]concat=n=2:v=1:a=0[${cat}]`)
              currentLabel = cat
              currentLen = currentLen + D[i + 1]!
            } else {
              const off = (currentLen - dSafe).toFixed(4)
              const prevClip = clipInputs[i]!.clip
              const nextClip = clipInputs[i + 1]!.clip
              const xfname = pickXfadeTransitionName(prevClip.transitionOut, nextClip.transitionIn)
              filterParts.push(
                `[${currentLabel}][v${i + 1}]xfade=transition=${xfname}:duration=${dSafe.toFixed(3)}:offset=${off}[${outLab}]`,
              )
              currentLabel = outLab
              currentLen = currentLen + D[i + 1]! - dSafe
            }
          }
          videoOutLabel = 'vx'
        } else {
          const concatIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join('')
          filterParts.push(`${concatIn}concat=n=${n}:v=1:a=0[concatv]`)
          videoOutLabel = 'concatv'
        }

        const telopClips = collectAllTelopClips(project)
        /** ASS は出力 MP4 と同じディレクトリ（tmp 直下より libass が安定しやすいことがある） */
        if (telopClips.length > 0) {
          assTmp = path.join(assHostDir, `.vela-telop-${randomUUID()}.ass`)
          const assText = buildTelopAssContent(telopClips, width, height)
          await writeFile(assTmp, assText, 'utf8')
          if (isPhaseAExportDebug()) {
            console.error(
              '[vela-phase-a-debug] ass path:',
              assTmp,
              keepTmpAss ? '(kept: VELA_PHASE_A_DEBUG=1 or VELA_EXPORT_DEBUG=1)' : '',
            )
            console.error(
              '[vela-phase-a-debug] ass (first 50 lines):\n',
              assText.split('\n').slice(0, 50).join('\n'),
            )
          }
          filterParts.push(`[${videoOutLabel}]${buildAssBurnInFilter(assTmp)}[outv]`)
        } else {
          filterParts.push(`[${videoOutLabel}]format=yuv420p[outv]`)
        }

        const hasAudio = audioClips.length > 0 && settings.includeAudio
        /** 音声グラフの最終ラベル（post なしのときは apad 直出し） */
        let audioMapBracketed = '[outa]'
        if (hasAudio) {
          audioClips.forEach((ac, i) => {
            const idx = audioInputStart + i
            const gain = stemMixGainForAudioClip(project, ac)
            const pan = effectivePanForAudioClip(project, ac)
            const aTrim = `atrim=start=${ac.sourceStart}:end=${ac.sourceEnd},asetpts=PTS-STARTPTS`
            /** FFmpeg 6 の stereotools は `balance` ではなく `balance_out`（-1〜1） */
            const panF =
              Math.abs(pan) < 0.001
                ? ''
                : `,aformat=channel_layouts=stereo,stereotools=balance_out=${pan.toFixed(4)}`
            const vChain = `volume=${gain}${panF}`
            const audDur = Math.max(1e-4, (ac.sourceEnd ?? 0) - (ac.sourceStart ?? 0))
            const fadeSfx = audioFadeAffixes(ac, audDur)
            const delayMs = Math.round(ac.timelineStart * 1000)
            filterParts.push(
              `[${idx}:a]${aTrim},${vChain}${fadeSfx},adelay=${delayMs}|${delayMs}[a${i}]`,
            )
          })
          const nAudio = audioClips.length
          const amixIns = audioClips.map((_, i) => `[a${i}]`).join('')
          const tEnd = timelineEndSec.toFixed(4)
          filterParts.push(`${amixIns}amix=inputs=${nAudio}:normalize=0:duration=longest[atmix]`)
          const masterGn = audioMasterVolumeNormalized(project)
          const trimInLabel = Math.abs(masterGn - 1) > 1e-6 ? 'atmstv' : 'atmix'
          if (trimInLabel === 'atmstv') {
            filterParts.push(`[atmix]volume=${masterGn.toFixed(6)}[atmstv]`)
          }
          filterParts.push(
            `[${trimInLabel}]atrim=0:${tEnd},asetpts=PTS-STARTPTS,apad=whole_dur=${tEnd}[atpad]`,
          )
          if (audioPostMix === 'none') {
            audioMapBracketed = '[atpad]'
          } else if (audioPostMix === 'loudnorm') {
            filterParts.push(
              `[atpad]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary[outa]`,
            )
          } else {
            filterParts.push(`[atpad]dynaudnorm[outa]`)
          }
        }

        const filterComplexStr = filterParts.join(';')
        const ffBin = resolveFfmpegBinary()
        let ffmpegVersionHeadMemo: string | undefined
        const ensureFfmpegVersionHead = (): string | undefined => {
          if (ffmpegVersionHeadMemo !== undefined) return ffmpegVersionHeadMemo || undefined
          try {
            ffmpegVersionHeadMemo = execFileSync(ffBin, ['-hide_banner', '-version'], {
              encoding: 'utf8',
              maxBuffer: 256 * 1024,
            })
              .split('\n')
              .slice(0, 8)
              .join('\n')
          } catch {
            ffmpegVersionHeadMemo = ''
          }
          return ffmpegVersionHeadMemo || undefined
        }

        const diagBase: Partial<ExportDiagnostics> = {
          ffmpegPath: ffBin,
          platform: process.platform,
          presetId: settings.format,
          presetCodec: settings.preset.codec,
          resolvedPresetSummary: `${width}x${height}@${fps} ${bitrate}`,
          requestedVideoEncoder: String(settings.videoEncoder ?? 'auto'),
          outputPath: settings.outputPath,
          timelineDurationSec: timelineEndSec,
        }

        const platNorm = normalizeExportPlatform(process.platform)
        const firstEnc = resolveExportVideoEncoder(settings.preset.codec, settings.videoEncoder, platNorm)
        const mayHwFallback =
          !firstEnc.usePresetLibx && (settings.videoEncoder ?? 'auto') !== 'off'

        const runAttempt = (hwOverride: HwVideoEncoder | undefined, attemptPhase: 'primary' | 'software_retry') =>
          new Promise<void>((res, rej) => {
            const eff = hwOverride !== undefined ? hwOverride : settings.videoEncoder
            const { vcodec, usePresetLibx, extraAfterBitrate } = resolveExportVideoEncoder(
              settings.preset.codec,
              eff,
              platNorm,
            )
            const cmd = buildInputCmd()
            const outputOptions: string[] = [
              '-map',
              '[outv]',
              ...(hasAudio ? (['-map', audioMapBracketed] as const) : []),
              '-c:v',
              vcodec,
            ]
            if (usePresetLibx) {
              outputOptions.push('-b:v', bitrate, '-preset', 'medium')
            } else {
              outputOptions.push('-b:v', bitrate, ...extraAfterBitrate)
            }
            if (!usePresetLibx && vcodec.includes('videotoolbox')) {
              outputOptions.push('-allow_sw', '1')
            }
            outputOptions.push('-r', String(fps), '-pix_fmt', 'yuv420p')
            if (hasAudio) {
              outputOptions.push('-c:a', 'aac', '-b:a', '192k')
            } else {
              outputOptions.push('-an')
            }
            outputOptions.push('-movflags', '+faststart')
            outputOptions.push('-t', timelineEndSec.toFixed(4))

            cmd.complexFilter(filterParts).outputOptions(outputOptions).output(settings.outputPath)

            if (isPhaseAExportDebug()) {
              console.error('[vela-phase-a-debug] ffmpeg binary:', ffBin)
              console.error('[vela-phase-a-debug] projectId:', process.env.VELA_PHASE_A_DEBUG_PROJECT_ID ?? '(unset)')
              console.error('[vela-phase-a-debug] filter_complex:', filterComplexStr)
              console.error('[vela-phase-a-debug] tmp / ass host dir:', assHostDir)
              try {
                const verHead = execFileSync(ffBin, ['-hide_banner', '-version'], {
                  encoding: 'utf8',
                  maxBuffer: 256 * 1024,
                })
                  .split('\n')
                  .slice(0, 10)
                  .join('\n')
                console.error('[vela-phase-a-debug] ffmpeg -version (head):\n', verHead)
              } catch (ev) {
                console.error('[vela-phase-a-debug] ffmpeg -version failed:', ev)
              }
              try {
                const argv = (cmd as unknown as { _getArguments: () => string[] })._getArguments()
                console.error('[vela-phase-a-debug] argv JSON (replay):', JSON.stringify([ffBin, ...argv]))
              } catch (ea) {
                console.error('[vela-phase-a-debug] _getArguments failed:', ea)
              }
            }

            cmd
              .on('start', (cmdline) => {
                if (isPhaseAExportDebug()) console.error('[vela-phase-a-debug] fluent start:', cmdline)
              })
              .on('progress', (p) => {
                if (p.percent != null) onProgress(Math.min(100, p.percent))
              })
              .on('end', () => {
                res()
              })
              .on('error', (err: unknown) => {
                logExportFailureDiagnostics(err, {
                  attemptPhase,
                  vcodec,
                  primaryVcodec: attemptPhase === 'software_retry' ? firstEnc.vcodec : undefined,
                  diagBase: { ...diagBase, ffmpegVersionHead: ensureFfmpegVersionHead() },
                  filterComplexStr,
                  cmd,
                })
                rej(err)
              })
              .run()
          })

        try {
          await runAttempt(undefined, 'primary')
        } catch (e1) {
          const code1 =
            parseFfmpegExitCode(extractExportErrorMessage(e1)) ??
            parseFfmpegExitCode(extractFfmpegStderr(e1) ?? '') ??
            undefined
          if (!mayHwFallback) {
            reject(
              new Error(
                formatExportErrorSummary({ exitCode: code1 ?? undefined, retriedWithSoftware: false }),
              ),
            )
            return
          }
          console.error(
            '[vela-export] hardware encode failed; retrying with software libx264/libx265:',
            extractExportErrorMessage(e1),
          )
          onProgress(0)
          try {
            await runAttempt('off', 'software_retry')
            console.error('[vela-export] Software encode retry succeeded after hardware failure.')
          } catch (e2) {
            const code2 =
              parseFfmpegExitCode(extractExportErrorMessage(e2)) ??
              parseFfmpegExitCode(extractFfmpegStderr(e2) ?? '') ??
              undefined
            reject(
              new Error(
                formatExportErrorSummary({
                  exitCode: code2 ?? undefined,
                  retriedWithSoftware: true,
                }),
              ),
            )
            return
          }
        }
        clearExportDiagnosticsRun()
        resolve()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (assTmp && !keepTmpAss) await rm(assTmp, { force: true }).catch(() => {})
      }
    })()
  })
}