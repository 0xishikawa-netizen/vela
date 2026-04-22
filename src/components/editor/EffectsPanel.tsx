const COMING_SOON = [
  { icon: '🎨', label: 'カラーグレーディング', desc: 'LUT & color wheels' },
  { icon: '✨', label: 'フィルター', desc: 'Blur, sharpen, vignette...' },
  { icon: '↔', label: 'トランジション', desc: 'Fade, dissolve, wipe...' },
]

export default function EffectsPanel() {
  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        Coming Soon
      </p>
      {COMING_SOON.map((item) => (
        <div
          key={item.label}
          className="rounded-lg p-3 flex items-start gap-3"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            opacity: 0.6,
          }}
        >
          <span className="text-lg shrink-0">{item.icon}</span>
          <div>
            <p className="text-[11px] font-medium" style={{ color: 'var(--fg)' }}>{item.label}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
