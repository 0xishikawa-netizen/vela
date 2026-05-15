import { ipcMain } from 'electron'
import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const FILE_NAME = 'whisper-local-settings.json'

export function registerWhisperLocalSettingsIpc(): void {
  const settingsPath = () => path.join(app.getPath('userData'), FILE_NAME)

  ipcMain.handle('whisperLocalSettings:load', async (): Promise<unknown> => {
    try {
      const text = await readFile(settingsPath(), 'utf8')
      return JSON.parse(text) as unknown
    } catch {
      return {}
    }
  })

  ipcMain.handle('whisperLocalSettings:save', async (_, data: unknown) => {
    const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    await writeFile(settingsPath(), `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  })
}
