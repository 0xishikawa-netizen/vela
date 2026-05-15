import { ipcMain, dialog, shell, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { allowlistMediaPaths } from '../mediaPathAllowlist'

const SUBTITLE_FILE_MAX_BYTES = 2 * 1024 * 1024

export function registerDialogIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('dialog:openMedia', async () => {
    const win = getWindow()
    if (!win) return []
    const { filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '動画・画像・音声',
          extensions: [
            'mp4',
            'mov',
            'avi',
            'mkv',
            'webm',
            'm4v',
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'mp3',
            'aac',
            'wav',
            'm4a',
            'flac',
          ],
        },
      ],
    })
    allowlistMediaPaths(filePaths)
    return filePaths
  })

  ipcMain.handle('dialog:openLut', async () => {
    const win = getWindow()
    if (!win) return undefined
    const { filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'LUT (cube)', extensions: ['cube'] }],
    })
    const p = filePaths?.[0]
    if (p) allowlistMediaPaths([p])
    return p
  })

  ipcMain.handle(
    'dialog:readSubtitleFile',
    async (): Promise<
      | { ok: true; path: string; text: string }
      | { ok: false; reason: 'no_window' | 'cancelled' | 'too_large' | 'read_error' }
    > => {
      const win = getWindow()
      if (!win) return { ok: false, reason: 'no_window' }
      const { filePaths, canceled } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: '字幕 (SRT / WebVTT)', extensions: ['srt', 'vtt'] }],
      })
      if (canceled || !filePaths?.[0]) return { ok: false, reason: 'cancelled' }
      const p = filePaths[0]
      allowlistMediaPaths([p])
      try {
        const buf = await readFile(p)
        if (buf.length > SUBTITLE_FILE_MAX_BYTES) return { ok: false, reason: 'too_large' }
        return { ok: true, path: p, text: buf.toString('utf8') }
      } catch {
        return { ok: false, reason: 'read_error' }
      }
    },
  )

  ipcMain.handle(
    'dialog:saveSubtitleFile',
    async (
      _,
      payload: { defaultName: string; content: string },
    ): Promise<
      | { ok: true; path: string }
      | { ok: false; reason: 'no_window' | 'cancelled' | 'write_failed'; detail?: string }
    > => {
      const win = getWindow()
      if (!win) return { ok: false, reason: 'no_window' }
      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('documents'), payload.defaultName),
        filters: [
          { name: 'SubRip', extensions: ['srt'] },
          { name: 'WebVTT', extensions: ['vtt'] },
          { name: 'すべて', extensions: ['*'] },
        ],
      })
      if (canceled || !filePath) return { ok: false, reason: 'cancelled' }
      try {
        await writeFile(filePath, payload.content, 'utf8')
        return { ok: true, path: filePath }
      } catch (e) {
        return {
          ok: false,
          reason: 'write_failed',
          detail: e instanceof Error ? e.message : String(e),
        }
      }
    },
  )

  ipcMain.handle('dialog:saveExport', async (_, defaultName: string) => {
    const win = getWindow()
    if (!win) return undefined
    const { filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      filters: [{ name: '動画ファイル', extensions: ['mp4'] }],
    })
    return filePath
  })

  ipcMain.handle('shell:showItem', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(
    'dialog:pickWhisperBinary',
    async (): Promise<{ ok: true; path: string } | { ok: false; reason: 'no_window' | 'cancelled' }> => {
      const win = getWindow()
      if (!win) return { ok: false, reason: 'no_window' }
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: '実行ファイル', extensions: ['exe', 'out', 'bin'] },
          { name: 'すべて', extensions: ['*'] },
        ],
      })
      if (canceled || !filePaths?.[0]) return { ok: false, reason: 'cancelled' }
      allowlistMediaPaths([filePaths[0]])
      return { ok: true, path: filePaths[0] }
    },
  )

  ipcMain.handle(
    'dialog:pickWhisperModel',
    async (): Promise<{ ok: true; path: string } | { ok: false; reason: 'no_window' | 'cancelled' }> => {
      const win = getWindow()
      if (!win) return { ok: false, reason: 'no_window' }
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: 'モデル', extensions: ['gguf', 'bin', 'pt', 'ggml'] },
          { name: 'すべて', extensions: ['*'] },
        ],
      })
      if (canceled || !filePaths?.[0]) return { ok: false, reason: 'cancelled' }
      allowlistMediaPaths([filePaths[0]])
      return { ok: true, path: filePaths[0] }
    },
  )
}
