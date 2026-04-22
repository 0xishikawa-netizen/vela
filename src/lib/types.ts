// ============================================================
// プロジェクト
// ============================================================

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9'

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  duration: number
  fps: number
  aspectRatio: AspectRatio
  resolution: { width: number; height: number }
  tracks: Track[]
  thumbnailPath?: string
}

// ============================================================
// トラック
// ============================================================

export type TrackType = 'video' | 'audio' | 'telop' | 'image'

export interface Track {
  id: string
  type: TrackType
  name: string
  muted: boolean
  locked: boolean
  clips: Clip[]
}

// ============================================================
// クリップ
// ============================================================

export type ClipType = 'video' | 'audio' | 'image' | 'telop'

export interface BaseClip {
  id: string
  type: ClipType
  timelineStart: number
  timelineDuration: number
  transitionIn: TransitionDef
  transitionOut: TransitionDef
}

export interface VideoClip extends BaseClip {
  type: 'video'
  sourcePath: string
  sourceStart: number
  sourceEnd: number
  volume: number
  speed: number
  filter: VideoFilter
  colorGrade: ColorGrade
  cropRect?: CropRect
}

export interface AudioClip extends BaseClip {
  type: 'audio'
  sourcePath: string
  sourceStart: number
  sourceEnd: number
  volume: number
  fadeIn: number
  fadeOut: number
}

export interface ImageClip extends BaseClip {
  type: 'image'
  sourcePath: string
  kenBurns?: KenBurnsEffect
  filter: VideoFilter
}

export interface TelopClip extends BaseClip {
  type: 'telop'
  text: string
  style: TelopStyle
  animation: TelopAnimation
  position: TelopPosition
  customPosition?: TelopCustomPosition
}

export type Clip = VideoClip | AudioClip | ImageClip | TelopClip

// ============================================================
// トランジション
// ============================================================

export type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'wipe'

export interface TransitionDef {
  type: TransitionType
  duration: number
}

export const DEFAULT_TRANSITION: TransitionDef = { type: 'none', duration: 0 }

// ============================================================
// フィルター / カラーグレーディング
// ============================================================

export type VideoFilter =
  | 'none'
  | 'cinematic'
  | 'vintage'
  | 'sepia'
  | 'bw'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'matte'
  | 'fade'

export interface ColorGrade {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  temperature: number
  highlights: number
  shadows: number
  sharpness: number
}

export const DEFAULT_COLOR_GRADE: ColorGrade = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface KenBurnsEffect {
  startScale: number
  endScale: number
  startX: number
  startY: number
  endX: number
  endY: number
}

// ============================================================
// テロップ
// ============================================================

export interface TelopStyle {
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  color: string
  backgroundColor: string
  backgroundOpacity: number
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  letterSpacing: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
}

export const DEFAULT_TELOP_STYLE: TelopStyle = {
  fontFamily: 'Noto Sans JP',
  fontSize: 48,
  fontWeight: 'bold',
  color: '#ffffff',
  backgroundColor: 'transparent',
  backgroundOpacity: 0,
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: 'rgba(0,0,0,0.8)',
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  letterSpacing: 0,
  lineHeight: 1.4,
  align: 'center',
}

export type TelopAnimationType =
  | 'none'
  | 'fade_in'
  | 'fade_out'
  | 'slide_up'
  | 'slide_down'
  | 'slide_left'
  | 'slide_right'
  | 'zoom_in'
  | 'zoom_out'
  | 'typewriter'
  | 'bounce'
  | 'flip'
  | 'glitch'
  | 'blur_in'
  | 'wave'

export interface TelopAnimation {
  in: TelopAnimationType
  inDuration: number
  out: TelopAnimationType
  outDuration: number
}

export const DEFAULT_TELOP_ANIMATION: TelopAnimation = {
  in: 'fade_in',
  inDuration: 0.3,
  out: 'fade_out',
  outDuration: 0.3,
}

export type TelopPosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'middle_left'
  | 'middle_center'
  | 'middle_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right'
  | 'custom'

export interface TelopCustomPosition {
  x: number
  y: number
}

// ============================================================
// メディアファイル情報
// ============================================================

export interface MediaFile {
  path: string
  name: string
  type: 'video' | 'image' | 'audio'
  duration?: number
  width?: number
  height?: number
  fps?: number
  size: number
  thumbnailPath?: string
}

// ============================================================
// 書き出し設定
// ============================================================

export type ExportFormat =
  | 'youtube_hd'
  | 'youtube_4k'
  | 'instagram_reel'
  | 'twitter'
  | 'tiktok'
  | 'custom'

export interface ExportPreset {
  label: string
  width: number
  height: number
  fps: number
  bitrate: string
  codec: 'h264' | 'h265'
}

export const EXPORT_PRESETS: Record<ExportFormat, ExportPreset> = {
  youtube_hd: { label: 'YouTube HD（1080p）', width: 1920, height: 1080, fps: 30, bitrate: '8000k', codec: 'h264' },
  youtube_4k: { label: 'YouTube 4K', width: 3840, height: 2160, fps: 30, bitrate: '35000k', codec: 'h265' },
  instagram_reel: { label: 'Instagram Reel（縦型）', width: 1080, height: 1920, fps: 30, bitrate: '5000k', codec: 'h264' },
  twitter: { label: 'X（Twitter）', width: 1280, height: 720, fps: 30, bitrate: '5000k', codec: 'h264' },
  tiktok: { label: 'TikTok', width: 1080, height: 1920, fps: 30, bitrate: '6000k', codec: 'h264' },
  custom: { label: 'カスタム', width: 1920, height: 1080, fps: 30, bitrate: '8000k', codec: 'h264' },
}

export interface ExportSettings {
  outputPath: string
  format: ExportFormat
  preset: ExportPreset
  includeAudio: boolean
}

// ============================================================
// 字幕（AI生成 / 手動）
// ============================================================

export interface Caption {
  id: string
  startTime: number
  endTime: number
  text: string
  isAiGenerated: boolean
}

// ============================================================
// テロッププリセット
// ============================================================

export interface TelopPreset {
  id: string
  name: string
  style: TelopStyle
  animation: TelopAnimation
  thumbnail?: string
}
