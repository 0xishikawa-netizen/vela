import { create } from 'zustand'
import type { Project } from '../lib/types'

const MAX = 80

function cloneProject(p: Project): Project {
  return structuredClone(p)
}

interface HistoryStore {
  snapshots: Project[]
  index: number
  push: (p: Project) => void
  undo: () => Project | null
  redo: () => Project | null
  reset: (p: Project) => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  snapshots: [],
  index: -1,

  reset: (p) =>
    set({
      snapshots: [cloneProject(p)],
      index: 0,
    }),

  push: (p) =>
    set((s) => {
      const base = s.index >= 0 ? s.snapshots.slice(0, s.index + 1) : []
      const next = [...base, cloneProject(p)].slice(-MAX)
      return { snapshots: next, index: next.length - 1 }
    }),

  undo: () => {
    const { snapshots, index } = get()
    if (index <= 0) return null
    const newIndex = index - 1
    set({ index: newIndex })
    return cloneProject(snapshots[newIndex])
  },

  redo: () => {
    const { snapshots, index } = get()
    if (index < 0 || index >= snapshots.length - 1) return null
    const newIndex = index + 1
    set({ index: newIndex })
    return cloneProject(snapshots[newIndex])
  },
}))
