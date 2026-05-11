/**
 * Phase C-2d — LUT preview の **UI 状態**（`Preview.tsx`）と **純粋ヘルパ**（`check:lut-cube` 用）。
 *
 * **Export** は FFmpeg `lut3d` が canonical。ここは preview のみ。
 */

export type LutPreviewUiState = 'disabled' | 'loading' | 'ready' | 'fallback'

/** `lutPath` が無い、または `readCubeLutFile` が無い → LUT レイヤーは試みない */
export function lutPreviewIsDisabled(hasLutPath: boolean, hasReadCubeLutApi: boolean): boolean {
  return !hasLutPath || !hasReadCubeLutApi
}

/** CSS `previewLook` を **LUT canvas** にだけ掛ける（二重適用防止） */
export function previewLookStyleTarget(state: LutPreviewUiState): 'source' | 'lutCanvas' {
  return state === 'ready' ? 'lutCanvas' : 'source'
}

/** LUT 合成結果をオーバーレイとして見せる（ソース video/img は非表示） */
export function lutPreviewShowLutOverlay(state: LutPreviewUiState): boolean {
  return state === 'ready'
}
