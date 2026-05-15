import { create } from 'zustand'
import type { WhisperLocalSettings } from '../lib/types'
import { sanitizeWhisperLocalSettings } from '../lib/whisperLocalSettings'

interface WhisperLocalSettingsState {
  hydrated: boolean
  settings: WhisperLocalSettings
  load: () => Promise<void>
  patch: (p: Partial<WhisperLocalSettings>) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

async function persist(settings: WhisperLocalSettings): Promise<void> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.saveWhisperLocalSettings) return
  await api.saveWhisperLocalSettings(sanitizeWhisperLocalSettings(settings))
}

function schedulePersist(getSettings: () => WhisperLocalSettings): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void persist(getSettings())
  }, 400)
}

export const useWhisperLocalSettingsStore = create<WhisperLocalSettingsState>((set, get) => ({
  hydrated: false,
  settings: {},

  load: async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.loadWhisperLocalSettings) {
      set({ hydrated: true })
      return
    }
    try {
      const raw = await api.loadWhisperLocalSettings()
      set({ settings: sanitizeWhisperLocalSettings(raw), hydrated: true })
    } catch {
      set({ settings: {}, hydrated: true })
    }
  },

  patch: (p) => {
    set((s) => ({
      settings: sanitizeWhisperLocalSettings({ ...s.settings, ...p }),
    }))
    schedulePersist(() => get().settings)
  },
}))
