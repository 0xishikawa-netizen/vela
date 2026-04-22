import { secondsToDisplay } from '../../lib/timeUtils'
import { useEditorStore } from '../../store/editorStore'
import { useProjectStore } from '../../store/projectStore'

export default function Transport() {
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const duration = useProjectStore((s) => s.current?.duration ?? 0)
  const fps = useProjectStore((s) => s.current?.fps ?? 30)

  const skipFrames = (frames: number) => {
    const delta = frames / fps
    setCurrentTime(Math.max(0, Math.min(duration, currentTime + delta)))
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-5 py-3 shrink-0"
      style={{ minWidth: 180 }}
    >
      {/* Time display */}
      <div className="text-center">
        <div
          className="mono text-lg font-semibold tracking-widest"
          style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}
        >
          {secondsToDisplay(currentTime)}
        </div>
        <div className="mono text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
          / {secondsToDisplay(duration)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Skip back */}
        <button
          type="button"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--fg)'
            e.currentTarget.style.background = 'var(--surface-3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.background = 'var(--surface-2)'
          }}
          onClick={() => skipFrames(-10)}
          title="10フレーム戻る"
        >
          ⏮
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold"
          style={{
            background: isPlaying ? 'var(--accent)' : 'var(--accent)',
            color: '#020406',
            boxShadow: isPlaying ? '0 0 16px rgba(0,200,240,0.4)' : '0 0 8px rgba(0,200,240,0.2)',
          }}
          onClick={() => setPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Skip forward */}
        <button
          type="button"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--fg)'
            e.currentTarget.style.background = 'var(--surface-3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.background = 'var(--surface-2)'
          }}
          onClick={() => skipFrames(10)}
          title="10フレーム進む"
        >
          ⏭
        </button>
      </div>
    </div>
  )
}
