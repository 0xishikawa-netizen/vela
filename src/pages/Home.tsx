import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { AspectRatio } from '../lib/types'

const ASPECT_OPTIONS: { value: AspectRatio; label: string; sub: string }[] = [
  { value: '16:9', label: '16:9', sub: 'Landscape' },
  { value: '9:16', label: '9:16', sub: 'Portrait' },
  { value: '1:1', label: '1:1', sub: 'Square' },
  { value: '4:3', label: '4:3', sub: 'Classic' },
  { value: '21:9', label: '21:9', sub: 'Cinematic' },
]

export default function Home() {
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const createProject = useProjectStore((s) => s.createProject)
  const openProject = useProjectStore((s) => s.openProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  const [name, setName] = useState('新規プロジェクト')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  const [fps, setFps] = useState(30)

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  return (
    <div
      className="drag-region flex h-screen flex-col overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 20% 50%, rgba(0,200,240,0.04) 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 80% 50%, rgba(139,92,246,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Grid background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />

      {/* Header */}
      <header
        className="relative flex h-12 shrink-0 items-center border-b px-6"
        style={{ borderColor: 'var(--border)', background: 'rgba(3,5,8,0.8)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold tracking-widest"
            style={{
              background: 'linear-gradient(90deg, #00c8f0, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            VELA
          </span>
          <span className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Video Editor
          </span>
        </div>
      </header>

      {/* Main */}
      <div className="no-drag relative flex flex-1 gap-8 p-8 overflow-hidden">
        {/* Left: New project */}
        <section className="w-[340px] shrink-0 flex flex-col gap-5">
          <div>
            <h2 className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--accent)' }}>
              New Project
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              新しいプロジェクトを作成
            </p>
          </div>

          <div
            className="rounded-xl border p-5 flex flex-col gap-4"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03)',
            }}
          >
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
                名前
              </label>
              <input
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--fg)',
                }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(0,200,240,0.4)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Aspect ratio */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
                アスペクト比
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAspect(opt.value)}
                    className="flex flex-col items-center rounded-lg py-2 px-1 text-center"
                    style={{
                      background: aspect === opt.value ? 'var(--accent-dim)' : 'var(--surface-2)',
                      border: `1px solid ${aspect === opt.value ? 'rgba(0,200,240,0.4)' : 'var(--border)'}`,
                      color: aspect === opt.value ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    <span className="text-[10px] font-semibold">{opt.label}</span>
                    <span className="text-[9px] mt-0.5 opacity-60">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* FPS */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
                フレームレート
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[24, 30, 60].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFps(f)}
                    className="rounded-lg py-2 text-xs font-semibold"
                    style={{
                      background: fps === f ? 'var(--accent-dim)' : 'var(--surface-2)',
                      border: `1px solid ${fps === f ? 'rgba(0,200,240,0.4)' : 'var(--border)'}`,
                      color: fps === f ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {f} fps
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-accent w-full rounded-lg py-2.5 text-sm font-semibold mt-1"
              onClick={() => void createProject(name || '無題', aspect, fps)}
            >
              ＋ 作成して開く
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="w-px shrink-0 self-stretch" style={{ background: 'var(--border)' }} />

        {/* Right: Recent projects */}
        <section className="min-w-0 flex-1 flex flex-col gap-5">
          <div>
            <h2 className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--accent)' }}>
              Recent Projects
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              最近のプロジェクト
            </p>
          </div>

          <div className="flex-1 overflow-auto pr-1">
            {projects.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-40 rounded-xl border"
                style={{ borderColor: 'var(--border)', borderStyle: 'dashed' }}
              >
                <div className="text-2xl mb-2 opacity-20">◻</div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  プロジェクトがありません
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <div
                      className="group flex items-center rounded-xl border px-4 py-3 cursor-pointer"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--surface)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0,200,240,0.2)'
                        e.currentTarget.style.background = 'var(--surface-2)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.background = 'var(--surface)'
                      }}
                      onClick={() => void openProject(p.id)}
                    >
                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mr-3 text-base"
                        style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}
                      >
                        ▶
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--fg)' }}>
                          {p.name}
                        </p>
                        <p className="text-[10px] mono mt-0.5" style={{ color: 'var(--muted)' }}>
                          {new Date(p.updatedAt).toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 ml-2">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded font-medium mono"
                          style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
                        >
                          {p.fps}fps
                        </span>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 text-[11px] px-2 py-0.5 rounded"
                          style={{
                            background: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#f87171',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteProject(p.id)
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.22)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
