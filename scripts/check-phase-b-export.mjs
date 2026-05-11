#!/usr/bin/env node
/**
 * Phase B: 書き出し mp4 の尺を project.duration と照合し、volumedetect（全尺・左右分離・フェード区間）で音声を緩く検査する。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { path: ffprobePath } = require('ffprobe-static')
const ffmpegPath = process.env.FFMPEG_BIN?.trim() || require('ffmpeg-static')

const SKIP_IDS = new Set(
  (process.env.VELA_PHASE_B_SKIP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

/** 無音性: max がこれ以下、または -inf なら無音扱いで PASS */
const MUTE_MAX_DB = -60

/** reference mean より master がこの dB 以上下がっていれば PASS（0.5 倍 ≒ -6dB 想定、余裕あり） */
const MASTER_DROP_MIN_DB = 4

/** reference mean より clip-volume がこの dB 以上下がっていれば PASS（clip 0.2 想定） */
const CLIP_DROP_MIN_DB = 6

/**
 * pan fixture: ステレオ出力の左右を分離して mean を比較（dB）
 * direction: 'right' → R が L より十分大きい（Rmean - Lmean）
 * direction: 'left' → L が R より十分大きい（Lmean - Rmean）
 */
const PAN_EXPECTATIONS = {
  'phase-b-clip-pan-right': { direction: 'right', minDiffDb: 6 },
  'phase-b-clip-pan-left': { direction: 'left', minDiffDb: 6 },
  'phase-b-track-pan-right': { direction: 'right', minDiffDb: 6 },
  'phase-b-pan-clamp': { direction: 'right', minDiffDb: 6 },
  /** 元ステレオ素材（L/R 別周波数）でも pan が期待方向に効くこと */
  'phase-b-stereo-pan-right': { direction: 'right', minDiffDb: 6 },
  'phase-b-stereo-pan-left': { direction: 'left', minDiffDb: 6 },
}

/**
 * ステレオ基準: 各 ch の max が閾値より大きい（0 に近い＝レベルあり）。-inf / 極端な無音は fail。
 * AAC 後のブレを避けるため閾値は緩め（-60dB より「上」＝より大きい振幅）。
 */
const STEREO_REFERENCE_EXPECTATIONS = {
  'phase-b-stereo-reference': { minMaxDb: -60 },
}

const STEM_REFERENCE = 'phase-b-reference-volume'
const STEM_MUTE = 'phase-b-mute'
const STEM_MASTER = 'phase-b-master-volume'
const STEM_CLIP_VOL = 'phase-b-clip-volume'
const STEM_FADE = 'phase-b-fade-in-out'

/**
 * export の `afade` が「両端が中央より十分低い」ことを緩く見る（曲線一致はしない）。
 * dB は 0 に近いほど大きい → `middle.mean - start.mean >= 閾値` で PASS。
 */
const FADE_SEGMENT_DROP_MIN_DB = 2

function expectedDurationFromProject(json) {
  const base = json.duration
  if (typeof base !== 'number' || !Number.isFinite(base)) return null
  return base
}

function parseArgs(argv) {
  const out = {
    file: null,
    expect: null,
    epsilon: 0.55,
    fromProject: null,
    outDir: null,
    preparedDir: null,
  }
  const rest = [...argv]
  while (rest.length) {
    const a = rest.shift()
    if (a === '--expect' && rest[0]) out.expect = Number(rest.shift())
    else if (a === '--epsilon' && rest[0]) out.epsilon = Number(rest.shift())
    else if (a === '--from-project' && rest[0]) out.fromProject = rest.shift()
    else if (a === '--out-dir' && rest[0]) out.outDir = rest.shift()
    else if (a === '--prepared-dir' && rest[0]) out.preparedDir = rest.shift()
    else if (!a.startsWith('-') && !out.file) out.file = a
  }
  return out
}

function ffprobeDurationSeconds(file) {
  const r = spawnSync(
    ffprobePath,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file],
    { encoding: 'utf8' },
  )
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(r.stderr || `ffprobe exit ${r.status}`)
  const n = parseFloat(String(r.stdout).trim())
  if (!Number.isFinite(n)) throw new Error(`invalid duration: ${r.stdout}`)
  return n
}

/** volumedetect のトークンを dB 数値に（-inf は -Infinity） */
function dbTokenToNumber(tok) {
  const t = String(tok).trim().toLowerCase()
  if (t === '-inf' || t === '-infinity') return Number.NEGATIVE_INFINITY
  if (t === '+inf' || t === 'inf' || t === '+infinity' || t === 'infinity') return Number.POSITIVE_INFINITY
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : NaN
}

function formatDb(n) {
  if (n === Number.NEGATIVE_INFINITY) return '-inf'
  if (n === Number.POSITIVE_INFINITY) return '+inf'
  if (!Number.isFinite(n)) return 'NaN'
  return `${n.toFixed(1)}dB`
}

/**
 * ffmpeg volumedetect の stderr から mean / max を読む。
 * @returns {{ mean: number, max: number }}
 */
function parseVolumedetectStderr(stderr) {
  let meanRaw = null
  let maxRaw = null
  for (const line of String(stderr).split('\n')) {
    if (line.includes('mean_volume:')) {
      const m = line.match(/mean_volume:\s*([^d]+?)\s*dB/)
      if (m) meanRaw = m[1].trim()
    }
    if (line.includes('max_volume:')) {
      const m = line.match(/max_volume:\s*([^d]+?)\s*dB/)
      if (m) maxRaw = m[1].trim()
    }
  }
  if (meanRaw == null || maxRaw == null) {
    throw new Error(
      `[phase-b-check] volumedetect: mean_volume / max_volume をパースできません（ffmpeg stderr 先頭 500 文字）:\n${String(stderr).slice(0, 500)}`,
    )
  }
  const mean = dbTokenToNumber(meanRaw)
  const max = dbTokenToNumber(maxRaw)
  if (Number.isNaN(mean) || Number.isNaN(max)) {
    throw new Error(`[phase-b-check] volumedetect: 不正な dB 値 mean=${meanRaw} max=${maxRaw}`)
  }
  return { mean, max }
}

function getVolumeStats(filePath) {
  if (!ffmpegPath || !existsSync(filePath)) {
    throw new Error(`[phase-b-check] getVolumeStats: パス不正 ffmpeg=${ffmpegPath} file=${filePath}`)
  }
  const r = spawnSync(
    ffmpegPath,
    ['-nostdin', '-hide_banner', '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(r.stderr || `[phase-b-check] ffmpeg volumedetect exit ${r.status}`)
  }
  return parseVolumedetectStderr(r.stderr || '')
}

/**
 * 出力ファイルの一部区間だけを切り出して `volumedetect`（`-ss` / `-t` は入力前・軽量シーク）。
 * @returns {{ mean: number, max: number }}
 */
function getSegmentVolumeStats(filePath, startSec, durationSec) {
  if (!ffmpegPath || !existsSync(filePath)) {
    throw new Error(`[phase-b-check] getSegmentVolumeStats: パス不正 ffmpeg=${ffmpegPath} file=${filePath}`)
  }
  const ss = Math.max(0, startSec)
  const dur = Math.max(0.05, durationSec)
  const r = spawnSync(
    ffmpegPath,
    [
      '-nostdin',
      '-hide_banner',
      '-ss',
      String(ss),
      '-t',
      String(dur),
      '-i',
      filePath,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  if (r.error) throw r.error
  if (r.status !== 0) {
    const tail = String(r.stderr || '').slice(-600)
    throw new Error(`[phase-b-check] ffmpeg segment volumedetect exit ${r.status}: ${tail}`)
  }
  try {
    return parseVolumedetectStderr(r.stderr || '')
  } catch (e) {
    const tail = String(r.stderr || '').slice(-600)
    throw new Error(`${e.message || e}\nstderr tail:\n${tail}`)
  }
}

function firstAudioClipInProject(j) {
  const tracks = Array.isArray(j.tracks) ? j.tracks : []
  for (const tr of tracks) {
    if (tr.type !== 'audio') continue
    const clips = Array.isArray(tr.clips) ? tr.clips : []
    for (const c of clips) {
      if (c.type === 'audio') return c
    }
  }
  return null
}

/** `src/lib/audioMix.ts` の normalize + resolve と同じ式（Node のみで再現） */
function resolveNormalizedFadeLengthsForCheck(fadeIn, fadeOut, trimmedDurationSec) {
  const d = Math.max(1e-4, trimmedDurationSec)
  const cap = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0
    return Math.min(Math.max(0, v), d)
  }
  let fin = cap(fadeIn)
  let fout = cap(fadeOut)
  if (fin + fout > d) {
    const s = d / (fin + fout)
    fin *= s
    fout *= s
  }
  return { fadeInSec: fin, fadeOutSec: fout, trimSec: d }
}

/**
 * `phase-b-fade-in-out` の export 音声: 冒頭・中央・終端の mean を比較（緩い回帰）。
 * @returns {{ ok: boolean, msg: string }}
 */
function checkFadeInOutExportSegmentMeans(filePath, projectJson) {
  const clip = firstAudioClipInProject(projectJson)
  if (!clip) return { ok: false, msg: 'no audio clip in project json' }

  const trimSec = Math.max(1e-4, (clip.sourceEnd ?? 0) - (clip.sourceStart ?? 0))
  const { fadeInSec: fin, fadeOutSec: fout } = resolveNormalizedFadeLengthsForCheck(
    clip.fadeIn,
    clip.fadeOut,
    trimSec,
  )

  const flatStart = fin + 0.2
  const flatEnd = trimSec - fout - 0.2
  if (flatEnd - flatStart < 0.4) {
    return { ok: false, msg: `flat region too short trim=${trimSec.toFixed(3)} fin=${fin.toFixed(3)} fout=${fout.toFixed(3)}` }
  }

  const startDur = Math.min(0.65, Math.max(0.12, fin > 1e-5 ? fin * 0.88 : 0.12))
  const midDur = Math.min(1.1, flatEnd - flatStart - 0.15)
  const midStart = flatStart + (flatEnd - flatStart - midDur) * 0.5
  const fadeOutStart = trimSec - fout
  const endStart = Math.max(0, fadeOutStart - 0.1)
  const endDur = Math.min(0.95, trimSec - endStart)
  if (midDur < 0.2 || endDur < 0.12) {
    return { ok: false, msg: `bad segment layout midDur=${midDur.toFixed(3)} endDur=${endDur.toFixed(3)}` }
  }

  let startStats
  let midStats
  let endStats
  try {
    startStats = getSegmentVolumeStats(filePath, 0, startDur)
    midStats = getSegmentVolumeStats(filePath, midStart, midDur)
    endStats = getSegmentVolumeStats(filePath, endStart, endDur)
  } catch (e) {
    return { ok: false, msg: String(e.message || e) }
  }

  const sm = startStats.mean
  const mm = midStats.mean
  const em = endStats.mean
  if (!Number.isFinite(mm)) {
    return { ok: false, msg: `middle mean not finite: ${formatDb(mm)}` }
  }

  const startDrop = mm - sm
  const endDrop = mm - em
  const startOk =
    sm === Number.NEGATIVE_INFINITY
      ? true
      : Number.isFinite(sm)
        ? startDrop >= FADE_SEGMENT_DROP_MIN_DB
        : false
  const endOk =
    em === Number.NEGATIVE_INFINITY
      ? true
      : Number.isFinite(em)
        ? endDrop >= FADE_SEGMENT_DROP_MIN_DB
        : false
  const ok = startOk && endOk
  const msg =
    `fade-seg mean start=${formatDb(sm)} mid=${formatDb(mm)} end=${formatDb(em)} ` +
    `(mid-start)=${Number.isFinite(startDrop) ? `${startDrop.toFixed(1)}dB` : 'n/a'} ` +
    `(mid-end)=${Number.isFinite(endDrop) ? `${endDrop.toFixed(1)}dB` : 'n/a'} need>=${FADE_SEGMENT_DROP_MIN_DB}dB`
  return { ok, msg }
}

/**
 * ステレオの片chだけを取り出して volumedetect。
 * channel='left' は c0、'right' は c1 を参照。
 * @returns {{ mean: number, max: number }}
 */
function getChannelVolumeStats(filePath, channel) {
  if (!ffmpegPath || !existsSync(filePath)) {
    throw new Error(`[phase-b-check] getChannelVolumeStats: パス不正 ffmpeg=${ffmpegPath} file=${filePath}`)
  }
  const panExpr = channel === 'left' ? 'pan=mono|c0=c0' : 'pan=mono|c0=c1'
  const r = spawnSync(
    ffmpegPath,
    ['-nostdin', '-hide_banner', '-i', filePath, '-af', `${panExpr},volumedetect`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(r.stderr || `[phase-b-check] ffmpeg ${channel} volumedetect exit ${r.status}`)
  }
  return parseVolumedetectStderr(r.stderr || '')
}

function muteAudioPass(maxDb) {
  if (maxDb === Number.NEGATIVE_INFINITY) return true
  if (!Number.isFinite(maxDb)) return false
  return maxDb <= MUTE_MAX_DB
}

const args = parseArgs(process.argv.slice(2))

if (args.outDir) {
  const outDirAbs = resolve(args.outDir)
  const preparedAbs = resolve(args.preparedDir ?? join(outDirAbs, '..', 'prepared'))
  if (!existsSync(outDirAbs)) {
    console.error('[phase-b-check] out-dir not found:', outDirAbs)
    process.exit(1)
  }
  const mp4s = readdirSync(outDirAbs).filter((f) => f.startsWith('phase-b-') && f.endsWith('.mp4'))
  if (mp4s.length === 0) {
    console.error('[phase-b-check] no phase-b mp4 in', outDirAbs)
    process.exit(1)
  }

  const refFile = join(outDirAbs, `${STEM_REFERENCE}.mp4`)
  const stemsPresent = new Set(mp4s.map((f) => basename(f, '.mp4')))
  const needsRef =
    (stemsPresent.has(STEM_MASTER) && !SKIP_IDS.has(STEM_MASTER)) ||
    (stemsPresent.has(STEM_CLIP_VOL) && !SKIP_IDS.has(STEM_CLIP_VOL))
  if (needsRef && !SKIP_IDS.has(STEM_REFERENCE) && !existsSync(refFile)) {
    console.error(
      '[phase-b-check] phase-b-master-volume / phase-b-clip-volume には同梱の',
      `${STEM_REFERENCE}.mp4`,
      'が必要です（export を忘れていませんか）',
    )
    process.exit(1)
  }

  let refMean = null
  /** @type {{ mean: number, max: number } | null} */
  let refStats = null
  if (!SKIP_IDS.has(STEM_REFERENCE) && existsSync(refFile)) {
    try {
      refStats = getVolumeStats(refFile)
      refMean = refStats.mean
    } catch (e) {
      console.error('[phase-b-check] reference volumedetect failed:', e.message || e)
      process.exit(1)
    }
    if (!Number.isFinite(refMean)) {
      console.error('[phase-b-check] reference mean は有限の dB である必要があります:', formatDb(refMean))
      process.exit(1)
    }
  }

  let failed = 0
  for (const name of mp4s.sort()) {
    const stem = basename(name, '.mp4')
    if (SKIP_IDS.has(stem)) {
      console.log('[phase-b-check] SKIP', stem)
      continue
    }
    const projPath = join(preparedAbs, `${stem}.json`)
    if (!existsSync(projPath)) {
      console.error('[phase-b-check] missing project for', name, '→', projPath)
      failed++
      continue
    }
    const j = JSON.parse(readFileSync(projPath, 'utf8'))
    const expect = expectedDurationFromProject(j)
    if (expect == null) {
      console.error('[phase-b-check] bad duration in', projPath)
      failed++
      continue
    }
    const file = join(outDirAbs, name)
    const got = ffprobeDurationSeconds(file)
    const diff = Math.abs(got - expect)
    const durOk = diff <= args.epsilon

    let audioOk = true
    let audioMsg = ''
    let vol = null

    if (!durOk) {
      audioMsg = 'audio=skipped(duration fail)'
    } else if (stem === STEM_FADE) {
      const fr = checkFadeInOutExportSegmentMeans(file, j)
      audioOk = fr.ok
      audioMsg = fr.msg
    } else if (stem === STEM_REFERENCE && refStats) {
      vol = refStats
      audioMsg = `mean=${formatDb(vol.mean)} max=${formatDb(vol.max)} ref=baseline`
    } else {
      try {
        vol = getVolumeStats(file)
      } catch (e) {
        console.error('[phase-b-check] FAIL', stem, 'volumedetect:', e.message || e)
        failed++
        console.log(
          '[phase-b-check] FAIL',
          stem,
          `duration=${got.toFixed(2)}s`,
          'exp',
          expect.toFixed(3),
          '|Δ|',
          diff.toFixed(3),
          'audio=error',
        )
        continue
      }

      if (stem === STEM_MUTE) {
        const mp = muteAudioPass(vol.max)
        audioOk = mp
        audioMsg = `max=${formatDb(vol.max)} mean=${formatDb(vol.mean)}`
        if (!mp) audioMsg += ` (need max<=${MUTE_MAX_DB}dB or -inf)`
      } else if (PAN_EXPECTATIONS[stem]) {
        const { direction, minDiffDb } = PAN_EXPECTATIONS[stem]
        let leftStats
        let rightStats
        try {
          leftStats = getChannelVolumeStats(file, 'left')
          rightStats = getChannelVolumeStats(file, 'right')
        } catch (e) {
          audioOk = false
          audioMsg = `pan-channel-check-error: ${e.message || e}`
          leftStats = null
          rightStats = null
        }
        if (leftStats && rightStats) {
          const leftMean = leftStats.mean
          const rightMean = rightStats.mean
          /** 期待方向に応じて（強い側 mean − 弱い側 mean）。片側のみ -∞ などは ±∞。 */
          let panDiff
          if (direction === 'right') {
            if (rightMean === Number.NEGATIVE_INFINITY) panDiff = Number.NEGATIVE_INFINITY
            else if (leftMean === Number.NEGATIVE_INFINITY) panDiff = Number.POSITIVE_INFINITY
            else panDiff = rightMean - leftMean
          } else {
            if (leftMean === Number.NEGATIVE_INFINITY) panDiff = Number.NEGATIVE_INFINITY
            else if (rightMean === Number.NEGATIVE_INFINITY) panDiff = Number.POSITIVE_INFINITY
            else panDiff = leftMean - rightMean
          }
          const diffLabel = direction === 'right' ? 'R-L' : 'L-R'
          audioOk =
            Number.isFinite(panDiff) ? panDiff >= minDiffDb : panDiff === Number.POSITIVE_INFINITY
          audioMsg =
            `Lmean=${formatDb(leftMean)} Rmean=${formatDb(rightMean)} ` +
            `${diffLabel}=${Number.isFinite(panDiff) ? `${panDiff.toFixed(1)}dB` : formatDb(panDiff)} ` +
            `need>=${minDiffDb}dB dir=${direction}`
        }
      } else if (STEREO_REFERENCE_EXPECTATIONS[stem]) {
        const { minMaxDb } = STEREO_REFERENCE_EXPECTATIONS[stem]
        let leftStats
        let rightStats
        try {
          leftStats = getChannelVolumeStats(file, 'left')
          rightStats = getChannelVolumeStats(file, 'right')
        } catch (e) {
          audioOk = false
          audioMsg = `stereo-ref-channel-error: ${e.message || e}`
          leftStats = null
          rightStats = null
        }
        if (leftStats && rightStats) {
          const lMax = leftStats.max
          const rMax = rightStats.max
          const lOk = Number.isFinite(lMax) && lMax > minMaxDb
          const rOk = Number.isFinite(rMax) && rMax > minMaxDb
          audioOk = lOk && rOk
          audioMsg = `Lmax=${formatDb(lMax)} Rmax=${formatDb(rMax)} need both max>${minMaxDb}dB finite`
        }
      } else if (stem === STEM_MASTER || stem === STEM_CLIP_VOL) {
        if (refMean == null) {
          audioOk = false
          audioMsg = 'need phase-b-reference-volume.mp4 (+ prepared json)'
        } else if (!Number.isFinite(vol.mean)) {
          audioOk = false
          audioMsg = `mean=${formatDb(vol.mean)} (finite required)`
        } else {
          const drop = refMean - vol.mean
          const need = stem === STEM_MASTER ? MASTER_DROP_MIN_DB : CLIP_DROP_MIN_DB
          audioOk = drop >= need
          audioMsg = `mean=${formatDb(vol.mean)} drop=${drop.toFixed(1)}dB need>=${need}dB`
        }
      } else {
        audioMsg = `mean=${formatDb(vol.mean)} max=${formatDb(vol.max)} audio=no-specific-threshold`
      }
    }

    const allOk = durOk && audioOk
    if (!allOk) failed++

    const parts = [
      allOk ? '[phase-b-check] PASS' : '[phase-b-check] FAIL',
      stem,
      `duration=${got.toFixed(2)}s`,
    ]
    if (!durOk) parts.push(`exp=${expect.toFixed(3)}`, `|Δ|=${diff.toFixed(3)}`)
    parts.push(audioMsg)
    console.log(parts.join(' '))
  }

  process.exit(failed ? 1 : 0)
}

console.error('[phase-b-check] usage: node scripts/check-phase-b-export.mjs --out-dir ... [--prepared-dir ...]')
process.exit(2)
