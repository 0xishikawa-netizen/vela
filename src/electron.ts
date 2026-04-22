import type { Caption, MediaFile, Project } from './lib/types'

export interface ElectronAPI {
  openMediaDialog: () => Promise<string[] | undefined>
  saveExportDialog: (name: string) => Promise<string | undefined>
  showItemInFolder: (filePath: string) => Promise<void>

  listProjects: () => Promise<Project[]>
  saveProject: (id: string, data: object) => Promise<void>
  loadProject: (id: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>

  getMediaInfo: (filePath: string) => Promise<MediaFile>
  getThumbnail: (filePath: string, t?: number) => Promise<string>
  getWaveform: (filePath: string) => Promise<number[]>

  startExport: (project: object, settings: object) => Promise<void>
  onExportProgress: (cb: (pct: number) => void) => void
  offExportProgress: () => void

  transcribe: (path: string, model: string, lang: string) => Promise<Caption[]>
  onTranscribeProgress: (cb: (pct: number) => void) => void
  offTranscribeProgress: () => void
  downloadWhisperModel: (modelId: string) => Promise<string>
  onDownloadProgress: (cb: (pct: number) => void) => void
  offDownloadProgress: () => void
  listWhisperModels: () => Promise<string[]>
}
