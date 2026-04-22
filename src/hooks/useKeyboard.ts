import { useEffect } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'
import { useHistoryStore } from '../store/historyStore'

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

function meta(ev: KeyboardEvent) {
  return isMac ? ev.metaKey : ev.ctrlKey
}

export function useKeyboardShortcuts() {
  const current = useProjectStore((s) => s.current)
  const saveProject = useProjectStore((s) => s.saveProject)
  const removeClip = useProjectStore((s) => s.removeClip)
  const splitClip = useProjectStore((s) => s.splitClip)
  const replaceCurrent = useProjectStore((s) => s.replaceCurrent)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setZoom = useEditorStore((s) => s.setZoom)
  const zoom = useEditorStore((s) => s.zoom)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const currentTime = useEditorStore((s) => s.currentTime)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)
  const fps = current?.fps ?? 30

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!current) return
      const tag = (ev.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (ev.code === 'Space') {
        ev.preventDefault()
        setPlaying(!isPlaying)
      }

      if (meta(ev) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        void saveProject()
      }

      if (meta(ev) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault()
        const snap = ev.shiftKey ? useHistoryStore.getState().redo() : useHistoryStore.getState().undo()
        if (snap) replaceCurrent(snap)
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedTrackId && selectedClipId) {
          ev.preventDefault()
          removeClip(selectedTrackId, selectedClipId)
        }
      }

      if (ev.key === 'b' || ev.key === 'B') {
        if (selectedTrackId && selectedClipId) {
          ev.preventDefault()
          const before = useProjectStore.getState().current
          if (before) useHistoryStore.getState().push(before)
          splitClip(selectedTrackId, selectedClipId, currentTime)
        }
      }

      if (meta(ev) && (ev.key === '=' || ev.key === '+')) {
        ev.preventDefault()
        setZoom(zoom * 1.15)
      }
      if (meta(ev) && ev.key === '-') {
        ev.preventDefault()
        setZoom(zoom / 1.15)
      }
      if (meta(ev) && ev.key === '0') {
        ev.preventDefault()
        setZoom(80)
      }

      if (ev.key === 'ArrowLeft') {
        ev.preventDefault()
        const frames = ev.shiftKey ? 10 : 1
        setCurrentTime(Math.max(0, currentTime - frames / fps))
      }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault()
        const frames = ev.shiftKey ? 10 : 1
        setCurrentTime(currentTime + frames / fps)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    current,
    saveProject,
    removeClip,
    splitClip,
    replaceCurrent,
    setPlaying,
    isPlaying,
    setZoom,
    zoom,
    setCurrentTime,
    currentTime,
    selectedClipId,
    selectedTrackId,
    fps,
  ])
}
