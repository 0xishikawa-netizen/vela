import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { AudioClip } from '../../lib/types'
import { normalizeAudioMasterVolumeValue, normalizeAudioPanValue } from '../../lib/audioMix'

export default function AudioPanel() {
  const current = useProjectStore((s) => s.current)
  const updateClip = useProjectStore((s) => s.updateClip)
  const toggleMute = useProjectStore((s) => s.toggleMute)
  const toggleLock = useProjectStore((s) => s.toggleLock)
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume)
  const setAudioMasterVolume = useProjectStore((s) => s.setAudioMasterVolume)
  const setTrackPan = useProjectStore((s) => s.setTrackPan)
  const toggleSolo = useProjectStore((s) => s.toggleSolo)

  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)

  if (!current) {
    return (
      <div className="p-4">
        <p className="text-[12px]" style={{ color: 'var(--label)' }}>プロジェクトを開いてください</p>
      </div>
    )
  }

  let selectedAudio: { trackId: string; clip: AudioClip } | null = null
  if (selectedTrackId && selectedClipId) {
    const tr = current.tracks.find((t) => t.id === selectedTrackId)
    const cl = tr?.clips.find((c) => c.id === selectedClipId)
    if (tr && cl?.type === 'audio') selectedAudio = { trackId: tr.id, clip: cl as AudioClip }
  }

  const audioTracks = current.tracks.filter((t) => t.type === 'audio')

  const masterEff = normalizeAudioMasterVolumeValue(current.audioMasterVolume)

  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        オーディオ
      </p>
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        <span className="font-medium" style={{ color: 'var(--label)' }}>
          全体音量（マスター）
        </span>
        はタイムライン全体のゲインで、プレビューと書き出しの両方に適用されます。クリップの音量・ミュート・パン・フェードは下の「選択中の音声クリップ」から。**クリップのパンはトラックのパンに加算**され（合計が -1〜1 に収まります）、プレビューと書き出しの両方に反映されます。フェードはプレビューと書き出しに反映されます（プレビューは Web Audio による近似です）。
      </p>

      <div
        className="rounded-lg px-3 py-2.5 flex flex-col gap-2 min-w-0"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="text-[11px] font-medium min-w-0" style={{ color: 'var(--fg)' }}>
            全体音量（マスター）
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] font-semibold shrink-0"
            style={{ background: 'var(--surface-3)', color: 'var(--label)', border: '1px solid var(--border)' }}
            title="100% に戻す"
            onClick={() => setAudioMasterVolume(1)}
          >
            Reset
          </button>
        </div>
        <label className="ui-label flex min-w-0 flex-col gap-1">
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
            {Math.round(masterEff * 100)}%
          </span>
          <input
            type="range"
            className="ui-input w-full min-w-0 py-1"
            min={0}
            max={2}
            step={0.01}
            value={masterEff}
            onChange={(e) => setAudioMasterVolume(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div
        className="rounded-lg px-3 py-2.5 flex flex-col gap-2 min-w-0"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <span className="text-[11px] font-medium" style={{ color: 'var(--fg)' }}>
          選択中の音声クリップ
        </span>
        {!selectedAudio ? (
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            タイムラインで音声クリップを選択すると、クリップ音量・ミュート・パン・フェードを調整できます。
          </p>
        ) : (
          <>
            <label className="ui-label flex min-w-0 flex-col gap-1">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                クリップ音量 {Math.round((selectedAudio.clip.volume ?? 1) * 100)}%
              </span>
              <input
                type="range"
                className="ui-input w-full min-w-0 py-1"
                min={0}
                max={2}
                step={0.01}
                value={typeof selectedAudio.clip.volume === 'number' ? selectedAudio.clip.volume : 1}
                onChange={(e) =>
                  updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                    volume: parseFloat(e.target.value),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer min-w-0">
              <input
                type="checkbox"
                className="shrink-0"
                checked={selectedAudio.clip.muted === true}
                onChange={(e) =>
                  updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                    muted: e.target.checked,
                  })
                }
              />
              <span className="text-[11px]" style={{ color: 'var(--label)' }}>
                クリップをミュート（トラック M とは別）
              </span>
            </label>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  クリップ・パン（トラックと加算）
                </span>
                <button
                  type="button"
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0"
                  style={{ background: 'var(--surface-3)', color: 'var(--label)', border: '1px solid var(--border)' }}
                  title="中央へ"
                  onClick={() =>
                    updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                      pan: 0,
                    })
                  }
                >
                  中央へ
                </button>
              </div>
              <span className="text-[10px]" style={{ color: 'var(--muted-2)' }}>
                {(() => {
                  const p = normalizeAudioPanValue(selectedAudio.clip.pan)
                  const pct = Math.round(p * 100)
                  if (pct === 0) return 'C（中央）'
                  return pct < 0 ? `L ${Math.abs(pct)}` : `R ${pct}`
                })()}
              </span>
              <label className="ui-label flex min-w-0 items-center gap-2">
                <span className="text-[9px] w-6 shrink-0" style={{ color: 'var(--muted)' }}>
                  左
                </span>
                <input
                  type="range"
                  className="ui-input flex-1 min-w-0 py-1"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={normalizeAudioPanValue(selectedAudio.clip.pan)}
                  onChange={(e) =>
                    updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                      pan: parseFloat(e.target.value),
                    })
                  }
                />
                <span className="text-[9px] w-6 shrink-0 text-right" style={{ color: 'var(--muted)' }}>
                  右
                </span>
              </label>
            </div>
            <label className="ui-label flex min-w-0 flex-col gap-1">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                フェード IN（秒）
              </span>
              <input
                type="number"
                className="ui-input w-full min-w-0 py-1.5 px-2"
                min={0}
                max={60}
                step={0.1}
                value={selectedAudio.clip.fadeIn ?? 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                    fadeIn: Number.isFinite(v) ? Math.max(0, v) : 0,
                  })
                }}
              />
            </label>
            <label className="ui-label flex min-w-0 flex-col gap-1">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                フェード OUT（秒）
              </span>
              <input
                type="number"
                className="ui-input w-full min-w-0 py-1.5 px-2"
                min={0}
                max={60}
                step={0.1}
                value={selectedAudio.clip.fadeOut ?? 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  updateClip(selectedAudio!.trackId, selectedAudio!.clip.id, {
                    fadeOut: Number.isFinite(v) ? Math.max(0, v) : 0,
                  })
                }}
              />
            </label>
          </>
        )}
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        トラックのミュート・ソロ・音量・パンは書き出しのミックスに反映されます。いずれかの音声トラックをソロにすると、ソロ以外の音声トラックはミックスに入りません。
      </p>
      {audioTracks.length === 0 ? (
        <div
          className="rounded-lg p-4 text-center text-[11px]"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          音声トラックがありません
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {audioTracks.map((t) => (
            <li
              key={t.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg px-3 py-2.5"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="text-[12px] font-medium truncate min-w-0" style={{ color: 'var(--fg)' }} title={t.name}>
                  {t.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{
                      background: t.solo ? 'var(--accent-dim)' : 'var(--surface-3)',
                      color: t.solo ? 'var(--accent)' : 'var(--label)',
                      border: '1px solid var(--border)',
                    }}
                    title="ソロ"
                    onClick={() => toggleSolo(t.id)}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{
                      background: t.muted ? 'rgba(200,100,100,0.2)' : 'var(--surface-3)',
                      color: t.muted ? '#e8a0a0' : 'var(--label)',
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => toggleMute(t.id)}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{
                      background: t.locked ? 'var(--accent-dim)' : 'var(--surface-3)',
                      color: t.locked ? 'var(--accent)' : 'var(--label)',
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => toggleLock(t.id)}
                    title="ロック（今後拡張）"
                  >
                    L
                  </button>
                </div>
              </div>
              <label className="ui-label flex min-w-0 flex-col gap-1">
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  トラック音量 {Math.round((t.volume ?? 1) * 100)}%
                </span>
                <input
                  type="range"
                  className="ui-input w-full min-w-0 py-1"
                  min={0}
                  max={2}
                  step={0.01}
                  value={t.volume ?? 1}
                  onChange={(e) => setTrackVolume(t.id, parseFloat(e.target.value))}
                />
              </label>
              <label className="ui-label flex min-w-0 flex-col gap-1">
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  パン L ← {((t.pan ?? 0) * 100).toFixed(0)}% → R
                </span>
                <input
                  type="range"
                  className="ui-input w-full min-w-0 py-1"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={t.pan ?? 0}
                  onChange={(e) => setTrackPan(t.id, parseFloat(e.target.value))}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
