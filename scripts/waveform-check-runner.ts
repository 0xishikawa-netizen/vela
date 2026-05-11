/**
 * 単体確認: `waveformAlgo`・キャッシュ・`loadWaveformPeaksForPath` の一部（Node 内で並列 FFmpeg 無し）。
 * `npm run check:waveform` から実行。
 */
import assert from 'node:assert/strict'

import {
  clearWaveformPeakCache,
  loadWaveformPeaksForPath,
  waveformPeakCacheSize,
} from '../src/lib/waveform'
import {
  generateWaveformPeaksFromChannels,
  sliceWaveformPeaksForClipData,
  sliceWaveformPeaksSegments,
  type WaveformPeaks,
} from '../src/lib/waveformAlgo'

function assertNormalized01(peaks: readonly number[]) {
  for (const p of peaks) {
    assert(Number.isFinite(p), `non-finite peak: ${p}`)
    assert(p >= 0 && p <= 1, `out of 0..1: ${p}`)
  }
}

function runWaveformChecksSync(): void {
  /* generateWaveformPeaksFromChannels */
  const L = 960
  const L2 = 480
  const ch0 = new Float32Array(L)
  const ch1 = new Float32Array(L)
  for (let i = 0; i < L; i++) {
    ch0[i] = Math.sin((i / L) * Math.PI * 8) * 0.5
    ch1[i] = -ch0[i]! * 0.25
  }
  const gen = generateWaveformPeaksFromChannels([ch0, ch1], L / 48000, { targetBuckets: 128 })
  assert.equal(gen.peaks.length, 128)
  assert.equal(gen.sampleCount, 128)
  assert.equal(gen.duration, L / 48000)
  assertNormalized01(gen.peaks)

  const mono = generateWaveformPeaksFromChannels([ch0.slice(0, L2)], 0.42, { targetBuckets: 64 })
  assert.equal(mono.peaks.length, 64)
  assertNormalized01(mono.peaks)

  /* empty channels */
  const emp = generateWaveformPeaksFromChannels([], 1)
  assert.equal(emp.peaks.length, 1)
  assertNormalized01(emp.peaks)

  /* sliceWaveformPeaksSegments */
  const linear: number[] = []
  for (let i = 0; i < 100; i++) linear.push(i / 99)

  const dur = 10
  assert.deepEqual(sliceWaveformPeaksSegments([], dur, 0, 10), [])
  assert.deepEqual(sliceWaveformPeaksSegments(linear, 0, 0, 10), [])
  assert.deepEqual(sliceWaveformPeaksSegments(linear, -3, 0, 10), [])
  /** `WaveformPeaks.duration` が 0 のときは描画相当で空 */
  assert.deepEqual(sliceWaveformPeaksForClipData({ peaks: linear, duration: 0, sampleCount: linear.length }, 0, 10), [])
  /** 全体 */
  let s = sliceWaveformPeaksSegments(linear, dur, 0, 10)
  assert(s.length > 2 && s.length <= linear.length)
  assertNormalized01(s)
  /** 一部 */
  s = sliceWaveformPeaksSegments(linear, dur, 2.5, 7.5)
  assert(s.length >= 2 && s.length < linear.length)
  assertNormalized01(s)
  /** clip が waveform duration をはみ出す */
  s = sliceWaveformPeaksSegments(linear, dur, 9, 200)
  assert(s.length >= 1)
  assertNormalized01(s)
  /** peaks 単一要素 */
  s = sliceWaveformPeaksSegments([0.4], dur, 0, 99)
  assert.equal(s.length, 1)

  /** sliceWaveformPeaksForClipData（フェード値は algo 層には渡さない／UI とは独立） */
  const wf: WaveformPeaks = { peaks: linear, duration: dur, sampleCount: linear.length }
  s = sliceWaveformPeaksForClipData(wf, 1, 3)
  assert(s.length >= 1)
  assertNormalized01(s)

  /** ソース範囲が逆でも例外にしない（極小スライス） */
  assert.doesNotThrow(() => {
    const t = sliceWaveformPeaksForClipData(wf, 8, 2)
    assertNormalized01(t)
  })

  /* waveform cache API */
  const before = waveformPeakCacheSize()
  clearWaveformPeakCache()
  assert.equal(waveformPeakCacheSize(), 0)
  clearWaveformPeakCache()
  assert.equal(waveformPeakCacheSize(), 0)
  void before
}

async function runLoadSmoke(): Promise<void> {
  clearWaveformPeakCache()
  let gw = 0
  const gf = async () => {
    gw++
    return [0.1, 0.8, 0.2]
  }
  const once = await loadWaveformPeaksForPath('_dummy.wav', {
    readAudioFileForWaveform: async () => ({ ok: false, reason: 'error' }),
    getWaveform: gf,
  })
  assert(once)
  assert(once.peaks.length > 0)
  assertNormalized01(once.peaks)
  assert.equal(gw, 1)

  await loadWaveformPeaksForPath('_dummy.wav', {
    readAudioFileForWaveform: async () => ({ ok: false, reason: 'error' }),
    getWaveform: gf,
  })
  assert.equal(gw, 1)

  clearWaveformPeakCache()
  await loadWaveformPeaksForPath('_dummy.wav', {
    readAudioFileForWaveform: async () => ({ ok: false, reason: 'error' }),
    getWaveform: gf,
  })
  assert.equal(gw, 2)
}

async function main(): Promise<void> {
  runWaveformChecksSync()
  await runLoadSmoke()
  console.info('[waveform-check] PASS')
}

await main()
