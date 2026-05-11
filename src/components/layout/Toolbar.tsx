import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

export default function Toolbar() {
  const current = useProjectStore((s) => s.current)
  const saveProject = useProjectStore((s) => s.saveProject)
  const splitAtCurrentTime = useProjectStore((s) => s.splitAtCurrentTime)
  const removeClip = useProjectStore((s) => s.removeClip)
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  const canSplit = Boolean(current)
  const canDelete = Boolean(current && selectedTrackId && selectedClipId)

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

      <div className="h-5 w-px shrink-0 opacity-30" style={{ background: 'var(--border)' }} />

      <button
        type="button"
        disabled={!canSplit}
        title={`再生ヘッドの位置でクリップを分割（B または K）。${mod}＋クリックでクリップ上からも可`}
        className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap disabled:opacity-35"
        onClick={() => splitAtCurrentTime()}
      >
        分割
      </button>
      <button
        type="button"
        disabled={!canDelete}
        title="選択中のクリップを削除（Delete）"
        className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap disabled:opacity-35"
        onClick={() => {
          if (selectedTrackId && selectedClipId) removeClip(selectedTrackId, selectedClipId)
        }}
      >
        削除
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
