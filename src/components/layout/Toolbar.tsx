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
        title={`書き出し（${mod}E）`}
        className="btn-export-toolbar no-drag flex shrink-0 items-center gap-2 px-3.5 py-1.5 text-[12px] whitespace-nowrap"
        onClick={() => setExportModalOpen(true)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 opacity-95"
          aria-hidden
        >
          <path d="M12 15V4" />
          <path d="m8 8 4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        書き出し
      </button>
    </div>
  )
}
