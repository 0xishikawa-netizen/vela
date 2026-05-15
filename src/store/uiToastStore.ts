import { create } from 'zustand'

export type UiToastVariant = 'warning' | 'error' | 'info'

export type UiToastItem = {
  id: string
  message: string
  variant: UiToastVariant
  /** 同一キーは短時間内に 1 件だけ（連打・Strict Mode 二重実行の抑制） */
  dedupeKey?: string
}

const dedupeAt = new Map<string, number>()
const DEDUPE_MS = 5000

type UiToastState = {
  toasts: UiToastItem[]
  pushToast: (t: Omit<UiToastItem, 'id'> & { id?: string }) => void
  dismissToast: (id: string) => void
}

function shouldDedupe(key: string): boolean {
  const now = Date.now()
  const prev = dedupeAt.get(key)
  if (prev !== undefined && now - prev < DEDUPE_MS) return true
  dedupeAt.set(key, now)
  return false
}

export const useUiToastStore = create<UiToastState>((set, get) => ({
  toasts: [],
  pushToast: (t) => {
    if (t.dedupeKey && shouldDedupe(t.dedupeKey)) return
    const id = t.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const item: UiToastItem = { id, message: t.message, variant: t.variant, dedupeKey: t.dedupeKey }
    set({ toasts: [...get().toasts, item] })
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))
