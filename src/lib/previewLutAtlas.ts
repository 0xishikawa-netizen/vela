/**
 * LUT → **2D アトラス**の純粋関数（Node / ブラウザ共通、`check:lut-cube` で検証可能）。
 *
 * ## WebGL1 と 3D テクスチャ
 * WebGL1 において **3D texture は不可**のため、`LUT_3D_SIZE = N` の格子を **2D テクスチャ 1 枚**に詰める。
 *
 * ## レイアウト（`lutCube` の並びと整合）
 * ファイル順は **R が最速**（index = `r + N*g + N*N*b`）。
 * テクスチャ座標: **幅 = N×N、高さ = N**。テクセル `(x, y)` は `x = r + N*g`, `y = b`（0 始まり）。
 * シェーダ側で **trilinear** に近い補間を行う想定。FFmpeg **`lut3d` tetrahedral** とは **一致させない**（後続で tetrahedral 近似を検討）。
 */

import type { ParsedCubeLut } from './lutCube'

/** プレビュー用の安全上限（巨大 LUT で GPU メモリを食い潰さない） */
export const PREVIEW_LUT_ATLAS_MAX_SIZE = 128

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(255, Math.max(0, Math.round(v * 255)))
}

/**
 * `N` から 2D アトラス寸法を返す。不正な `N` は `null`。
 */
export function previewLutAtlasDimensions(size: number): { width: number; height: number } | null {
  if (!Number.isInteger(size) || size < 2 || size > PREVIEW_LUT_ATLAS_MAX_SIZE) return null
  return { width: size * size, height: size }
}

/**
 * `cacheKey` が前回と同一なら **GPU 再 upload を省略**してよい。
 * `newCacheKey` が空 / undefined のときは再アップロード前提（false を返す）。
 */
export function previewLutShouldSkipAtlasReupload(
  lastCacheKey: string | undefined,
  newCacheKey: string | undefined,
): boolean {
  if (newCacheKey == null || newCacheKey === '') return false
  return lastCacheKey === newCacheKey
}

/**
 * `ParsedCubeLut` から RGBA8 アトラスを生成（A=255）。
 */
export function buildPreviewLutAtlasRgba(parsed: ParsedCubeLut): Uint8Array | null {
  const dim = previewLutAtlasDimensions(parsed.size)
  if (!dim) return null
  const { width, height } = dim
  const N = parsed.size
  const rgb = parsed.rgb
  const expected = N * N * N * 3
  if (rgb.length !== expected) return null

  const out = new Uint8Array(width * height * 4)
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const src = (r + N * g + N * N * b) * 3
        const x = r + N * g
        const y = b
        const dst = (y * width + x) * 4
        out[dst] = clampByte(rgb[src]!)
        out[dst + 1] = clampByte(rgb[src + 1]!)
        out[dst + 2] = clampByte(rgb[src + 2]!)
        out[dst + 3] = 255
      }
    }
  }
  return out
}
