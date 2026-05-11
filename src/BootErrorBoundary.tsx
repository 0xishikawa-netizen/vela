import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { err: Error | null }

export default class BootErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[vela] renderer crash', err, info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            background: '#1a1b20',
            color: '#ececf1',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <h1 style={{ fontSize: 15, marginBottom: 12, color: '#d98a8a' }}>画面の表示に失敗しました</h1>
          <p style={{ marginBottom: 8, wordBreak: 'break-word' }}>{this.state.err.message}</p>
          <p style={{ fontSize: 12, opacity: 0.75 }}>
            ターミナルで <code style={{ background: '#2a2c34', padding: '2px 6px', borderRadius: 4 }}>npm run dev</code>{' '}
            を実行し直し、赤いログがないか確認してください。
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
