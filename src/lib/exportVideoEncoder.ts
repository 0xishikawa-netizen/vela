/**
 * 書き出し動画エンコーダ（HW / SW）の解決。**メイン process でも renderer の単体チェックでも**同じ式を使う。
 * VAAPI / Linux 専用 QSV は **未実装**（`auto` on Linux は常に libx264/libx265）。
 */
import type { HwVideoEncoder } from './types'

export type ExportRuntimePlatform = 'darwin' | 'win32' | 'linux'

export function normalizeExportPlatform(platform: NodeJS.Platform): ExportRuntimePlatform {
  if (platform === 'darwin') return 'darwin'
  if (platform === 'win32') return 'win32'
  return 'linux'
}

export type ResolvedExportEncoder = {
  vcodec: string
  usePresetLibx: boolean
  /** `-b:v` の直後に挿入（libx 以外の品質・レート制御補助） */
  extraAfterBitrate: string[]
  encoderKind: 'libx' | 'videotoolbox' | 'nvenc' | 'qsv' | 'amf'
}

/**
 * UI / IPC からの希望エンコーダを FFmpeg `-c:v` と追加オプションに解決する。
 * - **VideoToolbox** は **macOS のみ**。それ以外の OS で指定された場合は **ソフトウェア**（旧挙動どおり安全側）。
 * - **NVENC** / **QSV** / **AMF**: 明示選択時は OS に関わらず該当エンコーダを試す（Linux + NVENC 等）。**AMF は Windows 専用**想定のため、非 Windows ではソフトへ落とす。
 */
export function resolveExportVideoEncoder(
  codec: 'h264' | 'h265',
  hw: HwVideoEncoder | undefined,
  platform: ExportRuntimePlatform,
): ResolvedExportEncoder {
  const isHevc = codec === 'h265'
  const h: HwVideoEncoder = hw === undefined ? 'auto' : hw

  const libx = (): ResolvedExportEncoder => ({
    vcodec: isHevc ? 'libx265' : 'libx264',
    usePresetLibx: true,
    extraAfterBitrate: [],
    encoderKind: 'libx',
  })

  if (h === 'off') return libx()

  if (h === 'videotoolbox') {
    if (platform !== 'darwin') return libx()
    return {
      vcodec: isHevc ? 'hevc_videotoolbox' : 'h264_videotoolbox',
      usePresetLibx: false,
      extraAfterBitrate: [],
      encoderKind: 'videotoolbox',
    }
  }

  if (h === 'auto' && platform === 'darwin') {
    return {
      vcodec: isHevc ? 'hevc_videotoolbox' : 'h264_videotoolbox',
      usePresetLibx: false,
      extraAfterBitrate: [],
      encoderKind: 'videotoolbox',
    }
  }

  if (h === 'nvenc' || (h === 'auto' && platform === 'win32')) {
    return {
      vcodec: isHevc ? 'hevc_nvenc' : 'h264_nvenc',
      usePresetLibx: false,
      extraAfterBitrate: ['-rc', 'vbr', '-preset', 'p4'],
      encoderKind: 'nvenc',
    }
  }

  if (h === 'qsv') {
    return {
      vcodec: isHevc ? 'hevc_qsv' : 'h264_qsv',
      usePresetLibx: false,
      extraAfterBitrate: ['-preset', 'medium'],
      encoderKind: 'qsv',
    }
  }

  if (h === 'amf') {
    if (platform !== 'win32') return libx()
    return {
      vcodec: isHevc ? 'hevc_amf' : 'h264_amf',
      usePresetLibx: false,
      extraAfterBitrate: ['-quality', 'balanced'],
      encoderKind: 'amf',
    }
  }

  // auto + Linux 等
  return libx()
}

/** Export モーダルで選択肢を無効化するか（明示 HW のみ。`auto` / `off` は常に true） */
export function exportEncoderOptionAvailable(
  hw: HwVideoEncoder,
  platform: ExportRuntimePlatform,
): boolean {
  if (hw === 'off' || hw === 'auto') return true
  if (hw === 'videotoolbox') return platform === 'darwin'
  if (hw === 'nvenc' || hw === 'qsv' || hw === 'amf') return platform === 'win32'
  return false
}

/** 初回実行が HW パスか（失敗時にソフト再試行するかの判定用） */
export function exportEncoderAttemptIsHardware(
  codec: 'h264' | 'h265',
  hw: HwVideoEncoder | undefined,
  platform: ExportRuntimePlatform,
): boolean {
  return !resolveExportVideoEncoder(codec, hw, platform).usePresetLibx
}
