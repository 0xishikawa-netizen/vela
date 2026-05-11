import type { ImageClip, Project, TelopClip, Track, VideoClip } from './types'

export type VisualClip = VideoClip | ImageClip

export type VisualClipEntry = {
  clip: VisualClip
  /** `project.tracks` 内のインデックス（大きいほどタイムライン上で下＝手前／上に重なる想定に合わせる） */
  trackIndex: number
}

function visualClipsOnTrack(tr: Track): VisualClip[] {
  return tr.clips.filter((c): c is VisualClip => c.type === 'video' || c.type === 'image')
}

/** 映像・画像トラック上のクリップをすべて取得（各クリップにトラック順位を付与） */
export function collectVisualClipEntries(project: Project): VisualClipEntry[] {
  const out: VisualClipEntry[] = []
  project.tracks.forEach((tr, trackIndex) => {
    if (tr.type !== 'video' && tr.type !== 'image') return
    for (const clip of visualClipsOnTrack(tr)) {
      out.push({ clip, trackIndex })
    }
  })
  return out
}

/**
 * 書き出し用の単一並び（非オーバーラップ想定）。
 * タイムライン開始が早い順、同一時刻は **trackIndex が大きい方が後**（手前のクリップが後段 concat で上に来る）。
 */
export function sortVisualClipsForExport(entries: VisualClipEntry[]): VisualClip[] {
  const sorted = [...entries].sort((a, b) => {
    const d = a.clip.timelineStart - b.clip.timelineStart
    if (d !== 0) return d
    return a.trackIndex - b.trackIndex
  })
  return sorted.map((e) => e.clip)
}

/** タイムライン上で区間が重なるクリップがあれば true（書き出しは overlay 経路に切り替える） */
export function hasVisualClipTimelineOverlap(clips: VisualClip[]): boolean {
  if (clips.length < 2) return false
  const sorted = [...clips].sort((a, b) => a.timelineStart - b.timelineStart || a.id.localeCompare(b.id))
  let maxEnd = 0
  for (const c of sorted) {
    if (c.timelineStart < maxEnd - 1e-3) return true
    const e = c.timelineStart + c.timelineDuration
    if (e > maxEnd) maxEnd = e
  }
  return false
}

/** 全テロップトラックのクリップをタイムライン順に */
export function collectAllTelopClips(project: Project): TelopClip[] {
  const out: TelopClip[] = []
  for (const tr of project.tracks) {
    if (tr.type !== 'telop') continue
    for (const c of tr.clips) {
      if (c.type === 'telop') out.push(c)
    }
  }
  out.sort((a, b) => a.timelineStart - b.timelineStart || a.id.localeCompare(b.id))
  return out
}

/** 再生・プレビュー: 時刻 t で最も手前（`project.tracks` で下＝後ろ＝大きいインデックス）のアクティブ映像クリップ */
export function topVisualClipAtTime(
  project: Project,
  t: number,
): { clip: VideoClip | ImageClip; trackIndex: number } | undefined {
  let best: { clip: VideoClip | ImageClip; trackIndex: number } | undefined
  project.tracks.forEach((tr, trackIndex) => {
    if (tr.type !== 'video' && tr.type !== 'image') return
    for (const c of tr.clips) {
      if (c.type !== 'video' && c.type !== 'image') continue
      if (t >= c.timelineStart && t < c.timelineStart + c.timelineDuration) {
        if (!best || trackIndex > best.trackIndex) best = { clip: c, trackIndex }
      }
    }
  })
  return best
}

export function trackContainingClipId(project: Project, clipId: string): Track | undefined {
  return project.tracks.find((tr) => tr.clips.some((c) => c.id === clipId))
}
