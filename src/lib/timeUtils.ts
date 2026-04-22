export function secondsToTimecode(seconds: number, fps = 30): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * fps)
  return (
    [h, m, s].map((v) => String(v).padStart(2, '0')).join(':') +
    ':' +
    String(f).padStart(2, '0')
  )
}

export function secondsToDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function pxToSeconds(px: number, zoom: number): number {
  return px / zoom
}

export function secondsToPx(seconds: number, zoom: number): number {
  return seconds * zoom
}

export function snapToGrid(value: number, snapPoints: number[], threshold: number): number {
  for (const point of snapPoints) {
    if (Math.abs(value - point) <= threshold) return point
  }
  return value
}
