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
    <div className="min-w-0 space-y-4 p-3 text-[13px]">
      <div>
        <span className="ui-label">テロップ文案</span>
        <textarea
          className="ui-textarea min-h-[88px]"
          rows={3}
          value={text}
          placeholder="画面に表示するテキストを入力…"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div>
        <span className="ui-label">プリセット</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TELOP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ui-chip"
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
        <span className="ui-label">フォント</span>
        <select
          className="ui-select mt-1 w-full min-w-0"
          value={style.fontFamily}
          onChange={(e) => setStyle({ ...style, fontFamily: e.target.value })}
        >
          {TELOP_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[10px] leading-snug" style={{ color: 'var(--muted-2)' }}>
          書き出し（ASS）は OS のフォント解決（libass）です。未インストールの書体は代替になり、プレビューと幅がずれることがあります。
        </p>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="ui-label">サイズ (px)</span>
          <input
            type="number"
            className="ui-input mt-1"
            value={style.fontSize}
            onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="block min-w-0">
          <span className="ui-label">文字色</span>
          <input
            type="color"
            className="mt-2 h-10 w-full cursor-pointer rounded-md border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            value={style.color.startsWith('#') ? style.color : '#ffffff'}
            onChange={(e) => setStyle({ ...style, color: e.target.value })}
          />
        </label>
      </div>
      <TelopAnimPicker value={animation} onChange={setAnimation} />
      <div>
        <span className="ui-label">位置</span>
        <div className="grid w-full max-w-[180px] grid-cols-3 gap-1">
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
        <span className="ui-label">プレビュー時間</span>
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
        className="btn-accent w-full rounded-lg px-2 py-2.5 text-center text-[13px] font-semibold leading-snug whitespace-normal"
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
