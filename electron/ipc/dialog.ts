import { ipcMain, dialog, shell, type BrowserWindow } from 'electron'
import path from 'node:path'
import { app } from 'electron'

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
    return filePaths
  })

  ipcMain.handle('dialog:openLut', async () => {
    const win = getWindow()
    if (!win) return undefined
    const { filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'LUT (cube)', extensions: ['cube'] }],
    })
    return filePaths?.[0]
  })

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
}
