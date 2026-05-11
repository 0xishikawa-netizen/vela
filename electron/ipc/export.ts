import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

import { buildExportDiagnosticsSaveDocument } from '../../src/lib/exportDiagnostics'

function isExportDebugEnv(): boolean {
  return process.env.VELA_PHASE_A_DEBUG === '1' || process.env.VELA_EXPORT_DEBUG === '1'
}

export function registerExportIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('app:getRuntimePlatform', (): 'darwin' | 'win32' | 'linux' => {
    const p = process.platform
    if (p === 'darwin') return 'darwin'
    if (p === 'win32') return 'win32'
    return 'linux'
  })

  ipcMain.handle('export:start', async (event, project: object, settings: object) => {
    const { exportVideo } = await import('../ffmpeg')
    return exportVideo(project as import('../../src/lib/types').Project, settings as import('../../src/lib/types').ExportSettings, (pct) =>
      event.sender.send('export:progress', pct),
    )
  })

  ipcMain.handle('export:getLastDiagnostics', async () => {
    const { getLastExportDiagnosticsRun } = await import('../ffmpeg')
    return getLastExportDiagnosticsRun()
  })

  ipcMain.handle(
    'export:saveLastDiagnostics',
    async (
      _event,
      payload: { userFacingError?: string } | undefined,
    ): Promise<
      | { ok: true; path: string }
      | { ok: false; reason: 'no_window' | 'nothing_to_save' | 'cancelled' | 'write_failed'; detail?: string }
    > => {
      const win = getWindow()
      if (!win) return { ok: false, reason: 'no_window' }
      const { getLastExportDiagnosticsRun } = await import('../ffmpeg')
      const run = getLastExportDiagnosticsRun()
      if (!run) return { ok: false, reason: 'nothing_to_save' }
      const defaultName = `vela-export-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
      const { filePath } = await dialog.showSaveDialog(win, {
        title: '診断ログを保存',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [
          { name: 'テキスト', extensions: ['txt', 'log'] },
          { name: 'すべて', extensions: ['*'] },
        ],
      })
      if (!filePath) return { ok: false, reason: 'cancelled' }
      try {
        const body = buildExportDiagnosticsSaveDocument({
          generatedAtIso: new Date().toISOString(),
          appName: app.getName(),
          appVersion: app.getVersion(),
          platform: process.platform,
          debugEnvEnabled: isExportDebugEnv(),
          userFacingMessage: payload?.userFacingError,
          settingsSummary: run.meta,
          attempts: run.attempts,
        })
        await writeFile(filePath, body, 'utf8')
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
}
