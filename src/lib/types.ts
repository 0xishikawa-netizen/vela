import type { ExportPreset, ExportPresetId } from './exportPresets'

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
  /** 全体の最終音量（プレビュー・書き出し）。省略時 1.0。0〜2（等倍〜200%） */
  audioMasterVolume?: number
  /**
   * ファイル字幕トラック（SRT/VTT import）。テロップクリップとは別。省略時は `[]` 扱い。
   * Whisper 連携は後続フェーズ。
   */
  subtitleTracks?: SubtitleTrack[]
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
  /** 音声トラックの書き出しゲイン倍率（既定 1）。映像・テロップでは未使用 */
  volume?: number
  /** 音声トラックのみ。いずれかが true のとき、ソロ以外の音声はミックスに入れない */
  solo?: boolean
  /** 音声トラックのステレオバランス（-1=左寄り, 0=中央, 1=右寄り）。書き出しで stereotools に反映 */
  pan?: number
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
  /** 任意。書き出しで FFmpeg `lut3d` に渡す .cube ファイルの絶対パス */
  lutPath?: string
  cropRect?: CropRect
}

export interface AudioClip extends BaseClip {
  type: 'audio'
  sourcePath: string
  sourceStart: number
  sourceEnd: number
  volume: number
  /** クリップ単体ミュート（書き出しはゲイン 0。トラック M とは別） */
  muted?: boolean
  /** クリップ単体のパン（-1=左, 0=中央, 1=右）。トラック pan と加算後に -1〜1 にクランプ */
  pan?: number
  fadeIn: number
  fadeOut: number
}

export interface ImageClip extends BaseClip {
  type: 'image'
  sourcePath: string
  kenBurns?: KenBurnsEffect
  filter: VideoFilter
  colorGrade?: ColorGrade
  /** 任意。FFmpeg `lut3d` */
  lutPath?: string
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

/** 書き出し（ASS）での再現度。UI の注意表示に使う */
export type ExportSupportLevel = 'full' | 'approx' | 'unsupported'

export type TelopAnimationMeta = {
  key: TelopAnimationType
  label: string
  exportSupport: ExportSupportLevel
  exportNote?: string
}

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

export type { ExportPreset, ExportPresetId } from './exportPresets'
export {
  EXPORT_PRESET_DEFINITIONS,
  EXPORT_PRESETS,
  resolveExportPresetSettings,
  sanitizeExportPresetId,
} from './exportPresets'

/** 選択中のプリセット ID（`ExportPresetId` と同義・互換名） */
export type ExportFormat = ExportPresetId

export type HwVideoEncoder = 'off' | 'auto' | 'videotoolbox' | 'nvenc' | 'qsv' | 'amf'

export interface ExportSettings {
  outputPath: string
  /** 書き出しプリセット ID（`sanitizeExportPresetId` で正規化済み想定） */
  format: ExportFormat
  preset: ExportPreset
  includeAudio: boolean
  /** 隣接する映像クリップ間にクロスフェード（xfade）を挟む */
  crossfadeAdjacent?: boolean
  /** 各境界の xfade 秒。未指定時は 0.35 */
  crossfadeDurationSec?: number
  /** 最終ミックスに loudnorm をかける（後方互換。`audioPostMix` が優先） */
  loudnessNormalize?: boolean
  /** ミックス後のオーディオ処理。未指定時は `loudnessNormalize` が true なら loudnorm */
  audioPostMix?: 'none' | 'loudnorm' | 'dynaudnorm'
  /**
   * 動画エンコーダ。
   * - `auto`: macOS → VideoToolbox、Windows → NVENC、Linux → libx264/libx265（VAAPI 等は未実装）
   * - HW 失敗時は **1 回だけ** libx264/libx265 に自動再試行（`off` 指定時は再試行しない）
   */
  videoEncoder?: HwVideoEncoder
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

/** ファイル字幕の 1 キュー（Whisper 前のプロジェクト内字幕） */
export interface SubtitleSegment {
  id: string
  startSec: number
  endSec: number
  text: string
  speaker?: string
  /** 0〜1。省略可 */
  confidence?: number
}

export interface SubtitleTrack {
  id: string
  name: string
  language?: string
  segments: SubtitleSegment[]
}

/** Whisper 実装前の文字起こしジョブ（Phase E-3 mock / 将来の推論用） */
export type TranscriptionJobStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled'

/** `src/lib/transcriptionEngine.ts` の実装 ID と一致（循環回避のため型はここに置く） */
export type TranscriptionEngineId = 'mock' | 'whisper-local'

export interface TranscriptionOptions {
  language?: string
  translateToJapanese?: boolean
  /** 将来 Whisper のモデル規模。現状は mock のみで参照のみ */
  modelSize?: string
}

export interface TranscriptionJob {
  id: string
  sourceMediaPath: string
  status: TranscriptionJobStatus
  /** 0〜1 */
  progress: number
  language?: string
  options?: TranscriptionOptions
  createdAt: string
  updatedAt: string
  errorMessage?: string
  /** Whisper local 失敗時: GUIログビューアで表示する stderr 末尾（最大 2KB） */
  stderrTail?: string
  /** mock / Whisper 完了時にセット */
  resultSegments?: SubtitleSegment[]
  /** Whisper local 成功時: 読み取った成果物形式 */
  resultRawOutputKind?: 'json' | 'srt' | 'vtt'
  engine?: TranscriptionEngineId
}

/** アプリ環境に紐づく Whisper local 設定（`userData/whisper-local-settings.json`）。プロジェクト JSON には含めない */
export interface WhisperLocalSettings {
  binaryPath?: string
  modelPath?: string
  /** whisper.cpp `-l` 既定 */
  defaultLanguage?: string
  /** UI メモ（CLI argv には未使用。モデルマネージャ接続まで） */
  defaultModelSize?: string
  /** 将来: GPU 優先。現状は保存のみ */
  preferGpu?: boolean
}

/** main `whisperLocal:start` へ渡すペイロード（renderer → IPC） */
export interface WhisperLocalStartPayload {
  runId: string
  binaryPath: string
  modelPath: string
  sourceMediaPath: string
  options?: TranscriptionOptions
  /** argv 未反映。main が保持するのみ（将来 GPU フラグ接続） */
  preferGpu?: boolean
  /**
   * CLI 出力形式。未指定時は main 側で `json`（`-oj` + `*.json`）。
   * UI は E-9 時点では未露出（将来 settings / 上書き argv と併せて整理）。
   */
  outputFormat?: 'json' | 'srt' | 'vtt'
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
