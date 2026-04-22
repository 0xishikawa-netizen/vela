import { useEffect, useRef } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { TelopClip, VideoClip, ImageClip } from '../../lib/types'
import { renderTelops } from '../../lib/telopRenderer'

function fileSrc(abs: string) {
  const u = abs.replace(/\\/g, '/')
  return u.startsWith('file:') ? u : `file://${u}`
}

export default function Preview() {
  const current = useProjectStore((s) => s.current)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const videoTrack = current?.tracks.find((t) => t.type === 'video')
  const telopTrack = current?.tracks.find((t) => t.type === 'telop')

  const active = videoTrack?.clips.find((c) => {
    if (c.type !== 'video' && c.type !== 'image') return false
    return currentTime >= c.timelineStart && currentTime < c.timelineStart + c.timelineDuration
  }) as (VideoClip | ImageClip) | undefined

  const telops = (telopTrack?.clips ?? []).filter((c): c is TelopClip => c.type === 'telop')

  useEffect(() => {
    const v = videoRef.current
    const img = imgRef.current
    if (!active) {
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.removeAttribute('src')
      return
    }
    if (active.type === 'video') {
      const src = fileSrc(active.sourcePath)
      if (v && v.src !== src) {
        v.src = src
      }
      if (img) img.removeAttribute('src')
      const local = currentTime - active.timelineStart + active.sourceStart
      if (v && Number.isFinite(local)) {
        v.currentTime = Math.max(0, Math.min(local, active.sourceEnd - 0.001))
        if (isPlaying) void v.play().catch(() => {})
        else v.pause()
      }
    } else {
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.src = fileSrc(active.sourcePath)
    }
  }, [active, currentTime, isPlaying])

  const w = current?.resolution.width ?? 1920
  const h = current?.resolution.height ?? 1080
  const maxW = 640
  const scale = Math.min(maxW / w, 360 / h, 1)
  const dispW = Math.round(w * scale)
  const dispH = Math.round(h * scale)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = dispW
    canvas.height = dispH
    renderTelops({
      canvas,
      telops,
      currentTime,
      width: dispW,
      height: dispH,
    })
  }, [telops, currentTime, dispW, dispH])

  if (!current) return null

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)', background: '#000', width: dispW, height: dispH }}
    >
      {active?.type === 'image' ? (
        <img ref={imgRef} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <video ref={videoRef} className="max-h-full max-w-full object-contain" muted playsInline />
      )}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}
