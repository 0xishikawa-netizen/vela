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
      <div
        className="pointer-events-auto absolute -top-1 left-0 h-3 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm"
        style={{ background: 'var(--accent)' }}
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
      <div className="absolute left-0 top-2 w-px" style={{ height: height - 8, background: 'var(--accent)' }} />
    </div>
  )
}
