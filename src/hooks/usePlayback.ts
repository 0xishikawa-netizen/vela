import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useProjectStore } from '../store/projectStore'

export function usePlayback() {
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const currentTime = useEditorStore((s) => s.currentTime)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const duration = useProjectStore((s) => s.current?.duration ?? 0)
  const raf = useRef<number>(0)
  const last = useRef<number>(0)

  useEffect(() => {
    if (!isPlaying) {
      last.current = 0
      if (raf.current) cancelAnimationFrame(raf.current)
      return
    }

    const tick = (t: number) => {
      if (!last.current) last.current = t
      const dt = (t - last.current) / 1000
      last.current = t
      const base = useEditorStore.getState().currentTime
      const next = base + dt
      if (next >= duration && duration > 0) {
        setPlaying(false)
        setCurrentTime(Math.max(0, duration - 0.001))
      } else {
        setCurrentTime(next)
      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [isPlaying, duration, setCurrentTime, setPlaying])

  return { currentTime, isPlaying, setCurrentTime, setPlaying }
}
