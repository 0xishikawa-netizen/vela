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

function presetFilter(filter: string): string {
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
  return map[filter] || ''
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
}

type VisualClip = VideoClip | ImageClip

export function exportVideo(
  project: Project,
  settings: ExportSettings,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { width, height, fps, bitrate } = settings.preset
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
    const clipInputs: { clip: VisualClip; idx: number }[] = []

    for (const clip of videoClips) {
      if (clip.type === 'image') {
        cmd = cmd.input(clip.sourcePath).inputOptions(['-loop', '1', '-t', String(clip.timelineDuration)])
      } else {
        cmd = cmd.input(clip.sourcePath)
      }
      clipInputs.push({ clip, idx: inputIdx++ })
    }

    const audioClips = (audioTrack?.clips ?? []).filter((c) => c.type === 'audio') as AudioClip[]
    const audioInputStart = inputIdx
    for (const ac of audioClips) {
      cmd = cmd.input(ac.sourcePath)
      inputIdx++
    }

    const filterParts: string[] = []
    const concatParts: string[] = []

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
        clip.type === 'video' ? ((clip as VideoClip).colorGrade ?? ({} as ColorGrade)) : ({} as ColorGrade),
      )
      if (cg) parts.push(cg)

      if (clip.transitionIn?.type === 'fade' && clip.transitionIn.duration > 0) {
        parts.push(`fade=t=in:st=0:d=${clip.transitionIn.duration}`)
      }
      if (clip.transitionOut?.type === 'fade' && clip.transitionOut.duration > 0) {
        const fadeStart = clip.timelineDuration - clip.transitionOut.duration
        parts.push(`fade=t=out:st=${Math.max(0, fadeStart)}:d=${clip.transitionOut.duration}`)
      }

      filterParts.push(`[${idx}:v]${parts.join(',')}[v${i}]`)
      concatParts.push(`[v${i}]`)
    })

    filterParts.push(
      `${concatParts.join('')}concat=n=${concatParts.length}:v=1:a=0[concatv]`,
    )

    const telopClips = (telopTrack?.clips ?? []).filter((c) => c.type === 'telop') as TelopClip[]
    if (telopClips.length > 0) {
      const drawtexts = telopClips.map((tc) => {
        const posMap: Record<string, string> = {
          top_center: 'x=(w-text_w)/2:y=h*0.05',
          middle_center: 'x=(w-text_w)/2:y=(h-text_h)/2',
          bottom_center: 'x=(w-text_w)/2:y=h*0.88',
          bottom_left: 'x=w*0.05:y=h*0.88',
          bottom_right: 'x=w*0.90-text_w:y=h*0.88',
        }
        const pos = posMap[tc.position] ?? posMap.bottom_center
        const color = tc.style.color.replace('#', '')
        return [
          `drawtext=text='${escapeDrawtext(tc.text)}':`,
          `fontsize=${tc.style.fontSize}:`,
          `fontcolor=0x${color}:`,
          `${pos}:`,
          `enable='between(t,${tc.timelineStart},${tc.timelineStart + tc.timelineDuration})'`,
        ].join('')
      })
      filterParts.push(`[concatv]${drawtexts.join(',')}[outv]`)
    } else {
      filterParts.push('[concatv]copy[outv]')
    }

    const hasAudio = audioClips.length > 0 && settings.includeAudio
    if (hasAudio) {
      audioClips.forEach((ac, i) => {
        const idx = audioInputStart + i
        const delayMs = Math.round(ac.timelineStart * 1000)
        filterParts.push(
          `[${idx}:a]volume=${ac.volume ?? 1},adelay=${delayMs}|${delayMs}[a${i}]`,
        )
      })
      const amix = audioClips.map((_, i) => `[a${i}]`).join('')
      filterParts.push(`${amix}amix=inputs=${audioClips.length}:normalize=0[outa]`)
    }

    const outputMaps = hasAudio ? ['-map', '[outv]', '-map', '[outa]'] : ['-map', '[outv]']
    const codecLib = settings.preset.codec === 'h265' ? 'libx265' : 'libx264'

    cmd
      .complexFilter(filterParts)
      .outputOptions([
        ...outputMaps,
        `-c:v`,
        codecLib,
        `-b:v`,
        bitrate,
        `-r`,
        String(fps),
        `-preset`,
        `medium`,
        ...(hasAudio ? [`-c:a`, `aac`, `-b:a`, `192k`] : [`-an`]),
        `-movflags`,
        `+faststart`,
      ])
      .output(settings.outputPath)
      .on('progress', (p) => onProgress(Math.min(99, Math.round(p.percent ?? 0))))
      .on('end', () => {
        onProgress(100)
        resolve()
      })
      .on('error', reject)
      .run()
  })
}
