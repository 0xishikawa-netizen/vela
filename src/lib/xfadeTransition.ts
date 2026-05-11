import type { TransitionType } from './types'

/**
 * FFmpeg xfade の transition 名（映像クリップ間）。
 * @see https://ffmpeg.org/ffmpeg-filters.html#xfade
 */
export function transitionTypeToXfadeName(t: TransitionType | undefined): string {
  switch (t) {
    case 'dissolve':
      return 'dissolve'
    case 'wipe':
      return 'wipeleft'
    case 'slide_left':
      return 'slideleft'
    case 'slide_right':
      return 'slideright'
    case 'slide_up':
      return 'slideup'
    case 'slide_down':
      return 'slidedown'
    case 'zoom_in':
      return 'circleopen'
    case 'zoom_out':
      return 'circleclose'
    case 'fade':
      return 'fade'
    default:
      return 'fade'
  }
}

/** 境界の見た目: 前クリップのトランジションアウトを優先し、なければ次のイン */
export function pickXfadeTransitionName(
  prevOut: { type: TransitionType; duration: number } | undefined,
  nextIn: { type: TransitionType; duration: number } | undefined,
): string {
  if (prevOut && prevOut.type !== 'none' && prevOut.duration > 0.02) {
    return transitionTypeToXfadeName(prevOut.type)
  }
  if (nextIn && nextIn.type !== 'none' && nextIn.duration > 0.02) {
    return transitionTypeToXfadeName(nextIn.type)
  }
  return 'fade'
}
