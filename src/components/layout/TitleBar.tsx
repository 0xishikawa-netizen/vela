import { useProjectStore } from '../../store/projectStore'

export default function TitleBar() {
  const current = useProjectStore((s) => s.current)
  const closeProject = useProjectStore((s) => s.closeProject)

  return (
    <div
      className="drag-region flex h-10 shrink-0 items-center justify-between px-4"
      style={{
        background: 'rgba(3,5,8,0.95)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: Logo + project */}
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-bold tracking-widest"
          style={{
            background: 'linear-gradient(90deg, #00c8f0, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VELA
        </span>

        {current && (
          <>
            <span style={{ color: 'var(--muted-2)', fontSize: 10 }}>›</span>
            <span className="text-xs truncate max-w-[240px]" style={{ color: 'var(--muted)' }}>
              {current.name}
            </span>
            <span
              className="mono text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface-2)', color: 'var(--muted-2)' }}
            >
              {current.fps}fps · {current.aspectRatio}
            </span>
          </>
        )}
      </div>

      {/* Right: back button */}
      <button
        type="button"
        className="no-drag btn-ghost rounded-lg px-3 py-1 text-[11px]"
        onClick={() => closeProject()}
      >
        ← ホーム
      </button>
    </div>
  )
}
