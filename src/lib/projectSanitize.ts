import { v4 as uuid } from 'uuid'
import { normalizeAudioMasterVolumeValue, normalizeAudioPanValue } from './audioMix'
import type {
  AspectRatio,
  AudioClip,
  Clip,
  ColorGrade,
  ImageClip,
  Project,
  SubtitleSegment,
  SubtitleTrack,
  Track,
  TrackType,
  VideoClip,
} from './types'
import { DEFAULT_COLOR_GRADE } from './types'
import { sanitizeSubtitleSegment } from './subtitleFormat'

const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '21:9': { width: 2560, height: 1080 },
}

const ASPECT_KEYS = new Set<AspectRatio>(['16:9', '9:16', '1:1', '4:3', '21:9'])
const TRACK_TYPES = new Set<TrackType>(['video', 'audio', 'telop', 'image'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** ffprobe / JSON / 旧データで string になっている尺を秒に正規化 */
export function coerceTimelineSeconds(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

export function makeDefaultTracks(): Track[] {
  return [
    { id: uuid(), type: 'video', name: '映像 1', muted: false, locked: false, volume: 1, solo: false, pan: 0, clips: [] },
    { id: uuid(), type: 'telop', name: 'テロップ 1', muted: false, locked: false, volume: 1, solo: false, pan: 0, clips: [] },
    { id: uuid(), type: 'audio', name: 'BGM 1', muted: false, locked: false, volume: 1, solo: false, pan: 0, clips: [] },
  ]
}

function sanitizeAspectRatio(v: unknown): AspectRatio {
  const s = typeof v === 'string' ? v : ''
  return ASPECT_KEYS.has(s as AspectRatio) ? (s as AspectRatio) : '16:9'
}

function sanitizeTrackVolume(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1
  return Math.min(4, Math.max(0, v))
}

function numInRange(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, v))
}

/** 旧プロジェクト・壊れた JSON からの読み込み用。未定義・NaN・範囲外は clamp。 */
export function sanitizeColorGrade(raw: unknown): ColorGrade {
  const r = isRecord(raw) ? raw : {}
  return {
    brightness: numInRange(r.brightness, -100, 100, DEFAULT_COLOR_GRADE.brightness),
    contrast: numInRange(r.contrast, -100, 100, DEFAULT_COLOR_GRADE.contrast),
    saturation: numInRange(r.saturation, -100, 100, DEFAULT_COLOR_GRADE.saturation),
    hue: numInRange(r.hue, -180, 180, DEFAULT_COLOR_GRADE.hue),
    temperature: numInRange(r.temperature, -100, 100, DEFAULT_COLOR_GRADE.temperature),
    highlights: numInRange(r.highlights, -100, 100, DEFAULT_COLOR_GRADE.highlights),
    shadows: numInRange(r.shadows, -100, 100, DEFAULT_COLOR_GRADE.shadows),
    sharpness: numInRange(r.sharpness, -100, 100, DEFAULT_COLOR_GRADE.sharpness),
  }
}

function sanitizeTrack(raw: unknown): Track | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : uuid()
  const t = raw.type
  const type: TrackType = typeof t === 'string' && TRACK_TYPES.has(t as TrackType) ? (t as TrackType) : 'video'
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'トラック'
  const rawClips = Array.isArray(raw.clips) ? raw.clips.filter(Boolean) : []
  const clips: Clip[] = rawClips.map((cr) => {
    const cl = cr as Clip
    if (cl.type === 'audio') {
      const ac = cl as AudioClip
      return { ...ac, pan: normalizeAudioPanValue(ac.pan) } as Clip
    }
    if (cl.type === 'video') {
      const vc = cl as VideoClip
      return { ...vc, colorGrade: sanitizeColorGrade(vc.colorGrade) } as Clip
    }
    if (cl.type === 'image') {
      const ic = cl as ImageClip
      return {
        ...ic,
        colorGrade: ic.colorGrade !== undefined ? sanitizeColorGrade(ic.colorGrade) : undefined,
      } as Clip
    }
    return cl
  })
  return {
    id,
    type,
    name,
    muted: Boolean(raw.muted),
    locked: Boolean(raw.locked),
    volume: sanitizeTrackVolume(raw.volume),
    solo: Boolean(raw.solo),
    pan: normalizeAudioPanValue(raw.pan),
    clips,
  }
}

/**
 * ディスク上の JSON や古い形式でも Editor で開けるよう最低限を補う。
 */
/** IPC / Immer のプロキシをまたがないプレーンなコピー（structured clone 用） */
export function cloneProject(p: Project): Project {
  try {
    return structuredClone(p)
  } catch {
    return JSON.parse(JSON.stringify(p)) as Project
  }
}

/** クリップのタイムライン上の末端（timelineDuration とソース範囲×速度のずれも吸収） */
function clipEndOnTimelineSeconds(clip: Clip): number {
  const start = coerceTimelineSeconds(clip.timelineStart)
  const tlDur = coerceTimelineSeconds(clip.timelineDuration)
  let end = start + tlDur

  if (clip.type === 'video' || clip.type === 'audio') {
    const m = clip as VideoClip | AudioClip
    const ss = coerceTimelineSeconds(m.sourceStart)
    const seRaw = coerceTimelineSeconds(m.sourceEnd)
    const se = seRaw >= ss ? seRaw : ss
    const sourceLen = Math.max(0, se - ss)
    const speed =
      clip.type === 'video'
        ? Math.max(coerceTimelineSeconds((clip as VideoClip).speed) || 1, 0.001)
        : 1
    const fromSource = start + sourceLen / speed
    if (fromSource > end) end = fromSource
  }

  return Number.isFinite(end) && end >= 0 ? end : start
}

/** 保存されている duration と全クリップ末端のうち長い方（タイムラインの実効尺） */
export function computeTimelineEndSeconds(project: Project | null): number {
  if (!project) return 0
  let end = coerceTimelineSeconds(project.duration)
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const te = clipEndOnTimelineSeconds(clip)
      if (Number.isFinite(te) && te > end) end = te
    }
  }
  const subs = project.subtitleTracks ?? []
  for (const st of subs) {
    for (const seg of st.segments) {
      const te = coerceTimelineSeconds(seg.endSec)
      if (Number.isFinite(te) && te > end) end = te
    }
  }
  return Number.isFinite(end) && end >= 0 ? end : 0
}

function sanitizeSubtitleSegmentFromUnknown(raw: unknown): SubtitleSegment | null {
  if (!isRecord(raw)) return null
  const start = coerceTimelineSeconds(raw.startSec ?? raw.startTime)
  const end = coerceTimelineSeconds(raw.endSec ?? raw.endTime)
  const idRaw = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  const text = typeof raw.text === 'string' ? raw.text : ''
  const speaker = typeof raw.speaker === 'string' && raw.speaker.trim() ? raw.speaker.trim() : undefined
  const conf = raw.confidence
  const confidence =
    typeof conf === 'number' && Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : undefined
  const base = sanitizeSubtitleSegment({
    id: idRaw || uuid(),
    startSec: start,
    endSec: end,
    text,
    speaker,
    confidence,
  })
  return base
}

function sanitizeSubtitleTrack(raw: unknown): SubtitleTrack | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uuid()
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '字幕'
  const language = typeof raw.language === 'string' && raw.language.trim() ? raw.language.trim() : undefined
  const segsRaw = Array.isArray(raw.segments) ? raw.segments : []
  const segments = segsRaw.map(sanitizeSubtitleSegmentFromUnknown).filter((s): s is SubtitleSegment => s != null)
  return { id, name, language, segments }
}

export function sanitizeSubtitleTracks(raw: unknown): SubtitleTrack[] {
  if (!Array.isArray(raw)) return []
  return raw.map(sanitizeSubtitleTrack).filter((t): t is SubtitleTrack => t != null)
}

export function sanitizeProject(raw: unknown): Project | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  if (!id) return null

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '無題'
  const aspectRatio = sanitizeAspectRatio(raw.aspectRatio)
  let resolution: { width: number; height: number }
  if (
    isRecord(raw.resolution) &&
    typeof raw.resolution.width === 'number' &&
    typeof raw.resolution.height === 'number' &&
    Number.isFinite(raw.resolution.width) &&
    Number.isFinite(raw.resolution.height) &&
    raw.resolution.width > 0 &&
    raw.resolution.height > 0
  ) {
    resolution = {
      width: Math.round(raw.resolution.width),
      height: Math.round(raw.resolution.height),
    }
  } else {
    resolution = { ...ASPECT_RATIOS[aspectRatio] }
  }

  const fps =
    typeof raw.fps === 'number' && Number.isFinite(raw.fps) && raw.fps > 0 && raw.fps <= 240
      ? raw.fps
      : 30
  const duration = coerceTimelineSeconds(raw.duration)
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt

  let tracks: Track[] = []
  if (Array.isArray(raw.tracks)) {
    tracks = raw.tracks.map(sanitizeTrack).filter((t): t is Track => t != null)
  }
  if (tracks.length === 0) tracks = makeDefaultTracks()

  const thumbnailPath = typeof raw.thumbnailPath === 'string' ? raw.thumbnailPath : undefined
  const audioMasterVolume = normalizeAudioMasterVolumeValue(raw.audioMasterVolume)
  const subtitleTracks = sanitizeSubtitleTracks(raw.subtitleTracks)

  return {
    id,
    name,
    createdAt,
    updatedAt,
    duration,
    fps,
    aspectRatio,
    resolution,
    tracks,
    thumbnailPath,
    audioMasterVolume,
    subtitleTracks,
  }
}
