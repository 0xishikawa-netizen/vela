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

const TRACK_ACCENT: Record<string, string> = {
  video: 'rgba(0,200,240,0.06)',
  audio: 'rgba(52,211,153,0.06)',
  telop: 'rgba(139,92,246,0.06)',
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
      className="relative h-11"
      style={{
        borderBottom: '1px solid var(--border)',
        background: TRACK_ACCENT[track.type] ?? 'var(--timeline-bg)',
      }}
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
