import type { Track } from '../../lib/types'
import TimelineClip from './TimelineClip'

type Props = {
  track: Track
  zoom: number
  scrollLeft: number
  selectedClipId: string | null
  onSelectClip: (clipId: string) => void
  onMoveClip: (clipId: string, newStart: number) => void
  onTrimStart: (clipId: string, newSrc: number, newTl: number) => void
  onTrimEnd: (clipId: string, newEnd: number) => void
  onSplitAt: (clipId: string, time: number) => void
}

export default function TimelineTrack({
  track,
  zoom,
  scrollLeft,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onTrimStart,
  onTrimEnd,
  onSplitAt,
}: Props) {
  return (
    <div
      className="relative h-11 border-b"
      style={{ borderColor: 'var(--border)', background: 'var(--timeline-bg)' }}
    >
      {track.clips.map((c) => (
        <TimelineClip
          key={c.id}
          clip={c}
          zoom={zoom}
          scrollLeft={scrollLeft}
          selected={c.id === selectedClipId}
          onSelect={() => onSelectClip(c.id)}
          onMoveClip={(ns) => onMoveClip(c.id, ns)}
          onTrimStart={(a, b) => onTrimStart(c.id, a, b)}
          onTrimEnd={(e) => onTrimEnd(c.id, e)}
          onSplitAt={(t) => onSplitAt(c.id, t)}
        />
      ))}
    </div>
  )
}
