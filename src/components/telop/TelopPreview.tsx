import { useEffect, useRef } from 'react'
import type { TelopClip } from '../../lib/types'
import { renderTelops } from '../../lib/telopRenderer'

type Props = {
  clip: TelopClip
  width: number
  height: number
  previewTime: number
}

export default function TelopPreview({ clip, width, height, previewTime }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    renderTelops({
      canvas: c,
      telops: [{ ...clip, timelineStart: 0, timelineDuration: 999 }],
      currentTime: previewTime,
      width,
      height,
    })
  }, [clip, width, height, previewTime])
  return <canvas ref={ref} className="rounded border" style={{ borderColor: 'var(--border)' }} />
}
