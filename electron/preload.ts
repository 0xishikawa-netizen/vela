import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openMediaDialog: () => ipcRenderer.invoke('dialog:openMedia'),
  saveExportDialog: (name: string) => ipcRenderer.invoke('dialog:saveExport', name),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItem', filePath),

  listProjects: () => ipcRenderer.invoke('project:list'),
  saveProject: (id: string, data: object) => ipcRenderer.invoke('project:save', id, data),
  loadProject: (id: string) => ipcRenderer.invoke('project:load', id),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),

  getMediaInfo: (filePath: string) => ipcRenderer.invoke('media:getInfo', filePath),
  getThumbnail: (filePath: string, t?: number) => ipcRenderer.invoke('media:getThumbnail', filePath, t),
  getWaveform: (filePath: string) => ipcRenderer.invoke('media:getWaveform', filePath),

  startExport: (project: object, settings: object) => ipcRenderer.invoke('export:start', project, settings),
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
