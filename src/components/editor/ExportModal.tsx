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
        <p className="mb-3 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          書き出しは FFmpeg が正（カラー・LUT・ルックプリセット）。プレビューはルック・カラーグレード（色相・色温度含む）を CSS で近似し、LUT は WebGL で近似します。コンテナは MP4、+faststart
          を付与します。
        </p>
        <label className="mb-1 block">
          <span className="ui-label">プリセット</span>
        </label>
        <select
          className="ui-select mb-2 w-full"
          value={presetId}
          onChange={(e) => {
            const v = e.target.value as ExportFormat
            setPresetId(v)
            if (v === 'custom') setCustomPatch({})
          }}
        >
          {PRESET_ORDER.map((k) => (
            <option key={k} value={k}>
              {EXPORT_PRESET_DEFINITIONS[k].label}
            </option>
          ))}
        </select>
        <p className="mb-3 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          固定プリセットでは解像度・fps・ビットレートはロックされます。個別に変える場合は「カスタム（手動）」を選ぶか、下のボタンで現在の値をコピーしてください。
        </p>

        {presetId === 'custom' ? (
          <div className="mb-4 space-y-3 rounded-lg px-2 py-3" style={{ background: 'var(--surface-2)' }}>
            <div>
              <span className="ui-label">コーデック</span>
              <select
                className="ui-select mt-1 w-full"
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
                  className="ui-input mt-1 w-full"
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
                  className="ui-input mt-1 w-full"
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
                className="ui-input mt-1 w-full"
                value={resolvedPreset.fps}
                onChange={(e) => setCustomField('fps', Number(e.target.value))}
              />
            </div>
            <div>
              <span className="ui-label">動画ビットレート</span>
              <input
                type="text"
                className="ui-input mt-1 w-full"
                placeholder="例: 8000k"
                value={resolvedPreset.bitrate}
                onChange={(e) => setCustomField('bitrate', e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="mb-4 space-y-2 rounded-lg px-3 py-3 text-[12px]" style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}>
            <p>
              <span style={{ color: 'var(--muted-2)' }}>反映: </span>
              {resolvedPreset.codec === 'h264' ? 'H.264' : 'H.265'} / {resolvedPreset.width}×{resolvedPreset.height} / {resolvedPreset.fps}{' '}
              fps / {resolvedPreset.bitrate}
            </p>
            <button
              type="button"
              className="btn-ghost w-full px-3 py-2 text-[12px] font-medium"
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
        <p className="mb-2 pl-6 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
          映像トラックにクリップが 2 本以上あるとき、並び順どおりの継ぎ目に FFmpeg の xfade（フェード）を適用します。短すぎるクリップは自動で concat に切り替わります。
        </p>
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
        {visualOverlap && (
          <p className="mb-3 rounded-md px-2 py-2 text-[10px] leading-snug" style={{ background: 'var(--surface-2)', color: 'var(--label)' }}>
            映像クリップがタイムライン上で重なっています。書き出しはオーバーレイ合成になり、隣接クリップ間の xfade（クロスフェード）は適用されません（チェックしていても無効）。
          </p>
        )}

        <span className="ui-label mb-1 block">オーディオ（ミックス後）</span>
        <div className="mb-4 flex flex-col gap-2 rounded-lg px-2 py-2" style={{ background: 'var(--surface-2)' }}>
          {(
            [
              { v: 'none' as const, label: 'なし' },
              { v: 'loudnorm' as const, label: 'ラウドネス正規化（loudnorm、EBU R128 風）' },
              { v: 'dynaudnorm' as const, label: 'ダイナミック正規化（dynaudnorm）' },
            ] as const
          ).map((o) => (
            <label key={o.v} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="audioPost"
                className="mt-0.5 rounded-full"
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

        <label className="mb-1 block">
          <span className="ui-label">動画エンコーダ</span>
        </label>
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
          プリセットの H.264 / H.265 に合わせてエンコーダを選びます。Linux の「自動」は HW 未接続（VAAPI 等は未実装）でソフトエンコードです。NVENC / QSV / AMF の UI は Windows のみ。H.265 選択時は各 HW の HEVC に対応していることが前提です。
        </p>

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
          <div className="mb-3 space-y-2">
            <p className="text-xs" style={{ color: '#d98a8a' }}>
              {error}
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
              詳細はメインプロセスのログ（ターミナル）と開発者ツールのコンソールを参照してください。ファイルにまとめる場合は下のボタンを使えます。
            </p>
            <button
              type="button"
              className="btn-ghost w-full px-3 py-2 text-[12px] font-medium"
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
              保存ファイルには書き出し先などローカルパスが含まれることがあります。共有前に内容を確認してください。
            </p>
            {diagnosticsSaveHint && (
              <p className="text-[11px] leading-snug" style={{ color: 'var(--label)' }}>
                {diagnosticsSaveHint}
              </p>
            )}
          </div>
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
            開始
          </button>
        </div>
      </div>
    </div>
  )
}
