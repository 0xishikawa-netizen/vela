import { secondsToDisplay } from '../../lib/timeUtils'
import { useEditorStore } from '../../store/editorStore'
import { useProjectStore } from '../../store/projectStore'

export default function Transport() {
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const duration = useProjectStore((s) => s.current?.duration ?? 0)

  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <button
        type="button"
        className="rounded px-3 py-1 text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#0a0c10' }}
        onClick={() => setPlaying(!isPlaying)}
      >
        {isPlaying ? '停止' : '再生'}
      </button>
      <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
        {secondsToDisplay(currentTime)} / {secondsToDisplay(duration)}
      </span>
    </div>
  )
}
