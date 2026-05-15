import { contextBridge, ipcRenderer } from 'electron'

import type { WhisperLocalProgressIpcPayload } from '../src/lib/whisperLocalIpcMap'
import { assertWhisperLocalStartPayload } from '../src/lib/whisperLocalIpcMap'

contextBridge.exposeInMainWorld('electronAPI', {
  getRuntimePlatform: () =>
    ipcRenderer.invoke('app:getRuntimePlatform') as Promise<'darwin' | 'win32' | 'linux'>,

  openMediaDialog: () => ipcRenderer.invoke('dialog:openMedia'),
  openLutDialog: () => ipcRenderer.invoke('dialog:openLut'),
  readSubtitleFile: () => ipcRenderer.invoke('dialog:readSubtitleFile'),
  saveSubtitleFile: (payload: { defaultName: string; content: string }) =>
    ipcRenderer.invoke('dialog:saveSubtitleFile', payload),
  saveExportDialog: (name: string) => ipcRenderer.invoke('dialog:saveExport', name),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItem', filePath),
  pickWhisperBinary: () => ipcRenderer.invoke('dialog:pickWhisperBinary'),
  pickWhisperModel: () => ipcRenderer.invoke('dialog:pickWhisperModel'),
  loadWhisperLocalSettings: () => ipcRenderer.invoke('whisperLocalSettings:load'),
  saveWhisperLocalSettings: (data: object) => ipcRenderer.invoke('whisperLocalSettings:save', data),

  startWhisperLocalTranscription: (payload: unknown) => {
    try {
      return ipcRenderer.invoke('whisperLocal:start', assertWhisperLocalStartPayload(payload))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)))
    }
  },
  cancelWhisperLocalTranscription: (runId: string) => ipcRenderer.invoke('whisperLocal:cancel', runId),
  getWhisperLocalRunStatus: () => ipcRenderer.invoke('whisperLocal:getStatus'),
  onWhisperLocalProgress: (cb: (p: WhisperLocalProgressIpcPayload) => void) => {
    const wrapped = (_: unknown, p: WhisperLocalProgressIpcPayload) => {
      cb(p)
    }
    ipcRenderer.on('whisperLocal:progress', wrapped)
    return () => {
      ipcRenderer.removeListener('whisperLocal:progress', wrapped)
    }
  },

  listProjects: () => ipcRenderer.invoke('project:list'),
  saveProject: (id: string, data: object) => ipcRenderer.invoke('project:save', id, data),
  loadProject: (id: string) => ipcRenderer.invoke('project:load', id),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),

  getMediaInfo: (filePath: string) => ipcRenderer.invoke('media:getInfo', filePath),
  getThumbnail: (filePath: string, t?: number) => ipcRenderer.invoke('media:getThumbnail', filePath, t),
  getWaveform: (filePath: string) => ipcRenderer.invoke('media:getWaveform', filePath),
  readAudioFileForWaveform: (filePath: string) =>
    ipcRenderer.invoke(
      'media:readAudioFileForWaveform',
      filePath,
    ) as Promise<
      | { ok: true; data: Buffer; mtimeMs: number; fileSize: number }
      | { ok: false; reason: 'too_large' | 'error' | 'not_allowlisted'; mtimeMs?: number; fileSize?: number }
    >,

  readCubeLutFile: (lutPath: string) =>
    ipcRenderer.invoke('media:readCubeLutFile', lutPath) as Promise<
      | { ok: true; text: string; mtimeMs: number; sizeBytes: number }
      | {
          ok: false
          reason: 'not_found' | 'not_cube_extension' | 'too_large' | 'read_error' | 'not_allowlisted'
        }
    >,

  registerMediaAllowlistPaths: (paths: string[]) => ipcRenderer.invoke('media:allowlistPaths', paths),

  startExport: (project: object, settings: object) => ipcRenderer.invoke('export:start', project, settings),
  getLastExportDiagnostics: () => ipcRenderer.invoke('export:getLastDiagnostics'),
  saveExportDiagnosticsLog: (opts?: { userFacingError?: string }) =>
    ipcRenderer.invoke('export:saveLastDiagnostics', opts ?? {}) as Promise<
      | { ok: true; path: string }
      | { ok: false; reason: string; detail?: string }
    >,
  onExportProgress: (cb: (pct: number) => void) => {
    ipcRenderer.on('export:progress', (_, pct: number) => cb(pct))
  },
  offExportProgress: () => {
    ipcRenderer.removeAllListeners('export:progress')
  },

  transcribe: (filePath: string, model: string, lang: string) =>
    ipcRenderer.invoke('ai:transcribe', filePath, model, lang),
  onTranscribeProgress: (cb: (pct: number) => void) => {
    ipcRenderer.on('ai:transcribeProgress', (_, pct: number) => cb(pct))
  },
  offTranscribeProgress: () => {
    ipcRenderer.removeAllListeners('ai:transcribeProgress')
  },
  downloadWhisperModel: (modelId: string) => ipcRenderer.invoke('ai:downloadModel', modelId),
  onDownloadProgress: (cb: (pct: number) => void) => {
    ipcRenderer.on('ai:downloadProgress', (_, pct: number) => cb(pct))
  },
  offDownloadProgress: () => {
    ipcRenderer.removeAllListeners('ai:downloadProgress')
  },
  listWhisperModels: () => ipcRenderer.invoke('ai:listModels'),
})
