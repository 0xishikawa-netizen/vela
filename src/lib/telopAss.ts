/**
 * 書き出し用 ASS（プレビュー `telopRenderer` / `TELOP_LAYOUT` / `getTelopAssAnchor` に寄せる）
 *
 * 制約: 複行ブロックの縦方向は Canvas の行ごとの top と ASS の単一 \\pos で完全一致しない場合がある。
 */
import type { TelopClip } from './types'
import { getTelopAssAnchor, parseColorForFfmpeg, splitTelopLines } from './telopExportGeometry'

/** 書き出しで明示する既定フォント（プレビュー DEFAULT と揃える） */
export const TELOP_ASS_DEFAULT_FONT = 'Noto Sans JP'

function escapeAssText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N')
}

function rgbHexToAssBgr(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return 'FFFFFF'
  const h = m[1]!
  const rr = h.slice(0, 2)
  const gg = h.slice(2, 4)
  const bb = h.slice(4, 6)
  return `${bb}${gg}${rr}`.toUpperCase()
}

/** ASS &HAABBGGRR（AA: 00=不透明, FF=透明） */
function assColorFromCss(color: string, fallbackHex: string): string {
  const { hex, alpha } = parseColorForFfmpeg(color, fallbackHex)
  const aa = Math.round((1 - Math.min(1, Math.max(0, alpha))) * 255)
  const aas = aa.toString(16).padStart(2, '0').toUpperCase()
  return `${aas}${rgbHexToAssBgr(`#${hex}`)}`
}

/** H:MM:SS.cc（ffmpeg/libass 互換） */
function formatAssTime(sec: number): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const whole = Math.floor(s % 60)
  const cs = Math.round((s - Math.floor(s)) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(Math.min(99, cs)).padStart(2, '0')}`
}

function slideMoveTag(
  animIn: TelopClip['animation']['in'],
  inMs: number,
  x: number,
  y: number,
): string {
  const d = Math.max(1, inMs)
  /** `telopRenderer` の slide_* と同じ px 幅 */
  const px = 60
  const py = 40
  switch (animIn) {
    case 'slide_up':
      return `{\\move(${x},${y + py},${x},${y},0,${d})}`
    case 'slide_down':
      return `{\\move(${x},${y - py},${x},${y},0,${d})}`
    case 'slide_left':
      return `{\\move(${x + px},${y},${x},${y},0,${d})}`
    case 'slide_right':
      return `{\\move(${x - px},${y},${x},${y},0,${d})}`
    default:
      return ''
  }
}

/**
 * プレビュー（`telopRenderer`）は inDuration / outDuration に応じて
 * 常に先頭・末尾でアルファをかけるため、ASS も同じ尺で \\fad する。
 * （アニメ種別の fade_in / fade_out フラグには依存しない）
 */
function buildEnvelopeFadeTag(tc: TelopClip): string {
  const td = Math.max(0.001, tc.timelineDuration)
  const fi = Math.round(Math.min(tc.animation.inDuration, td) * 1000)
  const fo = Math.round(Math.min(tc.animation.outDuration, td) * 1000)
  if (fi === 0 && fo === 0) return ''
  return `{\\fad(${fi},${fo})}`
}

/**
 * zoom_in / zoom_out を \\t + \\fscx/y で近似（プレビューの 0.5→1.0 スケールに寄せる）。
 * 他アニメとの併用時は先頭に置き、\\fad / \\move と順序を固定する。
 */
function buildZoomScaleTags(tc: TelopClip, startSec: number, endSec: number): string {
  const durMs = Math.max(1, Math.round((endSec - startSec) * 1000))
  let s = ''
  if (tc.animation.in === 'zoom_in') {
    const inMs = Math.round(Math.min(tc.animation.inDuration, endSec - startSec) * 1000)
    if (inMs > 0) {
      s += `{\\fscx50\\fscy50\\t(0,${inMs},\\fscx100\\fscy100)}`
    }
  }
  if (tc.animation.out === 'zoom_out') {
    const outMs = Math.round(Math.min(tc.animation.outDuration, endSec - startSec) * 1000)
    if (outMs > 0 && outMs < durMs) {
      const t0 = durMs - outMs
      s += `{\\t(${t0},${durMs},\\fscx118\\fscy118)}`
    }
  }
  return s
}

export function buildTelopAssContent(telops: TelopClip[], playResX: number, playResY: number): string {
  const out: string[] = []
  out.push('[Script Info]')
  out.push('Title: Vela')
  out.push('ScriptType: v4.00+')
  out.push('WrapStyle: 0')
  out.push('ScaledBorderAndShadow: yes')
  out.push(`PlayResX: ${playResX}`)
  out.push(`PlayResY: ${playResY}`)
  out.push('Timer: 100.0')
  out.push(`; Vela: Style Fontname は OS のフォント解決（libass）に依存。未インストール時は代替書体になり幅がズレることがあります。`)
  out.push(`; 既定は「${TELOP_ASS_DEFAULT_FONT}」に合わせています。`)
  out.push('')

  out.push('[V4+ Styles]')
  out.push(
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  )

  const sorted = [...telops].sort((a, b) => a.timelineStart - b.timelineStart || a.id.localeCompare(b.id))

  const styleLines: string[] = []
  const eventLines: string[] = []

  sorted.forEach((tc, idx) => {
    const textLines = splitTelopLines(tc.text)
    if (textLines.length === 0) return

    const st = tc.timelineStart
    const en = tc.timelineStart + tc.timelineDuration
    const fs = Math.max(8, Math.min(200, tc.style.fontSize || 48))
    const lh = Math.max(1, tc.style.lineHeight || 1.4)
    const leading = Math.max(0, Math.round((lh - 1) * fs))

    const rawFont = (tc.style.fontFamily || TELOP_ASS_DEFAULT_FONT).trim() || TELOP_ASS_DEFAULT_FONT
    const font = escapeAssText(rawFont.replace(/,/g, ' '))
    const bold = tc.style.fontWeight === 'bold' ? -1 : 0
    const primary = assColorFromCss(tc.style.color, 'ffffff')
    const outlineC = assColorFromCss(tc.style.strokeColor, '000000')
    const back = '&HFF000000'

    const outline = Math.min(8, Math.max(0, Math.round(tc.style.strokeWidth || 0)))
    const shadow = Math.min(12, Math.max(0, Math.round((tc.style.shadowBlur ?? 0) / 2)))

    const { an, x, y } = getTelopAssAnchor(tc, playResX, playResY)
    const marginV = Math.round(fs * 0.35)

    const styleName = `Vela${idx}`
    styleLines.push(
      `Style: ${styleName},${font},${fs},&H${primary},&H000000FF,&H${outlineC},&H${back},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},${an},48,48,${marginV},1`,
    )

    const body = escapeAssText(textLines.join('\n'))
    const inMs = Math.round(Math.min(tc.animation.inDuration, tc.timelineDuration) * 1000)
    const slide = slideMoveTag(tc.animation.in, inMs, x, y)
    const fade = buildEnvelopeFadeTag(tc)
    const zoom = buildZoomScaleTags(tc, st, en)
    const leadTag = leading > 0 ? `{\\leading${leading}}` : ''
    const posTag = slide === '' ? `{\\pos(${x},${y})}` : ''
    const layer = idx
    eventLines.push(
      `Dialogue: ${layer},${formatAssTime(st)},${formatAssTime(en)},${styleName},,0,0,0,,${zoom}${fade}${slide}${posTag}${leadTag}${body}`,
    )
  })

  out.push(...styleLines)
  out.push('')
  out.push('[Events]')
  out.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text')
  out.push(...eventLines)
  return out.join('\n')
}
