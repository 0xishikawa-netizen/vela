import { useEffect, type CSSProperties } from 'react'
import { useUiToastStore, type UiToastItem } from '../../store/uiToastStore'

const AUTO_DISMISS_MS = 9000

function toastStyles(t: UiToastItem): CSSProperties {
  const base: CSSProperties = {
    maxWidth: 360,
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    lineHeight: 1.55,
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    border: '1px solid var(--border-bright)',
    color: 'var(--fg)',
    background: 'var(--glass)',
    backdropFilter: 'blur(10px)',
  }
  if (t.variant === 'error') {
    return {
      ...base,
      borderColor: 'var(--danger-border)',
      background: 'var(--danger-bg)',
    }
  }
  if (t.variant === 'info') {
    return { ...base, borderColor: 'var(--accent-muted)' }
  }
  return { ...base, borderColor: 'rgba(212, 180, 120, 0.35)', background: 'rgba(40, 38, 32, 0.92)' }
}

function ToastLine({ t }: { t: UiToastItem }) {
  const dismissToast = useUiToastStore((s) => s.dismissToast)

  useEffect(() => {
    const id = window.setTimeout(() => dismissToast(t.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [dismissToast, t.id])

  return (
    <div style={toastStyles(t)} role="status" aria-live="polite">
      <div className="flex gap-2">
        <p className="min-w-0 flex-1" style={{ margin: 0 }}>
          {t.message}
        </p>
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
          onClick={() => dismissToast(t.id)}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

export default function UiToasts() {
  const toasts = useUiToastStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[10000] flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-1"
      style={{ maxWidth: 'calc(100vw - 24px)' }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastLine t={t} />
        </div>
      ))}
    </div>
  )
}
