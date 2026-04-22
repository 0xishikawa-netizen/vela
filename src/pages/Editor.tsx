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

export default function Editor() {
  usePlayback()
  useKeyboardShortcuts()
  const activePanel = useEditorStore((s) => s.activePanel)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
      <TitleBar />
      <Toolbar onExport={() => setExportOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <div className="no-drag w-56 shrink-0">
          <MediaPanel />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start gap-3 border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <Preview />
            <Transport />
          </div>
          <Timeline />
        </div>
        <aside
          className="no-drag w-72 shrink-0 overflow-y-auto border-l"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex border-b text-[11px]" style={{ borderColor: 'var(--border)' }}>
            {(
              [
                ['properties', 'プロパティ'],
                ['text', 'テロップ'],
                ['effects', 'ルック'],
                ['audio', '音声'],
                ['ai', 'AI'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="flex-1 py-2"
                style={{
                  background: activePanel === id ? 'var(--surface-2)' : 'transparent',
                  color: activePanel === id ? 'var(--fg)' : 'var(--muted)',
                }}
                onClick={() => useEditorStore.getState().setActivePanel(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {activePanel === 'properties' && <PropertiesPanel />}
          {activePanel === 'text' && <TextPanel />}
          {activePanel === 'effects' && <EffectsPanel />}
          {activePanel === 'audio' && <AudioPanel />}
          {activePanel === 'ai' && <AutoCaptionPanel />}
        </aside>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
