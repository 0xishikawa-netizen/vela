import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { v4 as uuid } from 'uuid'
import type { Project, Track, Clip, TrackType, AspectRatio, VideoClip, AudioClip, TelopClip } from '../lib/types'
import { DEFAULT_COLOR_GRADE, DEFAULT_TRANSITION, DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE } from '../lib/types'
import { useHistoryStore } from './historyStore'

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

  addClip: (trackId: string, clip: Omit<Clip, 'id'>) => void
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void
  removeClip: (trackId: string, clipId: string) => void
  moveClip: (trackId: string, clipId: string, newStart: number) => void
  trimClipStart: (trackId: string, clipId: string, newSourceStart: number, newTimelineStart: number) => void
  trimClipEnd: (trackId: string, clipId: string, newSourceEnd: number) => void
  splitClip: (trackId: string, clipId: string, atTime: number) => void
}

const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '21:9': { width: 2560, height: 1080 },
}

function makeDefaultTracks(): Track[] {
  return [
    { id: uuid(), type: 'video', name: '映像 1', muted: false, locked: false, clips: [] },
    { id: uuid(), type: 'telop', name: 'テロップ 1', muted: false, locked: false, clips: [] },
    { id: uuid(), type: 'audio', name: 'BGM 1', muted: false, locked: false, clips: [] },
  ]
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => ({
    projects: [],
    current: null,

    loadProjects: async () => {
      const list = await window.electronAPI.listProjects()
      set((s) => {
        s.projects = list as Project[]
      })
    },

    createProject: async (name, aspectRatio, fps) => {
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
      }
      await window.electronAPI.saveProject(project.id, project)
      set((s) => {
        s.projects.unshift(project)
        s.current = project
      })
      useHistoryStore.getState().reset(project)
      return project
    },

    openProject: async (id) => {
      const project = (await window.electronAPI.loadProject(id)) as Project
      set((s) => {
        s.current = project
      })
      useHistoryStore.getState().reset(project)
    },

    saveProject: async () => {
      const { current } = get()
      if (!current) return
      const updated = { ...current, updatedAt: new Date().toISOString() }
      await window.electronAPI.saveProject(updated.id, updated)
      set((s) => {
        s.current = updated
      })
    },

    deleteProject: async (id) => {
      await window.electronAPI.deleteProject(id)
      set((s) => {
        s.projects = s.projects.filter((p) => p.id !== id)
      })
    },

    closeProject: () =>
      set((s) => {
        s.current = null
      }),

    replaceCurrent: (project) =>
      set((s) => {
        s.current = project
      }),

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

    addClip: (trackId, clip) =>
      set((s) => {
        if (!s.current) return
        const track = s.current.tracks.find((t) => t.id === trackId)
        if (!track || track.locked) return
        track.clips.push({ ...clip, id: uuid() } as Clip)
        const end = clip.timelineStart + clip.timelineDuration
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
          const end = clip.timelineStart + clip.timelineDuration
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
        const splitPoint = atTime - clip.timelineStart
        if (splitPoint <= 0.05 || splitPoint >= clip.timelineDuration - 0.05) return

        const first = { ...clip, id: uuid(), timelineDuration: splitPoint } as Clip
        if (first.type === 'video' || first.type === 'audio') {
          const vc = first as VideoClip | AudioClip
          vc.sourceEnd = vc.sourceStart + splitPoint
        }

        const second = {
          ...clip,
          id: uuid(),
          timelineStart: atTime,
          timelineDuration: clip.timelineDuration - splitPoint,
        } as Clip
        if (second.type === 'video' || second.type === 'audio') {
          const sc = second as VideoClip | AudioClip
          sc.sourceStart = (clip as VideoClip | AudioClip).sourceStart + splitPoint
        }

        track.clips.splice(idx, 1, first, second)
      }),
  })),
)

export function buildVideoClipFromMedia(
  sourcePath: string,
  duration: number,
  timelineStart: number,
): Omit<VideoClip, 'id'> {
  return {
    type: 'video',
    sourcePath,
    timelineStart,
    timelineDuration: duration,
    sourceStart: 0,
    sourceEnd: duration,
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
  return {
    type: 'audio',
    sourcePath,
    timelineStart,
    timelineDuration: sourceDuration,
    sourceStart: 0,
    sourceEnd: sourceDuration,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: { ...DEFAULT_TRANSITION },
    transitionOut: { ...DEFAULT_TRANSITION },
  }
}
