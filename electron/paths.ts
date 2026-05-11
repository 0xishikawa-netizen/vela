import path from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

const require = createRequire(import.meta.url)

/** Electron 外（Phase A fixture の Node スクリプト等）では null。パッケージ済みアプリのみ unpacked パスを使う。 */
function electronApp(): import('electron').App | null {
  if (!process.versions.electron) return null
  try {
    const electron = require('electron') as typeof import('electron')
    return electron.app ?? null
  } catch {
    return null
  }
}

function unpackedNodeModules(...segments: string[]): string {
  const app = electronApp()
  const base =
    app?.isPackaged === true
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
      : path.join(process.cwd(), 'node_modules')
  return path.join(base, ...segments)
}

/** 既定は `ffmpeg-static`。`FFMPEG_BIN` があれば最優先（Phase A の切り分けやシステム ffmpeg との比較）。 */
export function resolveFfmpegBinary(): string {
  const fromEnv = process.env.FFMPEG_BIN?.trim()
  if (fromEnv) return fromEnv
  const app = electronApp()
  if (app?.isPackaged) {
    const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const p = path.join(unpackedNodeModules('ffmpeg-static'), name)
    if (existsSync(p)) return p
  }
  return ffmpegPath as string
}

export function resolveFfprobeBinary(): string {
  const app = electronApp()
  if (app?.isPackaged) {
    const rel =
      process.platform === 'win32'
        ? ['ffprobe-static', 'bin', 'win32', process.arch === 'ia32' ? 'ia32' : 'x64', 'ffprobe.exe']
        : process.platform === 'darwin'
          ? ['ffprobe-static', 'bin', 'darwin', process.arch === 'arm64' ? 'arm64' : 'x64', 'ffprobe']
          : ['ffprobe-static', 'bin', 'linux', process.arch === 'arm64' ? 'arm64' : 'ia32', 'ffprobe']
    const p = unpackedNodeModules(...rel)
    if (existsSync(p)) return p
  }
  return (ffprobeStatic as { path: string }).path
}
