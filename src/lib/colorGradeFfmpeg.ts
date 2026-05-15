/**
 * ColorGrade → FFmpeg フィルタ断片（`electron/ffmpeg.ts` の `buildClipVideoFilterParts` が順に結合）。
 *
 * **順序（ルックプリセットの直後）**: **`eq`**（明るさ・コントラスト・彩度）→ **`hue`**（色相）→ **`colorbalance`**（色温度の粗い近似）
 * → **`curves`**（ハイライト）→ **`curves`**（シャドウ）→ **`unsharp`**（シャープネス）
 * → 続けて **`lut3d`** → clip fade → **fps**（ASS / 音声は別経路）。
 */
import type { ColorGrade } from './types'
import { DEFAULT_COLOR_GRADE } from './types'

const EPS = 0.01

export function buildColorGradeFfmpegFilterParts(raw: Partial<ColorGrade> | undefined): string[] {
  const g = { ...DEFAULT_COLOR_GRADE, ...raw }
  const parts: string[] = []

  const eqParts: string[] = []
  if (Math.abs(g.brightness) > EPS) eqParts.push(`brightness=${(g.brightness / 100).toFixed(2)}`)
  if (Math.abs(g.contrast) > EPS) eqParts.push(`contrast=${(1 + g.contrast / 100).toFixed(2)}`)
  if (Math.abs(g.saturation) > EPS) eqParts.push(`saturation=${(1 + g.saturation / 100).toFixed(2)}`)
  if (eqParts.length) parts.push(`eq=${eqParts.join(':')}`)

  if (Math.abs(g.hue) > EPS) {
    const rad = (g.hue * Math.PI) / 180
    parts.push(`hue=h=${rad.toFixed(5)}`)
  }

  if (Math.abs(g.temperature) > EPS) {
    const t = Math.max(-1, Math.min(1, g.temperature / 100))
    const rm = (0.12 * t).toFixed(4)
    const bm = (-0.12 * t).toFixed(4)
    parts.push(`colorbalance=rm=${rm}:bm=${bm}`)
  }

  if (Math.abs(g.highlights) > EPS) {
    const h = Math.max(-1, Math.min(1, g.highlights / 100))
    const hiVal = Math.max(0.3, Math.min(1.7, 1 + h * 0.4)).toFixed(4)
    parts.push(`curves=all='0/0 0.5/0.5 1/${hiVal}'`)
  }

  if (Math.abs(g.shadows) > EPS) {
    const s = Math.max(-1, Math.min(1, g.shadows / 100))
    const shadowOffset = (s * 0.2).toFixed(4)
    const shadow35 = Math.max(0, Math.min(1, 0.35 + s * 0.12)).toFixed(4)
    const shadow0 = Math.max(0, Math.min(0.5, parseFloat(shadowOffset))).toFixed(4)
    parts.push(`curves=all='0/${shadow0} 0.35/${shadow35} 1/1'`)
  }

  if (Math.abs(g.sharpness) > EPS) {
    const la = Math.max(-1.5, Math.min(1.5, (g.sharpness / 100) * 1.5)).toFixed(3)
    parts.push(`unsharp=lx=5:ly=5:la=${la}:cx=5:cy=5:ca=${la}`)
  }

  return parts
}
