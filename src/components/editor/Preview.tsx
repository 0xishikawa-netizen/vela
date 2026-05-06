import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { TelopClip, VideoClip, ImageClip, AudioClip } from '../../lib/types'
import { renderTelops } from '../../lib/telopRenderer'

function fileSrc(abs: string) {
  const u = abs.replace(/\\/g, '/')
  return u.startsWith('file:') ? u : `file://${u}`
}

/** 再生中に毎フレーム currentTime を書き換えるとシークが連続し、映像が出ないことがある */
function syncMediaPlayback(
  el: HTMLMediaElement,
  timelineTime: number,
  clip: { timelineStart: number; sourceStart: number; sourceEnd: number },
  isPlaying: boolean,
) {
  const local = timelineTime - clip.timelineStart + clip.sourceStart
  if (!Number.isFinite(local)) return
  const target = Math.max(0, Math.min(local, clip.sourceEnd - 0.001))
  if (!isPlaying) {
    el.currentTime = target
    el.pause()
    return
  }
  const drift = Math.abs(el.currentTime - target)
  if (el.paused || drift > 0.25) {
    el.currentTime = target
  }
  void el.play().catch(() => {})
}

function PreviewAudioSync({
  clip,
  trackMuted,
  currentTime,
  isPlaying,
}: {
  clip: AudioClip
  trackMuted: boolean
  currentTime: number
  isPlaying: boolean
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const sourcePathRef = useRef<string | null>(null)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    if (sourcePathRef.current !== clip.sourcePath) {
      sourcePathRef.current = clip.sourcePath
      a.src = fileSrc(clip.sourcePath)
    }
    a.muted = trackMuted
    a.volume = trackMuted ? 0 : clip.volume
    syncMediaPlayback(a, currentTime, clip, isPlaying)
  }, [clip, currentTime, isPlaying, trackMuted])

  return <audio ref={ref} className="pointer-events-none h-0 w-0 opacity-0" aria-hidden playsInline />
}

export default function Preview() {
  const current = useProjectStore((s) => s.current)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoSourcePathRef = useRef<string | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)

  const videoTrack = current?.tracks.find((t) => t.type === 'video')
  const telopTrack = current?.tracks.find((t) => t.type === 'telop')

  const active = videoTrack?.clips.find((c) => {
    if (c.type !== 'video' && c.type !== 'image') return false
    return currentTime >= c.timelineStart && currentTime < c.timelineStart + c.timelineDuration
  }) as (VideoClip | ImageClip) | undefined

  const activeAudioEntries: { key: string; clip: AudioClip; trackMuted: boolean }[] = []
  if (current) {
    for (const t of current.tracks) {
      if (t.type !== 'audio') continue
      for (const c of t.clips) {
        if (c.type !== 'audio') continue
        if (
          currentTime >= c.timelineStart &&
          currentTime < c.timelineStart + c.timelineDuration
        ) {
          activeAudioEntries.push({ key: c.id, clip: c, trackMuted: t.muted })
        }
      }
    }
  }

  const telops = (telopTrack?.clips ?? []).filter((c): c is TelopClip => c.type === 'telop')

  useEffect(() => {
    const v = videoRef.current
    const img = imgRef.current
    if (!active) {
      videoSourcePathRef.current = null
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.removeAttribute('src')
      return
    }
    if (active.type === 'video') {
      const want = fileSrc(active.sourcePath)
      if (v) {
        if (videoSourcePathRef.current !== active.sourcePath) {
          videoSourcePathRef.current = active.sourcePath
          v.src = want
        }
        v.volume = active.volume
        if (img) img.removeAttribute('src')
        syncMediaPlayback(v, currentTime, active, isPlaying)
      }
    } else {
      videoSourcePathRef.current = null
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.src = fileSrc(active.sourcePath)
    }
  }, [active, currentTime, isPlaying, videoTrack?.muted])

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setHostW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [current?.id])

  const w = current?.resolution.width ?? 1920
  const h = current?.resolution.height ?? 1080
  const maxW = 640
  const baseScale = Math.min(maxW / w, 360 / h, 1)
  const idealW = Math.round(w * baseScale)
  const outW = hostW > 0 ? Math.max(1, Math.min(idealW, Math.floor(hostW))) : idealW
  const outH = Math.round((outW * h) / w)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = outW
    canvas.height = outH
    renderTelops({
      canvas,
      telops,
      currentTime,
      width: outW,
      height: outH,
    })
  }, [telops, currentTime, outW, outH])

  if (!current) return null

  return (
    <div ref={hostRef} className="flex w-full min-w-0 justify-center">
      <div
        className="relative flex max-w-full items-center justify-center overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--timeline-bg)', width: outW, height: outH }}
      >
      {active?.type === 'image' ? (
        <img ref={imgRef} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <video
          ref={videoRef}
          className="max-h-full max-w-full object-contain"
          playsInline
          muted={videoTrack?.muted ?? false}
          onLoadedData={(e) => {
            if (active?.type !== 'video') return
            const st = useEditorStore.getState()
            syncMediaPlayback(e.currentTarget, st.currentTime, active, st.isPlaying)
          }}
        />
      )}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {activeAudioEntries.map(({ key, clip, trackMuted }) => (
        <PreviewAudioSync
          key={key}
          clip={clip}
          trackMuted={trackMuted}
          currentTime={currentTime}
          isPlaying={isPlaying}
        />
      ))}
      </div>
    </div>
  )
}
