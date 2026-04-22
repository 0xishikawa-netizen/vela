import { create } from 'zustand'

type PanelType = 'properties' | 'text' | 'effects' | 'audio' | 'ai'

interface EditorStore {
  currentTime: number
  isPlaying: boolean
  zoom: number
  selectedClipId: string | null
  selectedTrackId: string | null
  activePanel: PanelType
  scrollLeft: number

  setCurrentTime: (t: number) => void
  setPlaying: (v: boolean) => void
  setZoom: (z: number) => void
  selectClip: (trackId: string, clipId: string) => void
  deselect: () => void
  setActivePanel: (p: PanelType) => void
  setScrollLeft: (x: number) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  currentTime: 0,
  isPlaying: false,
  zoom: 80,
  selectedClipId: null,
  selectedTrackId: null,
  activePanel: 'properties',
  scrollLeft: 0,

  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setPlaying: (v) => set({ isPlaying: v }),
  setZoom: (z) => set({ zoom: Math.min(300, Math.max(10, z)) }),
  selectClip: (trackId, clipId) =>
    set({ selectedTrackId: trackId, selectedClipId: clipId, activePanel: 'properties' }),
  deselect: () => set({ selectedClipId: null, selectedTrackId: null }),
  setActivePanel: (p) => set({ activePanel: p }),
  setScrollLeft: (x) => set({ scrollLeft: Math.max(0, x) }),
}))
