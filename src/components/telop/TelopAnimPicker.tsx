import type { TelopAnimation, TelopAnimationType } from '../../lib/types'
import { getTelopInAnimationMeta } from '../../lib/telopAnimationMeta'

const IN_ORDER: TelopAnimationType[] = [
  'none',
  'fade_in',
  'slide_up',
  'zoom_in',
  'bounce',
  'blur_in',
]

type Props = {
  value: TelopAnimation
  onChange: (v: TelopAnimation) => void
}

export default function TelopAnimPicker({ value, onChange }: Props) {
  const inMeta = getTelopInAnimationMeta(value.in)
  const showInNote = inMeta.exportSupport !== 'full' && inMeta.exportNote

  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <label className="col-span-2 block min-w-0">
        <span className="ui-label">イン</span>
        <select
          className="ui-select mt-1 w-full min-w-0"
          value={value.in}
          onChange={(e) => onChange({ ...value, in: e.target.value as TelopAnimationType })}
        >
          {IN_ORDER.map((id) => {
            const m = getTelopInAnimationMeta(id)
            return (
              <option key={id} value={id}>
                {m.label}
              </option>
            )
          })}
        </select>
        {showInNote && (
          <p className="mt-1.5 text-[10px] leading-snug" style={{ color: 'var(--muted-2)' }}>
            {inMeta.exportNote}
          </p>
        )}
      </label>
      <label className="block min-w-0">
        <span className="ui-label">イン秒</span>
        <input
          type="number"
          step={0.1}
          min={0}
          className="ui-input mt-1 min-w-0"
          value={value.inDuration}
          onChange={(e) => onChange({ ...value, inDuration: Number(e.target.value) })}
        />
      </label>
      <label className="block min-w-0">
        <span className="ui-label">アウト秒</span>
        <input
          type="number"
          step={0.1}
          min={0}
          className="ui-input mt-1 min-w-0"
          value={value.outDuration}
          onChange={(e) => onChange({ ...value, outDuration: Number(e.target.value) })}
        />
      </label>
      <p className="col-span-2 text-[10px] leading-snug" style={{ color: 'var(--muted-2)' }}>
        書き出しは ASS（libass）です。プレビューと完全一致しないアニメは上記のとおり近似または未再現になります。
      </p>
    </div>
  )
}
