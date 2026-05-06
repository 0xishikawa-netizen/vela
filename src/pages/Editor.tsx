import React, { useCallback } from 'react'
import TitleBar from '../components/layout/TitleBar'
import Toolbar from '../components/layout/Toolbar'
import Preview from '../components/editor/Preview'
import Transport from '../components/editor/Transport'
import MediaPanel from '../components/editor/MediaPanel'
import Timeline from '../components/editor/Timeline'
import PropertiesPanel from '../components/editor/PropertiesPanel'
import TextPanel from '../components/editor/TextPanel'
import EffectsPanel from '../components/editor/EffectsPanel'
import AudioPanel from '../components/editor/AudioPanel'
import ExportModal from '../components/editor/ExportModal'
import AutoCaptionPanel from '../components/ai/AutoCaptionPanel'
import { useEditorStore } from '../store/editorStore'
import { usePlayback } from '../hooks/usePlayback'
import { useKeyboardShortcuts } from '../hooks/useKeyboard'

const PANEL_TABS = [
  { id: 'properties' as const, icon: '⊟', label: 'クリップ' },
  { id: 'text' as const, icon: 'T', label: 'テロップ' },
  { id: 'effects' as const, icon: '✦', label: 'ルック' },
  { id: 'audio' as const, icon: '♪', label: '音声' },
  { id: 'ai' as const, icon: '◈', label: 'AI字幕' },
]

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="shrink-0 w-px cursor-col-resize group relative"
      style={{ background: 'var(--border)' }}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[var(--accent)] opacity-0 group-hover:opacity-20 transition-opacity" />
    </div>
  )
}

export default function Editor() {
  usePlayback()
  useKeyboardShortcuts()
  const activePanel = useEditorStore((s) => s.activePanel)
  const exportOpen = useEditorStore((s) => s.exportModalOpen)
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(300)

  const startResizeLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    const onMove = (ev: MouseEvent) => setLeftWidth(Math.max(160, Math.min(400, startW + ev.clientX - startX)))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [leftWidth])

  const startResizeRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightWidth
    const onMove = (ev: MouseEvent) => setRightWidth(Math.max(220, Math.min(480, startW - ev.clientX + startX)))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightWidth])

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TitleBar />

      {/* Main body */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Left: Media panel */}
        <div
          className="no-drag flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
          style={{ width: leftWidth, borderRight: '1px solid var(--border)', background: 'var(--sidebar)' }}
        >
          <MediaPanel />
        </div>

        <ResizeHandle onMouseDown={startResizeLeft} />

        {/* Center: Toolbar + Preview + Timeline（ツールバーを右パネル幅にかからないようこの列だけに置く） */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Toolbar />
          <div
            className="flex min-h-0 min-w-0 shrink-0 items-center gap-0 overflow-hidden"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-3">
              <Preview />
            </div>
            <div className="w-px shrink-0 self-stretch" style={{ background: 'var(--border)' }} />
            <Transport />
          </div>
          <Timeline />
        </div>

        <ResizeHandle onMouseDown={startResizeRight} />

        {/* Right: Properties panel with vertical icon tabs */}
        <aside
          className="no-drag flex min-h-0 min-w-0 shrink-0 overflow-hidden"
          style={{ width: rightWidth, borderLeft: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {/* Panel content */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {activePanel === 'properties' && <PropertiesPanel />}
            {activePanel === 'text' && <TextPanel />}
            {activePanel === 'effects' && <EffectsPanel />}
            {activePanel === 'audio' && <AudioPanel />}
            {activePanel === 'ai' && <AutoCaptionPanel />}
          </div>

          {/* Vertical icon tab rail */}
          <div
            className="shrink-0 flex flex-col items-center gap-1 py-3"
            style={{ width: 40, borderLeft: '1px solid var(--border)', background: 'var(--sidebar)' }}
          >
            {PANEL_TABS.map(({ id, icon, label }) => (
              <button
                key={id}
                type="button"
                title={label}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{
                  background: activePanel === id ? 'var(--accent-dim)' : 'transparent',
                  color: activePanel === id ? 'var(--accent)' : 'var(--label)',
                  border: `1px solid ${activePanel === id ? 'rgba(132,181,169,0.28)' : 'transparent'}`,
                  fontFamily: id === 'text' ? 'serif' : 'inherit',
                  fontWeight: id === 'text' ? 700 : 400,
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={(e) => { if (activePanel !== id) e.currentTarget.style.color = 'var(--fg)' }}
                onMouseLeave={(e) => { if (activePanel !== id) e.currentTarget.style.color = 'var(--label)' }}
                onClick={() => useEditorStore.getState().setActivePanel(id)}
              >
                {icon}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportModalOpen(false)} />
    </div>
  )
}
