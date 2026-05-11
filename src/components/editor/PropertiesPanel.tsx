import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { VideoClip, ImageClip } from '../../lib/types'

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="ui-label">{label}</span>
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
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1"
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
        <p className="text-[12px] font-medium leading-relaxed" style={{ color: 'var(--label)' }}>
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
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <div
          className="rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wide"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(132,181,169,0.22)' }}
        >
          ▶ 映像クリップ
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
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          色味・LUT・プリセット・トランジションは右パネル「ルック」タブで調整します（書き出しに反映されます）。
        </p>
      </div>
    )
  }

  if (clip.type === 'image') {
    const im = clip as ImageClip
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <div
          className="rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wide"
          style={{ background: 'var(--accent-2-dim)', color: '#d4c8e8', border: '1px solid rgba(180,171,201,0.25)' }}
        >
          ◻ 静止画
        </div>
        <SliderRow
          label="表示尺（秒）"
          min={0.1}
          max={60}
          step={0.1}
          value={im.timelineDuration}
          display={`${im.timelineDuration.toFixed(1)}s`}
          onChange={(v) => updateClip(selectedTrackId, selectedClipId, { timelineDuration: v } as Partial<ImageClip>)}
        />
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          色味・LUT・トランジションは「ルック」で調整します。
        </p>
      </div>
    )
  }

  if (clip.type === 'audio') {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <div
          className="rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wide"
          style={{ background: 'rgba(126,158,140,0.12)', color: 'rgba(126,158,140,0.95)', border: '1px solid rgba(126,158,140,0.25)' }}
        >
          ♪ 音声クリップ
        </div>
        <p className="text-[11px] leading-relaxed font-medium" style={{ color: 'var(--label)' }}>
          音量・ミュート・パン・フェード IN/OUT は右パネル「音声」の「選択中の音声クリップ」から編集します。
        </p>
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          プレビューでは音量・クリップミュート・パン（トラックと合成）・フェードが反映されます。フェードは FFmpeg（書き出し）と Web Audio（プレビュー）で処理が異なり、体感はわずかに違う場合があります。
        </p>
      </div>
    )
  }

  if (clip.type === 'telop') {
    return (
      <div className="min-w-0 p-4">
        <div
          className="rounded-lg px-3 py-2 text-[12px] leading-snug font-medium"
          style={{ background: 'var(--accent-2-dim)', color: '#e2deef', border: '1px solid rgba(180,171,201,0.28)' }}
        >
          T テロップは「Text」パネルで編集します。
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 p-4">
      <p className="text-[12px] leading-relaxed font-medium" style={{ color: 'var(--label)' }}>
        このクリップの詳細設定は今後追加されます。
      </p>
    </div>
  )
}
