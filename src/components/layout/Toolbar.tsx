import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

type Props = {
  onExport: () => void
}

export default function Toolbar({ onExport }: Props) {
  const saveProject = useProjectStore((s) => s.saveProject)
  const setActivePanel = useEditorStore((s) => s.setActivePanel)

  return (
    <div
      className="no-drag flex h-10 shrink-0 items-center gap-2 border-b px-3"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <button
        type="button"
        className="rounded px-2 py-1 text-xs"
        style={{ background: 'var(--surface-2)' }}
        onClick={() => void saveProject()}
      >
        保存
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs"
        style={{ background: 'var(--surface-2)' }}
        onClick={() => setActivePanel('text')}
      >
        テロップ
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs"
        style={{ background: 'var(--surface-2)' }}
        onClick={() => setActivePanel('ai')}
      >
        AI 字幕
      </button>
      <div className="flex-1" />
      <button
        type="button"
        className="rounded px-3 py-1 text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#0a0c10' }}
        onClick={onExport}
      >
        書き出し
      </button>
    </div>
  )
}
