/**
 * 書き出しプリセット（解像度・fps・ビットレート・コーデック）の単一ソース。
 * `+faststart` は `electron/ffmpeg.ts` 側で固定。ここでは数値・コーデックのみ。
 */
export type ExportPresetId = 'custom' | 'web_1080p' | 'web_720p' | 'sns_1080p' | 'archive_4k'

export interface ExportPreset {
  label: string
  width: number
  height: number
  fps: number
  bitrate: string
  codec: 'h264' | 'h265'
}

/** 定義どおりのプリセット（`custom` は手動時の既定値） */
export const EXPORT_PRESET_DEFINITIONS: Record<ExportPresetId, ExportPreset> = {
  custom: {
    label: 'カスタム（手動）',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '8000k',
    codec: 'h264',
  },
  web_1080p: {
    label: 'Web 1080p（H.264 / 30fps）',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '10000k',
    codec: 'h264',
  },
  web_720p: {
    label: 'Web 720p（H.264 / 軽量）',
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: '5000k',
    codec: 'h264',
  },
  sns_1080p: {
    label: 'SNS 1080p（H.264 / やや高ビットレート）',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '12000k',
    codec: 'h264',
  },
  archive_4k: {
    label: 'アーカイブ 4K（H.265 / 高ビットレート）',
    width: 3840,
    height: 2160,
    fps: 30,
    bitrate: '45000k',
    codec: 'h265',
  },
}

/** @deprecated `EXPORT_PRESET_DEFINITIONS` と同一（互換） */
export const EXPORT_PRESETS = EXPORT_PRESET_DEFINITIONS

const LEGACY_FORMAT_MAP: Record<string, ExportPresetId> = {
  youtube_hd: 'web_1080p',
  youtube_4k: 'archive_4k',
  instagram_reel: 'sns_1080p',
  twitter: 'web_720p',
  tiktok: 'sns_1080p',
}

export function sanitizeExportPresetId(raw: unknown): ExportPresetId {
  if (raw === 'custom') return 'custom'
  if (raw === 'web_1080p' || raw === 'web_720p' || raw === 'sns_1080p' || raw === 'archive_4k') return raw
  if (typeof raw === 'string' && LEGACY_FORMAT_MAP[raw]) return LEGACY_FORMAT_MAP[raw]!
  return 'custom'
}

/**
 * IPC / UI から `preset` 行を確定する。
 * - 固定プリセット: 定義どおり（上書きなし）
 * - `custom`: `customOverride` を既定 `custom` にマージ（未指定フィールドは既定）
 */
export function resolveExportPresetSettings(
  presetId: ExportPresetId | unknown,
  customOverride?: Partial<ExportPreset> | null,
): ExportPreset {
  const id = sanitizeExportPresetId(presetId)
  const def = EXPORT_PRESET_DEFINITIONS[id]
  if (!def) {
    return { ...EXPORT_PRESET_DEFINITIONS.custom }
  }
  if (id === 'custom') {
    const base = EXPORT_PRESET_DEFINITIONS.custom
    const o = customOverride ?? {}
    return {
      label: base.label,
      width: typeof o.width === 'number' && Number.isFinite(o.width) && o.width > 0 ? Math.round(o.width) : base.width,
      height:
        typeof o.height === 'number' && Number.isFinite(o.height) && o.height > 0 ? Math.round(o.height) : base.height,
      fps: typeof o.fps === 'number' && Number.isFinite(o.fps) && o.fps > 0 && o.fps <= 240 ? o.fps : base.fps,
      bitrate: typeof o.bitrate === 'string' && o.bitrate.trim() ? o.bitrate.trim() : base.bitrate,
      codec: o.codec === 'h265' || o.codec === 'h264' ? o.codec : base.codec,
    }
  }
  return { ...def }
}
