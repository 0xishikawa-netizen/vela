/**
 * ColorGrade → FFmpeg フィルタ断片（`electron/ffmpeg.ts` の `buildClipVideoFilterParts` が順に結合）。
 *
 * **順序（ルックプリセットの直後）**: **`eq`**（明るさ・コントラスト・彩度）→ **`hue`**（色相）→ **`colorbalance`**（色温度の粗い近似）
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

  return parts
}
