export default function AudioPanel() {
  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        Audio Mixer
      </p>
      <div
        className="rounded-lg p-4 flex flex-col items-center gap-2"
        style={{
          background: 'var(--surface-2)',
          border: '1px dashed rgba(52,211,153,0.2)',
        }}
      >
        <span className="text-2xl opacity-30">♪</span>
        <p className="text-[11px] text-center" style={{ color: 'var(--muted)' }}>
          BGM・ミキサーは今後拡張予定
        </p>
        <p className="text-[10px] text-center" style={{ color: 'var(--muted-2)' }}>
          メディアパネルから音声を<br />タイムラインに追加できます
        </p>
      </div>
    </div>
  )
}
