import { useCallback, useState } from 'react'
import type { ExportFormat, ExportSettings } from '../lib/types'
import { EXPORT_PRESETS } from '../lib/types'
import { useProjectStore } from '../store/projectStore'

export function useExport() {
  const current = useProjectStore((s) => s.current)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runExport = useCallback(
    async (format: ExportFormat, customPreset?: Partial<(typeof EXPORT_PRESETS)['custom']>) => {
      if (!current) return
      setError(null)
      setBusy(true)
      setProgress(0)
      const defaultPath = `${current.name.replace(/[/\\?%*:|"<>]/g, '-')}.mp4`
      const out = await window.electronAPI.saveExportDialog(defaultPath)
      if (!out) {
        setBusy(false)
        return
      }
      const preset = { ...EXPORT_PRESETS[format], ...customPreset }
      const settings: ExportSettings = {
        outputPath: out,
        format,
        preset,
        includeAudio: true,
      }
      window.electronAPI.offExportProgress()
      window.electronAPI.onExportProgress(setProgress)
      try {
        await window.electronAPI.startExport(current, settings)
        setProgress(100)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        window.electronAPI.offExportProgress()
        setBusy(false)
      }
    },
    [current],
  )

  return { runExport, progress, busy, error }
}
