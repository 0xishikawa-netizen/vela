import { useProjectStore } from '../../store/projectStore'

export default function AudioPanel() {
  const current = useProjectStore((s) => s.current)
  const toggleMute = useProjectStore((s) => s.toggleMute)
  const toggleLock = useProjectStore((s) => s.toggleLock)

  if (!current) {
    return (
      <div className="p-4">
        <p className="text-[12px]" style={{ color: 'var(--label)' }}>プロジェクトを開いてください</p>
      </div>
    )
  }

  const audioTracks = current.tracks.filter((t) => t.type === 'audio')

  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        オーディオ
      </p>
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        トラックをミュートにすると、書き出しのミックスからそのトラック上のクリップの音声が除かれます。クリップの音量・フェードは「クリップ」で選択中のクリップから調整します。
      </p>
      {audioTracks.length === 0 ? (
        <div
          className="rounded-lg p-4 text-center text-[11px]"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          音声トラックがありません
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {audioTracks.map((t) => (
            <li
              key={t.id}
              className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <span className="text-[12px] font-medium truncate min-w-0" style={{ color: 'var(--fg)' }} title={t.name}>
                {t.name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] font-semibold"
                  style={{
                    background: t.muted ? 'rgba(200,100,100,0.2)' : 'var(--surface-3)',
                    color: t.muted ? '#e8a0a0' : 'var(--label)',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => toggleMute(t.id)}
                >
                  M
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] font-semibold"
                  style={{
                    background: t.locked ? 'var(--accent-dim)' : 'var(--surface-3)',
                    color: t.locked ? 'var(--accent)' : 'var(--label)',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => toggleLock(t.id)}
                  title="ロック（今後拡張）"
                >
                  L
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
