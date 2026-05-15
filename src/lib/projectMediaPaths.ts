import type { Clip, Project, VideoClip, ImageClip } from './types'

/** プロジェクト内のメディア・LUT の絶対パスを収集（main の読取 allowlist 登録用） */
export function collectMediaSourcePathsFromProject(p: Project): string[] {
  const out = new Set<string>()
  for (const t of p.tracks) {
    for (const c of t.clips) {
      const clip = c as Clip
      if ('sourcePath' in clip && typeof clip.sourcePath === 'string') {
        const s = clip.sourcePath.trim()
        if (s) out.add(s)
      }
      if (clip.type === 'video' || clip.type === 'image') {
        const lut = (clip as VideoClip | ImageClip).lutPath
        if (typeof lut === 'string' && lut.trim()) out.add(lut.trim())
      }
    }
  }
  return [...out]
}
