import { useCallback, useState } from 'react'
import type { ExportFormat, ExportSettings, ExportPreset, HwVideoEncoder } from '../lib/types'
import { EXPORT_PRESETS } from '../lib/types'
import { useProjectStore } from '../store/projectStore'

export type RunExportOptions = {
  customPreset?: Partial<ExportPreset>
  includeAudio?: boolean
  crossfadeAdjacent?: boolean
  crossfadeDurationSec?: number
  loudnessNormalize?: boolean
  videoEncoder?: HwVideoEncoder
}

export function useExport() {
  const current = useProjectStore((s) => s.current)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runExport = useCallback(
    async (format: ExportFormat, opts: RunExportOptions = {}) => {
      if (!current) return
      const api = window.electronAPI
      if (!api?.startExport) {
        setError('Electron の API が使えません。')
        return
      }
      setError(null)
      setBusy(true)
      setProgress(0)
      const defaultPath = `${current.name.replace(/[/\\?%*:|"<>]/g, '-')}.mp4`
      const out = await api.saveExportDialog(defaultPath)
      if (!out) {
        setBusy(false)
        return
      }
      const preset = { ...EXPORT_PRESETS[format], ...opts.customPreset }
      const settings: ExportSettings = {
        outputPath: out,
        format,
        preset,
        includeAudio: opts.includeAudio ?? true,
        crossfadeAdjacent: opts.crossfadeAdjacent,
        crossfadeDurationSec: opts.crossfadeDurationSec,
        loudnessNormalize: opts.loudnessNormalize,
        videoEncoder: opts.videoEncoder,
      }
      api.offExportProgress()
      api.onExportProgress(setProgress)
      try {
        await api.startExport(current, settings)
        setProgress(100)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        api.offExportProgress()
        setBusy(false)
      }
    },
    [current],
  )

  return { runExport, progress, busy, error }
}
