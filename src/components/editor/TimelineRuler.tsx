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
      className="relative h-7 border-b text-[10px]"
      style={{ borderColor: 'var(--border)', color: 'var(--muted-2)' }}
    >
      {marks.map((t) => (
        <div
          key={t}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: t * zoom - scrollLeft, width: 0 }}
        >
          <span className="mono -translate-x-1/2 whitespace-nowrap pt-1">{secondsToDisplay(t)}</span>
          <div className="h-1 w-px bg-current opacity-40" />
        </div>
      ))}
    </div>
  )
}
