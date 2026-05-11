import type { TelopClip, TelopAnimationType } from './types'
import { getTelopAssAnchor, splitTelopLines, telopLineTopYs } from './telopExportGeometry'

interface RenderOptions {
  canvas: HTMLCanvasElement
  telops: TelopClip[]
  currentTime: number
  width: number
  height: number
}

export function renderTelops({ canvas, telops, currentTime, width, height }: RenderOptions) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)

  for (const telop of telops) {
    const { timelineStart, timelineDuration, style, animation, text } = telop
    if (currentTime < timelineStart || currentTime > timelineStart + timelineDuration) continue

    const lines = splitTelopLines(text)
    if (lines.length === 0) continue

    const elapsed = currentTime - timelineStart
    const remaining = timelineDuration - elapsed
    const inDur = Math.max(0.001, animation.inDuration)
    const outDur = Math.max(0.001, animation.outDuration)
    const inProgress = elapsed / inDur
    const outProgress = remaining / outDur

    let alpha = 1
    if (elapsed < inDur) alpha = Math.min(1, inProgress)
    if (remaining < outDur) alpha = Math.min(alpha, outProgress)

    const { x } = getTelopAssAnchor(telop, width, height)

    ctx.save()
    ctx.globalAlpha = alpha

    ctx.font = `${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`
    ctx.textAlign = (style.align ?? 'center') as CanvasTextAlign
    ctx.textBaseline = 'top'

    const fs = style.fontSize
    const lh = style.lineHeight || 1.4
    const gap = Math.round(fs * lh)
    const m0 = ctx.measureText(lines[0]!)
    const textH = Math.max(
      fs * 0.85,
      (m0.actualBoundingBoxAscent ?? 0) + (m0.actualBoundingBoxDescent ?? 0),
    )
    const tops = telopLineTopYs(height, telop, lines.length, gap, textH)
    const blockMidY = tops[0]! + ((lines.length - 1) * gap + textH) / 2

    const offset = applyAnimation(
      ctx,
      animation.in,
      Math.min(1, inProgress),
      inDur,
      elapsed,
      x,
      blockMidY,
      width,
      height,
    )
    const drawX = x + offset.dx
    const drawTops = tops.map((ty) => ty + offset.dy)

    if (style.shadowBlur > 0) {
      ctx.shadowColor = style.shadowColor
      ctx.shadowBlur = style.shadowBlur
      ctx.shadowOffsetX = style.shadowOffsetX
      ctx.shadowOffsetY = style.shadowOffsetY
    }

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!
      const yLine = drawTops[li]!
      if (style.strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor
        ctx.lineWidth = style.strokeWidth * 2
        ctx.lineJoin = 'round'
        ctx.strokeText(line, drawX, yLine)
      }
      ctx.fillStyle = style.color
      ctx.fillText(line, drawX, yLine)
    }
    ctx.restore()
  }
}

function applyAnimation(
  ctx: CanvasRenderingContext2D,
  type: TelopAnimationType,
  progress: number,
  _duration: number,
  elapsed: number,
  x: number,
  y: number,
  _w: number,
  _h: number,
): { dx: number; dy: number } {
  const t = Math.min(1, progress)
  const ease = easeOutCubic(t)

  switch (type) {
    case 'fade_in':
      return { dx: 0, dy: 0 }
    case 'slide_up':
      return { dx: 0, dy: (1 - ease) * 40 }
    case 'slide_down':
      return { dx: 0, dy: -(1 - ease) * 40 }
    case 'slide_left':
      return { dx: (1 - ease) * 60, dy: 0 }
    case 'slide_right':
      return { dx: -(1 - ease) * 60, dy: 0 }
    case 'zoom_in':
      ctx.translate(x, y)
      ctx.scale(0.5 + ease * 0.5, 0.5 + ease * 0.5)
      ctx.translate(-x, -y)
      return { dx: 0, dy: 0 }
    case 'bounce': {
      const bounce = Math.abs(Math.sin(elapsed * Math.PI * 3)) * (1 - t) * 20
      return { dx: 0, dy: bounce }
    }
    case 'blur_in':
      ctx.filter = `blur(${Math.max(0, (1 - ease) * 12)}px)`
      return { dx: 0, dy: 0 }
    default:
      return { dx: 0, dy: 0 }
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
