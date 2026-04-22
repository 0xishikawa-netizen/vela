import type { Caption } from '../../lib/types'

type Props = {
  captions: Caption[]
  onChange: (next: Caption[]) => void
}

export default function CaptionEditor({ captions, onChange }: Props) {
  return (
    <div className="max-h-48 space-y-2 overflow-auto text-[11px]">
      {captions.map((c, i) => (
        <div key={c.id} className="rounded border p-2" style={{ borderColor: 'var(--border)' }}>
          <div className="mono mb-1" style={{ color: 'var(--muted-2)' }}>
            {c.startTime.toFixed(2)} – {c.endTime.toFixed(2)}
          </div>
          <input
            className="w-full rounded border px-1 py-1"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            value={c.text}
            onChange={(e) => {
              const next = captions.slice()
              next[i] = { ...c, text: e.target.value }
              onChange(next)
            }}
          />
        </div>
      ))}
    </div>
  )
}
