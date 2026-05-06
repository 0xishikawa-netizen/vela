import { useState } from 'react'
import type { ExportFormat, HwVideoEncoder } from '../../lib/types'
import { EXPORT_PRESETS } from '../../lib/types'
import { useExport } from '../../hooks/useExport'

type Props = {
  open: boolean
  onClose: () => void
}

const ENCODER_OPTIONS: { value: HwVideoEncoder; label: string }[] = [
  { value: 'off', label: 'ソフト（libx264/265）' },
  { value: 'auto', label: '自動（OS に応じて HW 優先）' },
  { value: 'videotoolbox', label: 'VideoToolbox（macOS）' },
  { value: 'nvenc', label: 'NVENC' },
  { value: 'qsv', label: 'Quick Sync（QSV）' },
]

export default function ExportModal({ open, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('youtube_hd')
  const [includeAudio, setIncludeAudio] = useState(true)
  const [crossfade, setCrossfade] = useState(false)
  const [crossfadeSec, setCrossfadeSec] = useState(0.35)
  const [loudnorm, setLoudnorm] = useState(false)
  const [videoEncoder, setVideoEncoder] = useState<HwVideoEncoder>('auto')
  const { runExport, progress, busy, error } = useExport()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,12,16,0.72)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="no-drag w-full max-w-md rounded-xl border p-6 shadow-2xl max-h-[min(90vh,640px)] overflow-y-auto"
        style={{
          borderColor: 'var(--border-bright)',
          background: 'var(--surface)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
        }}
      >
        <h2 className="ui-modal-title mb-5">書き出し</h2>
        <label className="mb-1 block">
          <span className="ui-label">プリセット</span>
        </label>
        <select
          className="ui-select mb-4 w-full"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
        >
          {(Object.keys(EXPORT_PRESETS) as ExportFormat[]).map((k) => (
            <option key={k} value={k}>
              {EXPORT_PRESETS[k].label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            style={{ accentColor: 'var(--accent)' }}
            checked={includeAudio}
            onChange={(e) => setIncludeAudio(e.target.checked)}
          />
          <span className="text-[13px]" style={{ color: 'var(--fg)' }}>
            オーディオを含む
          </span>
        </label>

        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            style={{ accentColor: 'var(--accent)' }}
            checked={crossfade}
            onChange={(e) => setCrossfade(e.target.checked)}
          />
          <span className="text-[13px]" style={{ color: 'var(--fg)' }}>
            隣接クリップ間をクロスフェード（xfade）
          </span>
        </label>
        {crossfade && (
          <div className="mb-3 pl-6">
            <span className="ui-label">フェード秒</span>
            <input
              type="number"
              min={0.05}
              max={2}
              step={0.05}
              className="ui-select mt-1 w-full"
              value={crossfadeSec}
              onChange={(e) => setCrossfadeSec(Number(e.target.value))}
            />
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            style={{ accentColor: 'var(--accent)' }}
            checked={loudnorm}
            onChange={(e) => setLoudnorm(e.target.checked)}
          />
          <span className="text-[13px]" style={{ color: 'var(--fg)' }}>
            ラウドネス正規化（loudnorm、EBU R128 風）
          </span>
        </label>

        <label className="mb-1 block">
          <span className="ui-label">動画エンコーダ</span>
        </label>
        <select
          className="ui-select mb-4 w-full"
          value={videoEncoder}
          onChange={(e) => setVideoEncoder(e.target.value as HwVideoEncoder)}
        >
          {ENCODER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {busy && (
          <div className="mb-3">
            <div className="h-2 w-full overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full transition-all"
                style={{ width: `${progress}%`, background: 'var(--accent)' }}
              />
            </div>
            <p className="mt-1.5 text-[12px] font-medium" style={{ color: 'var(--label)' }}>
              {progress}%
            </p>
          </div>
        )}
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d98a8a' }}>
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost min-w-0 shrink-0 px-4 py-2 text-[13px] font-medium"
            onClick={onClose}
            disabled={busy}
          >
            閉じる
          </button>
          <button
            type="button"
            className="btn-accent min-w-0 shrink-0 px-5 py-2 text-[13px] font-semibold"
            disabled={busy}
            onClick={() =>
              void runExport(format, {
                includeAudio,
                crossfadeAdjacent: crossfade,
                crossfadeDurationSec: crossfadeSec,
                loudnessNormalize: loudnorm,
                videoEncoder,
              })
            }
          >
            開始
          </button>
        </div>
      </div>
    </div>
  )
}
