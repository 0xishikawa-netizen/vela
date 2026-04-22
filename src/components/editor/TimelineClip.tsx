import type { Clip } from '../../lib/types'
import { secondsToPx } from '../../lib/timeUtils'
import clsx from 'clsx'

type Props = {
  clip: Clip
  zoom: number
  scrollLeft: number
  selected: boolean
  onSelect: () => void
  onMoveClip: (newStart: number) => void
  onTrimStart: (newSourceStart: number, newTimelineStart: number) => void
  onTrimEnd: (newSourceEnd: number) => void
  onSplitAt: (time: number) => void
}

export default function TimelineClip({
  clip,
  zoom,
  scrollLeft,
  selected,
  onSelect,
  onMoveClip,
  onTrimStart,
  onTrimEnd,
  onSplitAt,
}: Props) {
  const left = secondsToPx(clip.timelineStart, zoom) - scrollLeft
  const width = Math.max(8, secondsToPx(clip.timelineDuration, zoom))

  const bg =
    clip.type === 'video' || clip.type === 'image'
      ? 'var(--clip-video)'
      : clip.type === 'audio'
        ? 'var(--clip-audio)'
        : 'var(--clip-telop)'

  const label =
    clip.type === 'telop'
      ? clip.text.slice(0, 12) + (clip.text.length > 12 ? '…' : '')
      : clip.type === 'video' || clip.type === 'audio' || clip.type === 'image'
        ? clip.sourcePath.split(/[/\\]/).pop() ?? clip.type
        : ''

  return (
    <div
      className={clsx(
        'absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-center overflow-hidden rounded border text-[10px]',
        selected && 'ring-1',
      )}
      style={{
        left,
        width,
        background: bg,
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        color: 'var(--fg)',
      }}
      onMouseDown={(e) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const xIn = e.clientX - rect.left
          const t = clip.timelineStart + xIn / zoom
          onSplitAt(t)
          return
        }
        if ((e.target as HTMLElement).dataset.trim) return
        e.stopPropagation()
        onSelect()
        const startX = e.clientX
        const startClip = clip.timelineStart
        const onDrag = (ev: MouseEvent) => {
          const dx = ev.clientX - startX
          onMoveClip(Math.max(0, startClip + dx / zoom))
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onDrag)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onDrag)
        window.addEventListener('mouseup', onUp)
      }}
    >
      <div
        data-trim="1"
        className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-ew-resize opacity-60 hover:opacity-100"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onMouseDown={(e) => {
          e.stopPropagation()
          if (clip.type !== 'video' && clip.type !== 'audio') return
          const startX = e.clientX
          const origStart = clip.timelineStart
          const origSrc = clip.sourceStart
          const onMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startX) / zoom
            const newTl = Math.max(0, origStart + dx)
            const newSrc = Math.max(0, origSrc + dx)
            onTrimStart(newSrc, newTl)
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />
      <span className="pointer-events-none flex-1 truncate px-3">{label}</span>
      <div
        data-trim="1"
        className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-ew-resize opacity-60 hover:opacity-100"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onMouseDown={(e) => {
          e.stopPropagation()
          if (clip.type !== 'video' && clip.type !== 'audio') return
          const startX = e.clientX
          const origEnd = clip.sourceEnd
          const onMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startX) / zoom
            onTrimEnd(Math.max(clip.sourceStart + 0.2, origEnd + dx))
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />
    </div>
  )
}
