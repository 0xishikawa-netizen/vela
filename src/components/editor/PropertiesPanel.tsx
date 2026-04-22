import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { VideoClip } from '../../lib/types'

export default function PropertiesPanel() {
  const current = useProjectStore((s) => s.current)
  const updateClip = useProjectStore((s) => s.updateClip)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)

  if (!current || !selectedTrackId || !selectedClipId) {
    return (
      <div className="p-3 text-xs" style={{ color: 'var(--muted)' }}>
        クリップを選択してください
      </div>
    )
  }

  const track = current.tracks.find((t) => t.id === selectedTrackId)
  const clip = track?.clips.find((c) => c.id === selectedClipId)
  if (!clip) return null

  if (clip.type === 'video') {
    const vc = clip as VideoClip
    return (
      <div className="space-y-3 p-3 text-xs">
        <div>
          <div className="mb-1" style={{ color: 'var(--muted)' }}>
            音量
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vc.volume}
            onChange={(e) => updateClip(selectedTrackId, selectedClipId, { volume: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="mb-1" style={{ color: 'var(--muted)' }}>
            速度
          </div>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.05}
            value={vc.speed}
            onChange={(e) => updateClip(selectedTrackId, selectedClipId, { speed: Number(e.target.value) })}
          />
          <span className="mono ml-2">{vc.speed.toFixed(2)}x</span>
        </div>
      </div>
    )
  }

  if (clip.type === 'telop') {
    return (
      <div className="p-3 text-xs" style={{ color: 'var(--muted)' }}>
        テロップは「テロップ」パネルで編集します。
      </div>
    )
  }

  return (
    <div className="p-3 text-xs" style={{ color: 'var(--muted)' }}>
      このクリップタイプの詳細設定は今後追加されます。
    </div>
  )
}
