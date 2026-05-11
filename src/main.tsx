import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import BootErrorBoundary from './BootErrorBoundary'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML =
    '<p style="padding:24px;font-family:system-ui;background:#1a1b20;color:#ececf1">#root が見つかりません。</p>'
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    </StrictMode>,
  )
}
