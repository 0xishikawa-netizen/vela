import { useState } from 'react'
import type { ExportFormat } from '../../lib/types'
import { EXPORT_PRESETS } from '../../lib/types'
import { useExport } from '../../hooks/useExport'

type Props = {
  open: boolean
  onClose: () => void
}

export default function ExportModal({ open, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('youtube_hd')
  const { runExport, progress, busy, error } = useExport()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="no-drag w-full max-w-md rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <h2 className="mb-3 text-sm font-medium">書き出し</h2>
        <label className="mb-2 block text-xs" style={{ color: 'var(--muted)' }}>
          プリセット
        </label>
        <select
          className="mb-4 w-full rounded border px-2 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
        >
          {(Object.keys(EXPORT_PRESETS) as ExportFormat[]).map((k) => (
            <option key={k} value={k}>
              {EXPORT_PRESETS[k].label}
            </option>
          ))}
        </select>
        {busy && (
          <div className="mb-3">
            <div className="h-2 w-full overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
            </div>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              {progress}%
            </p>
          </div>
        )}
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d98a8a' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs"
            style={{ background: 'var(--surface-2)' }}
            onClick={onClose}
            disabled={busy}
          >
            閉じる
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--accent)', color: '#0a0c10' }}
            disabled={busy}
            onClick={() => void runExport(format).then(() => {})}
          >
            開始
          </button>
        </div>
      </div>
    </div>
  )
}
