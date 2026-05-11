import type { AudioClip, Project } from './types'

/** プロジェクト全体のマスター音量（未定義・異常値は 1.0、負は 0、上限 2） */
export function normalizeAudioMasterVolumeValue(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1
  if (v <= 0) return 0
  return Math.min(2, v)
}

export function audioMasterVolumeNormalized(project: Project): number {
  return normalizeAudioMasterVolumeValue(project.audioMasterVolume)
}

/** トラック／クリップ共通: パン値を -1〜1 に正規化（未定義・NaN・非数は 0） */
export function normalizeAudioPanValue(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.min(1, Math.max(-1, v))
}

export function trackForAudioClip(project: Project, clip: AudioClip) {
  return project.tracks.find((tr) => tr.clips.some((c) => c.id === clip.id && c.type === 'audio'))
}

/** 各クリップ stem（トラック音量×クリップ音量×M/S）。書き出しの per-input `volume=` に使用。マスターは掛けない。 */
export function stemMixGainForAudioClip(project: Project, clip: AudioClip): number {
  if (clip.muted === true) return 0
  const t = trackForAudioClip(project, clip)
  if (!t || t.muted) return 0
  const tv = typeof t.volume === 'number' && Number.isFinite(t.volume) && t.volume >= 0 ? t.volume : 1
  const anySolo = project.tracks.some((tr) => tr.type === 'audio' && tr.solo === true)
  if (anySolo && t.type === 'audio' && !t.solo) return 0
  const cv = typeof clip.volume === 'number' && Number.isFinite(clip.volume) && clip.volume >= 0 ? clip.volume : 1
  return tv * cv
}

/** プレビュー用: stem × マスター音量 */
export function mixGainForAudioClip(project: Project, clip: AudioClip): number {
  return stemMixGainForAudioClip(project, clip) * audioMasterVolumeNormalized(project)
}

/** 音声トラックの pan のみ（-1〜1）。映像トラックは 0 */
export function trackPanForAudioClip(project: Project, clip: AudioClip): number {
  const t = trackForAudioClip(project, clip)
  if (!t || t.type !== 'audio') return 0
  return normalizeAudioPanValue(t.pan)
}

/** プレビュー・書き出し: トラック pan + クリップ pan を加算し -1〜1 にクランプ */
export function effectivePanForAudioClip(project: Project, clip: AudioClip): number {
  return normalizeAudioPanValue(trackPanForAudioClip(project, clip) + normalizeAudioPanValue(clip.pan))
}

/** 全音声トラックのクリップをタイムライン順に列挙（書き出し・論理ミックス用） */
export function collectAllAudioClips(project: Project): AudioClip[] {
  const out: AudioClip[] = []
  for (const tr of project.tracks) {
    if (tr.type !== 'audio') continue
    for (const c of tr.clips) {
      if (c.type === 'audio') out.push(c)
    }
  }
  out.sort((a, b) => a.timelineStart - b.timelineStart || a.id.localeCompare(b.id))
  return out
}

/**
 * `atrim=start=sourceStart:end=sourceEnd` 後に聴こえる音声の長さ（秒）。
 * **`electron/ffmpeg.ts` の `audDur`** とプレビュー fade のタイムボックスを共通にする。
 */
export function audioClipTrimDurationSec(clip: AudioClip): number {
  const ss = clip.sourceStart ?? 0
  const se = clip.sourceEnd ?? 0
  return Math.max(1e-4, se - ss)
}

/**
 * IN/OUT の片方のフェード長を正規化（負・非有限は 0、上限は `clipDuration`）。
 */
export function normalizeAudioFadeDuration(value: unknown, clipDuration: number): number {
  const d = Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : 1e-4
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const v = Math.max(0, value)
  return Math.min(v, d)
}

/**
 * `electron/ffmpeg.ts` の `audioFadeAffixes` と同一運用：
 * IN/OUT を `trimmedDurationSec` で個別キャップ後、合計が超えれば同率で縮小。
 */
export function resolveNormalizedAudioFadeLengths(
  fadeIn: unknown,
  fadeOut: unknown,
  trimmedDurationSec: number,
): { fadeInSec: number; fadeOutSec: number } {
  const d = Math.max(1e-4, trimmedDurationSec)
  let fin = normalizeAudioFadeDuration(fadeIn, d)
  let fout = normalizeAudioFadeDuration(fadeOut, d)
  if (fin + fout > d) {
    const s = d / (fin + fout)
    fin *= s
    fout *= s
  }
  return { fadeInSec: fin, fadeOutSec: fout }
}

/**
 * プレビュー用: フェード込み振幅係数（0〜1）。
 *
 * **preview（本関数）**
 * - Web Audio 側で **線形ゲイン**（0〜1）を掛ける。入りは `t/fadeIn`、出は `(duration−t)/fadeOut` のランプを **乗算**（`rin * rout`）。
 *
 * **export（`electron/ffmpeg.ts`）**
 * - 同一クリップに対し **`afade=t=in`** と **`afade=t=out`** をフィルタチェーンに直列配置（`curve=` は未指定 → FFmpeg 既定、多くの版で振幅の三角系ランプに近い）。
 *
 * **preview と export の関係**
 * - 現状は **カーブの完全一致を狙わない**（体感上「フェードが効く」ことと、**フェード長の解釈が大きくズレない**ことを優先）。
 * - **フェード秒数の正規化**（各辺をトリム尺でキャップし、`fadeIn+fadeOut` が尺を超えるときの **同率縮小**）は **`resolveNormalizedAudioFadeLengths`** で export と共有する。
 *
 * 回帰: `npm run fixture:phase-b:verify` の **`phase-b-fade-in-out`** で export 音声の区間 `mean_volume` を緩く検査（詳細は `fixtures/export/phase-b/README.md`）。
 */
export function calculateAudioFadeGain(params: {
  localTime: number
  duration: number
  fadeIn?: number
  fadeOut?: number
}): number {
  const duration = Number.isFinite(params.duration) ? Math.max(1e-4, params.duration) : 1e-4
  const tRaw = typeof params.localTime === 'number' && Number.isFinite(params.localTime) ? params.localTime : 0
  const t = Math.min(Math.max(tRaw, 0), duration)
  const { fadeInSec: fin, fadeOutSec: fout } = resolveNormalizedAudioFadeLengths(
    params.fadeIn,
    params.fadeOut,
    duration,
  )
  const eps = 1e-5
  let rin = 1
  if (fin > eps) {
    rin = Math.max(0, Math.min(1, t / fin))
  }
  let rout = 1
  if (fout > eps) {
    const stOut = duration - fout
    if (t >= stOut)
      rout = Math.max(0, Math.min(1, (duration - t) / fout))
  }
  return rin * rout
}
