import { useState } from 'react'
import type { ImageClip } from '../../lib/types'
import { useProjectStore, buildVideoClipFromMedia, buildAudioClip } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

export default function MediaPanel() {
  const current = useProjectStore((s) => s.current)
  const addClip = useProjectStore((s) => s.addClip)
  const currentTime = useEditorStore((s) => s.currentTime)
  const [items, setItems] = useState<{ path: string; thumb?: string; name: string; type: string }[]>([])

  const pick = async () => {
    const paths = await window.electronAPI.openMediaDialog()
    if (!paths?.length) return
    const next: { path: string; thumb?: string; name: string; type: string }[] = []
    for (const p of paths) {
      const info = await window.electronAPI.getMediaInfo(p)
      let thumb: string | undefined
      try {
        thumb = await window.electronAPI.getThumbnail(p, 0)
      } catch {
        /* ignore */
      }
      next.push({ path: p, thumb, name: info.name, type: info.type })
    }
    setItems((prev) => [...next, ...prev])
  }

  const addToTimeline = async (path: string, type: string) => {
    if (!current) return
    const info = await window.electronAPI.getMediaInfo(path)
    const dur = info.duration ?? 5
    const videoTrack = current.tracks.find((t) => t.type === 'video')
    const audioTrack = current.tracks.find((t) => t.type === 'audio')
    if (type === 'audio') {
      if (audioTrack) addClip(audioTrack.id, buildAudioClip(path, dur, currentTime))
    } else if (type === 'image') {
      if (videoTrack) {
        const img: Omit<ImageClip, 'id'> = {
          type: 'image',
          sourcePath: path,
          timelineStart: currentTime,
          timelineDuration: 3,
          filter: 'none',
          transitionIn: { type: 'none', duration: 0 },
          transitionOut: { type: 'none', duration: 0 },
        }
        addClip(videoTrack.id, img)
      }
    } else {
      if (videoTrack) addClip(videoTrack.id, buildVideoClipFromMedia(path, dur, currentTime))
    }
  }

  const typeIcon = (type: string) => {
    if (type === 'audio') return '♪'
    if (type === 'image') return '◻'
    return '▶'
  }

  const typeColor = (type: string) => {
    if (type === 'audio') return 'rgba(52,211,153,0.7)'
    if (type === 'image') return 'rgba(139,92,246,0.7)'
    return 'rgba(0,200,240,0.7)'
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="mb-2 px-1">
          <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Media
          </p>
        </div>
        <button
          type="button"
          className="w-full rounded-lg py-2 text-[11px] font-medium flex items-center justify-center gap-1.5"
          style={{
            background: 'var(--surface-2)',
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,200,240,0.3)'
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'var(--accent-dim)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.background = 'var(--surface-2)'
          }}
          onClick={() => void pick()}
        >
          <span style={{ fontSize: 14 }}>＋</span>
          メディアを追加
        </button>
      </div>

      {/* Media list */}
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 opacity-30">
            <span style={{ fontSize: 24 }}>◻</span>
            <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>メディアなし</p>
          </div>
        )}
        {items.map((m) => (
          <button
            key={m.path}
            type="button"
            className="group flex w-full gap-2 rounded-lg p-1.5 text-left"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,200,240,0.2)'
              e.currentTarget.style.background = 'var(--surface-3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'var(--surface-2)'
            }}
            onClick={() => void addToTimeline(m.path, m.type)}
          >
            {/* Thumbnail */}
            <div className="relative shrink-0 h-10 w-16 rounded overflow-hidden" style={{ background: 'var(--bg)' }}>
              {m.thumb ? (
                <img src={fileUrl(m.thumb)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center" style={{ color: typeColor(m.type), fontSize: 18 }}>
                  {typeIcon(m.type)}
                </div>
              )}
              {/* Type badge */}
              <span
                className="absolute top-0.5 left-0.5 text-[8px] px-0.5 rounded font-bold mono"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  color: typeColor(m.type),
                }}
              >
                {m.type.toUpperCase()}
              </span>
            </div>

            {/* Name */}
            <div className="min-w-0 flex-1 flex items-center">
              <span className="truncate text-[11px] leading-tight" style={{ color: 'var(--fg)' }}>
                {m.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function fileUrl(p: string) {
  return p.startsWith('file:') ? p : `file://${p}`
}
