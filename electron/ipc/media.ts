import { ipcMain } from 'electron'
import path from 'node:path'
import { access, constants, mkdir } from 'node:fs/promises'

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function registerMediaIpc(thumbnailsDir: string) {
  ipcMain.handle('media:getInfo', async (_, filePath: string) => {
    const { getMediaInfo } = await import('../ffmpeg')
    return getMediaInfo(filePath)
  })

  ipcMain.handle('media:getThumbnail', async (_, filePath: string, timeSeconds = 0) => {
    const { generateThumbnail } = await import('../ffmpeg')
    const key = Buffer.from(`${filePath}:${timeSeconds}`).toString('base64url')
    const thumbPath = path.join(thumbnailsDir, `${key}.jpg`)
    if (!(await pathExists(thumbPath))) {
      await ensureDir(thumbnailsDir)
      await generateThumbnail(filePath, thumbPath, timeSeconds)
    }
    return thumbPath
  })

  ipcMain.handle('media:getWaveform', async (_, filePath: string) => {
    const { generateWaveform } = await import('../ffmpeg')
    return generateWaveform(filePath)
  })
}
