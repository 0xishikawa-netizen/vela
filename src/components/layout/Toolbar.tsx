import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

export default function Toolbar() {
  const saveProject = useProjectStore((s) => s.saveProject)
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen)
  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  return (
    <div
      className="no-drag flex h-9 min-w-0 shrink-0 items-center gap-2 overflow-hidden px-3"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      <button
        type="button"
        title={`${mod}S`}
        className="btn-ghost flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
        onClick={() => void saveProject()}
      >
        <span style={{ fontSize: 11, lineHeight: 1 }}>↓</span>
        保存
      </button>

      <div className="min-w-0 flex-1" />

      <button
        type="button"
        title={`${mod}E`}
        className="btn-accent flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold whitespace-nowrap"
        onClick={() => setExportModalOpen(true)}
      >
        <span style={{ fontSize: 11, lineHeight: 1 }}>↑</span>
        書き出し
      </button>
    </div>
  )
}
