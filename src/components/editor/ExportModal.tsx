import { useEffect, useMemo, useState } from 'react'
import type { ExportFormat, ExportPreset, HwVideoEncoder } from '../../lib/types'
import {
  EXPORT_PRESET_DEFINITIONS,
  resolveExportPresetSettings,
} from '../../lib/exportPresets'
import { useExport } from '../../hooks/useExport'
import { useProjectStore } from '../../store/projectStore'
import {
  collectVisualClipEntries,
  hasVisualClipTimelineOverlap,
  sortVisualClipsForExport,
} from '../../lib/visualTimeline'
import type { ExportRuntimePlatform } from '../../lib/exportVideoEncoder'
import { exportEncoderOptionAvailable } from '../../lib/exportVideoEncoder'

type Props = {
  open: boolean
  onClose: () => void
}

const PRESET_ORDER: ExportFormat[] = ['web_1080p', 'web_720p', 'sns_1080p', 'archive_4k', 'custom']

const ENCODER_OPTIONS: { value: HwVideoEncoder; label: string }[] = [
  { value: 'off', label: 'ソフトウェア（libx264 / libx265）' },
  { value: 'auto', label: '自動（HW を試す → 失敗時 1 回だけソフトへ）' },
  { value: 'videotoolbox', label: 'VideoToolbox（Apple）' },
  { value: 'nvenc', label: 'NVIDIA NVENC' },
  { value: 'qsv', label: 'Intel Quick Sync（QSV）' },
  { value: 'amf', label: 'AMD AMF' },
]

function presetCardTitle(id: ExportFormat): string {
  const full = EXPORT_PRESET_DEFINITIONS[id].label
  const i = full.indexOf('（')
  return i > 0 ? full.slice(0, i) : full
}

export default function ExportModal({ open, onClose }: Props) {
  const current = useProjectStore((s) => s.current)
  const [presetId, setPresetId] = useState<ExportFormat>('web_1080p')
  const [customPatch, setCustomPatch] = useState<Partial<ExportPreset>>({})
  const [includeAudio, setIncludeAudio] = useState(true)
  const [crossfade, setCrossfade] = useState(false)
  const [crossfadeSec, setCrossfadeSec] = useState(0.35)
  const [audioPost, setAudioPost] = useState<'none' | 'loudnorm' | 'dynaudnorm'>('none')
  const [videoEncoder, setVideoEncoder] = useState<HwVideoEncoder>('auto')
  const [runtimePlatform, setRuntimePlatform] = useState<ExportRuntimePlatform | null>(null)
  const { runExport, saveExportDiagnosticsLog, progress, busy, error } = useExport()
  const [diagnosticsSaveHint, setDiagnosticsSaveHint] = useState<string | null>(null)

  const resolvedPreset = useMemo(
    () => resolveExportPresetSettings(presetId, presetId === 'custom' ? customPatch : null),
    [presetId, customPatch],
  )

  useEffect(() => {
    if (open) setDiagnosticsSaveHint(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const api = window.electronAPI
    if (!api?.getRuntimePlatform) {
      setRuntimePlatform('linux')
      return
    }
    void api.getRuntimePlatform().then(setRuntimePlatform)
  }, [open])

  useEffect(() => {
    if (!open || !runtimePlatform) return
    if (!exportEncoderOptionAvailable(videoEncoder, runtimePlatform)) {
      setVideoEncoder('auto')
    }
  }, [open, runtimePlatform, videoEncoder])

  const visualOverlap = useMemo(() => {
    if (!current) return false
    const v = sortVisualClipsForExport(collectVisualClipEntries(current))
    return v.length >= 2 && hasVisualClipTimelineOverlap(v)
  }, [current])

  const setCustomField = <K extends keyof ExportPreset>(key: K, value: ExportPreset[K]) => {
    setCustomPatch((p) => ({ ...p, [key]: value }))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{
        background: 'rgba(8, 9, 12, 0.78)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.35]" aria-hidden />

      <div
        className="no-drag relative z-[1] flex w-full max-w-[28rem] flex-col overflow-hidden rounded-2xl shadow-2xl max-h-[min(92vh,44rem)]"
        style={{
          border: '1px solid var(--border-bright)',
          background: 'linear-gradient(165deg, var(--surface) 0%, var(--surface-2) 100%)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 28px 64px rgba(0,0,0,0.55)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex min-w-0 gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'var(--accent-dim)',
                border: '1px solid rgba(132, 181, 169, 0.22)',
                color: 'var(--accent)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m8 8 4-4 4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-[17px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--fg)' }}>
                書き出し
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                FFmpeg が正。プレビューはルックを CSS・LUT を WebGL で近似します。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/6"
            style={{ color: 'var(--muted)' }}
            title="閉じる"
            disabled={busy}
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="ui-section-title mb-3">プリセット</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {PRESET_ORDER.map((k) => {
              const def = EXPORT_PRESET_DEFINITIONS[k]
              const selected = presetId === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setPresetId(k)
                    if (k === 'custom') setCustomPatch({})
                  }}
                  className="flex flex-col items-start rounded-xl px-3 py-2.5 text-left transition-all duration-150"
                  style={{
                    border: `1px solid ${selected ? 'rgba(132, 181, 169, 0.55)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent-dim)' : 'var(--surface-2)',
                    boxShadow: selected ? '0 0 0 1px rgba(132, 181, 169, 0.12)' : 'none',
                  }}
                >
                  <span className="mono text-[10px] font-medium tabular-nums" style={{ color: 'var(--muted)' }}>
                    {def.width}×{def.height}
                    <span style={{ color: 'var(--muted-2)' }}> · </span>
                    {def.codec === 'h264' ? 'H.264' : 'H.265'}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug" style={{ color: 'var(--label-strong)' }}>
                    {presetCardTitle(k)}
                  </span>
                </button>
              )
            })}
          </div>

          {presetId === 'custom' ? (
            <div
              className="mb-4 space-y-3 rounded-xl border px-3 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-3)' }}
            >
              <div>
                <span className="ui-label">コーデック</span>
                <select
                  className="ui-select w-full"
                  value={resolvedPreset.codec}
                  onChange={(e) => setCustomField('codec', e.target.value as ExportPreset['codec'])}
                >
                  <option value="h264">H.264（AVC）</option>
                  <option value="h265">H.265（HEVC）</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="ui-label">幅（px）</span>
                  <input
                    type="number"
                    min={16}
                    max={7680}
                    className="ui-input w-full"
                    value={resolvedPreset.width}
                    onChange={(e) => setCustomField('width', Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="ui-label">高さ（px）</span>
                  <input
                    type="number"
                    min={16}
                    max={4320}
                    className="ui-input w-full"
                    value={resolvedPreset.height}
                    onChange={(e) => setCustomField('height', Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <span className="ui-label">フレームレート（fps）</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  className="ui-input w-full"
                  value={resolvedPreset.fps}
                  onChange={(e) => setCustomField('fps', Number(e.target.value))}
                />
              </div>
              <div>
                <span className="ui-label">動画ビットレート</span>
                <input
                  type="text"
                  className="ui-input w-full"
                  placeholder="例: 8000k"
                  value={resolvedPreset.bitrate}
                  onChange={(e) => setCustomField('bitrate', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div
              className="mb-4 flex flex-col gap-2 rounded-xl border px-3 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-3)' }}
            >
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--fg)' }}>
                <span style={{ color: 'var(--muted-2)' }}>反映: </span>
                {resolvedPreset.codec === 'h264' ? 'H.264' : 'H.265'} · {resolvedPreset.width}×{resolvedPreset.height} ·{' '}
                {resolvedPreset.fps} fps · {resolvedPreset.bitrate}
              </p>
              <button
                type="button"
                className="btn-ghost rounded-lg px-3 py-2 text-[12px] font-medium"
                onClick={() => {
                  const r = resolveExportPresetSettings(presetId, null)
                  setCustomPatch({
                    width: r.width,
                    height: r.height,
                    fps: r.fps,
                    bitrate: r.bitrate,
                    codec: r.codec,
                  })
                  setPresetId('custom')
                }}
              >
                このプリセットをベースにカスタムへ
              </button>
            </div>
          )}

          <p className="ui-section-title mb-3">オプション</p>
          <div
            className="mb-4 space-y-2 rounded-xl border px-3 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[0.04]">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-0"
                style={{ accentColor: 'var(--accent)' }}
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
              />
              <span className="text-[13px] font-medium" style={{ color: 'var(--fg)' }}>
                オーディオを含む
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[0.04]">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-0"
                style={{ accentColor: 'var(--accent)' }}
                checked={crossfade}
                onChange={(e) => setCrossfade(e.target.checked)}
              />
              <span className="text-[13px] font-medium" style={{ color: 'var(--fg)' }}>
                隣接クリップ間をクロスフェード（xfade）
              </span>
            </label>
            <p className="pl-7 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
              並び順どおりの継ぎ目に FFmpeg xfade を適用。短尺クリップは自動で concat に切り替わります。
            </p>
            {crossfade && (
              <div className="pl-7 pt-1">
                <span className="ui-label">フェード秒</span>
                <input
                  type="number"
                  min={0.05}
                  max={2}
                  step={0.05}
                  className="ui-input mt-1 max-w-[8rem]"
                  value={crossfadeSec}
                  onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {visualOverlap && (
            <div
              className="mb-4 rounded-xl border px-3 py-2.5 text-[11px] leading-snug"
              style={{
                borderColor: 'var(--danger-border)',
                background: 'var(--danger-bg)',
                color: 'var(--label)',
              }}
            >
              映像クリップが重なっています。書き出しはオーバーレイ合成となり、xfade は適用されません。
            </div>
          )}

          <p className="ui-section-title mb-2">オーディオ（ミックス後）</p>
          <div
            className="mb-4 space-y-1 rounded-xl border px-2 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            {(
              [
                { v: 'none' as const, label: 'なし' },
                { v: 'loudnorm' as const, label: 'ラウドネス正規化（loudnorm、EBU R128 風）' },
                { v: 'dynaudnorm' as const, label: 'ダイナミック正規化（dynaudnorm）' },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
              >
                <input
                  type="radio"
                  name="audioPost"
                  className="mt-0.5 h-4 w-4 shrink-0 border-0"
                  style={{ accentColor: 'var(--accent)' }}
                  checked={audioPost === o.v}
                  onChange={() => setAudioPost(o.v)}
                />
                <span className="text-[12px] leading-snug" style={{ color: 'var(--fg)' }}>
                  {o.label}
                </span>
              </label>
            ))}
          </div>

          <p className="ui-section-title mb-2">動画エンコーダ</p>
          <select
            className="ui-select mb-2 w-full"
            value={videoEncoder}
            onChange={(e) => setVideoEncoder(e.target.value as HwVideoEncoder)}
          >
            {ENCODER_OPTIONS.map((o) => {
              const plat = runtimePlatform ?? 'linux'
              const dis = !exportEncoderOptionAvailable(o.value, plat)
              return (
                <option key={o.value} value={o.value} disabled={dis}>
                  {o.label}
                  {dis ? '（この OS では利用不可）' : ''}
                </option>
              )
            })}
          </select>
          <p className="mb-4 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
            Linux の「自動」は HW 未接続でソフトエンコード。NVENC / QSV / AMF は主に Windows。H.265 時は各 HW の HEVC 対応が前提です。
          </p>

          {busy && (
            <div className="mb-4">
              <div
                className="h-2.5 w-full overflow-hidden rounded-full"
                style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)' }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #6a9e91 0%, var(--accent) 45%, #a8cfc4 100%)',
                    boxShadow: '0 0 12px rgba(132, 181, 169, 0.35)',
                  }}
                />
              </div>
              <p className="mt-2 text-center text-[12px] font-semibold tabular-nums" style={{ color: 'var(--label-strong)' }}>
                {progress}%
              </p>
            </div>
          )}

          {error && (
            <div
              className="mb-4 space-y-2 rounded-xl border px-3 py-3"
              style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}
            >
              <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                詳細はターミナルと開発者ツールを参照。ファイルにまとめる場合は下のボタンを使用できます。
              </p>
              <button
                type="button"
                className="btn-ghost w-full rounded-lg px-3 py-2 text-[12px] font-medium"
                disabled={busy}
                onClick={() => {
                  setDiagnosticsSaveHint(null)
                  void (async () => {
                    const r = await saveExportDiagnosticsLog(error)
                    if (r.ok) {
                      setDiagnosticsSaveHint(`保存しました: ${r.path}`)
                      console.info('[vela-export-ui] diagnostics saved:', r.path)
                    } else if (r.reason === 'cancelled') {
                      setDiagnosticsSaveHint('保存をキャンセルしました。')
                    } else if (r.reason === 'nothing_to_save') {
                      setDiagnosticsSaveHint('保存できる診断がありません（書き出し開始前の失敗など）。')
                    } else if (r.reason === 'no_window') {
                      setDiagnosticsSaveHint('ウィンドウが無いため保存できませんでした。')
                    } else if (r.reason === 'no_api') {
                      setDiagnosticsSaveHint('Electron 外では診断の保存は利用できません。')
                    } else {
                      setDiagnosticsSaveHint(`保存に失敗しました: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`)
                    }
                  })()
                }}
              >
                診断ログを保存…
              </button>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                保存内容にローカルパスが含まれることがあります。共有前に確認してください。
              </p>
              {diagnosticsSaveHint && (
                <p className="text-[11px] leading-snug" style={{ color: 'var(--label)' }}>
                  {diagnosticsSaveHint}
                </p>
              )}
            </div>
          )}
        </div>

        <footer
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.12)' }}
        >
          <button
            type="button"
            className="btn-ghost min-w-[5.5rem] rounded-xl px-4 py-2.5 text-[13px] font-medium"
            onClick={onClose}
            disabled={busy}
          >
            閉じる
          </button>
          <button
            type="button"
            className="btn-export-toolbar min-w-[7.5rem] rounded-xl px-5 py-2.5 text-[13px]"
            disabled={busy}
            onClick={() =>
              void runExport(presetId, {
                customPreset: presetId === 'custom' ? customPatch : undefined,
                includeAudio,
                crossfadeAdjacent: crossfade,
                crossfadeDurationSec: crossfadeSec,
                audioPostMix: audioPost,
                videoEncoder,
              })
            }
          >
            書き出し開始
          </button>
        </footer>
      </div>
    </div>
  )
}
