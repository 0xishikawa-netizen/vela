import { useProjectStore } from '../../store/projectStore'

export default function TitleBar() {
  const current = useProjectStore((s) => s.current)
  const closeProject = useProjectStore((s) => s.closeProject)

  return (
    <div
      className="drag-region flex h-11 min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden"
      style={{
        background: 'rgba(26,27,32,0.94)',
        borderBottom: '1px solid var(--border)',
        paddingLeft: 'max(env(titlebar-area-x, 0px), 76px)',
        paddingRight: 16,
      }}
    >
      {/* Left: Logo + project info */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <span
          className="shrink-0 text-[11px] font-bold tracking-[0.2em]"
          style={{ background: 'linear-gradient(90deg, #84b5a9, #b4abc9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          VELA
        </span>

        {current && (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="shrink-0" style={{ color: 'var(--muted-2)', fontSize: 10 }}>
              ›
            </span>
            <span className="min-w-0 truncate text-xs" style={{ color: 'var(--fg)' }} title={current.name}>
              {current.name}
            </span>
            <span
              className="mono hidden shrink-0 text-[9px] px-1.5 py-0.5 rounded sm:inline"
              style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
            >
              {current.aspectRatio} · {current.fps}fps
            </span>
          </div>
        )}
      </div>

      {/* Right */}
      <button
        type="button"
        className="no-drag btn-ghost shrink-0 rounded-lg px-2.5 py-1 text-[11px] whitespace-nowrap"
        onClick={() => closeProject()}
      >
        ← ホーム
      </button>
    </div>
  )
}
