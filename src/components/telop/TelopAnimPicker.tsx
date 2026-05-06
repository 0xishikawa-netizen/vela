import type { TelopAnimation, TelopAnimationType } from '../../lib/types'

const IN_OPTS: { id: TelopAnimationType; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'fade_in', label: 'フェードイン' },
  { id: 'slide_up', label: '下から上' },
  { id: 'zoom_in', label: 'ズームイン' },
  { id: 'bounce', label: 'バウンス' },
  { id: 'blur_in', label: 'ブラーイン' },
]

type Props = {
  value: TelopAnimation
  onChange: (v: TelopAnimation) => void
}

export default function TelopAnimPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <label className="col-span-2 block min-w-0">
        <span className="ui-label">イン</span>
        <select
          className="ui-select mt-1 w-full min-w-0"
          value={value.in}
          onChange={(e) => onChange({ ...value, in: e.target.value as TelopAnimationType })}
        >
          {IN_OPTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
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
    </div>
  )
}
