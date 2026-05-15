import { create } from 'zustand'
import { clearWaveformPeakCache, loadWaveformPeaksForPath, type WaveformPeaks } from '../lib/waveform'

/** 同一ファイルへの `loadWaveform` 並行呼び出しを 1 本にまとめる */
const waveformInflight = new Map<string, Promise<void>>()

type PanelType = 'properties' | 'text' | 'subtitles' | 'effects' | 'audio' | 'ai'

/** 音声波形の読み込み状態（パスごと）。loading / failed / ready は排他。 */
export type WaveformLoadPhase = 'idle' | 'loading' | 'ready' | 'failed'

interface EditorStore {
  currentTime: number
  isPlaying: boolean
  zoom: number
  selectedClipId: string | null
  selectedTrackId: string | null
  activePanel: PanelType
  scrollLeft: number
  exportModalOpen: boolean
  /** 音声ファイルパス → 波形 peaks（in-memory cache、`src/lib/waveform.ts` の Map と併用） */
  waveforms: Record<string, WaveformPeaks>
  /** パスごとの波形取得フェーズ（`waveformFailed` / `waveformLoading` の単一モデル） */
  waveformPhase: Record<string, WaveformLoadPhase>

  setCurrentTime: (t: number) => void
  setPlaying: (v: boolean) => void
  setZoom: (z: number) => void
  selectClip: (trackId: string, clipId: string) => void
  deselect: () => void
  setActivePanel: (p: PanelType) => void
  setScrollLeft: (x: number) => void
  setExportModalOpen: (v: boolean) => void
  /** 新規プロジェクト作成・別プロジェクトを開いたときに呼ぶ */
  resetSession: () => void
  loadWaveform: (filePath: string) => Promise<void>
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  currentTime: 0,
  isPlaying: false,
  zoom: 80,
  selectedClipId: null,
  selectedTrackId: null,
  activePanel: 'properties',
  scrollLeft: 0,
  exportModalOpen: false,
  waveforms: {},
  waveformPhase: {},

  resetSession: () => {
    clearWaveformPeakCache()
    set({
      currentTime: 0,
      isPlaying: false,
      zoom: 80,
      selectedClipId: null,
      selectedTrackId: null,
      activePanel: 'properties',
      scrollLeft: 0,
      exportModalOpen: false,
      waveforms: {},
      waveformPhase: {},
    })
  },

  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setPlaying: (v) => set({ isPlaying: v }),
  setZoom: (z) => set({ zoom: Math.min(300, Math.max(10, z)) }),
  selectClip: (trackId, clipId) =>
    set({ selectedTrackId: trackId, selectedClipId: clipId, activePanel: 'properties' }),
  deselect: () => set({ selectedClipId: null, selectedTrackId: null }),
  setActivePanel: (p) => set({ activePanel: p }),
  setScrollLeft: (x) => set({ scrollLeft: Math.max(0, x) }),
  setExportModalOpen: (v) => set({ exportModalOpen: v }),

  loadWaveform: async (filePath) => {
    const key = filePath.trim()
    if (!key) return

    const existingFlight = waveformInflight.get(key)
    if (existingFlight) return existingFlight

    const run = (async () => {
      const st = get()
      if (st.waveformPhase[key] === 'failed') return
      if (st.waveforms[key]?.peaks?.length) return

      set((s) => ({ waveformPhase: { ...s.waveformPhase, [key]: 'loading' } }))

      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      const toU8 = (data: Uint8Array | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number }): Uint8Array => {
        if (data instanceof Uint8Array) return data
        return new Uint8Array(data.buffer, data.byteOffset ?? 0, data.byteLength ?? 0)
      }

      try {
        const peaksData = await loadWaveformPeaksForPath(key, {
          readAudioFileForWaveform: api?.readAudioFileForWaveform
            ? async (p) => {
                try {
                  const r = await api.readAudioFileForWaveform!(p)
                  if (r.ok === true)
                    return {
                      ok: true,
                      data: toU8(r.data),
                      mtimeMs: r.mtimeMs,
                      fileSize: r.fileSize,
                    }
                  return { ok: false, reason: r.reason, mtimeMs: r.mtimeMs, fileSize: r.fileSize }
                } catch {
                  return { ok: false, reason: 'error' }
                }
              }
            : undefined,
          getWaveform: api?.getWaveform,
          getMediaDurationSec: api?.getMediaInfo
            ? async (p) => {
                try {
                  const m = await api.getMediaInfo(p)
                  const d = m?.duration
                  return typeof d === 'number' && Number.isFinite(d) ? d : undefined
                } catch {
                  return undefined
                }
              }
            : undefined,
        })
        if (peaksData?.peaks?.length) {
          set((s) => ({
            waveforms: { ...s.waveforms, [key]: peaksData },
            waveformPhase: { ...s.waveformPhase, [key]: 'ready' },
          }))
        } else {
          set((s) => ({ waveformPhase: { ...s.waveformPhase, [key]: 'failed' } }))
        }
      } catch {
        set((s) => ({ waveformPhase: { ...s.waveformPhase, [key]: 'failed' } }))
      } finally {
        set((s) => {
          const cur = s.waveformPhase[key]
          if (cur === 'loading') {
            return { waveformPhase: { ...s.waveformPhase, [key]: 'failed' } }
          }
          return {}
        })
      }
    })()

    waveformInflight.set(key, run)
    try {
      await run
    } finally {
      waveformInflight.delete(key)
    }
  },
}))
