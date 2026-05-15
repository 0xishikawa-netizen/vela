import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { v4 as uuid } from 'uuid'
import type {
  Project,
  Clip,
  TrackType,
  AspectRatio,
  VideoClip,
  AudioClip,
  TelopClip,
  SubtitleSegment,
  SubtitleTrack,
} from '../lib/types'
import { DEFAULT_COLOR_GRADE, DEFAULT_TRANSITION, DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE } from '../lib/types'
import {
  cloneProject,
  coerceTimelineSeconds,
  computeTimelineEndSeconds,
  makeDefaultTracks,
  sanitizeProject,
} from '../lib/projectSanitize'
import {
  applySubtitleSegmentPatch,
  type SubtitleSegmentPatch,
  parseSrt,
  parseVtt,
  sanitizeSubtitleSegment,
  sortSubtitleSegmentsByStart,
} from '../lib/subtitleFormat'
import { subtitleSegmentsToTelopClipPayloads } from '../lib/subtitleTelopBridge'
import { normalizeAudioMasterVolumeValue } from '../lib/audioMix'
import { useHistoryStore } from './historyStore'
import { useEditorStore } from './editorStore'
import { clearTranscriptionJobsOnly, resetEditorSessionAndClearTranscriptionJobs } from './sessionActions'
import { useTranscriptionStore } from './transcriptionStore'
import { useUiToastStore } from './uiToastStore'
import { transcriptionTrackNameFromSourcePath } from '../lib/transcriptionEngine'

interface ProjectStore {
  projects: Project[]
  current: Project | null

  loadProjects: () => Promise<void>
  createProject: (name: string, aspectRatio: AspectRatio, fps: number) => Promise<Project>
  openProject: (id: string) => Promise<void>
  saveProject: () => Promise<void>
  deleteProject: (id: string) => Promise<void>
  closeProject: () => void
  replaceCurrent: (project: Project) => void

  addTrack: (type: TrackType) => void
  removeTrack: (trackId: string) => void
  toggleMute: (trackId: string) => void
  toggleLock: (trackId: string) => void
  setTrackVolume: (trackId: string, volume: number) => void
  /** 0〜2（等倍〜200%）、プレビュー・書き出しの最終ゲインに乗算 */
  setAudioMasterVolume: (volume: number) => void
  setTrackPan: (trackId: string, pan: number) => void
  toggleSolo: (trackId: string) => void

  addClip: (trackId: string, clip: Omit<Clip, 'id'>) => void
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void
  removeClip: (trackId: string, clipId: string) => void
  moveClip: (trackId: string, clipId: string, newStart: number) => void
  trimClipStart: (trackId: string, clipId: string, newSourceStart: number, newTimelineStart: number) => void
  trimClipEnd: (trackId: string, clipId: string, newSourceEnd: number) => void
  splitClip: (trackId: string, clipId: string, atTime: number) => void
  /** 再生ヘッド位置でクリップを分割（選択クリップ優先、なければヘッド下のクリップ） */
  splitAtCurrentTime: () => void

  /** パース済みテキストから字幕トラックを 1 本追加 */
  importSubtitleText: (filePath: string, text: string, kind: 'srt' | 'vtt') => void
  subtitleTracksClear: () => void
  /** 先頭トラック（または `trackIndex`）を既定テロップでテロップトラックに追加 */
  applySubtitleTrackToTelop: (trackIndex?: number) => void

  addEmptySubtitleTrack: () => void
  updateSubtitleTrack: (trackId: string, patch: Partial<Pick<SubtitleTrack, 'name' | 'language'>>) => void
  removeSubtitleTrack: (trackId: string) => void
  addSubtitleSegment: (
    trackId: string,
    payload?: Partial<Pick<SubtitleSegment, 'startSec' | 'endSec' | 'text' | 'speaker' | 'confidence'>>,
  ) => void
  updateSubtitleSegment: (trackId: string, segmentId: string, patch: SubtitleSegmentPatch) => void
  removeSubtitleSegment: (trackId: string, segmentId: string) => void
  sortSubtitleSegments: (trackId: string) => void
  /** 文字起こし mock / 将来 Whisper の結果を 1 トラック追加 */
  addSubtitleTrackFromTranscription: (args: {
    name: string
    language?: string
    segments: SubtitleSegment[]
  }) => void
  /** 完了した文字起こしジョブを `subtitleTracks` に 1 本追加（`transcriptionStore` 参照） */
  applyTranscriptionResultToSubtitleTrack: (jobId: string) => boolean
}

const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '21:9': { width: 2560, height: 1080 },
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    projects: [],
    current: null,

    loadProjects: async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.listProjects) {
        set((s) => {
          s.projects = []
        })
        return
      }
      try {
        const list = await api.listProjects()
        const arr = Array.isArray(list) ? list : []
        const sanitized = arr.map(sanitizeProject).filter((p): p is Project => p != null)
        set((s) => {
          s.projects = sanitized
        })
      } catch (e) {
        set((s) => {
          s.projects = []
        })
        const msg = e instanceof Error ? e.message : 'プロジェクト一覧を読めませんでした'
        throw new Error(msg)
      }
    },

    createProject: async (name, aspectRatio, fps) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.saveProject) {
        throw new Error('Electron の API が使えません。ターミナルで npm run dev から起動してください。')
      }
      const project: Project = {
        id: uuid(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        duration: 0,
        fps,
        aspectRatio,
        resolution: ASPECT_RATIOS[aspectRatio],
        tracks: makeDefaultTracks(),
        subtitleTracks: [],
      }
      const forDisk = cloneProject(project)
      await api.saveProject(forDisk.id, forDisk)
      resetEditorSessionAndClearTranscriptionJobs()
      const forList = cloneProject(forDisk)
      const forEditor = cloneProject(forDisk)
      set((s) => {
        s.projects.unshift(forList)
        s.current = forEditor
      })
      useHistoryStore.getState().reset(forEditor)
      return forEditor
    },

    openProject: async (id) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.loadProject) {
        throw new Error('Electron の API が使えません。npm run dev から起動してください。')
      }
      let raw: unknown
      try {
        raw = await api.loadProject(id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(msg)
      }
      const project = sanitizeProject(raw)
      if (!project) {
        throw new Error('プロジェクトデータが無効です。JSON を確認してください。')
      }
      resetEditorSessionAndClearTranscriptionJobs()
      const forEditor = cloneProject(project)
      set((s) => {
        s.current = forEditor
      })
      useHistoryStore.getState().reset(forEditor)
    },

    saveProject: async () => {
      const { current } = get()
      if (!current) return
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.saveProject) return
      try {
        const plain = cloneProject(current)
        const updated = { ...plain, updatedAt: new Date().toISOString() }
        await api.saveProject(updated.id, updated)
        set((s) => {
          s.current = cloneProject(updated)
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'プロジェクトの保存に失敗しました'
        useUiToastStore.getState().pushToast({ message: msg, variant: 'error', dedupeKey: 'save-project-fail' })
        throw e
      }
    },

    deleteProject: async (id) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.deleteProject) return
      try {
        await api.deleteProject(id)
        set((s) => {
          s.projects = s.projects.filter((p) => p.id !== id)
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'プロジェクトを削除できませんでした'
        useUiToastStore.getState().pushToast({ message: msg, variant: 'error', dedupeKey: 'delete-project-fail' })
        throw e
      }
    },

    closeProject: () => {
      clearTranscriptionJobsOnly()
      set((s) => {
        s.current = null
      })
    },

    replaceCurrent: (project) => {
      const p = sanitizeProject(project as unknown)
      if (!p) return
      set((s) => {
        s.current = cloneProject(p)
      })
    },

    addTrack: (type) =>
      set((s) => {
        if (!s.current) return
        const count = s.current.tracks.filter((t) => t.type === type).length + 1
        const labels: Record<TrackType, string> = {
          video: '映像',
          audio: '音声',
          telop: 'テロップ',
          image: '画像',
        }
        s.current.tracks.push({
          id: uuid(),
          type,
          name: `${labels[type]} ${count}`,
          muted: false,
          locked: false,
          volume: 1,
          solo: false,
          pan: 0,
          clips: [],
        })
      }),

    removeTrack: (trackId) =>
      set((s) => {
        if (!s.current) return
        s.current.tracks = s.current.tracks.filter((t) => t.id !== trackId)
      }),

    toggleMute: (trackId) =>
      set((s) => {
        if (!s.current) return
        const t = s.current.tracks.find((x) => x.id === trackId)
        if (t) t.muted = !t.muted
      }),

    toggleLock: (trackId) =>
      set((s) => {
        if (!s.current) return
        const t = s.current.tracks.find((x) => x.id === trackId)
        if (t) t.locked = !t.locked
      }),

    setTrackVolume: (trackId, volume) =>
      set((s) => {
        if (!s.current) return
        const t = s.current.tracks.find((x) => x.id === trackId)
        if (!t || t.type !== 'audio') return
        t.volume = Math.min(4, Math.max(0, volume))
      }),

    setAudioMasterVolume: (volume) =>
      set((s) => {
        if (!s.current) return
        s.current.audioMasterVolume = normalizeAudioMasterVolumeValue(volume)
      }),

    setTrackPan: (trackId, pan) =>
      set((s) => {
        if (!s.current) return
        const t = s.current.tracks.find((x) => x.id === trackId)
        if (!t || t.type !== 'audio') return
        t.pan = Math.min(1, Math.max(-1, pan))
      }),

    toggleSolo: (trackId) =>
      set((s) => {
        if (!s.current) return
        const t = s.current.tracks.find((x) => x.id === trackId)
        if (!t || t.type !== 'audio') return
        if (t.solo) {
          for (const tr of s.current.tracks) {
            if (tr.type === 'audio') tr.solo = false
          }
        } else {
          for (const tr of s.current.tracks) {
            if (tr.type === 'audio') tr.solo = tr.id === trackId
          }
        }
      }),

    addClip: (trackId, clip) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        if (!track || track.locked) return
        track.clips.push({ ...clip, id: uuid() } as Clip)
        const end = coerceTimelineSeconds(clip.timelineStart) + coerceTimelineSeconds(clip.timelineDuration)
        if (end > s.current.duration) s.current.duration = end
      }),

    updateClip: (trackId, clipId, updates) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        const clip = track?.clips.find((c) => c.id === clipId)
        if (clip) Object.assign(clip, updates)
      }),

    removeClip: (trackId, clipId) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        if (track) track.clips = track.clips.filter((c) => c.id !== clipId)
      }),

    moveClip: (trackId, clipId, newStart) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        const clip = track?.clips.find((c) => c.id === clipId)
        if (clip && track && !track.locked) {
          clip.timelineStart = Math.max(0, newStart)
          const end = coerceTimelineSeconds(clip.timelineStart) + coerceTimelineSeconds(clip.timelineDuration)
          if (end > s.current.duration) s.current.duration = end
        }
      }),

    trimClipStart: (trackId, clipId, newSourceStart, newTimelineStart) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        const clip = track?.clips.find((c) => c.id === clipId) as VideoClip | AudioClip | undefined
        if (!clip || track?.locked) return
        if (clip.type !== 'video' && clip.type !== 'audio') return
        const delta = clip.timelineStart - newTimelineStart
        clip.sourceStart = newSourceStart
        clip.timelineStart = newTimelineStart
        clip.timelineDuration += delta
      }),

    trimClipEnd: (trackId, clipId, newSourceEnd) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        const clip = track?.clips.find((c) => c.id === clipId) as VideoClip | AudioClip | undefined
        if (!clip || track?.locked) return
        if (clip.type !== 'video' && clip.type !== 'audio') return
        clip.sourceEnd = newSourceEnd
        clip.timelineDuration = newSourceEnd - clip.sourceStart
      }),

    splitClip: (trackId, clipId, atTime) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        if (!track || track.locked) return
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx < 0) return
        const clip = track.clips[idx] as VideoClip | AudioClip | TelopClip
        const at = coerceTimelineSeconds(atTime)
        const cs = coerceTimelineSeconds(clip.timelineStart)
        const tlDur = coerceTimelineSeconds(clip.timelineDuration)
        const splitPoint = at - cs
        const eps = Math.min(0.05, Math.max(0.001, tlDur * 0.003))
        if (splitPoint <= eps || splitPoint >= tlDur - eps) return

        const first = { ...clip, id: uuid(), timelineDuration: splitPoint } as Clip
        if (first.type === 'video' || first.type === 'audio') {
          const vc = first as VideoClip | AudioClip
          vc.sourceEnd = vc.sourceStart + splitPoint
        }

        const second = {
          ...clip,
          id: uuid(),
          timelineStart: at,
          timelineDuration: tlDur - splitPoint,
        } as Clip
        if (second.type === 'video' || second.type === 'audio') {
          const sc = second as VideoClip | AudioClip
          sc.sourceStart = (clip as VideoClip | AudioClip).sourceStart + splitPoint
        }

        track.clips.splice(idx, 1, first, second)

        let maxEnd = coerceTimelineSeconds(s.current.duration)
        for (const tr of s.current.tracks) {
          for (const c of tr.clips) {
            const e = coerceTimelineSeconds(c.timelineStart) + coerceTimelineSeconds(c.timelineDuration)
            if (e > maxEnd) maxEnd = e
          }
        }
        const computed = computeTimelineEndSeconds(s.current)
        s.current.duration = Math.max(maxEnd, computed)
      }),

    importSubtitleText: (filePath, text, kind) =>
      set((s) => {
        if (!s.current) return
        const segmentsRaw = kind === 'vtt' ? parseVtt(text) : parseSrt(text)
        const segments = segmentsRaw.map((seg) => ({
          ...seg,
          id: seg.id && seg.id.trim() ? seg.id : uuid(),
        }))
        if (!s.current.subtitleTracks) s.current.subtitleTracks = []
        const base = filePath.split(/[/\\]/).pop() ?? 'imported'
        const name = base.replace(/\.(srt|vtt)$/i, '') || '字幕'
        s.current.subtitleTracks.push({
          id: uuid(),
          name,
          segments,
        })
        const end = computeTimelineEndSeconds(s.current)
        if (end > s.current.duration) s.current.duration = end
      }),

    subtitleTracksClear: () =>
      set((s) => {
        if (!s.current) return
        s.current.subtitleTracks = []
      }),

    applySubtitleTrackToTelop: (trackIndex = 0) =>
      set((s) => {
        if (!s.current) return
        const tracks = s.current.subtitleTracks ?? []
        const st = tracks[trackIndex]
        if (!st || st.segments.length === 0) return
        const telopTrack = s.current.tracks.find((t) => t.type === 'telop')
        if (!telopTrack || telopTrack.locked) return
        const payloads = subtitleSegmentsToTelopClipPayloads(st.segments)
        for (const p of payloads) {
          telopTrack.clips.push({ ...p, id: uuid() } as TelopClip)
        }
        const end = computeTimelineEndSeconds(s.current)
        if (end > s.current.duration) s.current.duration = end
      }),

    addEmptySubtitleTrack: () =>
      set((s) => {
        if (!s.current) return
        if (!s.current.subtitleTracks) s.current.subtitleTracks = []
        const n = s.current.subtitleTracks.length + 1
        s.current.subtitleTracks.push({
          id: uuid(),
          name: `字幕 ${n}`,
          segments: [],
        })
      }),

    updateSubtitleTrack: (trackId, patch) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        const tr = s.current.subtitleTracks.find((t) => t.id === trackId)
        if (!tr) return
        if (typeof patch.name === 'string') {
          const nm = patch.name.trim()
          if (nm) tr.name = nm
        }
        if ('language' in patch) {
          const lang = patch.language
          tr.language = typeof lang === 'string' && lang.trim() ? lang.trim() : undefined
        }
      }),

    removeSubtitleTrack: (trackId) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        s.current.subtitleTracks = s.current.subtitleTracks.filter((t) => t.id !== trackId)
      }),

    addSubtitleSegment: (trackId, payload) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        const tr = s.current.subtitleTracks.find((t) => t.id === trackId)
        if (!tr) return
        const lastEnd = tr.segments.length ? Math.max(...tr.segments.map((x) => x.endSec)) : NaN
        const ct = Math.max(0, useEditorStore.getState().currentTime)
        let start = Number.isFinite(lastEnd) ? lastEnd : ct
        if (typeof payload?.startSec === 'number' && Number.isFinite(payload.startSec)) start = payload.startSec
        let end = start + 3
        if (typeof payload?.endSec === 'number' && Number.isFinite(payload.endSec)) end = payload.endSec
        const newSeg = applySubtitleSegmentPatch(
          {
            id: uuid(),
            startSec: start,
            endSec: end,
            text: typeof payload?.text === 'string' ? payload.text : '',
            speaker: payload?.speaker,
            confidence: payload?.confidence,
          },
          {},
        )
        tr.segments.push(newSeg)
        const timelineEnd = computeTimelineEndSeconds(s.current)
        if (timelineEnd > s.current.duration) s.current.duration = timelineEnd
      }),

    updateSubtitleSegment: (trackId, segmentId, patch) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        const tr = s.current.subtitleTracks.find((t) => t.id === trackId)
        const idx = tr?.segments.findIndex((x) => x.id === segmentId) ?? -1
        if (!tr || idx < 0) return
        tr.segments[idx] = applySubtitleSegmentPatch(tr.segments[idx]!, patch)
        const timelineEnd = computeTimelineEndSeconds(s.current)
        if (timelineEnd > s.current.duration) s.current.duration = timelineEnd
      }),

    removeSubtitleSegment: (trackId, segmentId) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        const tr = s.current.subtitleTracks.find((t) => t.id === trackId)
        if (!tr) return
        tr.segments = tr.segments.filter((x) => x.id !== segmentId)
      }),

    sortSubtitleSegments: (trackId) =>
      set((s) => {
        if (!s.current?.subtitleTracks) return
        const tr = s.current.subtitleTracks.find((t) => t.id === trackId)
        if (!tr) return
        tr.segments = sortSubtitleSegmentsByStart(tr.segments)
      }),

    addSubtitleTrackFromTranscription: (args) =>
      set((s) => {
        if (!s.current) return
        if (!s.current.subtitleTracks) s.current.subtitleTracks = []
        const segments = args.segments.map((seg) =>
          sanitizeSubtitleSegment({
            ...seg,
            id: seg.id && seg.id.trim() ? seg.id.trim() : uuid(),
          }),
        )
        s.current.subtitleTracks.push({
          id: uuid(),
          name: args.name.trim() || '文字起こし',
          language: typeof args.language === 'string' && args.language.trim() ? args.language.trim() : undefined,
          segments,
        })
        const timelineEnd = computeTimelineEndSeconds(s.current)
        if (timelineEnd > s.current.duration) s.current.duration = timelineEnd
      }),

    applyTranscriptionResultToSubtitleTrack: (jobId) => {
      const job = useTranscriptionStore.getState().jobs.find((j) => j.id === jobId)
      if (!job || job.status !== 'completed' || !job.resultSegments?.length) return false
      if (!get().current) return false
      const engine = job.engine ?? 'mock'
      get().addSubtitleTrackFromTranscription({
        name: transcriptionTrackNameFromSourcePath(job.sourceMediaPath, engine),
        language: job.options?.language ?? job.language,
        segments: job.resultSegments,
      })
      return true
    },

    splitAtCurrentTime: () => {
      const current = get().current
      if (!current) return
      const t = useEditorStore.getState().currentTime
      const st = useEditorStore.getState()
      const selTrack = st.selectedTrackId
      const selClip = st.selectedClipId

      const trySplit = (trackId: string, clipId: string, at: number) => {
        const snap = get().current
        if (snap) useHistoryStore.getState().push(cloneProject(snap))
        get().splitClip(trackId, clipId, at)
      }

      if (selTrack && selClip) {
        const track = current.tracks.find((tr) => tr.id === selTrack)
        if (track && !track.locked) {
          const clip = track.clips.find((c) => c.id === selClip)
          if (clip) {
            const start = coerceTimelineSeconds(clip.timelineStart)
            const end = start + coerceTimelineSeconds(clip.timelineDuration)
            if (t > start && t < end) {
              trySplit(selTrack, selClip, t)
              return
            }
          }
        }
      }

      for (const track of current.tracks) {
        if (track.locked) continue
        for (const clip of track.clips) {
          const start = coerceTimelineSeconds(clip.timelineStart)
          const end = start + coerceTimelineSeconds(clip.timelineDuration)
          if (t > start && t < end) {
            trySplit(track.id, clip.id, t)
            return
          }
        }
      }
    },
  })),
)

export function buildVideoClipFromMedia(
  sourcePath: string,
  duration: number,
  timelineStart: number,
): Omit<VideoClip, 'id'> {
  const sec = coerceTimelineSeconds(duration) || 5
  const start = coerceTimelineSeconds(timelineStart)
  return {
    type: 'video',
    sourcePath,
    timelineStart: start,
    timelineDuration: sec,
    sourceStart: 0,
    sourceEnd: sec,
    volume: 1,
    speed: 1,
    filter: 'none',
    colorGrade: { ...DEFAULT_COLOR_GRADE },
    transitionIn: { ...DEFAULT_TRANSITION },
    transitionOut: { ...DEFAULT_TRANSITION },
  }
}

export function buildTelopClip(
  text: string,
  timelineStart: number,
  duration: number,
): Omit<TelopClip, 'id'> {
  return {
    type: 'telop',
    text,
    timelineStart,
    timelineDuration: duration,
    style: { ...DEFAULT_TELOP_STYLE },
    animation: { ...DEFAULT_TELOP_ANIMATION },
    position: 'bottom_center',
    transitionIn: { ...DEFAULT_TRANSITION },
    transitionOut: { ...DEFAULT_TRANSITION },
  }
}

export function buildAudioClip(
  sourcePath: string,
  sourceDuration: number,
  timelineStart: number,
): Omit<AudioClip, 'id'> {
  const sec = coerceTimelineSeconds(sourceDuration) || 5
  const start = coerceTimelineSeconds(timelineStart)
  return {
    type: 'audio',
    sourcePath,
    timelineStart: start,
    timelineDuration: sec,
    sourceStart: 0,
    sourceEnd: sec,
    volume: 1,
    muted: false,
    pan: 0,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: { ...DEFAULT_TRANSITION },
    transitionOut: { ...DEFAULT_TRANSITION },
  }
}
