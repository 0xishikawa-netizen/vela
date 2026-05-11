/**
 * Phase C-2f — LUT preview の **レイアウト純粋関数**（DPR・object-contain・backing サイズ）。
 * DOM / WebGL 不要。`check:lut-cube` から assert 可能。
 */

/** `window.devicePixelRatio` の上限（メモリ・GPU 負荷抑制） */
export const PREVIEW_LUT_DPR_MAX = 2.5

export type PreviewLutRenderLayout = {
  /** プレビュー枠の CSS px（`Preview` の `outW` × `outH`） */
  containerCssWidth: number
  containerCssHeight: number
  /** 通常 `clampPreviewLutDpr(window.devicePixelRatio)` を渡す */
  devicePixelRatio: number
}

export function clampPreviewLutDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1
  return Math.min(PREVIEW_LUT_DPR_MAX, Math.max(1, dpr))
}

/**
 * CSS `object-contain` と同じ **表示サイズ**（CSS px）。アスペクトは `sourceW:sourceH` を維持。
 */
export function previewLutObjectContainDisplaySize(
  containerCssW: number,
  containerCssH: number,
  sourceW: number,
  sourceH: number,
): { displayCssW: number; displayCssH: number } | null {
  if (
    !Number.isFinite(containerCssW) ||
    !Number.isFinite(containerCssH) ||
    !Number.isFinite(sourceW) ||
    !Number.isFinite(sourceH) ||
    containerCssW <= 0 ||
    containerCssH <= 0 ||
    sourceW <= 0 ||
    sourceH <= 0
  ) {
    return null
  }
  const scale = Math.min(containerCssW / sourceW, containerCssH / sourceH)
  return {
    displayCssW: sourceW * scale,
    displayCssH: sourceH * scale,
  }
}

/**
 * canvas の **backing store**（整数 px）。引数は `previewLutObjectContainDisplaySize` の結果（CSS px）。
 */
export function previewLutCanvasBackingSize(
  displayCssW: number,
  displayCssH: number,
  dpr: number,
): { width: number; height: number } | null {
  if (
    !Number.isFinite(displayCssW) ||
    !Number.isFinite(displayCssH) ||
    displayCssW <= 0 ||
    displayCssH <= 0
  ) {
    return null
  }
  const cdpr = clampPreviewLutDpr(dpr)
  const w = Math.max(1, Math.round(displayCssW * cdpr))
  const h = Math.max(1, Math.round(displayCssH * cdpr))
  return { width: w, height: h }
}
