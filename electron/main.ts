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
  const base = path.join(__dirname, '../preload')
  for (const name of candidates) {
    const full = path.join(base, name)
    if (existsSync(full)) return full
  }
  return path.join(base, 'preload.mjs')
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#080a0e',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  Menu.setApplicationMenu(null)

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
