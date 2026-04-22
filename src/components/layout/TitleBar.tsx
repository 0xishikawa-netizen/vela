import { useProjectStore } from '../../store/projectStore'

export default function TitleBar() {
  const current = useProjectStore((s) => s.current)
  const closeProject = useProjectStore((s) => s.closeProject)

  return (
    <div
      className="drag-region flex h-10 shrink-0 items-center justify-between border-b px-3"
      style={{ borderColor: 'var(--border)', background: 'var(--sidebar)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          Vela
        </span>
        {current && (
          <span className="truncate text-xs" style={{ color: 'var(--fg)' }}>
            {current.name}
          </span>
        )}
      </div>
      <button
        type="button"
        className="no-drag rounded px-2 py-1 text-[11px]"
        style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
        onClick={() => closeProject()}
      >
        ホームへ
      </button>
    </div>
  )
}
