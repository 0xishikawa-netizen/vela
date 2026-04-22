import { useMemo, useState } from 'react'
import type { TelopAnimation, TelopClip, TelopPosition, TelopStyle } from '../../lib/types'
import { DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE } from '../../lib/types'
import { TELOP_FONTS } from '../../lib/constants'
import TelopAnimPicker from './TelopAnimPicker'
import TelopPreview from './TelopPreview'
import { TELOP_PRESETS } from './presets'

type Props = {
  onAddToTimeline: (clip: Omit<TelopClip, 'id'>) => void
  resolution: { width: number; height: number }
}

export default function TelopEditor({ onAddToTimeline, resolution }: Props) {
  const [text, setText] = useState('サンプルテロップ')
  const [style, setStyle] = useState<TelopStyle>({ ...DEFAULT_TELOP_STYLE })
  const [animation, setAnimation] = useState<TelopAnimation>({ ...DEFAULT_TELOP_ANIMATION })
  const [position, setPosition] = useState<TelopPosition>('bottom_center')
  const [previewTime, setPreviewTime] = useState(0.2)

  const draft = useMemo(
    (): TelopClip => ({
      id: 'draft',
      type: 'telop',
      text,
      style,
      animation,
      position,
      timelineStart: 0,
      timelineDuration: 3,
      transitionIn: { type: 'none', duration: 0 },
      transitionOut: { type: 'none', duration: 0 },
    }),
    [text, style, animation, position],
  )

  const pw = Math.min(280, Math.round(resolution.width * 0.2))
  const ph = Math.round((pw * resolution.height) / resolution.width)

  return (
    <div className="space-y-3 p-3 text-xs">
      <textarea
        className="w-full rounded border p-2 text-sm"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <span style={{ color: 'var(--muted)' }}>プリセット</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {TELOP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded px-2 py-0.5 text-[10px]"
              style={{ background: 'var(--surface-2)' }}
              onClick={() => {
                setStyle({ ...p.style })
                setAnimation({ ...p.animation })
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span style={{ color: 'var(--muted)' }}>フォント</span>
        <select
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={style.fontFamily}
          onChange={(e) => setStyle({ ...style, fontFamily: e.target.value })}
        >
          {TELOP_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          サイズ
          <input
            type="number"
            className="mt-1 w-full rounded border px-1 py-1"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            value={style.fontSize}
            onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })}
          />
        </label>
        <label>
          文字色
          <input
            type="color"
            className="mt-1 h-8 w-full"
            value={style.color.startsWith('#') ? style.color : '#ffffff'}
            onChange={(e) => setStyle({ ...style, color: e.target.value })}
          />
        </label>
      </div>
      <TelopAnimPicker value={animation} onChange={setAnimation} />
      <div>
        <div className="mb-1" style={{ color: 'var(--muted)' }}>
          位置
        </div>
        <div className="grid max-w-[180px] grid-cols-3 gap-1">
          {(
            [
              'top_left',
              'top_center',
              'top_right',
              'middle_left',
              'middle_center',
              'middle_right',
              'bottom_left',
              'bottom_center',
              'bottom_right',
            ] as TelopPosition[]
          ).map((p) => (
            <button
              key={p}
              type="button"
              className="h-7 rounded border text-[9px]"
              style={{
                borderColor: position === p ? 'var(--accent)' : 'var(--border)',
                background: position === p ? 'var(--accent-muted)' : 'var(--surface-2)',
              }}
              onClick={() => setPosition(p)}
            >
              {p.replace(/_/g, '\n')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1" style={{ color: 'var(--muted)' }}>
          プレビュー時間
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={previewTime}
          onChange={(e) => setPreviewTime(Number(e.target.value))}
        />
      </div>
      <TelopPreview clip={draft} width={pw} height={ph} previewTime={previewTime} />
      <button
        type="button"
        className="w-full rounded py-2 text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#0a0c10' }}
        onClick={() =>
          onAddToTimeline({
            type: 'telop',
            text,
            style,
            animation,
            position,
            timelineStart: 0,
            timelineDuration: 3,
            transitionIn: { type: 'none', duration: 0 },
            transitionOut: { type: 'none', duration: 0 },
          })
        }
      >
        タイムラインに追加（現在位置へ）
      </button>
    </div>
  )
}
