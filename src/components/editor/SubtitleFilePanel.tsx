import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import TranscriptionMockSection from './TranscriptionMockSection'
import { flattenSubtitleTracksForExport, serializeSrt, serializeVtt } from '../../lib/subtitleFormat'
import type { SubtitleSegment, SubtitleTrack } from '../../lib/types'

function parseTimeInput(v: string): number | undefined {
  const x = Number.parseFloat(String(v).trim().replace(',', '.'))
  return Number.isFinite(x) ? x : undefined
}

function isSegmentActiveAt(t: number, seg: SubtitleSegment, eps = 0.02): boolean {
  return t >= seg.startSec - eps && t <= seg.endSec + eps
}

export default function SubtitleFilePanel() {
  const current = useProjectStore((s) => s.current)
  const importSubtitleText = useProjectStore((s) => s.importSubtitleText)
  const subtitleTracksClear = useProjectStore((s) => s.subtitleTracksClear)
  const applySubtitleTrackToTelop = useProjectStore((s) => s.applySubtitleTrackToTelop)
  const addEmptySubtitleTrack = useProjectStore((s) => s.addEmptySubtitleTrack)
  const updateSubtitleTrack = useProjectStore((s) => s.updateSubtitleTrack)
  const removeSubtitleTrack = useProjectStore((s) => s.removeSubtitleTrack)
  const addSubtitleSegment = useProjectStore((s) => s.addSubtitleSegment)
  const updateSubtitleSegment = useProjectStore((s) => s.updateSubtitleSegment)
  const removeSubtitleSegment = useProjectStore((s) => s.removeSubtitleSegment)
  const sortSubtitleSegments = useProjectStore((s) => s.sortSubtitleSegments)

  const currentTime = useEditorStore((s) => s.currentTime)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)

  const [hint, setHint] = useState<string | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)

  const tracks = current?.subtitleTracks ?? []

  useEffect(() => {
    if (!tracks.length) {
      setSelectedTrackId(null)
      return
    }
    setSelectedTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : tracks[0]!.id))
  }, [tracks])

  const selectedTrack: SubtitleTrack | undefined = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId),
    [tracks, selectedTrackId],
  )

  const summary = useMemo(() => {
    if (!tracks.length) return 'トラックなし'
    return tracks.map((t) => `${t.name}（${t.segments.length} キュー）`).join(' / ')
  }, [tracks])

  const runImport = async (kind: 'srt' | 'vtt') => {
    setHint(null)
    const api = window.electronAPI
    if (!api?.readSubtitleFile) {
      setHint('Electron 外では字幕ファイルを読めません。')
      return
    }
    const r = await api.readSubtitleFile()
    if (!r.ok) {
      if (r.reason === 'cancelled') return
      setHint(`読み込み失敗: ${r.reason}`)
      return
    }
    const lower = r.path.toLowerCase()
    const inferred: 'srt' | 'vtt' = lower.endsWith('.vtt') ? 'vtt' : 'srt'
    importSubtitleText(r.path, r.text, kind === 'vtt' || inferred === 'vtt' ? 'vtt' : 'srt')
    setHint(`取り込みました: ${r.path}`)
  }

  const runExport = async (kind: 'srt' | 'vtt') => {
    setHint(null)
    const api = window.electronAPI
    if (!api?.saveSubtitleFile) {
      setHint('Electron 外では保存できません。')
      return
    }
    if (!current || !tracks.length) {
      setHint('字幕トラックがありません。先に SRT/VTT を取り込むか、空トラックを追加してください。')
      return
    }
    const flat = flattenSubtitleTracksForExport(tracks)
    if (!flat.length) {
      setHint('キューが空です。')
      return
    }
    const body = kind === 'vtt' ? serializeVtt(flat) : serializeSrt(flat)
    const ext = kind === 'vtt' ? 'vtt' : 'srt'
    const r = await api.saveSubtitleFile({
      defaultName: `${current.name.replace(/[/\\?%*:|"<>]/g, '-')}-subtitles.${ext}`,
      content: body,
    })
    if (!r.ok) {
      if (r.reason === 'cancelled') return
      setHint(`保存失敗: ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`)
      return
    }
    setHint(`保存しました: ${r.path}`)
  }

  return (
    <div className="p-3 text-[12px]" style={{ color: 'var(--fg)' }}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-2)' }}>
        ファイル字幕（SRT / WebVTT）
      </h3>
      <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        テロップタイムラインとは別のデータです。Whisper による自動文字起こしは後続フェーズです。
      </p>

      <TranscriptionMockSection />

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost px-2 py-1.5 text-[11px]" onClick={() => void runImport('srt')}>
          SRT を取り込む…
        </button>
        <button type="button" className="btn-ghost px-2 py-1.5 text-[11px]" onClick={() => void runImport('vtt')}>
          WebVTT を取り込む…
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost px-2 py-1.5 text-[11px]"
          disabled={!tracks.length}
          onClick={() => void runExport('srt')}
        >
          SRT として保存…
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1.5 text-[11px]"
          disabled={!tracks.length}
          onClick={() => void runExport('vtt')}
        >
          WebVTT として保存…
        </button>
      </div>

      <p className="mb-2 text-[11px]" style={{ color: 'var(--label)' }}>
        状態: {summary}
      </p>

      <div
        className="mb-3 border-t pt-3"
        style={{ borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h4 className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--muted-2)' }}>
          トラック・キュー編集
        </h4>
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost px-2 py-1.5 text-[11px]"
            onClick={() => {
              addEmptySubtitleTrack()
              setHint('空の字幕トラックを追加しました。')
            }}
          >
            空トラックを追加
          </button>
        </div>
        {tracks.length > 0 && (
          <>
            <label className="ui-label mb-2 flex min-w-0 flex-col gap-1">
              編集するトラック
              <select
                className="ui-select w-full min-w-0 py-1.5"
                value={selectedTrackId ?? ''}
                onChange={(e) => setSelectedTrackId(e.target.value || null)}
              >
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.segments.length}）
                  </option>
                ))}
              </select>
            </label>
            {selectedTrack && (
              <div className="mb-3 space-y-2">
                <label className="ui-label flex min-w-0 flex-col gap-1">
                  トラック名
                  <input
                    key={`name-${selectedTrack.id}`}
                    className="ui-input w-full min-w-0 py-1.5"
                    defaultValue={selectedTrack.name}
                    onBlur={(e) => updateSubtitleTrack(selectedTrack.id, { name: e.target.value })}
                  />
                </label>
                <label className="ui-label flex min-w-0 flex-col gap-1">
                  言語（任意、BCP-47 風の短い表記）
                  <input
                    key={`lang-${selectedTrack.id}`}
                    className="ui-input w-full min-w-0 py-1.5"
                    placeholder="例: ja"
                    defaultValue={selectedTrack.language ?? ''}
                    onBlur={(e) => updateSubtitleTrack(selectedTrack.id, { language: e.target.value })}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1.5 text-[11px]"
                    onClick={() => {
                      addSubtitleSegment(selectedTrack.id)
                      setHint('キューを追加しました。')
                    }}
                  >
                    キューを追加
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1.5 text-[11px]"
                    onClick={() => {
                      sortSubtitleSegments(selectedTrack.id)
                      setHint('開始時刻順に並べ替えました。')
                    }}
                  >
                    開始時刻で並べ替え
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1.5 text-[11px]"
                    onClick={() => {
                      if (!window.confirm(`トラック「${selectedTrack.name}」を削除しますか？`)) return
                      removeSubtitleTrack(selectedTrack.id)
                      setHint('字幕トラックを削除しました。')
                    }}
                  >
                    このトラックを削除
                  </button>
                </div>
                <div
                  className="max-h-[220px] space-y-2 overflow-y-auto rounded border p-2"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1, rgba(0,0,0,0.15))' }}
                >
                  {selectedTrack.segments.length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
                      キューがありません。「キューを追加」で作成できます。
                    </p>
                  ) : (
                    selectedTrack.segments.map((seg) => {
                      const active = isSegmentActiveAt(currentTime, seg)
                      return (
                        <div
                          key={seg.id}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer rounded border p-2 transition-colors"
                          style={{
                            borderColor: active ? 'var(--accent, #6b8cff)' : 'var(--border)',
                            background: active ? 'rgba(107, 140, 255, 0.08)' : 'transparent',
                          }}
                          onClick={() => setCurrentTime(seg.startSec)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setCurrentTime(seg.startSec)
                            }
                          }}
                        >
                          <div className="mb-1 flex flex-wrap gap-2">
                            <label className="ui-label flex min-w-0 flex-1 flex-col gap-0.5 text-[10px]">
                              開始 (s)
                              <input
                                type="number"
                                step={0.01}
                                className="ui-input w-full min-w-0 py-1 text-[11px]"
                                value={seg.startSec}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const v = parseTimeInput(e.target.value)
                                  if (v === undefined) return
                                  updateSubtitleSegment(selectedTrack.id, seg.id, { startSec: v })
                                }}
                              />
                            </label>
                            <label className="ui-label flex min-w-0 flex-1 flex-col gap-0.5 text-[10px]">
                              終了 (s)
                              <input
                                type="number"
                                step={0.01}
                                className="ui-input w-full min-w-0 py-1 text-[11px]"
                                value={seg.endSec}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const v = parseTimeInput(e.target.value)
                                  if (v === undefined) return
                                  updateSubtitleSegment(selectedTrack.id, seg.id, { endSec: v })
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-ghost self-end px-2 py-1 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeSubtitleSegment(selectedTrack.id, seg.id)
                                setHint('キューを削除しました。')
                              }}
                            >
                              削除
                            </button>
                          </div>
                          <label className="ui-label flex min-w-0 flex-col gap-0.5 text-[10px]">
                            テキスト
                            <textarea
                              className="ui-textarea min-h-[48px] w-full resize-y py-1 text-[11px]"
                              rows={2}
                              value={seg.text}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateSubtitleSegment(selectedTrack.id, seg.id, { text: e.target.value })
                              }
                            />
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                  再生ヘッド付近のキューを枠で強調します。行をクリックするとプレビューの現在時刻が開始位置に移動します。
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="btn-ghost px-2 py-1.5 text-[11px]"
          disabled={!tracks.length}
          onClick={() => {
            applySubtitleTrackToTelop(0)
            setHint('先頭の字幕トラックをテロップトラックに追加しました（既定スタイル・下中央）。')
          }}
        >
          先頭トラックをテロップへ反映
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1.5 text-[11px]"
          disabled={!tracks.length}
          onClick={() => {
            subtitleTracksClear()
            setHint('字幕トラックをクリアしました。')
          }}
        >
          字幕トラックをクリア
        </button>
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        テロップへの反映は最小変換です（`subtitleTelopBridge`）。スタイル・アニメの細かい対応は後続で拡張できます。
      </p>

      {hint && (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--label)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
