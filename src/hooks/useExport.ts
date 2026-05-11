import { useCallback, useState } from 'react'
import type { ExportFormat, ExportSettings, ExportPreset, HwVideoEncoder } from '../lib/types'
import { resolveExportPresetSettings, sanitizeExportPresetId } from '../lib/exportPresets'
import { cloneProject } from '../lib/projectSanitize'
import { useProjectStore } from '../store/projectStore'

export type RunExportOptions = {
  /** `format === 'custom'` のときのみマージされる手動パラメータ */
  customPreset?: Partial<ExportPreset>
  includeAudio?: boolean
  crossfadeAdjacent?: boolean
  crossfadeDurationSec?: number
  loudnessNormalize?: boolean
  audioPostMix?: 'none' | 'loudnorm' | 'dynaudnorm'
  videoEncoder?: HwVideoEncoder
}

export type SaveExportDiagnosticsResult =
  | { ok: true; path: string }
  | { ok: false; reason: string; detail?: string }

export function useExport() {
  const current = useProjectStore((s) => s.current)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveExportDiagnosticsLog = useCallback(async (userFacingError?: string | null): Promise<SaveExportDiagnosticsResult> => {
    const api = window.electronAPI
    if (!api?.saveExportDiagnosticsLog) {
      console.error('[vela-export-ui] saveExportDiagnosticsLog is not available')
      return { ok: false, reason: 'no_api' }
    }
    return api.saveExportDiagnosticsLog({ userFacingError: userFacingError ?? undefined })
  }, [])

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
      const id = sanitizeExportPresetId(format)
      const preset = resolveExportPresetSettings(id, id === 'custom' ? opts.customPreset : null)
      const settings: ExportSettings = {
        outputPath: out,
        format: id,
        preset,
        includeAudio: opts.includeAudio ?? true,
        crossfadeAdjacent: opts.crossfadeAdjacent,
        crossfadeDurationSec: opts.crossfadeDurationSec,
        loudnessNormalize: opts.loudnessNormalize,
        audioPostMix:
          opts.audioPostMix ?? (opts.loudnessNormalize === true ? 'loudnorm' : undefined),
        videoEncoder: opts.videoEncoder,
      }
      api.offExportProgress()
      api.onExportProgress(setProgress)
      try {
        await api.startExport(cloneProject(current), settings)
        setProgress(100)
      } catch (e) {
        console.error('[vela-export-ui] export failed:', e)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        api.offExportProgress()
        setBusy(false)
      }
    },
    [current],
  )

  return { runExport, saveExportDiagnosticsLog, progress, busy, error }
}
