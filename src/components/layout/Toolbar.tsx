import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

type Props = {
  onExport: () => void
}

type ToolItem = {
  id: 'properties' | 'text' | 'effects' | 'audio' | 'ai'
  icon: string
  label: string
}

const TOOLS: ToolItem[] = [
  { id: 'text', icon: 'T', label: 'テロップ' },
  { id: 'effects', icon: '✦', label: 'ルック' },
  { id: 'audio', icon: '♪', label: '音声' },
  { id: 'ai', icon: '◈', label: 'AI字幕' },
]

export default function Toolbar({ onExport }: Props) {
  const saveProject = useProjectStore((s) => s.saveProject)
  const setActivePanel = useEditorStore((s) => s.setActivePanel)
  const activePanel = useEditorStore((s) => s.activePanel)

  return (
    <div
      className="no-drag flex h-10 shrink-0 items-center gap-1 px-3"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Save */}
      <button
        type="button"
        className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium"
        onClick={() => void saveProject()}
      >
        <span style={{ fontSize: 11 }}>↓</span>
        保存
      </button>

      {/* Separator */}
      <div className="mx-1 h-4 w-px" style={{ background: 'var(--border)' }} />

      {/* Tool buttons */}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium"
          style={{
            background: activePanel === t.id ? 'var(--accent-dim)' : 'transparent',
            color: activePanel === t.id ? 'var(--accent)' : 'var(--muted)',
            border: `1px solid ${activePanel === t.id ? 'rgba(0,200,240,0.25)' : 'transparent'}`,
          }}
          onMouseEnter={(e) => {
            if (activePanel !== t.id) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = 'var(--fg)'
            }
          }}
          onMouseLeave={(e) => {
            if (activePanel !== t.id) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--muted)'
            }
          }}
          onClick={() => setActivePanel(t.id)}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}

      <div className="flex-1" />

      {/* Export */}
      <button
        type="button"
        className="btn-accent flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[11px]"
        onClick={onExport}
      >
        <span>↑</span>
        書き出し
      </button>
    </div>
  )
}
