/** mono peaks（0〜1）と、それがカバーするソース上の秒数 */
export type WaveformPeaks = {
  peaks: number[]
  duration: number
  sampleCount: number
}

/**
 * FFmpeg 等非 AudioBuffer 経路での duration 未定義時の下限（波形の論理長さ）
 * （`waveform.ts` の MIN と同_order。変更時は両方更新）
 */
const MIN_WAVEFORM_DURATION_SEC = 1e-4

function clampBuckets(n: number): number {
  return Math.min(512, Math.max(64, Math.round(n)))
}

/** ソース線形時間から peaks インデックスへ（t === duration のとき範囲外にならないよう緩める） */
function timeFractionToPeakIndex(timeSec: number, durationSec: number, bucketCount: number): number {
  if (bucketCount < 2) return 0
  const cap = Math.max(MIN_WAVEFORM_DURATION_SEC, durationSec)
  const r = Math.min(1 - 1e-9, Math.max(0, timeSec / cap))
  return Math.min(bucketCount - 1, Math.floor(r * bucketCount))
}

/**
 * 複数チャンネルを平均モノラル化した上でピークバケツ化・0〜1 正規化（Node / 単体確認向け）。
 * `durationSec` は呼び出し側が PCM の実時間と一致させること。
 */
export function generateWaveformPeaksFromChannels(
  channels: readonly Float32Array[],
  durationSec: number,
  options?: { targetBuckets?: number },
): WaveformPeaks {
  const targetBuckets = clampBuckets(
    typeof options?.targetBuckets === 'number' && options.targetBuckets > 0 ? options.targetBuckets : 384,
  )
  const duration =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : MIN_WAVEFORM_DURATION_SEC

  if (!channels.length) {
    return { peaks: [0.05], duration, sampleCount: 1 }
  }

  const len = Math.min(...channels.map((c) => c.length))
  if (!Number.isFinite(len) || len < 2) {
    return { peaks: [0.05], duration, sampleCount: 1 }
  }

  const mix = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    let s = 0
    for (let c = 0; c < channels.length; c++) s += channels[c]![i]!
    mix[i] = s / channels.length
  }

  const bucketSize = len / targetBuckets
  const buckets: number[] = []
  for (let b = 0; b < targetBuckets; b++) {
    const start = Math.floor(b * bucketSize)
    const end = Math.min(len, Math.floor((b + 1) * bucketSize))
    let peak = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(mix[i]!)
      if (v > peak) peak = v
    }
    buckets.push(peak)
  }
  const maxP = Math.max(...buckets, 1e-9)
  const peaks = buckets.map((p) => Math.min(1, p / maxP))
  return { peaks, duration, sampleCount: peaks.length }
}

/**
 * `waveformDurationSec` を横軸とした peaks 列から、`sourceStart`〜`sourceEnd` に対応する部分を切り出す。
 * 範囲外・NaN でも例外にしない。
 */
export function sliceWaveformPeaksSegments(
  peaks: readonly number[],
  waveformDurationSec: number,
  sourceStart: number,
  sourceEnd: number,
): number[] {
  if (!peaks.length) return []
  /** duration が無効な WaveformPeaks とみなし、視覚的に何もない扱い */
  if (!Number.isFinite(waveformDurationSec) || waveformDurationSec <= 0) return []

  const n = peaks.length
  const cap = waveformDurationSec
  const ss = typeof sourceStart === 'number' && Number.isFinite(sourceStart) ? Math.max(0, sourceStart) : 0
  const seRaw = typeof sourceEnd === 'number' && Number.isFinite(sourceEnd) ? sourceEnd : ss + 0.001
  const se = Math.max(ss + 0.001, seRaw)

  const t0 = Math.min(ss, cap)
  const t1 = Math.min(se, cap)
  const i0 = timeFractionToPeakIndex(t0, cap, n)
  const i1End = Math.min(
    n,
    Math.max(
      i0 + 1,
      Math.ceil(Math.min(1 - 1e-9, Math.max(0, t1 / cap)) * n),
    ),
  )
  return peaks.slice(i0, i1End) as number[]
}

/** `WaveformPeaks` + `AudioClip` 相当の in/out 点（フェードは slice に影響しない） */
export function sliceWaveformPeaksForClipData(
  data: WaveformPeaks,
  sourceStart: number,
  sourceEnd: number,
): number[] {
  return sliceWaveformPeaksSegments(data.peaks, data.duration, sourceStart, sourceEnd)
}
