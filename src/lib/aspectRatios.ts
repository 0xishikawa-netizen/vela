import type { AspectRatio } from './types'

/** 新規プロジェクト・解像度欠落時の既定ピクセル寸法（`projectSanitize` / `projectStore` で共有） */
export const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '21:9': { width: 2560, height: 1080 },
}

export const ASPECT_RATIO_KEYS = new Set<AspectRatio>(Object.keys(ASPECT_RATIOS) as AspectRatio[])
