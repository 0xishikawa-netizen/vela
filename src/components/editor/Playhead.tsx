type Props = {
  currentTime: number
  zoom: number
  scrollLeft: number
  height: number
  onSeek: (seconds: number) => void
}

export default function Playhead({ currentTime, zoom, scrollLeft, height, onSeek }: Props) {
  const x = currentTime * zoom - scrollLeft

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-20"
      style={{ transform: `translateX(${x}px)`, height }}
    >
      {/* Handle (diamond shape) */}
      <div
        className="pointer-events-auto absolute -top-1 left-0 -translate-x-1/2 cursor-ew-resize"
        style={{
          width: 12,
          height: 12,
          background: 'var(--accent)',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          boxShadow: '0 0 6px var(--accent)',
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          const startX = e.clientX
          const startT = currentTime
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            onSeek(Math.max(0, startT + dx / zoom))
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />

      {/* Line */}
      <div
        className="absolute left-0 w-px"
        style={{
          top: 11,
          height: height - 11,
          background: 'linear-gradient(to bottom, var(--accent), rgba(132,181,169,0.32))',
          boxShadow: '0 0 4px rgba(132,181,169,0.28)',
        }}
      />
    </div>
  )
}
