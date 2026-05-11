/**
 * Phase C-2 — LUT **preview**（WebGL）設計・入口
 *
 * ## Canonical
 * - **Export**: `electron/ffmpeg.ts` の `lut3d=file='…':interp=tetrahedral`（変更しない）。
 * - **Preview**: **WebGL 2D アトラス + trilinear 近似**（`previewLutWebgl.ts`）。**export / preview の厳密一致は後続課題**。
 *
 * ## CSS との役割分担（`Preview.tsx`）
 * - **presetFilter / colorGrade** は Phase C-1 どおり **`previewLook.ts` の CSS `filter`**（映像ソースまたは LUT 合成後の canvas に適用）。
 * - **LUT は CSS では再現しない**（`.cube` は WebGL のみ）。
 *
 * ## `.cube` パース
 * - `lutCube.ts` の `parseCubeLut`。メインからは **`readCubeLutFile` IPC** でテキスト取得。
 *
 * ## 2D アトラス（WebGL1）
 * - **`previewLutAtlas.ts`**: 寸法・RGBA 詰め。**シェーダ内 trilinear** を想定。tetrahedral は後続。
 *
 * ## キャッシュ
 * - **`makePreviewLutCacheKey`** + **`previewLutShouldSkipAtlasReupload`**（`previewLutAtlas.ts`）で GPU 再 upload を抑制。
 *
 * ## 失敗時
 * - `createPreviewLutRenderer` → **`null`**。`render` → **`false`**。開発時のみ `console.warn`（`previewLutWebgl.ts` / `Preview.tsx` は **重複なし**）。
 *
 * ## UI 状態（Phase C-2d）
 * - `previewLutPreviewUi.ts` の純粋ヘルパで **CSS を source か LUT canvas のどちらか一方にだけ**適用。
 *
 * ## レイアウト（Phase C-2f）
 * - `previewLutLayout.ts` — **object-contain** 表示サイズ・**DPR clamp**・canvas **backing**（`PreviewLutRenderer.render` の第 2 引数）。
 */

export type { PreviewLutRenderer, PreviewLutRenderLayout } from './previewLutWebgl'
export { createPreviewLutRenderer } from './previewLutWebgl'

export {
  PREVIEW_LUT_DPR_MAX,
  clampPreviewLutDpr,
  previewLutCanvasBackingSize,
  previewLutObjectContainDisplaySize,
} from './previewLutLayout'

export {
  PREVIEW_LUT_ATLAS_MAX_SIZE,
  buildPreviewLutAtlasRgba,
  previewLutAtlasDimensions,
  previewLutShouldSkipAtlasReupload,
} from './previewLutAtlas'

export type { LutPreviewUiState } from './previewLutPreviewUi'
export {
  lutPreviewIsDisabled,
  lutPreviewShowLutOverlay,
  previewLookStyleTarget,
} from './previewLutPreviewUi'

/** `readCubeLutFile` 成功レスポンスと揃えたキャッシュメタ */
export type PreviewLutReadMeta = {
  path: string
  mtimeMs: number
  sizeBytes: number
}

export function makePreviewLutCacheKey(lutPath: string, mtimeMs?: number): string
export function makePreviewLutCacheKey(meta: PreviewLutReadMeta): string
export function makePreviewLutCacheKey(
  lutPathOrMeta: string | PreviewLutReadMeta,
  mtimeMs?: number,
): string {
  if (typeof lutPathOrMeta === 'object') {
    const p = lutPathOrMeta.path.trim().replace(/\\/g, '/')
    return `${p}\n${lutPathOrMeta.mtimeMs}\n${lutPathOrMeta.sizeBytes}`
  }
  const p = lutPathOrMeta.trim().replace(/\\/g, '/')
  if (mtimeMs != null && Number.isFinite(mtimeMs)) {
    return `${p}\n${mtimeMs}`
  }
  return p
}

/** IPC の `ok` 結果からキー生成（推奨） */
export function makePreviewLutCacheKeyFromReadResult(
  lutPath: string,
  r: { mtimeMs: number; sizeBytes: number },
): string {
  return makePreviewLutCacheKey({
    path: lutPath,
    mtimeMs: r.mtimeMs,
    sizeBytes: r.sizeBytes,
  })
}
