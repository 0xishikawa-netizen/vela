import type { CSSProperties } from 'react'
import type { ColorGrade, VideoFilter } from './types'
import { DEFAULT_COLOR_GRADE } from './types'

/**
 * Phase C — preview ルック
 *
 * - **Export（canonical）**: `electron/ffmpeg.ts` の `buildClipVideoFilterParts`（preset → **`eq` → `hue` → `colorbalance`** → `lut3d`）。
 * - **Preview（本モジュール）**: CSS `filter` による **軽量近似**（preset / colorGrade）。**LUT は CSS では再現しない**（Phase C-2: WebGL は `previewLut.ts`）。
 * - **hue**: `hue-rotate`（export の `hue=h=ラジアン` と方向は揃えるが厳密一致ではない）。
 * - **temperature**: CSS だけでは物理色温度の再現に限界がある。**暖色**は sepia / saturate / brightness の軽い合成、**寒色**は hue-rotate + saturate + brightness の粗い近似（export の `colorbalance` とはずれうる）。
 * - highlights: brightness + contrast の複合で近似（CSS では明部だけ選択的に変えられないため近似値）。
 * - shadows: brightness/contrast の逆方向複合で近似。
 * - sharpness: CSS `filter` に直接の sharpen はないため contrast の微増で疑似的に近似（輸出の `unsharp` とは非一致）。
 */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

const GRADE_EPS = 0.01

/**
 * 色温度の CSS 近似（export `colorbalance` とは非一致可）。
 * - 暖色 (temperature > 0): sepia + 彩度・明るさ微増
 * - 寒色 (temperature < 0): シアン寄せの hue-rotate + 彩度・明るさ微減（**CSS だけでは精密なクール調に限界**）
 */
export function buildCssTemperatureApprox(temperature: number): string {
  if (Math.abs(temperature) < 0.5) return ''
  const t = clamp(temperature, -100, 100) / 100
  if (t > 0) {
    const sep = (0.22 * t).toFixed(3)
    const sat = clamp(100 + 10 * t, 80, 130)
    const bri = clamp(100 + 4 * t, 95, 108)
    return `sepia(${sep}) saturate(${sat}%) brightness(${bri}%)`
  }
  const u = -t
  const hueDeg = (-16 * u).toFixed(1)
  const sat = clamp(100 - 14 * u, 70, 100)
  const bri = clamp(100 - 3 * u, 92, 100)
  return `hue-rotate(${hueDeg}deg) saturate(${sat}%) brightness(${bri}%)`
}

/**
 * プレビュー用 ColorGrade → CSS `filter` 断片。
 * **順序（export に寄せる）**: brightness / contrast / saturate（`eq` 相当）→ hue-rotate → 色温度近似
 */
export function buildCssFilterFromColorGrade(g: Partial<ColorGrade> | undefined): string {
  const grade = { ...DEFAULT_COLOR_GRADE, ...g }
  const parts: string[] = []

  if (Math.abs(grade.brightness) > GRADE_EPS) {
    parts.push(`brightness(${clamp(100 + grade.brightness, 5, 200)}%)`)
  }
  if (Math.abs(grade.contrast) > GRADE_EPS) {
    parts.push(`contrast(${clamp(100 + grade.contrast, 5, 200)}%)`)
  }
  if (Math.abs(grade.saturation) > GRADE_EPS) {
    parts.push(`saturate(${clamp(100 + grade.saturation, 0, 250)}%)`)
  }

  if (Math.abs(grade.hue) > GRADE_EPS) {
    parts.push(`hue-rotate(${clamp(grade.hue, -180, 180).toFixed(1)}deg)`)
  }

  const tempCss = buildCssTemperatureApprox(grade.temperature)
  if (tempCss) parts.push(tempCss)

  // highlights: 明部を brightness + 軽い contrast で粗く近似（CSS では部分選択不可）
  if (Math.abs(grade.highlights) > GRADE_EPS) {
    const h = clamp(grade.highlights, -100, 100) / 100
    const bri = clamp(100 + h * 12, 70, 140)
    const con = clamp(100 + h * 6, 80, 120)
    parts.push(`brightness(${bri}%) contrast(${con}%)`)
  }

  // shadows: 暗部を brightness の逆方向で粗く近似
  if (Math.abs(grade.shadows) > GRADE_EPS) {
    const s = clamp(grade.shadows, -100, 100) / 100
    const bri = clamp(100 + s * 10, 70, 130)
    parts.push(`brightness(${bri}%)`)
  }

  // sharpness: CSS に unsharp がないため contrast 微増で疑似近似（輸出とは非一致）
  if (Math.abs(grade.sharpness) > GRADE_EPS) {
    const sh = clamp(grade.sharpness, -100, 100) / 100
    const con = clamp(100 + sh * 8, 80, 130)
    parts.push(`contrast(${con}%)`)
  }

  return parts.join(' ')
}

/**
 * `presetFilter` の FFmpeg（curves / eq / colorchannelmixer 等）に対する CSS 近似。
 * export の `presetFilter()` マップと名前だけ揃え、数値は別物。
 */
export function buildCssFilterFromPreset(filter: VideoFilter | string | undefined): string {
  const f = (filter ?? 'none') as VideoFilter
  switch (f) {
    case 'none':
      return ''
    case 'bw':
      return 'grayscale(100%)'
    case 'sepia':
      return 'sepia(0.55)'
    case 'vivid':
      return 'saturate(1.35) contrast(1.08)'
    case 'warm':
      return 'sepia(0.18) saturate(1.08) brightness(1.03)'
    case 'cool':
      return 'saturate(0.92) hue-rotate(12deg) brightness(0.98)'
    case 'cinematic':
      return 'contrast(1.06) saturate(0.88) brightness(0.96)'
    case 'vintage':
      return 'sepia(0.3) contrast(0.92) brightness(0.92)'
    case 'matte':
      return 'contrast(0.9) saturate(0.82) brightness(0.97)'
    case 'fade':
      return 'brightness(0.93) contrast(0.94) saturate(0.94)'
    default:
      return ''
  }
}

/** export と同順: プリセット → ColorGrade（CSS では左から順に適用）。 */
export function buildPreviewLookCssFilter(opts: {
  filter: VideoFilter | string | undefined
  colorGrade?: Partial<ColorGrade> | undefined
}): string {
  const preset = buildCssFilterFromPreset(opts.filter)
  const grade = buildCssFilterFromColorGrade(opts.colorGrade)
  return [preset, grade].filter((s) => s.length > 0).join(' ')
}

export function buildPreviewLookStyle(opts: {
  filter: VideoFilter | string | undefined
  colorGrade?: Partial<ColorGrade> | undefined
}): CSSProperties {
  const css = buildPreviewLookCssFilter(opts)
  return css ? { filter: css } : {}
}
