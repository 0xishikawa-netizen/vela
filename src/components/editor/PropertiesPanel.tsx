import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { VideoClip } from '../../lib/types'

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <PanelRow label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span
          className="mono text-[11px] w-10 text-right shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          {display}
        </span>
      </div>
    </PanelRow>
  )
}

export default function PropertiesPanel() {
  const current = useProjectStore((s) => s.current)
  const updateClip = useProjectStore((s) => s.updateClip)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)

  if (!current || !selectedTrackId || !selectedClipId) {
    return (
      <div className="flex flex-col items-center justify-center h-32 p-4">
        <div className="text-2xl mb-2 opacity-10">◻</div>
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
          クリップを選択してください
        </p>
      </div>
    )
  }

  const track = current.tracks.find((t) => t.id === selectedTrackId)
  const clip = track?.clips.find((c) => c.id === selectedClipId)
  if (!clip) return null

  if (clip.type === 'video') {
    const vc = clip as VideoClip
    return (
      <div className="p-4 flex flex-col gap-4">
        <div
          className="rounded-lg px-3 py-2 text-[10px] font-medium"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(0,200,240,0.15)' }}
        >
          ▶ Video Clip
        </div>

        <SliderRow
          label="音量"
          min={0}
          max={1}
          step={0.05}
          value={vc.volume}
          display={`${Math.round(vc.volume * 100)}%`}
          onChange={(v) => updateClip(selectedTrackId, selectedClipId, { volume: v })}
        />

        <SliderRow
          label="速度"
          min={0.25}
          max={2}
          step={0.05}
          value={vc.speed}
          display={`${vc.speed.toFixed(2)}x`}
          onChange={(v) => updateClip(selectedTrackId, selectedClipId, { speed: v })}
        />
      </div>
    )
  }

  if (clip.type === 'telop') {
    return (
      <div className="p-4">
        <div
          className="rounded-lg px-3 py-2 text-[11px]"
          style={{ background: 'var(--accent-2-dim)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          T テロップは「Text」パネルで編集します。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
        このクリップの詳細設定は今後追加されます。
      </p>
    </div>
  )
}
