import { useEffect } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'
import { computeTimelineEndSeconds } from '../lib/projectSanitize'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

function meta(ev: KeyboardEvent) {
  return isMac ? ev.metaKey : ev.ctrlKey
}

/** テキスト入力・セレクト中はアプリショートカットを無効化 */
function isTypingContext(ev: KeyboardEvent): boolean {
  const t = ev.target as HTMLElement | null
  if (!t) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return false
}

/** Space で再生したいが、フォーカスがボタン／リンクのときはブラウザ既定（クリック）を優先 */
function isSpaceBlockedTarget(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return false
  const tag = ae.tagName
  return tag === 'BUTTON' || tag === 'A'
}

export function useKeyboardShortcuts() {
  const current = useProjectStore((s) => s.current)
  const saveProject = useProjectStore((s) => s.saveProject)
  const closeProject = useProjectStore((s) => s.closeProject)
  const removeClip = useProjectStore((s) => s.removeClip)
  const splitAtCurrentTime = useProjectStore((s) => s.splitAtCurrentTime)
  const replaceCurrent = useProjectStore((s) => s.replaceCurrent)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen)
  const deselect = useEditorStore((s) => s.deselect)
  const fps = current?.fps ?? 30

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!current) return
      if (isTypingContext(ev)) return

      if (ev.key === 'Escape') {
        ev.preventDefault()
        if (useEditorStore.getState().exportModalOpen) {
          setExportModalOpen(false)
          return
        }
        deselect()
        return
      }

      if (useEditorStore.getState().exportModalOpen) return

      const duration = computeTimelineEndSeconds(current)
      const frameDur = 1 / fps

      if (ev.code === 'Space') {
        if (isSpaceBlockedTarget()) return
        ev.preventDefault()
        const playing = useEditorStore.getState().isPlaying
        setPlaying(!playing)
        return
      }

      if (meta(ev) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        void saveProject()
        return
      }

      if (meta(ev) && ev.key.toLowerCase() === 'e') {
        ev.preventDefault()
        setExportModalOpen(true)
        return
      }

      if (meta(ev) && ev.key.toLowerCase() === 'w') {
        ev.preventDefault()
        closeProject()
        return
      }

      if (meta(ev) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault()
        const snap = ev.shiftKey ? useHistoryStore.getState().redo() : useHistoryStore.getState().undo()
        if (snap) replaceCurrent(snap)
        return
      }

      if (!isMac && ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'y') {
        ev.preventDefault()
        const snap = useHistoryStore.getState().redo()
        if (snap) replaceCurrent(snap)
        return
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const st = useEditorStore.getState()
        if (st.selectedTrackId && st.selectedClipId) {
          ev.preventDefault()
          removeClip(st.selectedTrackId, st.selectedClipId)
        }
        return
      }

      if (ev.key === 'b' || ev.key === 'B' || ev.key === 'k' || ev.key === 'K') {
        ev.preventDefault()
        splitAtCurrentTime()
        return
      }

      if (meta(ev) && (ev.key === '=' || ev.key === '+')) {
        ev.preventDefault()
        setZoom(useEditorStore.getState().zoom * 1.15)
        return
      }
      if (meta(ev) && ev.key === '-') {
        ev.preventDefault()
        setZoom(useEditorStore.getState().zoom / 1.15)
        return
      }
      if (meta(ev) && ev.key === '0') {
        ev.preventDefault()
        setZoom(80)
        return
      }

      if (ev.key === 'ArrowLeft') {
        ev.preventDefault()
        const st = useEditorStore.getState()
        const frames = ev.shiftKey ? 10 : 1
        setCurrentTime(Math.max(0, st.currentTime - frames / fps))
        return
      }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault()
        const st = useEditorStore.getState()
        const frames = ev.shiftKey ? 10 : 1
        const next = st.currentTime + frames / fps
        setCurrentTime(duration > 0 ? Math.min(duration - 1e-3, next) : next)
        return
      }

      if (ev.key === 'Home') {
        ev.preventDefault()
        setCurrentTime(0)
        return
      }
      if (ev.key === 'End') {
        ev.preventDefault()
        setCurrentTime(duration > 0 ? Math.max(0, duration - 1e-3) : 0)
        return
      }

      if (ev.code === 'Comma') {
        ev.preventDefault()
        const st = useEditorStore.getState()
        setCurrentTime(Math.max(0, st.currentTime - frameDur))
        return
      }
      if (ev.code === 'Period') {
        ev.preventDefault()
        const st = useEditorStore.getState()
        const next = st.currentTime + frameDur
        setCurrentTime(duration > 0 ? Math.min(duration - 1e-3, next) : next)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    current,
    saveProject,
    closeProject,
    removeClip,
    splitAtCurrentTime,
    replaceCurrent,
    setPlaying,
    setZoom,
    setCurrentTime,
    setExportModalOpen,
    deselect,
    fps,
  ])
}
