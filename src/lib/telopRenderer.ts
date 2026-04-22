import type { TelopClip, TelopAnimationType } from './types'

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
    const { timelineStart, timelineDuration, style, animation, position, text } = telop
    if (currentTime < timelineStart || currentTime > timelineStart + timelineDuration) continue

    const elapsed = currentTime - timelineStart
    const remaining = timelineDuration - elapsed
    const inDur = Math.max(0.001, animation.inDuration)
    const outDur = Math.max(0.001, animation.outDuration)
    const inProgress = elapsed / inDur
    const outProgress = remaining / outDur

    let alpha = 1
    if (elapsed < inDur) alpha = Math.min(1, inProgress)
    if (remaining < outDur) alpha = Math.min(alpha, outProgress)

    const posMap: Record<string, [number, number]> = {
      top_center: [width / 2, height * 0.08],
      middle_center: [width / 2, height / 2],
      bottom_center: [width / 2, height * 0.88],
      bottom_left: [width * 0.05, height * 0.88],
      bottom_right: [width * 0.95, height * 0.88],
      top_left: [width * 0.05, height * 0.08],
      top_right: [width * 0.95, height * 0.08],
      middle_left: [width * 0.05, height / 2],
      middle_right: [width * 0.95, height / 2],
      custom: [
        (telop.customPosition?.x ?? 0.5) * width,
        (telop.customPosition?.y ?? 0.88) * height,
      ],
    }
    let [x, y] = posMap[position] ?? posMap.bottom_center

    ctx.save()
    ctx.globalAlpha = alpha

    const offset = applyAnimation(
      ctx,
      animation.in,
      Math.min(1, inProgress),
      inDur,
      elapsed,
      x,
      y,
      width,
      height,
    )
    x += offset.dx
    y += offset.dy

    ctx.font = `${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`
    ctx.textAlign = style.align as CanvasTextAlign
    ctx.textBaseline = 'middle'

    if (style.shadowBlur > 0) {
      ctx.shadowColor = style.shadowColor
      ctx.shadowBlur = style.shadowBlur
      ctx.shadowOffsetX = style.shadowOffsetX
      ctx.shadowOffsetY = style.shadowOffsetY
    }

    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth = style.strokeWidth * 2
      ctx.lineJoin = 'round'
      ctx.strokeText(text, x, y)
    }

    ctx.fillStyle = style.color
    ctx.fillText(text, x, y)
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
