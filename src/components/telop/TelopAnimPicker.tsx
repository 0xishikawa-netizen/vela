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
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      <label className="col-span-2" style={{ color: 'var(--muted)' }}>
        イン
        <select
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
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
      <label style={{ color: 'var(--muted)' }}>
        イン秒
        <input
          type="number"
          step={0.1}
          min={0}
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={value.inDuration}
          onChange={(e) => onChange({ ...value, inDuration: Number(e.target.value) })}
        />
      </label>
      <label style={{ color: 'var(--muted)' }}>
        アウト秒
        <input
          type="number"
          step={0.1}
          min={0}
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={value.outDuration}
          onChange={(e) => onChange({ ...value, outDuration: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
