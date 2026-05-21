import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readdir } from 'node:fs/promises'
import { isMediaPathAllowlisted } from '../mediaPathAllowlist'

function sendProgress(event: IpcMainInvokeEvent, channel: string, pct: number): void {
  if (event.sender.isDestroyed()) return
  try {
    event.sender.send(channel, pct)
  } catch {
    /* Renderer may have closed while the background process is still emitting progress. */
  }
}

export function registerAiIpc(modelsDir: string) {
  ipcMain.handle('ai:transcribe', async (event, videoPath: string, modelId: string, language: string) => {
    if (!isMediaPathAllowlisted(videoPath)) {
      throw new Error('メディアパスが許可リストにありません。メディアパネルからファイルを追加してください。')
    }
    const { transcribe } = await import('../whisper')
    return transcribe(videoPath, modelId, language, modelsDir, (pct) => sendProgress(event, 'ai:transcribeProgress', pct))
  })

  ipcMain.handle('ai:downloadModel', async (event, modelId: string) => {
    const { downloadModel } = await import('../whisper')
    return downloadModel(modelId, modelsDir, (pct) => sendProgress(event, 'ai:downloadProgress', pct))
  })

  ipcMain.handle('ai:listModels', async () => {
    const files = await readdir(modelsDir).catch(() => [])
    return files.filter((f) => f.endsWith('.bin'))
  })
}
