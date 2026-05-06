import ffmpeg from 'fluent-ffmpeg'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Project,
  ExportSettings,
  MediaFile,
  VideoClip,
  ImageClip,
  TelopClip,
  ColorGrade,
  AudioClip,
} from '../src/lib/types'
import { resolveFfmpegBinary, resolveFfprobeBinary } from './paths'

ffmpeg.setFfmpegPath(resolveFfmpegBinary())
ffmpeg.setFfprobePath(resolveFfprobeBinary())

const platform = process.platform

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
      resolve({
        path: filePath,
        name: filePath.split('/').pop() || filePath.split('\\').pop() || '',
        type: imageExts.includes(ext) ? 'image' : v ? 'video' : 'audio',
        duration: meta.format.duration,
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

function colorGradeToFilter(g: ColorGrade): string {
  const parts: string[] = []
  if (g.brightness !== 0) parts.push(`brightness=${(g.brightness / 100).toFixed(2)}`)
  if (g.contrast !== 0) parts.push(`contrast=${(1 + g.contrast / 100).toFixed(2)}`)
  if (g.saturation !== 0) parts.push(`saturation=${(1 + g.saturation / 100).toFixed(2)}`)
  return parts.length > 0 ? `eq=${parts.join(':')}` : ''
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

/** FFmpeg フィルタ用に絶対パスを整形 */
function escPathForFfmpegFile(abs: string): string {
  return abs
    .replace(/\\/g, '/')
    .replace("'", "'\\''")
}

function lut3dForPath(abs: string | undefined): string {
  if (!abs || !abs.trim()) return ''
  const p = escPathForFfmpegFile(path.resolve(abs))
  return `lut3d=file='${p}':interp=tetrahedral`
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
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

function trackMutedForAudioClip(project: Project, clip: AudioClip): boolean {
  const t = project.tracks.find((tr) => tr.clips.some((c) => c.id === clip.id && c.type === 'audio'))
  return t?.muted === true
}

type HwEnc = 'off' | 'auto' | 'videotoolbox' | 'nvenc' | 'qsv' | undefined

function resolveVcodec(
  codec: 'h264' | 'h265',
  hw: HwEnc,
): { c: string; usePresetLibx: boolean; extra: string[] } {
  const isHevc = codec === 'h265'
  if (hw === 'off' || hw === undefined) {
    return { c: isHevc ? 'libx265' : 'libx264', usePresetLibx: true, extra: [] }
  }
  if (hw === 'videotoolbox' || (hw === 'auto' && platform === 'darwin')) {
    if (isHevc) return { c: 'hevc_videotoolbox', usePresetLibx: false, extra: [] }
    return { c: 'h264_videotoolbox', usePresetLibx: false, extra: [] }
  }
  if (hw === 'nvenc' || (hw === 'auto' && platform === 'win32')) {
    return {
      c: isHevc ? 'hevc_nvenc' : 'h264_nvenc',
      usePresetLibx: false,
      extra: ['-rc', 'vbr'],
    }
  }
  if (hw === 'qsv') {
    return { c: isHevc ? 'hevc_qsv' : 'h264_qsv', usePresetLibx: false, extra: [] }
  }
  if (hw === 'auto' && platform === 'linux') {
    return { c: isHevc ? 'libx265' : 'libx264', usePresetLibx: true, extra: [] }
  }
  return { c: isHevc ? 'libx265' : 'libx264', usePresetLibx: true, extra: [] }
}

const TELOP_POS: Record<string, string> = {
  top_left: 'x=w*0.05:y=h*0.05',
  top_center: 'x=(w-text_w)/2:y=h*0.05',
  top_right: 'x=w*0.95-text_w:y=h*0.05',
  middle_left: 'x=w*0.05:y=(h-text_h)/2',
  middle_center: 'x=(w-text_w)/2:y=(h-text_h)/2',
  middle_right: 'x=w*0.95-text_w:y=(h-text_h)/2',
  bottom_left: 'x=w*0.05:y=h*0.88',
  bottom_center: 'x=(w-text_w)/2:y=h*0.88',
  bottom_right: 'x=w*0.90-text_w:y=h*0.88',
  custom: 'x=(w-text_w)/2:y=h*0.88',
}

export function exportVideo(
  project: Project,
  settings: ExportSettings,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { width, height, fps, bitrate } = settings.preset
    const crossfade = settings.crossfadeAdjacent === true
    const crossDur = Math.max(0.05, settings.crossfadeDurationSec ?? 0.35)
    const loudness = settings.loudnessNormalize === true
    const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`

    const videoTrack = project.tracks.find((t) => t.type === 'video')
    const telopTrack = project.tracks.find((t) => t.type === 'telop')
    const audioTrack = project.tracks.find((t) => t.type === 'audio')

    const videoClips = (videoTrack?.clips ?? [])
      .filter((c): c is VisualClip => c.type === 'video' || c.type === 'image')
      .sort((a, b) => a.timelineStart - b.timelineStart)

    if (videoClips.length === 0) {
      reject(new Error('書き出しできる映像クリップがありません。'))
      return
    }

    let cmd = ffmpeg()
    let inputIdx = 0
    const clipInputs: { clip: VisualClip; idx: number; labelIndex: number }[] = []
    for (const clip of videoClips) {
      if (clip.type === 'image') {
        cmd = cmd.input(clip.sourcePath).inputOptions(['-loop', '1', '-t', String(clip.timelineDuration)])
      } else {
        cmd = cmd.input(clip.sourcePath)
      }
      clipInputs.push({ clip, idx: inputIdx, labelIndex: clipInputs.length })
      inputIdx++
    }

    const audioClips = (audioTrack?.clips ?? []).filter((c) => c.type === 'audio') as AudioClip[]
    const audioInputStart = inputIdx
    for (const ac of audioClips) {
      cmd = cmd.input(ac.sourcePath)
      inputIdx++
    }

    const filterParts: string[] = []
    const n = clipInputs.length
    const D = clipInputs.map(({ clip }) => segmentOutputDuration(clip))

    clipInputs.forEach(({ clip, idx }, i) => {
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
      parts.push(scale)
      const vf = clip.type === 'video' ? (clip as VideoClip).filter : (clip as ImageClip).filter
      const pf = presetFilter(vf ?? 'none')
      if (pf) parts.push(pf)
      const cg = colorGradeToFilter(
        clip.type === 'video'
          ? (clip as VideoClip).colorGrade ?? ({} as ColorGrade)
          : (clip as ImageClip).colorGrade ?? ({} as ColorGrade),
      )
      if (cg) parts.push(cg)
      const lutP =
        clip.type === 'video' ? (clip as VideoClip).lutPath : (clip as ImageClip).lutPath
      const lutf = lut3dForPath(lutP)
      if (lutf) parts.push(lutf)
      if (clip.transitionIn?.type === 'fade' && clip.transitionIn.duration > 0) {
        parts.push(`fade=t=in:st=0:d=${clip.transitionIn.duration}`)
      }
      if (clip.transitionOut?.type === 'fade' && clip.transitionOut.duration > 0) {
        const fadeStart = clip.timelineDuration - clip.transitionOut.duration
        parts.push(`fade=t=out:st=${Math.max(0, fadeStart)}:d=${clip.transitionOut.duration}`)
      }
      filterParts.push(`[${idx}:v]${parts.join(',')}[v${i}]`)
    })

    let videoOutLabel: string
    if (n === 1) {
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
          filterParts.push(
            `[${currentLabel}][v${i + 1}]xfade=transition=fade:duration=${dSafe.toFixed(3)}:offset=${off}[${outLab}]`,
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

    const telopClips = (telopTrack?.clips ?? []).filter((c) => c.type === 'telop') as TelopClip[]
    if (telopClips.length > 0) {
      const drawtexts = telopClips.map((tc) => {
        const pos = `${TELOP_POS[tc.position] ?? TELOP_POS.bottom_center!}`
        const color = tc.style.color.replace('#', '')
        const lines = tc.text.split('\n').filter(Boolean)
        const t0 = lines[0] ?? ''
        const rest = `borderw=${Math.min(8, tc.style.strokeWidth || 0)}:fontcolor=0x${color}:line_spacing=8`
        return `drawtext=text='${escapeDrawtext(t0)}':fontsize=${tc.style.fontSize}:${pos}:${rest}:enable='between(t,${tc.timelineStart},${tc.timelineStart + tc.timelineDuration})'`
      })
      filterParts.push(
        `[${videoOutLabel}]${drawtexts.join(',')},format=yuv420p[outv]`,
      )
    } else {
      filterParts.push(`[${videoOutLabel}]format=yuv420p[outv]`)
    }

    const hasAudio = audioClips.length > 0 && settings.includeAudio
    if (hasAudio) {
      audioClips.forEach((ac, i) => {
        const idx = audioInputStart + i
        const muted = trackMutedForAudioClip(project, ac)
        const baseVol = muted ? 0 : ac.volume ?? 1
        const aTrim = `atrim=start=${ac.sourceStart}:end=${ac.sourceEnd},asetpts=PTS-STARTPTS`
        const vChain = `volume=${baseVol}`
        const audDur = Math.max(0.01, (ac.sourceEnd ?? 0) - (ac.sourceStart ?? 0))
        const fi = ac.fadeIn > 0 ? `,afade=t=in:st=0:d=${Math.min(ac.fadeIn, audDur * 0.5)}` : ''
        const fo =
          ac.fadeOut > 0
            ? `,afade=t=out:st=${Math.max(0, audDur - ac.fadeOut)}:d=${Math.min(ac.fadeOut, audDur * 0.5)}`
            : ''
        const delayMs = Math.round(ac.timelineStart * 1000)
        filterParts.push(
          `[${idx}:a]${aTrim},${vChain}${fi}${fo},adelay=${delayMs}|${delayMs}[a${i}]`,
        )
      })
      const nAudio = audioClips.length
      const amixIns = audioClips.map((_, i) => `[a${i}]`).join('')
      if (loudness) {
        filterParts.push(
          `${amixIns}amix=inputs=${nAudio}:normalize=0:duration=first[atmp]`,
        )
        filterParts.push(
          `[atmp]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary[outa]`,
        )
      } else {
        filterParts.push(
          `${amixIns}amix=inputs=${nAudio}:normalize=0:duration=first[outa]`,
        )
      }
    }

    const { c: vcodec, usePresetLibx, extra: vExtra } = resolveVcodec(
      settings.preset.codec,
      settings.videoEncoder,
    )

    const outputOptions: string[] = [
      ...(hasAudio ? (['-map', '[outv]', '-map', '[outa]'] as const) : (['-map', '[outv]'] as const)),
      '-c:v',
      vcodec,
    ]
    if (usePresetLibx) {
      outputOptions.push('-b:v', bitrate, '-preset', 'medium')
    } else {
      outputOptions.push('-b:v', bitrate, ...vExtra)
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

    cmd
      .complexFilter(filterParts)
      .outputOptions(outputOptions)
      .output(settings.outputPath)
      .on('progress', (p) => {
        if (p.percent != null) onProgress(Math.min(100, p.percent))
      })
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}