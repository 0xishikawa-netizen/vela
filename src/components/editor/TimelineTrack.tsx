import { useEffect, useMemo } from 'react'
import type { Track } from '../../lib/types'
import { sliceWaveformPeaksForClip } from '../../lib/waveform'
import { useEditorStore } from '../../store/editorStore'
import TimelineClip from './TimelineClip'

type Props = {
  track: Track
  zoom: number
  selectedClipId: string | null
  onSelectClip: (clipId: string) => void
  onMoveClip: (clipId: string, newStart: number) => void
  onTrimStart: (clipId: string, newSrc: number, newTl: number) => void
  onTrimEnd: (clipId: string, newEnd: number) => void
  onSplitAt: (clipId: string, time: number) => void
}

const TRACK_ACCENT: Record<string, string> = {
  video: 'rgba(132,181,169,0.09)',
  audio: 'rgba(126,158,140,0.09)',
  telop: 'rgba(180,171,201,0.09)',
}

export default function TimelineTrack({
  track,
  zoom,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onTrimStart,
  onTrimEnd,
  onSplitAt,
}: Props) {
  const waveforms = useEditorStore((s) => s.waveforms)
  const waveformPhase = useEditorStore((s) => s.waveformPhase)
  const loadWaveform = useEditorStore((s) => s.loadWaveform)

  const audioPathsKey = useMemo(
    () =>
      track.clips
        .filter((c) => c.type === 'audio')
        .map((c) => c.sourcePath)
        .sort()
        .join('\0'),
    [track.clips],
  )

  useEffect(() => {
    if (track.type !== 'audio') return
    const paths = audioPathsKey.split('\0').filter(Boolean)
    for (const p of paths) void loadWaveform(p)
  }, [audioPathsKey, loadWaveform, track.type])

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
          waveform={
            c.type === 'audio' && waveforms[c.sourcePath]
              ? sliceWaveformPeaksForClip(waveforms[c.sourcePath]!, c)
              : undefined
          }
          waveformPlaceholder={
            c.type === 'audio' &&
            !waveforms[c.sourcePath] &&
            (waveformPhase[c.sourcePath] ?? 'idle') !== 'failed'
          }
          waveformLoading={c.type === 'audio' ? (waveformPhase[c.sourcePath] ?? 'idle') === 'loading' : false}
          waveformFailed={c.type === 'audio' ? (waveformPhase[c.sourcePath] ?? 'idle') === 'failed' : false}
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
