import { ipcMain } from 'electron'

export function registerExportIpc() {
  ipcMain.handle('export:start', async (event, project: object, settings: object) => {
    const { exportVideo } = await import('../ffmpeg')
    return exportVideo(project as import('../../src/lib/types').Project, settings as import('../../src/lib/types').ExportSettings, (pct) =>
      event.sender.send('export:progress', pct),
    )
  })
}
