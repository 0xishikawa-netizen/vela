import { app, BrowserWindow, Menu, dialog } from 'electron'
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
  try {
    bases.push(path.join(app.getAppPath(), 'out', 'preload'))
  } catch {
    /* ignore */
  }
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

  mainWindow.webContents.on('did-fail-load', (_ev, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    console.error('[vela] did-fail-load', { code, desc, url })
  })

  const rendererUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html')

  try {
    if (rendererUrl) {
      await mainWindow.loadURL(rendererUrl)
    } else {
      if (!existsSync(htmlPath)) {
        throw new Error(`レンダラが見つかりません: ${htmlPath}\n先に npm run build を実行してください。`)
      }
      await mainWindow.loadFile(htmlPath)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[vela] ウィンドウの読み込みに失敗:', msg)
    const safe = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vela</title></head>
<body style="margin:0;padding:24px;font:14px system-ui;background:#1a1b20;color:#ececf1;line-height:1.6">
<h1 style="color:#d98a8a;font-size:16px">画面を読み込めませんでした</h1>
<p>${safe}</p>
<p>プロジェクトのルートで <code style="background:#2a2c34;padding:2px 6px">npm run dev</code> を実行してください（Vite が起動してから Electron が接続します）。</p>
</body></html>`
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(body)}`)
    void dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Vela',
      message: 'レンダラの読み込みに失敗しました',
      detail: msg,
    })
  }
}

app.whenReady().then(async () => {
  await mkdir(PROJECTS_DIR, { recursive: true })
  await mkdir(THUMBNAILS_DIR, { recursive: true })
  await mkdir(MODELS_DIR, { recursive: true })

  registerDialogIpc(getWindow)
  registerProjectIpc(PROJECTS_DIR)
  registerMediaIpc(THUMBNAILS_DIR)
  registerExportIpc(getWindow)
  registerAiIpc(MODELS_DIR)

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
