import { useState } from 'react'
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
  { id: 'properties', label: 'Props' },
  { id: 'text', label: 'Text' },
  { id: 'effects', label: 'Look' },
  { id: 'audio', label: 'Audio' },
  { id: 'ai', label: 'AI' },
] as const

export default function Editor() {
  usePlayback()
  useKeyboardShortcuts()
  const activePanel = useEditorStore((s) => s.activePanel)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
      <TitleBar />
      <Toolbar onExport={() => setExportOpen(true)} />

      {/* Main body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Media panel */}
        <div
          className="no-drag shrink-0 w-52 flex flex-col"
          style={{ borderRight: '1px solid var(--border)', background: 'var(--sidebar)' }}
        >
          <MediaPanel />
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Preview area */}
          <div
            className="flex shrink-0 items-center gap-0"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex-1 flex items-center justify-center p-3">
              <Preview />
            </div>
            <div
              className="w-px self-stretch"
              style={{ background: 'var(--border)' }}
            />
            <Transport />
          </div>

          {/* Timeline */}
          <Timeline />
        </div>

        {/* Right: Properties panel */}
        <aside
          className="no-drag w-72 shrink-0 flex flex-col"
          style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {/* Tabs */}
          <div
            className="flex shrink-0"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}
          >
            {PANEL_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="relative flex-1 py-2.5 text-[11px] font-medium"
                style={{
                  color: activePanel === id ? 'var(--accent)' : 'var(--muted)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (activePanel !== id) e.currentTarget.style.color = 'var(--fg)'
                }}
                onMouseLeave={(e) => {
                  if (activePanel !== id) e.currentTarget.style.color = 'var(--muted)'
                }}
                onClick={() => useEditorStore.getState().setActivePanel(id)}
              >
                {label}
                {activePanel === id && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      width: 18,
                      height: 2,
                      background: 'var(--accent)',
                      boxShadow: '0 0 6px var(--accent)',
                    }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {activePanel === 'properties' && <PropertiesPanel />}
            {activePanel === 'text' && <TextPanel />}
            {activePanel === 'effects' && <EffectsPanel />}
            {activePanel === 'audio' && <AudioPanel />}
            {activePanel === 'ai' && <AutoCaptionPanel />}
          </div>
        </aside>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
