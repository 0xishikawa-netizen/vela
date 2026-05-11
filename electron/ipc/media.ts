import { ipcMain } from 'electron'
import path from 'node:path'
import { access, constants, mkdir, readFile, stat } from 'node:fs/promises'

/** `src/lib/waveform.ts` の `WAVEFORM_MAX_DECODE_BYTES` と揃える（main から renderer 向けに二重定義） */
const WAVEFORM_MAX_DECODE_BYTES = 24 * 1024 * 1024

/** LUT preview 用 `.cube`（UTF-8 テキスト）の上限。異常・攻撃用巨大ファイルを拒否 */
const LUT_CUBE_MAX_BYTES = 32 * 1024 * 1024

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

  ipcMain.handle(
    'media:readAudioFileForWaveform',
    async (_, filePath: string): Promise<
      | { ok: true; data: Buffer; mtimeMs: number; fileSize: number }
      | { ok: false; reason: 'too_large' | 'error'; mtimeMs?: number; fileSize?: number }
    > => {
      try {
        const st = await stat(filePath)
        if (st.size > WAVEFORM_MAX_DECODE_BYTES)
          return { ok: false, reason: 'too_large', mtimeMs: st.mtimeMs, fileSize: st.size }
        const data = await readFile(filePath)
        return { ok: true, data, mtimeMs: st.mtimeMs, fileSize: st.size }
      } catch {
        return { ok: false, reason: 'error' }
      }
    },
  )

  ipcMain.handle(
    'media:readCubeLutFile',
    async (
      _,
      lutPath: string,
    ): Promise<
      | { ok: true; text: string; mtimeMs: number; sizeBytes: number }
      | {
          ok: false
          reason: 'not_found' | 'not_cube_extension' | 'too_large' | 'read_error'
        }
    > => {
      const raw = typeof lutPath === 'string' ? lutPath.trim() : ''
      if (!raw) {
        return { ok: false, reason: 'not_found' }
      }
      const ext = path.extname(raw).toLowerCase()
      if (ext !== '.cube') {
        return { ok: false, reason: 'not_cube_extension' }
      }
      try {
        const st = await stat(raw)
        if (st.size > LUT_CUBE_MAX_BYTES) {
          return { ok: false, reason: 'too_large' }
        }
        const text = await readFile(raw, 'utf8')
        return { ok: true, text, mtimeMs: st.mtimeMs, sizeBytes: st.size }
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException
        if (err?.code === 'ENOENT') {
          return { ok: false, reason: 'not_found' }
        }
        return { ok: false, reason: 'read_error' }
      }
    },
  )
}
