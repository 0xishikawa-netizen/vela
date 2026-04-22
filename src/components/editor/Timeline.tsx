import { useCallback, useRef } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import { snapToGrid } from '../../lib/timeUtils'
import { SNAP_THRESHOLD } from '../../lib/constants'
import { useHistoryStore } from '../../store/historyStore'
import TimelineRuler from './TimelineRuler'
import TimelineTrack from './TimelineTrack'
import Playhead from './Playhead'

const TRACK_TYPE_ICON: Record<string, string> = {
  video: '▶',
  audio: '♪',
  telop: 'T',
}

const TRACK_TYPE_COLOR: Record<string, string> = {
  video: 'rgba(0,200,240,0.7)',
  audio: 'rgba(52,211,153,0.7)',
  telop: 'rgba(139,92,246,0.7)',
}

export default function Timeline() {
  const current = useProjectStore((s) => s.current)
  const moveClip = useProjectStore((s) => s.moveClip)
  const trimClipStart = useProjectStore((s) => s.trimClipStart)
  const trimClipEnd = useProjectStore((s) => s.trimClipEnd)
  const splitClip = useProjectStore((s) => s.splitClip)
  const selectClip = useEditorStore((s) => s.selectClip)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)
  const zoom = useEditorStore((s) => s.zoom)
  const scrollLeft = useEditorStore((s) => s.scrollLeft)
  const setScrollLeft = useEditorStore((s) => s.setScrollLeft)
  const setZoom = useEditorStore((s) => s.setZoom)
  const currentTime = useEditorStore((s) => s.currentTime)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentWidth = Math.max(800, (current?.duration ?? 60) * zoom + 400)

  const snapPoints = useCallback(() => {
    if (!current) return [0]
    const pts: number[] = [0, currentTime]
    for (const t of current.tracks) {
      for (const c of t.clips) {
        pts.push(c.timelineStart, c.timelineStart + c.timelineDuration)
      }
    }
    return pts
  }, [current, currentTime])

  const onWheel = (e: React.WheelEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(zoom * factor)
    } else if (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
      setScrollLeft(scrollLeft + (e.deltaX || e.deltaY))
    }
  }

  const seekFromClientX = (clientX: number) => {
    const el = scrollRef.current
    if (!el || !current) return
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    setCurrentTime(Math.max(0, x / zoom))
  }

  if (!current) return null

  const trackRows = current.tracks
  const totalH = 28 + trackRows.length * 44

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ borderTop: '1px solid var(--border)', background: 'var(--timeline-bg)' }}
    >
      <div className="flex min-h-0 flex-1">
        {/* Track labels */}
        <div
          className="w-36 shrink-0 pt-7"
          style={{
            borderRight: '1px solid var(--border)',
            background: 'var(--sidebar)',
          }}
        >
          {trackRows.map((t) => (
            <div
              key={t.id}
              className="flex h-11 items-center gap-2 border-b px-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
                style={{
                  background: `${TRACK_TYPE_COLOR[t.type] ?? 'rgba(255,255,255,0.1)'}20`,
                  color: TRACK_TYPE_COLOR[t.type] ?? 'var(--muted)',
                }}
              >
                {TRACK_TYPE_ICON[t.type] ?? '?'}
              </span>
              <span className="truncate text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                {t.name}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={onWheel}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        >
          <div style={{ width: contentWidth, minHeight: totalH }} className="relative">
            {/* Ruler */}
            <div className="sticky left-0 top-0 z-10" style={{ width: contentWidth }}>
              <TimelineRuler
                duration={current.duration || 120}
                zoom={zoom}
                scrollLeft={scrollLeft}
                width={scrollRef.current?.clientWidth ?? 800}
              />
            </div>

            {/* Tracks */}
            <div
              className="relative"
              style={{ height: trackRows.length * 44 }}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                seekFromClientX(e.clientX)
                const onMove = (ev: MouseEvent) => seekFromClientX(ev.clientX)
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            >
              {trackRows.map((t) => (
                <TimelineTrack
                  key={t.id}
                  track={t}
                  zoom={zoom}
                  scrollLeft={scrollLeft}
                  selectedClipId={selectedTrackId === t.id ? selectedClipId : null}
                  onSelectClip={(clipId) => selectClip(t.id, clipId)}
                  onMoveClip={(clipId, ns) => {
                    const snapped = snapToGrid(ns, snapPoints(), SNAP_THRESHOLD)
                    moveClip(t.id, clipId, snapped)
                  }}
                  onTrimStart={(clipId, a, b) => trimClipStart(t.id, clipId, a, b)}
                  onTrimEnd={(clipId, e) => trimClipEnd(t.id, clipId, e)}
                  onSplitAt={(clipId, time) => {
                    const p = useProjectStore.getState().current
                    if (p) useHistoryStore.getState().push(p)
                    splitClip(t.id, clipId, time)
                  }}
                />
              ))}
              <Playhead
                currentTime={currentTime}
                zoom={zoom}
                scrollLeft={scrollLeft}
                height={trackRows.length * 44}
                onSeek={setCurrentTime}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
