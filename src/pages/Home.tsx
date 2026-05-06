import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { AspectRatio } from '../lib/types'

const ASPECT_OPTIONS: { value: AspectRatio; label: string; sub: string }[] = [
  { value: '16:9', label: '16:9', sub: '横型' },
  { value: '9:16', label: '9:16', sub: '縦型' },
  { value: '1:1', label: '1:1', sub: '正方形' },
  { value: '4:3', label: '4:3', sub: 'クラシック' },
  { value: '21:9', label: '21:9', sub: 'シネマ' },
]

const ELECTRON_HELP =
  'Electron の API（preload）が読み込めていません。プロジェクトのルートでターミナルから「npm run dev」を実行してください。ブラウザで localhost だけ開いている場合はこのアプリは動きません。起動ターミナルに preload 関連のエラーが出ていないかも確認してください。'

function AspectBox({ ratio, active }: { ratio: string; active: boolean }) {
  const [w, h] = ratio.split(':').map(Number)
  const maxW = 28
  const maxH = 20
  const scale = Math.min(maxW / w, maxH / h)
  return (
    <div style={{ width: 30, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div
        style={{
          width: Math.round(w * scale),
          height: Math.round(h * scale),
          border: `1.5px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
          background: active ? 'var(--accent-dim)' : 'var(--surface-3)',
          borderRadius: 2,
          transition: 'all 0.15s',
        }}
      />
    </div>
  )
}

function ProjectCard({
  p,
  onOpen,
  onDelete,
}: {
  p: { id: string; name: string; aspectRatio: AspectRatio; fps: number; updatedAt: string }
  onOpen: () => void
  onDelete: () => void
}) {
  const [w, h] = p.aspectRatio.split(':').map(Number)
  const maxW = 72
  const maxH = 48
  const scale = Math.min(maxW / w, maxH / h)

  return (
    <div
      className="group relative rounded-xl border cursor-pointer overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)', transition: 'border-color 0.15s, background 0.15s' }}
      onClick={onOpen}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(132,181,169,0.28)'
        e.currentTarget.style.background = 'var(--surface-2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--surface)'
      }}
    >
      {/* Thumbnail */}
      <div className="flex items-center justify-center" style={{ height: 88, background: 'var(--surface-2)' }}>
        <div
          style={{
            width: Math.round(w * scale),
            height: Math.round(h * scale),
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'var(--surface-3)',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 14, opacity: 0.25, color: 'var(--accent)' }}>▶</span>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="truncate text-xs font-medium" style={{ color: 'var(--fg)' }}>{p.name}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
            {p.aspectRatio}
          </span>
          <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
            {p.fps}fps
          </span>
          <span className="text-[9px] ml-auto mono" style={{ color: 'var(--muted-2)' }}>
            {new Date(p.updatedAt).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded"
        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', transition: 'opacity 0.15s, background 0.15s' }}
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
      >
        削除
      </button>
    </div>
  )
}

export default function Home() {
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const createProject = useProjectStore((s) => s.createProject)
  const openProject = useProjectStore((s) => s.openProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  const [name, setName] = useState('新規プロジェクト')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  const [fps, setFps] = useState(30)
  const [createError, setCreateError] = useState<string | null>(null)
  const [electronApiMissing, setElectronApiMissing] = useState(false)

  useEffect(() => { void loadProjects() }, [loadProjects])

  /** preload はページ JS より先に実行されるが、起動直後のみのレースを避けるため短時間ポーリングする */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.electronAPI?.saveProject) {
      setElectronApiMissing(false)
      return
    }
    let cancelled = false
    let n = 0
    const max = 80
    const id = window.setInterval(() => {
      if (cancelled) return
      n++
      if (window.electronAPI?.saveProject) {
        setElectronApiMissing(false)
        window.clearInterval(id)
        return
      }
      if (n >= max) {
        setElectronApiMissing(true)
        window.clearInterval(id)
      }
    }, 50)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    const meta = (ev: KeyboardEvent) => (isMac ? ev.metaKey : ev.ctrlKey)

    const onKey = (ev: KeyboardEvent) => {
      if (!meta(ev) || ev.key !== 'Enter') return
      const t = ev.target as HTMLElement | null
      if (t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT') return
      if (electronApiMissing) return
      ev.preventDefault()
      setCreateError(null)
      void createProject(name.trim() || '無題', aspect, fps).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'プロジェクトの作成に失敗しました'
        setCreateError(msg)
        console.error(e)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [name, aspect, fps, electronApiMissing, createProject])

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: '#121212' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 20% 70%, rgba(132,181,169,0.04) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 80% 30%, rgba(180,171,201,0.04) 0%, transparent 60%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />

      {/* Header */}
      <header
        className="drag-region relative flex h-12 shrink-0 items-center border-b"
        style={{
          paddingLeft: 'max(env(titlebar-area-x, 0px), 76px)',
          paddingRight: 20,
          borderColor: 'var(--border)',
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="text-sm font-bold tracking-[0.2em]"
            style={{
              background: 'linear-gradient(90deg, #84b5a9, #b4abc9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            VELA
          </span>
          <span className="text-[11px] font-medium tracking-[0.22em]" style={{ color: 'var(--label)' }}>
            VIDEO EDITOR
          </span>
        </div>
      </header>

      {/* Body: left sidebar + main */}
      <div className="no-drag relative flex flex-1 min-h-0">
        {/* Left: New Project sidebar */}
        <div
          className="shrink-0 flex flex-col border-r overflow-y-auto"
          style={{
            width: 308,
            borderColor: 'var(--border)',
            background: '#1a1a1a',
            padding: '24px 20px 28px',
          }}
        >
          <p className="ui-section-title ui-section-title--accent mb-5">新規プロジェクト</p>

          <div className="flex flex-col gap-5">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="ui-label">プロジェクト名</label>
              <input
                className="ui-input rounded-lg"
                value={name}
                placeholder="新規プロジェクト"
                onChange={(e) => setName(e.target.value)}
                style={{ background: 'var(--surface-2)' }}
              />
            </div>

            {/* Aspect ratio */}
            <div className="flex flex-col gap-2">
              <span className="ui-label">アスペクト比</span>
              <div className="flex flex-col gap-1">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAspect(opt.value)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background,border-color] duration-100"
                    style={{
                      background: aspect === opt.value ? 'var(--accent-dim)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${
                        aspect === opt.value ? 'rgba(132,181,169,0.45)' : 'rgba(255,255,255,0.04)'
                      }`,
                    }}
                    onMouseEnter={(e) => {
                      if (aspect !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    }}
                    onMouseLeave={(e) => {
                      if (aspect !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <AspectBox ratio={opt.value} active={aspect === opt.value} />
                    <span className="min-w-0 flex-1">
                      <span
                        className="text-[13px] font-semibold"
                        style={{ color: aspect === opt.value ? 'var(--accent)' : 'var(--fg)' }}
                      >
                        {opt.label}
                      </span>
                      <span className="text-[12px] font-medium" style={{ color: 'var(--muted)' }}>
                        {' '}
                        {opt.sub}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* FPS */}
            <div className="flex flex-col gap-2">
              <span className="ui-label">フレームレート</span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-lg"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                {[24, 30, 60].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFps(f)}
                    className="rounded-md py-2 text-[12px] font-semibold transition-colors"
                    style={{
                      background: fps === f ? 'var(--accent-dim)' : 'transparent',
                      border: '1px solid',
                      borderColor: fps === f ? 'rgba(132,181,169,0.4)' : 'transparent',
                      color: fps === f ? 'var(--accent)' : 'var(--label)',
                    }}
                  >
                    {f}fps
                  </button>
                ))}
              </div>
            </div>

            {(electronApiMissing || createError) && (
              <p className="text-[11px] font-medium leading-relaxed" style={{ color: '#d98a8a' }}>
                {createError || ELECTRON_HELP}
              </p>
            )}
            <button
              type="button"
              className="btn-accent w-full rounded-lg py-2.5 text-sm font-semibold mt-1"
              disabled={electronApiMissing}
              style={electronApiMissing ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
              onClick={() => {
                setCreateError(null)
                void createProject(name.trim() || '無題', aspect, fps).catch((e: unknown) => {
                  const msg = e instanceof Error ? e.message : 'プロジェクトの作成に失敗しました'
                  setCreateError(msg)
                  console.error(e)
                })
              }}
            >
              ＋ プロジェクトを作成
            </button>
          </div>
        </div>

        {/* Right: Recent Projects */}
        <div
          className="flex flex-1 flex-col min-w-0 overflow-hidden"
          style={{ padding: '24px 24px 28px', background: 'rgba(18,18,18,0.5)' }}
        >
          <div className="flex items-center justify-between mb-5 shrink-0">
            <h2
              className="text-sm font-semibold tracking-wide"
              style={{ color: 'var(--label-strong)' }}
            >
              最近のプロジェクト
            </h2>
            {projects.length > 0 && (
              <span className="text-[10px] mono" style={{ color: 'var(--muted-2)' }}>
                {projects.length} 件
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-0.5">
            {projects.length === 0 ? (
              <div
                className="flex flex-1 flex-col items-center justify-center min-h-[min(60vh,420px)] rounded-xl border-2"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  borderStyle: 'dashed',
                  background: 'rgba(30,30,32,0.35)',
                }}
              >
                <div
                  className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
                >
                  <span className="text-3xl pl-0.5 opacity-30">▶</span>
                </div>
                <p className="text-[12px] font-medium" style={{ color: 'var(--muted)' }}>
                  プロジェクトがありません
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    onOpen={() => void openProject(p.id)}
                    onDelete={() => void deleteProject(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
