import { useEffect, useState } from 'react'
import { WHISPER_MODELS } from '../../lib/constants'
import type { Caption, TelopClip } from '../../lib/types'
import { DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE } from '../../lib/types'
import { useProjectStore } from '../../store/projectStore'
import CaptionEditor from './CaptionEditor'

function captionsToSrt(captions: Caption[]): string {
  let out = ''
  captions.forEach((c, i) => {
    const s = fmtSrtTime(c.startTime)
    const e = fmtSrtTime(c.endTime)
    out += `${i + 1}\n${s} --> ${e}\n${c.text}\n\n`
  })
  return out
}

function fmtSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export default function AutoCaptionPanel() {
  const current = useProjectStore((s) => s.current)
  const addClip = useProjectStore((s) => s.addClip)

  const [model, setModel] = useState('base')
  const [lang, setLang] = useState('ja')
  const [downloading, setDownloading] = useState(false)
  const [dlPct, setDlPct] = useState(0)
  const [busy, setBusy] = useState(false)
  const [trPct, setTrPct] = useState(0)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [installed, setInstalled] = useState<string[]>([])

  const videoPath =
    current?.tracks
      .find((t) => t.type === 'video')
      ?.clips.find((c) => c.type === 'video')?.sourcePath ?? ''

  useEffect(() => {
    void window.electronAPI.listWhisperModels().then(setInstalled)
  }, [])

  const hasModel = installed.some((f) => f.includes(model))

  const download = async () => {
    setDownloading(true)
    setDlPct(0)
    window.electronAPI.offDownloadProgress()
    window.electronAPI.onDownloadProgress(setDlPct)
    try {
      await window.electronAPI.downloadWhisperModel(model)
      setInstalled(await window.electronAPI.listWhisperModels())
    } finally {
      window.electronAPI.offDownloadProgress()
      setDownloading(false)
    }
  }

  const run = async () => {
    if (!videoPath) return
    setBusy(true)
    setTrPct(0)
    window.electronAPI.offTranscribeProgress()
    window.electronAPI.onTranscribeProgress(setTrPct)
    try {
      const cap = await window.electronAPI.transcribe(videoPath, model, lang === 'auto' ? 'auto' : lang)
      setCaptions(cap)
    } catch (e) {
      console.error(e)
      setCaptions([])
    } finally {
      window.electronAPI.offTranscribeProgress()
      setBusy(false)
    }
  }

  const addAsTelops = () => {
    if (!current) return
    const telopTrack = current.tracks.find((t) => t.type === 'telop')
    if (!telopTrack) return
    for (const c of captions) {
      const clip: Omit<TelopClip, 'id'> = {
        type: 'telop',
        text: c.text,
        timelineStart: c.startTime,
        timelineDuration: Math.max(0.3, c.endTime - c.startTime),
        style: { ...DEFAULT_TELOP_STYLE, fontSize: 36 },
        animation: { ...DEFAULT_TELOP_ANIMATION },
        position: 'bottom_center',
        transitionIn: { type: 'none', duration: 0 },
        transitionOut: { type: 'none', duration: 0 },
      }
      addClip(telopTrack.id, clip)
    }
  }

  const exportSrt = () => {
    const blob = new Blob([captionsToSrt(captions)], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'captions.srt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-3 p-3 text-xs">
      {!videoPath && <p style={{ color: 'var(--muted)' }}>映像トラックに動画クリップを置いてから実行してください。</p>}
      <label className="block" style={{ color: 'var(--muted)' }}>
        モデル
        <select
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {WHISPER_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {!hasModel && (
        <button
          type="button"
          className="w-full rounded py-1.5 text-xs"
          style={{ background: 'var(--surface-2)' }}
          disabled={downloading}
          onClick={() => void download()}
        >
          {downloading ? `ダウンロード ${dlPct}%` : 'モデルをダウンロード'}
        </button>
      )}
      <label className="block" style={{ color: 'var(--muted)' }}>
        言語
        <select
          className="mt-1 w-full rounded border px-1 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="ja">日本語</option>
          <option value="en">英語</option>
          <option value="auto">自動</option>
        </select>
      </label>
      <button
        type="button"
        className="w-full rounded py-2 text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#0a0c10' }}
        disabled={busy || !videoPath || !hasModel}
        onClick={() => void run()}
      >
        {busy ? `生成中 ${trPct}%` : '字幕を生成'}
      </button>
      <CaptionEditor captions={captions} onChange={setCaptions} />
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded py-1.5 text-[11px]"
          style={{ background: 'var(--surface-2)' }}
          disabled={!captions.length}
          onClick={exportSrt}
        >
          SRT 出力
        </button>
        <button
          type="button"
          className="flex-1 rounded py-1.5 text-[11px]"
          style={{ background: 'var(--surface-2)' }}
          disabled={!captions.length}
          onClick={addAsTelops}
        >
          テロップ化
        </button>
      </div>
    </div>
  )
}
