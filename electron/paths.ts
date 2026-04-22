import { app } from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

function unpackedNodeModules(...segments: string[]): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(process.cwd(), 'node_modules')
  return path.join(base, ...segments)
}

export function resolveFfmpegBinary(): string {
  if (app.isPackaged) {
    const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const p = path.join(unpackedNodeModules('ffmpeg-static'), name)
    if (existsSync(p)) return p
  }
  return ffmpegPath as string
}

export function resolveFfprobeBinary(): string {
  if (app.isPackaged) {
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
