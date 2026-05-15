import { useEffect, useState, type CSSProperties } from 'react'
import { useProjectStore } from './store/projectStore'
import Home from './pages/Home'
import Editor from './pages/Editor'

const ELECTRON_HELP =
  'この画面は Electron 内でのみ動作します。プロジェクト直下でターミナルから「npm run dev」を実行するか、dock の Vela が「npm run dev」で立ち上がったウィンドウを使ってください。'

function electronApiReady(): boolean {
  if (typeof window === 'undefined') return false
  const api = window.electronAPI
  if (!api) return false
  return (
    typeof api.listProjects === 'function' &&
    typeof api.saveProject === 'function' &&
    typeof api.loadProject === 'function'
  )
}

export default function App() {
  const current = useProjectStore((s) => s.current)
  const [gate, setGate] = useState<'pending' | 'ready' | 'missing'>(() =>
    electronApiReady() ? 'ready' : 'pending',
  )

  useEffect(() => {
    if (gate !== 'pending') return
    const started = Date.now()
    const maxMs = 20000
    const tick = () => {
      if (electronApiReady()) {
        setGate('ready')
        return true
      }
      if (Date.now() - started > maxMs) {
        setGate('missing')
        return true
      }
      return false
    }
    if (tick()) return undefined
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id)
    }, 50)
    const onFocus = () => {
      if (electronApiReady()) setGate('ready')
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [gate])

  const splashBox: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center',
    background: '#1a1b20',
    color: '#b8bcc8',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
  }

  if (gate === 'pending') {
    return (
      <div style={splashBox}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#ececf1', margin: 0 }}>起動準備中…</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, marginTop: 12, marginBottom: 0, opacity: 0.9 }}>
          Electron の機能（プロジェクト保存・読込）を待っています。
        </p>
      </div>
    )
  }

  if (gate === 'missing') {
    return (
      <div style={splashBox}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#d98a8a', margin: 0 }}>Electron API が読み込めません</p>
        <p style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 520, marginTop: 16, marginBottom: 0 }}>{ELECTRON_HELP}</p>
        <p style={{ fontSize: 12, maxWidth: 520, marginTop: 12, marginBottom: 0, opacity: 0.75, fontFamily: 'ui-monospace, monospace' }}>
          ターミナルで「[vela] preload:」のログが出ているか確認してください。
        </p>
      </div>
    )
  }

  return current ? <Editor /> : <Home />
}
