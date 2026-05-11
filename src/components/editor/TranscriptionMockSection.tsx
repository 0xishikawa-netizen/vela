import { useMemo, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useTranscriptionStore } from '../../store/transcriptionStore'
import type { TranscriptionEngineId, TranscriptionOptions } from '../../lib/types'

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return '待機'
    case 'queued':
      return 'キュー'
    case 'running':
      return '実行中'
    case 'completed':
      return '完了'
    case 'failed':
      return '失敗'
    case 'canceled':
      return 'キャンセル'
    default:
      return status
  }
}

export default function TranscriptionMockSection() {
  const current = useProjectStore((s) => s.current)
  const jobs = useTranscriptionStore((s) => s.jobs)
  const startTranscription = useTranscriptionStore((s) => s.startTranscription)
  const cancelTranscription = useTranscriptionStore((s) => s.cancelTranscription)
  const clearTranscriptionJobs = useTranscriptionStore((s) => s.clearTranscriptionJobs)
  const applyTranscriptionResultToSubtitleTrack = useProjectStore((s) => s.applyTranscriptionResultToSubtitleTrack)

  const mediaPaths = useMemo(() => {
    if (!current) return []
    const set = new Set<string>()
    for (const t of current.tracks) {
      for (const c of t.clips) {
        if ('sourcePath' in c && typeof (c as { sourcePath?: string }).sourcePath === 'string') {
          const p = (c as { sourcePath: string }).sourcePath.trim()
          if (p) set.add(p)
        }
      }
    }
    return [...set]
  }, [current])

  const [sourcePick, setSourcePick] = useState<string>('')
  const [sourceManual, setSourceManual] = useState('')
  const [language, setLanguage] = useState<string>('ja')
  const [modelSize, setModelSize] = useState<string>('base')
  const [translateToJapanese, setTranslateToJapanese] = useState(false)
  const [engineId, setEngineId] = useState<TranscriptionEngineId>('mock')
  const [hint, setHint] = useState<string | null>(null)

  const effectiveSource = (sourcePick || sourceManual).trim()

  const options: TranscriptionOptions = useMemo(
    () => ({
      language: language.trim() || undefined,
      translateToJapanese,
      modelSize: modelSize.trim() || undefined,
    }),
    [language, translateToJapanese, modelSize],
  )

  const runJob = () => {
    setHint(null)
    if (!current) {
      setHint('プロジェクトを開いてください。')
      return
    }
    if (engineId !== 'mock') {
      setHint('Whisper local はまだ実行できません（準備中）。')
      return
    }
    const maxDurationSec =
      typeof current.duration === 'number' && Number.isFinite(current.duration) && current.duration > 0
        ? current.duration
        : undefined
    const id = startTranscription(engineId, effectiveSource || '/mock/no-media-path', options, { maxDurationSec })
    setHint(`ジョブを開始しました（id: ${id.slice(0, 8)}…）`)
  }

  const recentJobs = useMemo(() => [...jobs].reverse(), [jobs])

  return (
    <div
      className="mb-3 border-b pb-3"
      style={{ borderColor: 'var(--border)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h4 className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--muted-2)' }}>
        文字起こし（mock / Whisper local 準備中）
      </h4>
      <p className="mb-2 text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        mock は試用できます。Whisper local はバイナリ・モデル・main IPC が未接続です（ロードマップ Phase E-5 以降）。
      </p>

      {!current ? (
        <p className="text-[11px]" style={{ color: 'var(--label)' }}>
          プロジェクトが開いていません。
        </p>
      ) : (
        <>
          <div className="mb-2 space-y-2">
            <label className="ui-label flex min-w-0 flex-col gap-1 text-[10px]">
              エンジン
              <select
                className="ui-select w-full min-w-0 py-1.5 text-[11px]"
                value={engineId}
                onChange={(e) => setEngineId(e.target.value as TranscriptionEngineId)}
              >
                <option value="mock">mock（実行可）</option>
                <option value="whisper-local" disabled>
                  Whisper local（準備中・バイナリ未同梱）
                </option>
              </select>
            </label>
            <label className="ui-label flex min-w-0 flex-col gap-1 text-[10px]">
              ソースメディア（タイムラインから）
              <select
                className="ui-select w-full min-w-0 py-1.5 text-[11px]"
                value={sourcePick}
                onChange={(e) => setSourcePick(e.target.value)}
              >
                <option value="">（未選択 — 下欄のパスまたは既定 mock）</option>
                {mediaPaths.map((p) => (
                  <option key={p} value={p}>
                    {p.length > 64 ? `…${p.slice(-60)}` : p}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-label flex min-w-0 flex-col gap-1 text-[10px]">
              またはパスを直接入力
              <input
                className="ui-input w-full min-w-0 py-1.5 text-[11px]"
                placeholder="/path/to/media.mp4"
                value={sourceManual}
                onChange={(e) => setSourceManual(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="ui-label flex min-w-0 flex-col gap-1 text-[10px]">
                言語
                <select
                  className="ui-select min-w-[7rem] py-1.5 text-[11px]"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">自動（mock）</option>
                  <option value="ja">ja</option>
                  <option value="en">en</option>
                </select>
              </label>
              <label className="ui-label flex min-w-0 flex-col gap-1 text-[10px]">
                モデル規模（将来用）
                <select
                  className="ui-select min-w-[7rem] py-1.5 text-[11px]"
                  value={modelSize}
                  onChange={(e) => setModelSize(e.target.value)}
                >
                  <option value="tiny">tiny</option>
                  <option value="base">base</option>
                  <option value="small">small</option>
                </select>
              </label>
            </div>
            <label className="ui-label flex items-center gap-2 text-[10px]" style={{ color: 'var(--label)' }}>
              <input
                type="checkbox"
                checked={translateToJapanese}
                onChange={(e) => setTranslateToJapanese(e.target.checked)}
              />
              仮訳ラベル付き mock（translateToJapanese）
            </label>
          </div>

          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost px-2 py-1.5 text-[11px]" onClick={runJob}>
              文字起こしを実行（mock）
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1.5 text-[11px]"
              disabled={!jobs.length}
              onClick={() => {
                clearTranscriptionJobs()
                setHint('ジョブ一覧をクリアしました。')
              }}
            >
              ジョブをすべてクリア
            </button>
          </div>

          {recentJobs.length > 0 && (
            <ul className="max-h-[160px] space-y-2 overflow-y-auto text-[10px]" style={{ color: 'var(--label)' }}>
              {recentJobs.map((j) => (
                <li
                  key={j.id}
                  className="rounded border p-2"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1, rgba(0,0,0,0.12))' }}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                    <span>
                      {statusLabel(j.status)} · {Math.round(j.progress * 100)}%
                    </span>
                    <span className="truncate opacity-80" title={j.sourceMediaPath}>
                      {j.sourceMediaPath.length > 40 ? `…${j.sourceMediaPath.slice(-36)}` : j.sourceMediaPath}
                    </span>
                  </div>
                  {j.errorMessage && (
                    <p className="mb-1 text-[10px]" style={{ color: 'var(--danger, #c44)' }}>
                      {j.errorMessage}
                    </p>
                  )}
                  {j.status === 'completed' && j.resultSegments && (
                    <p className="mb-1 text-[10px] opacity-80">キュー: {j.resultSegments.length} 件</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-[10px]"
                      disabled={j.status === 'completed' || j.status === 'failed' || j.status === 'canceled'}
                      onClick={() => {
                        cancelTranscription(j.id)
                        setHint('ジョブをキャンセルしました。')
                      }}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-[10px]"
                      disabled={j.status !== 'completed' || !j.resultSegments?.length}
                      onClick={() => {
                        const ok = applyTranscriptionResultToSubtitleTrack(j.id)
                        setHint(ok ? '字幕トラックに追加しました。' : '反映できません（完了ジョブ・プロジェクトを確認）。')
                      }}
                    >
                      結果を字幕トラックへ追加
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hint && (
            <p className="mt-2 text-[10px]" style={{ color: 'var(--muted-2)' }}>
              {hint}
            </p>
          )}
        </>
      )}
    </div>
  )
}
