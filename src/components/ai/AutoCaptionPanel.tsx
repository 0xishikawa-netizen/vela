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
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

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
    if (!api?.listWhisperModels) return
    void api.listWhisperModels().then(setInstalled)
  }, [api])

  const hasModel = installed.some((f) => f.includes(model))

  const download = async () => {
    if (!api?.downloadWhisperModel || !api.listWhisperModels) return
    setDownloading(true)
    setDlPct(0)
    api.offDownloadProgress?.()
    api.onDownloadProgress?.(setDlPct)
    try {
      await api.downloadWhisperModel(model)
      setInstalled(await api.listWhisperModels())
    } finally {
      api.offDownloadProgress?.()
      setDownloading(false)
    }
  }

  const run = async () => {
    if (!videoPath || !api?.transcribe) return
    setBusy(true)
    setTrPct(0)
    api.offTranscribeProgress?.()
    api.onTranscribeProgress?.(setTrPct)
    try {
      const cap = await api.transcribe(videoPath, model, lang === 'auto' ? 'auto' : lang)
      setCaptions(cap)
    } catch (e) {
      console.error(e)
      setCaptions([])
    } finally {
      api.offTranscribeProgress?.()
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
    <div className="min-w-0 space-y-4 p-3 text-[13px]">
      {!videoPath && (
        <p className="text-[12px] font-medium leading-relaxed" style={{ color: 'var(--label)' }}>
          映像トラックに動画クリップを置いてから実行してください。
        </p>
      )}
      <label className="block min-w-0">
        <span className="ui-label">モデル</span>
        <select className="ui-select mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
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
          className="btn-ghost w-full py-2 text-[13px] font-medium"
          disabled={downloading}
          onClick={() => void download()}
        >
          {downloading ? `ダウンロード ${dlPct}%` : 'モデルをダウンロード'}
        </button>
      )}
      <label className="block min-w-0">
        <span className="ui-label">言語</span>
        <select className="ui-select mt-1" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="ja">日本語</option>
          <option value="en">英語</option>
          <option value="auto">自動</option>
        </select>
      </label>
      <button
        type="button"
        className="btn-accent w-full rounded-lg py-2.5 text-[13px] font-semibold"
        disabled={busy || !videoPath || !hasModel}
        onClick={() => void run()}
      >
        {busy ? `生成中 ${trPct}%` : '字幕を生成'}
      </button>
      <CaptionEditor captions={captions} onChange={setCaptions} />
      <div className="grid min-w-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <button
          type="button"
          className="btn-ghost min-w-0 py-2 text-[12px] font-medium"
          disabled={!captions.length}
          onClick={exportSrt}
        >
          SRT 出力
        </button>
        <button
          type="button"
          className="btn-ghost min-w-0 py-2 text-[12px] font-medium"
          disabled={!captions.length}
          onClick={addAsTelops}
        >
          テロップ化
        </button>
      </div>
    </div>
  )
}
