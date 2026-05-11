import type { CSSProperties } from 'react'
import type { Clip } from '../../lib/types'
import { coerceTimelineSeconds } from '../../lib/projectSanitize'
import { secondsToPx } from '../../lib/timeUtils'

/** clip 下部の波形 SVG 高さ（px） */
const WAVEFORM_H = 20

/** 複数バケット対称波形。`n < 2` のときは `audioWaveformSvgPath` が単一バケット用パスに切り替える */
function audioWaveformSymmetricPath(samples: number[], w: number, h: number): string {
  const n = samples.length
  if (n < 2 || w < 2) return ''
  const mid = h / 2
  const maxAmp = Math.min(mid - 2, mid * 0.92)
  const step = (n - 1) / Math.max(1, w - 1)

  let dTop = ''
  for (let px = 0; px < w; px++) {
    const idx = Math.min(n - 1, Math.round(px * step))
    const v = Math.min(1, Math.max(0, samples[idx]! * 2.15))
    const yTop = mid - v * maxAmp
    dTop += px === 0 ? `M ${px} ${yTop.toFixed(2)}` : ` L ${px} ${yTop.toFixed(2)}`
  }
  for (let px = w - 1; px >= 0; px--) {
    const idx = Math.min(n - 1, Math.round(px * step))
    const v = Math.min(1, Math.max(0, samples[idx]! * 2.15))
    const yBot = mid + v * maxAmp
    dTop += ` L ${px} ${yBot.toFixed(2)}`
  }
  return `${dTop} Z`
}

function audioWaveformSingleBucketPath(samples: number[], w: number, h: number): string {
  if (samples.length < 1 || w < 2) return ''
  const mid = h / 2
  const maxAmp = Math.min(mid - 2, mid * 0.92)
  const v = Math.min(1, Math.max(0, samples[0]! * 2.15))
  const a = v * maxAmp
  const x1 = Math.max(0.25, w - 0.25)
  return `M 0 ${(mid - a).toFixed(2)} L ${x1} ${(mid - a).toFixed(2)} L ${x1} ${(mid + a).toFixed(2)} L 0 ${(mid + a).toFixed(2)} Z`
}

function audioWaveformSvgPath(samples: number[], w: number, h: number): string {
  if (samples.length >= 2) return audioWaveformSymmetricPath(samples, w, h)
  if (samples.length === 1) return audioWaveformSingleBucketPath(samples, w, h)
  return ''
}

function audioFadeHintStyle(clip: Clip, widthPx: number): CSSProperties | undefined {
  if (clip.type !== 'audio') return undefined
  const td = Math.max(1e-4, coerceTimelineSeconds(clip.timelineDuration))
  const fi = typeof clip.fadeIn === 'number' && Number.isFinite(clip.fadeIn) ? Math.max(0, clip.fadeIn) : 0
  const fo = typeof clip.fadeOut === 'number' && Number.isFinite(clip.fadeOut) ? Math.max(0, clip.fadeOut) : 0
  if (fi < 1e-5 && fo < 1e-5) return undefined
  const pStart = Math.min(48, (fi / td) * 100)
  const pEnd = Math.min(48, (fo / td) * 100)
  return {
    background: `linear-gradient(90deg, rgba(0,0,0,0.32) 0%, transparent ${pStart}%, transparent ${100 - pEnd}%, rgba(0,0,0,0.32) 100%)`,
    opacity: widthPx < 24 ? 0 : 1,
  }
}

type Props = {
  clip: Clip
  zoom: number
  /** 音声クリップ用: クリップ範囲に切り出した正規化 peaks */
  waveform?: number[]
  waveformPlaceholder?: boolean
  waveformLoading?: boolean
  waveformFailed?: boolean
  selected: boolean
  onSelect: () => void
  onMoveClip: (newStart: number) => void
  onTrimStart: (newSourceStart: number, newTimelineStart: number) => void
  onTrimEnd: (newSourceEnd: number) => void
  onSplitAt: (time: number) => void
}

function clipColors(type: string) {
  if (type === 'video' || type === 'image') {
    return { bg: 'var(--clip-video)', border: 'var(--clip-video-border)', text: '#d4ebe6' }
  }
  if (type === 'audio') {
    return { bg: 'var(--clip-audio)', border: 'var(--clip-audio-border)', text: '#d4eadc' }
  }
  return { bg: 'var(--clip-telop)', border: 'var(--clip-telop-border)', text: '#e8e4f5' }
}

export default function TimelineClip({
  clip,
  zoom,
  waveform,
  waveformPlaceholder,
  waveformLoading,
  waveformFailed,
  selected,
  onSelect,
  onMoveClip,
  onTrimStart,
  onTrimEnd,
  onSplitAt,
}: Props) {
  const left = secondsToPx(clip.timelineStart, zoom)
  const width = Math.max(8, secondsToPx(clip.timelineDuration, zoom))
  const colors = clipColors(clip.type)

  const label =
    clip.type === 'telop'
      ? clip.text.slice(0, 16) + (clip.text.length > 16 ? '…' : '')
      : clip.type === 'video' || clip.type === 'audio' || clip.type === 'image'
        ? clip.sourcePath.split(/[/\\]/).pop() ?? clip.type
        : ''

  const wfloor = Math.max(1, Math.floor(width))
  const isAudioMuted = clip.type === 'audio' && clip.muted === true
  const fadeEdgesStyle = clip.type === 'audio' ? audioFadeHintStyle(clip, wfloor) : undefined

  return (
    <div
      title="ドラッグで移動。⌘（Mac）または Ctrl（Windows）＋クリックで分割"
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
          const cs = coerceTimelineSeconds(clip.timelineStart)
          const cd = coerceTimelineSeconds(clip.timelineDuration)
          const rawT = cs + xIn / zoom
          const eps = Math.min(0.05, Math.max(0.001, cd * 0.003))
          const t = Math.min(cs + cd - eps, Math.max(cs + eps, rawT))
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
      {clip.type === 'audio' && waveform?.length ? (
        <svg
          className={`pointer-events-none absolute inset-x-0 bottom-0 top-5 z-[1] ${isAudioMuted ? 'opacity-[0.14]' : 'opacity-[0.4]'}`}
          style={{ color: colors.text }}
          preserveAspectRatio="none"
          viewBox={`0 0 ${wfloor} ${WAVEFORM_H}`}
        >
          <path
            vectorEffect="non-scaling-stroke"
            d={audioWaveformSvgPath(waveform, wfloor, WAVEFORM_H)}
            fill="currentColor"
            fillOpacity={isAudioMuted ? 0.1 : 0.2}
            stroke="currentColor"
            strokeOpacity={isAudioMuted ? 0.16 : 0.38}
            strokeWidth={0.55}
          />
        </svg>
      ) : null}

      {clip.type === 'audio' && waveform?.length && fadeEdgesStyle ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-5 z-[2]"
          style={fadeEdgesStyle}
        />
      ) : null}

      {clip.type === 'audio' && waveformPlaceholder && (
        <div className="pointer-events-none absolute inset-x-3 bottom-1 top-6 flex items-end justify-center">
          <div
            className={`h-[3px] w-full max-w-[100%] rounded-full ${waveformLoading ? 'animate-pulse' : ''}`}
            style={{ background: 'rgba(255,255,255,0.12)' }}
          />
        </div>
      )}

      {clip.type === 'audio' && waveformFailed && !(waveform && waveform.length) && (
        <div
          className="pointer-events-none absolute inset-x-4 bottom-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', opacity: 0.6 }}
          aria-hidden
        />
      )}

      {/* Left trim handle */}
      <div
        data-trim="1"
        title="ドラッグでイン点（映像・音声）"
        className="absolute bottom-0 left-0 top-0 z-10 w-2.5 cursor-ew-resize"
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
        title="ドラッグでアウト点（映像・音声）"
        className="absolute bottom-0 right-0 top-0 z-10 w-2.5 cursor-ew-resize"
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
