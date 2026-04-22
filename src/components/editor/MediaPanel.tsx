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

  return (
    <div className="flex h-full flex-col border-r" style={{ borderColor: 'var(--border)', background: 'var(--sidebar)' }}>
      <div className="border-b p-2" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="w-full rounded py-1.5 text-xs"
          style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}
          onClick={() => void pick()}
        >
          メディアを追加
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-2">
        {items.map((m) => (
          <button
            key={m.path}
            type="button"
            className="flex w-full gap-2 rounded border p-1 text-left text-[11px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            onClick={() => void addToTimeline(m.path, m.type)}
          >
            {m.thumb ? (
              <img src={fileUrl(m.thumb)} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-12 w-20 shrink-0 rounded" style={{ background: 'var(--surface-2)' }} />
            )}
            <span className="truncate" style={{ color: 'var(--fg)' }}>
              {m.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function fileUrl(p: string) {
  return p.startsWith('file:') ? p : `file://${p}`
}
