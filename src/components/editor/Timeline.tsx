import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import { snapToGrid } from '../../lib/timeUtils'
import { computeTimelineEndSeconds } from '../../lib/projectSanitize'
import { SNAP_THRESHOLD } from '../../lib/constants'
import { useHistoryStore } from '../../store/historyStore'
import TimelineRuler from './TimelineRuler'
import TimelineTrack from './TimelineTrack'
import SubtitleTimelineTrack from './SubtitleTimelineTrack'
import Playhead from './Playhead'

const TRACK_TYPE_ICON: Record<string, string> = {
  video: '▶',
  audio: '♪',
  telop: 'T',
}

const TRACK_TYPE_COLOR: Record<string, string> = {
  video: 'rgba(132,181,169,0.72)',
  audio: 'rgba(126,158,140,0.72)',
  telop: 'rgba(180,171,201,0.72)',
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
  const setScrollLeft = useEditorStore((s) => s.setScrollLeft)
  const setZoom = useEditorStore((s) => s.setZoom)
  const currentTime = useEditorStore((s) => s.currentTime)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollX, setScrollX] = useState(0)
  const [viewportW, setViewportW] = useState(800)
  const timelineEndRaw = useProjectStore((s) => computeTimelineEndSeconds(s.current))
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 80
  const safeWs = Number.isFinite(timelineEndRaw) ? Math.max(timelineEndRaw, 60) : 60
  const contentWidth = Math.max(800, safeWs * safeZoom + 400)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !current) return
    el.scrollLeft = 0
    setScrollX(0)
    setScrollLeft(0)
  }, [current?.id, setScrollLeft])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !current) return
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth))
    ro.observe(el)
    setViewportW(el.clientWidth)
    return () => ro.disconnect()
  }, [current?.id])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
    if (el.scrollLeft > maxScroll) {
      el.scrollLeft = maxScroll
      setScrollLeft(maxScroll)
      setScrollX(maxScroll)
    }
  }, [contentWidth, current?.id, setScrollLeft])

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
      const el = scrollRef.current
      if (!el) return
      e.preventDefault()
      const d = e.deltaX || e.deltaY
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
      el.scrollLeft = Math.min(maxScroll, Math.max(0, el.scrollLeft + d))
      // scroll イベントで store / scrollX と同期
    }
  }

  const seekFromClientX = (clientX: number) => {
    const el = scrollRef.current
    if (!el || !current) return
    const rect = el.getBoundingClientRect()
    const st = useEditorStore.getState()
    const z = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 80
    const x = clientX - rect.left + el.scrollLeft
    setCurrentTime(Math.max(0, x / z))
  }

  if (!current) return null

  const trackRows = current.tracks
  const subtitleTracks = current.subtitleTracks ?? []
  const totalH = 28 + trackRows.length * 44 + subtitleTracks.length * 36

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
          {subtitleTracks.map((st) => (
            <div
              key={st.id}
              className="flex items-center gap-2 border-b px-3"
              style={{ height: 36, borderColor: 'var(--border)', background: 'rgba(80,100,160,0.06)' }}
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
                style={{ background: 'rgba(100,140,220,0.2)', color: 'rgba(130,170,255,0.9)' }}
              >
                CC
              </span>
              <span className="truncate text-[10px]" style={{ color: 'var(--muted)' }}>
                {st.name}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div
          ref={scrollRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={onWheel}
          onScroll={(e) => {
            const el = e.currentTarget
            setScrollX(el.scrollLeft)
            setViewportW(el.clientWidth)
            setScrollLeft(el.scrollLeft)
          }}
        >
          <div
            className="relative box-border"
            style={{ width: contentWidth, minWidth: contentWidth, minHeight: `max(${totalH}px, 100%)` }}
          >
            {/* Ruler */}
            <div className="relative z-10" style={{ width: contentWidth, minWidth: contentWidth }}>
              <TimelineRuler
                duration={safeWs}
                zoom={safeZoom}
                scrollLeft={scrollX}
                width={viewportW}
              />
            </div>

            {/* Tracks */}
            <div
              className="relative"
              style={{ width: contentWidth, minWidth: contentWidth, height: trackRows.length * 44 + subtitleTracks.length * 36 }}
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
                  zoom={safeZoom}
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
              {subtitleTracks.map((st) => (
                <SubtitleTimelineTrack
                  key={st.id}
                  track={st}
                  zoom={safeZoom}
                  currentTime={currentTime}
                  onSeek={setCurrentTime}
                />
              ))}
              <Playhead
                currentTime={currentTime}
                zoom={safeZoom}
                height={trackRows.length * 44 + subtitleTracks.length * 36}
                onSeek={setCurrentTime}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
