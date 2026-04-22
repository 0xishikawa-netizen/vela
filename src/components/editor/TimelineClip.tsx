import type { Clip } from '../../lib/types'
import { secondsToPx } from '../../lib/timeUtils'

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

function clipColors(type: string) {
  if (type === 'video' || type === 'image') {
    return { bg: 'var(--clip-video)', border: 'var(--clip-video-border)', text: '#a8f0ff' }
  }
  if (type === 'audio') {
    return { bg: 'var(--clip-audio)', border: 'var(--clip-audio-border)', text: '#86efac' }
  }
  return { bg: 'var(--clip-telop)', border: 'var(--clip-telop-border)', text: '#c4b5fd' }
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
  const colors = clipColors(clip.type)

  const label =
    clip.type === 'telop'
      ? clip.text.slice(0, 16) + (clip.text.length > 16 ? '…' : '')
      : clip.type === 'video' || clip.type === 'audio' || clip.type === 'image'
        ? clip.sourcePath.split(/[/\\]/).pop() ?? clip.type
        : ''

  return (
    <div
      className="absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-center overflow-hidden rounded-md text-[10px]"
      style={{
        left,
        width,
        background: colors.bg,
        border: `1px solid ${selected ? colors.border : 'rgba(255,255,255,0.08)'}`,
        color: colors.text,
        boxShadow: selected ? `0 0 0 1px ${colors.border}, 0 0 10px ${colors.bg}` : 'none',
        backdropFilter: 'blur(4px)',
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
      {/* Left trim handle */}
      <div
        data-trim="1"
        className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-ew-resize"
        style={{ background: `linear-gradient(to right, ${colors.border}, transparent)` }}
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

      <span className="pointer-events-none flex-1 truncate px-3 font-medium">{label}</span>

      {/* Right trim handle */}
      <div
        data-trim="1"
        className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-ew-resize"
        style={{ background: `linear-gradient(to left, ${colors.border}, transparent)` }}
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
