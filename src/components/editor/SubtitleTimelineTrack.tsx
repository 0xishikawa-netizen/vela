import { useCallback, useRef } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { SubtitleSegment, SubtitleTrack } from '../../lib/types'

interface Props {
  track: SubtitleTrack
  zoom: number
  currentTime: number
  onSeek: (t: number) => void
}

const TRACK_H = 36

function clampSec(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function SegmentBar({
  seg,
  zoom,
  currentTime,
  trackId,
  trackName,
  onSeek,
}: {
  seg: SubtitleSegment
  zoom: number
  currentTime: number
  trackId: string
  trackName: string
  onSeek: (t: number) => void
}) {
  const updateSubtitleSegment = useProjectStore((s) => s.updateSubtitleSegment)
  const dragState = useRef<{ kind: 'move' | 'trimStart' | 'trimEnd'; startX: number; origStart: number; origEnd: number } | null>(null)

  const isActive = currentTime >= seg.startSec - 0.02 && currentTime <= seg.endSec + 0.02

  const left = seg.startSec * zoom
  const width = Math.max(4, (seg.endSec - seg.startSec) * zoom)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, kind: 'move' | 'trimStart' | 'trimEnd') => {
      e.stopPropagation()
      if (e.button !== 0) return
      dragState.current = { kind, startX: e.clientX, origStart: seg.startSec, origEnd: seg.endSec }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [seg.startSec, seg.endSec],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragState.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dt = dx / zoom
      const MIN_DUR = 0.1

      let newStart = d.origStart
      let newEnd = d.origEnd

      if (d.kind === 'move') {
        const moved = clampSec(d.origStart + dt, 0, Infinity)
        const dur = d.origEnd - d.origStart
        newStart = moved
        newEnd = moved + dur
      } else if (d.kind === 'trimStart') {
        newStart = clampSec(d.origStart + dt, 0, d.origEnd - MIN_DUR)
      } else {
        newEnd = Math.max(d.origStart + MIN_DUR, d.origEnd + dt)
      }

      updateSubtitleSegment(trackId, seg.id, { startSec: newStart, endSec: newEnd })
    },
    [zoom, seg.id, trackId, updateSubtitleSegment],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }, [])

  const segLabel = `${trackName}: ${seg.text.trim().slice(0, 48) || '（無テキスト）'} ${seg.startSec.toFixed(1)}〜${seg.endSec.toFixed(1)}秒`

  return (
    <div
      role="group"
      aria-label={segLabel}
      className="absolute top-1 select-none"
      style={{ left, width, height: TRACK_H - 8, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        e.stopPropagation()
        onSeek(seg.startSec)
      }}
    >
      {/* 本体バー */}
      <div
        className="absolute inset-0 rounded"
        style={{
          background: isActive ? 'rgba(130,180,255,0.85)' : 'rgba(100,140,220,0.6)',
          border: `1px solid ${isActive ? 'rgba(180,210,255,0.9)' : 'rgba(100,140,220,0.4)'}`,
          overflow: 'hidden',
        }}
      >
        <span
          className="absolute inset-0 flex items-center px-1 text-[9px] leading-none truncate"
          style={{ color: 'rgba(255,255,255,0.95)', pointerEvents: 'none' }}
        >
          {seg.text}
        </span>
      </div>

      {/* トリムハンドル: 左端 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="字幕の開始位置を調整"
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10"
        onPointerDown={(e) => handlePointerDown(e, 'trimStart')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ background: 'rgba(255,255,255,0.25)' }}
      />
      {/* トリムハンドル: 右端 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="字幕の終了位置を調整"
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10"
        onPointerDown={(e) => handlePointerDown(e, 'trimEnd')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ background: 'rgba(255,255,255,0.25)' }}
      />
    </div>
  )
}

export default function SubtitleTimelineTrack({ track, zoom, currentTime, onSeek }: Props) {
  return (
    <div
      className="relative"
      role="region"
      aria-label={`字幕トラック ${track.name}`}
      style={{ height: TRACK_H, borderBottom: '1px solid var(--border)', background: 'rgba(80,100,160,0.08)' }}
    >
      {track.segments.map((seg) => (
        <SegmentBar
          key={seg.id}
          seg={seg}
          zoom={zoom}
          currentTime={currentTime}
          trackId={track.id}
          trackName={track.name}
          onSeek={onSeek}
        />
      ))}
    </div>
  )
}
