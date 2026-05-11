import type { Caption, MediaFile, Project } from './lib/types'
import type { ExportDiagnosticsRunBuffer } from './lib/exportDiagnostics'

export interface ElectronAPI {
  /** 書き出し UI で HW エンコーダ選択肢の可否判定に使用 */
  getRuntimePlatform?: () => Promise<'darwin' | 'win32' | 'linux'>

  openMediaDialog: () => Promise<string[] | undefined>
  openLutDialog: () => Promise<string | undefined>
  readSubtitleFile?: () => Promise<
    | { ok: true; path: string; text: string }
    | { ok: false; reason: string }
  >
  saveSubtitleFile?: (payload: { defaultName: string; content: string }) => Promise<
    | { ok: true; path: string }
    | { ok: false; reason: string; detail?: string }
  >
  saveExportDialog: (name: string) => Promise<string | undefined>
  showItemInFolder: (filePath: string) => Promise<void>

  listProjects: () => Promise<Project[]>
  saveProject: (id: string, data: object) => Promise<void>
  loadProject: (id: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>

  getMediaInfo: (filePath: string) => Promise<MediaFile>
  getThumbnail: (filePath: string, t?: number) => Promise<string>
  getWaveform: (filePath: string) => Promise<number[]>
  readAudioFileForWaveform?: (
    filePath: string,
  ) => Promise<
    | { ok: true; data: Buffer; mtimeMs: number; fileSize: number }
    | { ok: false; reason: 'too_large' | 'error'; mtimeMs?: number; fileSize?: number }
  >

  /** Phase C-2: main で UTF-8 読み込み。renderer は fs 直接禁止 */
  readCubeLutFile?: (
    lutPath: string,
  ) => Promise<
    | { ok: true; text: string; mtimeMs: number; sizeBytes: number }
    | { ok: false; reason: 'not_found' | 'not_cube_extension' | 'too_large' | 'read_error' }
  >

  startExport: (project: object, settings: object) => Promise<void>
  /** 直近の書き出しで記録された診断（成功でクリア済みのことあり） */
  getLastExportDiagnostics?: () => Promise<ExportDiagnosticsRunBuffer | null>
  saveExportDiagnosticsLog?: (opts?: { userFacingError?: string }) => Promise<
    | { ok: true; path: string }
    | { ok: false; reason: string; detail?: string }
  >
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
