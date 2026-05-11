/**
 * テロップの書き出し（FFmpeg drawtext）用レイアウト。
 * `telopRenderer.ts` のプレビュー座標（正規化 0〜1）と揃える。
 */
import type { TelopClip, TelopPosition } from './types'

export const TELOP_LAYOUT = {
  topY: 0.08,
  bottomY: 0.88,
  sideLeft: 0.05,
  sideRight: 0.95,
} as const

/** 書き出し・プレビュー共通の行分割 */
export function splitTelopLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

/**
 * ASS の \\an（1〜9）と \\pos とプレビュー Canvas の参照点を揃える。
 * - 位置プリセットは「画面上のどの帯か」（列・行）を決める
 * - style.align はその帯の中での水平アンカ（左／中／右）を決める
 * 複行ブロックの縦位置は `telopLineTopYs` 側の規則と完全一致はしない（ASS は単一 \\pos）。
 */
export function getTelopAssAnchor(tc: TelopClip, w: number, h: number): { an: number; x: number; y: number } {
  const { topY, bottomY, sideLeft, sideRight } = TELOP_LAYOUT
  const pos: TelopPosition = tc.position ?? 'bottom_center'
  const align = tc.style?.align ?? 'center'

  if (pos === 'custom' && tc.customPosition) {
    const cx = Math.max(0, Math.min(1, tc.customPosition.x))
    const cy = Math.max(0, Math.min(1, tc.customPosition.y))
    const px = Math.round(w * cx)
    const py = Math.round(h * cy)
    if (align === 'left') return { an: 4, x: px, y: py }
    if (align === 'right') return { an: 6, x: px, y: py }
    return { an: 5, x: px, y: py }
  }

  const row = pos.startsWith('top') ? 'top' : pos.startsWith('middle') ? 'middle' : 'bottom'
  const col = pos.endsWith('_left') ? 'left' : pos.endsWith('_right') ? 'right' : 'center'

  const yRef = row === 'top' ? h * topY : row === 'middle' ? h / 2 : h * bottomY
  const xRef = col === 'left' ? w * sideLeft : col === 'right' ? w * sideRight : w / 2

  const anTable = {
    bottom: { left: 1, center: 2, right: 3 },
    middle: { left: 4, center: 5, right: 6 },
    top: { left: 7, center: 8, right: 9 },
  } as const

  const an = anTable[row][align]
  return { an, x: Math.round(xRef), y: Math.round(yRef) }
}

/**
 * 各テキスト行の上端 Y（px）。`electron/ffmpeg` の lineYExpr と同じ規則。
 * `textH` は行の高さの目安（Canvas では measureText、書き出しでは fontsize に近い値）。
 */
export function telopLineTopYs(
  heightPx: number,
  tc: TelopClip,
  n: number,
  gap: number,
  textH: number,
): number[] {
  const ys: number[] = []
  const p = tc.position ?? 'bottom_center'
  const { topY, bottomY } = TELOP_LAYOUT
  const cy = customNormY(tc)
  if (cy != null) {
    const cyp = cy * heightPx
    for (let i = 0; i < n; i++) {
      ys.push(cyp - textH - (n - 1 - i) * gap)
    }
    return ys
  }
  if (p.startsWith('top')) {
    for (let i = 0; i < n; i++) ys.push(heightPx * topY + i * gap)
    return ys
  }
  if (p.startsWith('middle')) {
    for (let i = 0; i < n; i++) {
      const midOff = i * gap - Math.floor(((n - 1) * gap) / 2)
      ys.push((heightPx - textH) / 2 + midOff)
    }
    return ys
  }
  for (let i = 0; i < n; i++) {
    const up = (n - 1 - i) * gap
    ys.push(heightPx * bottomY - textH - up)
  }
  return ys
}

export function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
}

/** #RRGGBB または rgba() / rgb() → 6桁 hex + 0〜1 のアルファ（ASS 等でも利用） */
export function parseColorForFfmpeg(color: string, fallbackHex: string): { hex: string; alpha: number } {
  const c = color.trim()
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c)
  if (rgba) {
    const r = Math.max(0, Math.min(255, parseInt(rgba[1]!, 10)))
    const g = Math.max(0, Math.min(255, parseInt(rgba[2]!, 10)))
    const b = Math.max(0, Math.min(255, parseInt(rgba[3]!, 10)))
    const a = rgba[4] != null && rgba[4] !== '' ? Math.max(0, Math.min(1, parseFloat(rgba[4]!))) : 1
    const hex = [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    return { hex, alpha: a }
  }
  const m = /^#?([0-9a-fA-F]{6})$/.exec(c)
  return { hex: m ? m[1]! : fallbackHex, alpha: 1 }
}

function fontColorExpr(style: TelopClip['style']): string {
  const { hex, alpha } = parseColorForFfmpeg(style.color, 'ffffff')
  if (alpha >= 0.999) return `fontcolor=0x${hex}`
  return `fontcolor=0x${hex}@${alpha.toFixed(3)}`
}

function borderColorExpr(style: TelopClip['style']): string {
  const { hex } = parseColorForFfmpeg(style.strokeColor, '000000')
  return `0x${hex}`
}

function boxColorExpr(bg: string, opacity: number): string {
  const { hex, alpha } = parseColorForFfmpeg(bg, '000000')
  const a = Math.min(1, Math.max(0, opacity * alpha))
  return `0x${hex}@${a.toFixed(3)}`
}

function shadowColorExpr(style: TelopClip['style']): string {
  const { hex, alpha } = parseColorForFfmpeg(style.shadowColor, '000000')
  const a = Math.max(0.15, Math.min(1, alpha * 0.85))
  return `0x${hex}@${a.toFixed(3)}`
}

function customNormY(tc: TelopClip): number | null {
  if (tc.position !== 'custom' || !tc.customPosition) return null
  return Math.max(0, Math.min(1, tc.customPosition.y))
}

/** プレビュー `telopRenderer` の正規化座標に合わせた x 式（text_w を考慮、drawtext の x= にそのまま渡す） */
function xExprForPosition(tc: TelopClip, align: 'left' | 'center' | 'right'): string {
  const { sideLeft, sideRight } = TELOP_LAYOUT
  const pos = tc.position ?? 'bottom_center'

  if (pos === 'custom' && tc.customPosition) {
    const cx = Math.max(0, Math.min(1, tc.customPosition.x))
    if (align === 'left') return `w*${cx}`
    if (align === 'right') return `w*${cx}-text_w`
    return `w*${cx}-text_w/2`
  }

  switch (pos) {
    case 'top_left':
    case 'middle_left':
    case 'bottom_left':
      return `w*${sideLeft}`
    case 'top_right':
    case 'middle_right':
    case 'bottom_right':
      return `w*${sideRight}-text_w`
    default:
      return '(w-text_w)/2'
  }
}

function lineYExpr(tc: TelopClip, lineIndex: number, nLines: number, gap: number): string {
  const { topY, bottomY } = TELOP_LAYOUT
  const n = nLines
  const i = lineIndex
  const p = tc.position ?? 'bottom_center'

  const cy = customNormY(tc)
  if (cy != null) {
    const stack = (n - 1 - i) * gap
    return `h*${cy}-text_h-${stack}`
  }

  if (p.startsWith('top')) {
    return `h*${topY}+${i * gap}`
  }
  if (p.startsWith('middle')) {
    const midOff = i * gap - Math.floor(((n - 1) * gap) / 2)
    return `(h-text_h)/2+${midOff}`
  }
  const up = (n - 1 - i) * gap
  return `h*${bottomY}-text_h-${up}`
}

/** 1 クリップ → drawtext フィルタ文字列の配列（カンマ連結用） */
export function buildTelopDrawtextFilters(tc: TelopClip): string[] {
  const lines = splitTelopLines(tc.text)
  if (lines.length === 0) return []

  const fs = Math.max(8, Math.min(200, tc.style.fontSize || 48))
  const lh = Math.max(1, tc.style.lineHeight || 1.4)
  const gap = Math.round(fs * lh)
  const n = lines.length

  const borderw = Math.min(8, Math.max(0, tc.style.strokeWidth || 0))
  const boldExtra = tc.style.fontWeight === 'bold' ? 1 : 0
  const bw = Math.min(8, borderw + boldExtra)

  const t0 = tc.timelineStart
  const t1 = tc.timelineStart + tc.timelineDuration
  const enable = `enable='between(t,${t0},${t1})'`

  const textAlign: 'left' | 'center' | 'right' =
    tc.style.align === 'left' ? 'left' : tc.style.align === 'right' ? 'right' : 'center'
  const xExpr = xExprForPosition(tc, textAlign)

  const box =
    (tc.style.backgroundOpacity ?? 0) > 0.02 && tc.style.backgroundColor
      ? `box=1:boxcolor=${boxColorExpr(tc.style.backgroundColor, tc.style.backgroundOpacity ?? 0)}:boxborderw=4`
      : ''

  const shadow =
    (tc.style.shadowBlur ?? 0) > 0.5
      ? `shadowcolor=${shadowColorExpr(tc.style)}:shadowx=${Math.round(tc.style.shadowOffsetX || 2)}:shadowy=${Math.round(tc.style.shadowOffsetY || 2)}`
      : ''

  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const line = lines[i]!
    const yExpr = lineYExpr(tc, i, n, gap)
    const parts = [
      `drawtext=text='${escapeDrawtext(line)}'`,
      `fontsize=${fs}`,
      `x=${xExpr}`,
      `y=${yExpr}`,
      fontColorExpr(tc.style),
      `borderw=${bw}`,
      `bordercolor=${borderColorExpr(tc.style)}`,
      `line_spacing=${Math.round((lh - 1) * fs)}`,
      `text_align=${textAlign}`,
      enable,
    ]
    if (shadow) parts.push(shadow)
    if (box) parts.push(box)
    out.push(parts.join(':'))
  }
  return out
}
