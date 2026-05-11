/// <reference types="vite/client" />

import type { ElectronAPI } from './electron'

interface ImportMetaEnv {
  /** `VELA_WAVEFORM_DEBUG=1` で波形読み込み経路ログ（`electron.vite.config` で埋め込み） */
  readonly VELA_WAVEFORM_DEBUG?: string
}

declare global {
  interface Window {
    /** preload で注入。ブラウザ単体では undefined */
    electronAPI?: ElectronAPI
  }
}

export {}
