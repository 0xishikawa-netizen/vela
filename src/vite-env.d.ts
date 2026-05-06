/// <reference types="vite/client" />

import type { ElectronAPI } from './electron'

declare global {
  interface Window {
    /** preload で注入。ブラウザ単体では undefined */
    electronAPI?: ElectronAPI
  }
}

export {}
