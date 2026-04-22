import { secondsToDisplay } from '../../lib/timeUtils'

type Props = {
  duration: number
  zoom: number
  scrollLeft: number
  width: number
}

export default function TimelineRuler({ duration, zoom, scrollLeft, width }: Props) {
  const visibleStart = scrollLeft / zoom
  const visibleEnd = visibleStart + width / zoom
  const step = zoom < 40 ? 5 : zoom < 100 ? 2 : 1
  const marks: number[] = []
  for (let t = Math.floor(visibleStart / step) * step; t <= visibleEnd + step; t += step) {
    if (t >= 0 && t <= duration + step) marks.push(t)
  }

  return (
    <div
      className="relative h-7 select-none"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--sidebar)',
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,200,240,0.03) 0%, transparent 100%)',
        }}
      />

      {marks.map((t) => (
        <div
          key={t}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: t * zoom - scrollLeft, width: 0 }}
        >
          <span
            className="mono -translate-x-1/2 whitespace-nowrap pt-1.5 text-[9px] font-medium tracking-wider"
            style={{ color: 'var(--muted-2)' }}
          >
            {secondsToDisplay(t)}
          </span>
          <div
            className="mt-auto"
            style={{
              width: 1,
              height: 6,
              background: t % 5 === 0 ? 'rgba(0,200,240,0.3)' : 'rgba(255,255,255,0.1)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
