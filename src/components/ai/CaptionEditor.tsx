import type { Caption } from '../../lib/types'

type Props = {
  captions: Caption[]
  onChange: (next: Caption[]) => void
}

export default function CaptionEditor({ captions, onChange }: Props) {
  return (
    <div className="max-h-48 space-y-2.5 overflow-auto text-[12px]">
      {captions.map((c, i) => (
        <div key={c.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="mono mb-2 text-[11px] font-medium" style={{ color: 'var(--label)' }}>
            {c.startTime.toFixed(2)} – {c.endTime.toFixed(2)}
          </div>
          <input
            className="ui-input min-w-0"
            placeholder="字幕テキスト"
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
