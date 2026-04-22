import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { AspectRatio } from '../lib/types'

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
    <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
      <header className="drag-region flex h-12 items-center border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-medium tracking-tight" style={{ color: 'var(--fg)' }}>
          Vela
        </span>
        <span className="ml-3 text-xs" style={{ color: 'var(--muted)' }}>
          ローカル動画エディタ
        </span>
      </header>
      <div className="flex flex-1 gap-6 p-8">
        <section
          className="no-drag w-[360px] rounded-lg border p-5"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <h2 className="mb-4 text-sm font-medium">新規プロジェクト</h2>
          <label className="mb-2 block text-xs" style={{ color: 'var(--muted)' }}>
            名前
          </label>
          <input
            className="mb-3 w-full rounded border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mb-2 block text-xs" style={{ color: 'var(--muted)' }}>
            アスペクト比
          </label>
          <select
            className="mb-3 w-full rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            value={aspect}
            onChange={(e) => setAspect(e.target.value as AspectRatio)}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16（縦）</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="21:9">21:9</option>
          </select>
          <label className="mb-2 block text-xs" style={{ color: 'var(--muted)' }}>
            FPS
          </label>
          <select
            className="mb-4 w-full rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          >
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
          <button
            type="button"
            className="w-full rounded py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#0a0c10' }}
            onClick={() => void createProject(name || '無題', aspect, fps)}
          >
            作成して開く
          </button>
        </section>
        <section className="no-drag min-w-0 flex-1">
          <h2 className="mb-3 text-sm font-medium">最近のプロジェクト</h2>
          <ul className="max-h-[calc(100vh-8rem)] space-y-2 overflow-auto pr-2">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  style={{ color: 'var(--fg)' }}
                  onClick={() => void openProject(p.id)}
                >
                  {p.name}
                </button>
                <span className="mono ml-2 shrink-0 text-[11px]" style={{ color: 'var(--muted-2)' }}>
                  {new Date(p.updatedAt).toLocaleDateString('ja-JP')}
                </span>
                <button
                  type="button"
                  className="no-drag ml-2 rounded px-2 py-0.5 text-xs"
                  style={{ color: '#c98a8a' }}
                  onClick={() => void deleteProject(p.id)}
                >
                  削除
                </button>
              </li>
            ))}
            {projects.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                まだプロジェクトがありません。左から作成してください。
              </p>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
