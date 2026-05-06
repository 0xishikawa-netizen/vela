import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { registerDialogIpc } from './ipc/dialog'
import { registerProjectIpc } from './ipc/project'
import { registerMediaIpc } from './ipc/media'
import { registerExportIpc } from './ipc/export'
import { registerAiIpc } from './ipc/ai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const USER_DATA = app.getPath('userData')
const PROJECTS_DIR = path.join(USER_DATA, 'projects')
const THUMBNAILS_DIR = path.join(USER_DATA, 'thumbnails')
const MODELS_DIR = path.join(USER_DATA, 'models', 'whisper')

let mainWindow: BrowserWindow | null = null

function getWindow(): BrowserWindow | null {
  return mainWindow
}

function resolvePreloadPath(): string {
  const candidates = ['preload.mjs', 'preload.js', 'index.mjs', 'index.js']
  const bases: string[] = [path.join(__dirname, '../preload')]
  // dev で main の実体パスが想定とずれる場合のフォールバック（プロジェクト直下の out/preload）
  if (!app.isPackaged) {
    bases.push(path.join(process.cwd(), 'out', 'preload'))
  }
  for (const base of bases) {
    for (const name of candidates) {
      const full = path.join(base, name)
      if (existsSync(full)) return path.resolve(full)
    }
  }
  const fallback = path.resolve(path.join(bases[0]!, 'preload.mjs'))
  console.error('[vela] preload が見つかりません。探索したディレクトリ:', bases)
  return fallback
}

async function createWindow() {
  const preloadPath = resolvePreloadPath()
  if (!existsSync(preloadPath)) {
    console.error('[vela] preload ファイルが存在しません:', preloadPath)
  } else {
    console.log('[vela] preload:', preloadPath)
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#1a1b20',
    // sandbox: true だと ESM プリロード（.mjs の import）が使えず API が注入されない（Electron 公式: Sandboxed preload scripts can't use ESM imports）
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      sandbox: false,
    },
  })

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `${app.name}について`, role: 'about' },
        { type: 'separator' },
        { label: 'サービス', role: 'services' },
        { type: 'separator' },
        { label: `${app.name}を隠す`, role: 'hide' },
        { label: 'ほかを隠す', role: 'hideOthers' },
        { label: 'すべてを表示', role: 'unhide' },
        { type: 'separator' },
        { label: `${app.name}を終了`, role: 'quit' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }
}

app.whenReady().then(async () => {
  await mkdir(PROJECTS_DIR, { recursive: true })
  await mkdir(THUMBNAILS_DIR, { recursive: true })
  await mkdir(MODELS_DIR, { recursive: true })

  registerDialogIpc(getWindow)
  registerProjectIpc(PROJECTS_DIR)
  registerMediaIpc(THUMBNAILS_DIR)
  registerExportIpc()
  registerAiIpc(MODELS_DIR)

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
