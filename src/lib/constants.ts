export const DEFAULT_FPS = 30
export const MIN_CLIP_DURATION = 0.1
export const SNAP_THRESHOLD = 0.1
export const DEFAULT_ZOOM = 80

export const SUPPORTED_VIDEO = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']
export const SUPPORTED_IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
export const SUPPORTED_AUDIO = ['mp3', 'aac', 'wav', 'm4a', 'flac', 'ogg']

export const WHISPER_MODELS = [
  { id: 'tiny', label: 'Tiny（高速・精度低）', size: '75MB' },
  { id: 'base', label: 'Base（バランス）', size: '142MB' },
  { id: 'small', label: 'Small（精度高）', size: '466MB' },
  { id: 'medium', label: 'Medium（最高精度）', size: '1.5GB' },
] as const

export const TELOP_FONTS = [
  'Noto Sans JP',
  'Noto Serif JP',
  'M PLUS Rounded 1c',
  'Zen Maru Gothic',
  'BIZ UDGothic',
  'Impact',
  'Arial',
] as const
