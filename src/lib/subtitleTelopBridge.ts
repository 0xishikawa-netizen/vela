/**
 * 字幕セグメント → テロップクリップの最小変換（既存 DEFAULT スタイルを流用）。
 * 本格スタイルマッピングは Phase E 以降で拡張可。
 */
import type { SubtitleSegment, TelopClip } from './types'
import { DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE, DEFAULT_TRANSITION } from './types'

export function subtitleSegmentsToTelopClipPayloads(segments: SubtitleSegment[]): Omit<TelopClip, 'id'>[] {
  return segments.map((seg) => {
    const dur = Math.max(0.05, seg.endSec - seg.startSec)
    return {
      type: 'telop' as const,
      timelineStart: seg.startSec,
      timelineDuration: dur,
      text: seg.text.length > 0 ? seg.text : ' ',
      style: { ...DEFAULT_TELOP_STYLE },
      animation: { ...DEFAULT_TELOP_ANIMATION },
      position: 'bottom_center' as const,
      transitionIn: { ...DEFAULT_TRANSITION },
      transitionOut: { ...DEFAULT_TRANSITION },
    }
  })
}
