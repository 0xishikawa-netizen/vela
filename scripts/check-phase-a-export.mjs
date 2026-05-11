#!/usr/bin/env node
/**
 * 書き出し済み MP4 の尺を ffprobe で取り、期待秒と比較する最小チェック。
 *
 * 使用例:
 *   node scripts/check-phase-a-export.mjs ./out.mp4 --expect 10 --epsilon 0.6
 *   node scripts/check-phase-a-export.mjs ./out.mp4 --from-project fixtures/export/phase-a/prepared/phase-a-basic-telop.json --epsilon 0.6
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { path: ffprobePath } = require('ffprobe-static')

/** export-phase-a-fixtures.mjs と同じ xfade 秒（尺検証用） */
const PHASE_A_CROSSFADE_SEC = 0.35
const PHASE_A_XFADE_IDS = new Set(['phase-a-xfade', 'phase-a-xfade-no-clip-transition'])

const PHASE_A_SKIP_CHECK_IDS = new Set(
  (process.env.VELA_PHASE_A_SKIP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

function expectedDurationFromProject(json) {
  const base = json.duration
  if (typeof base !== 'number' || !Number.isFinite(base)) return null
  const id = typeof json.id === 'string' ? json.id : ''
  if (PHASE_A_XFADE_IDS.has(id)) return base - PHASE_A_CROSSFADE_SEC
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
  if (r.status !== 0) {
    throw new Error(r.stderr || `ffprobe exit ${r.status}`)
  }
  const n = parseFloat(String(r.stdout).trim())
  if (!Number.isFinite(n)) throw new Error(`invalid duration: ${r.stdout}`)
  return n
}

const args = parseArgs(process.argv.slice(2))

if (args.outDir) {
  const outDirAbs = resolve(args.outDir)
  const preparedAbs = resolve(args.preparedDir ?? join(outDirAbs, '..', 'prepared'))
  if (!existsSync(outDirAbs)) {
    console.error('[check] out-dir not found:', outDirAbs)
    process.exit(1)
  }
  const mp4s = readdirSync(outDirAbs).filter((f) => f.startsWith('phase-a-') && f.endsWith('.mp4'))
  if (mp4s.length === 0) {
    console.error('[check] no mp4 in', outDirAbs)
    process.exit(1)
  }
  let failed = 0
  for (const name of mp4s.sort()) {
    const stem = basename(name, '.mp4')
    if (PHASE_A_SKIP_CHECK_IDS.has(stem)) {
      console.log('[check] SKIP', stem, '(VELA_PHASE_A_SKIP_IDS)')
      continue
    }
    const projPath = join(preparedAbs, `${stem}.json`)
    if (!existsSync(projPath)) {
      console.error('[check] missing project for', name, '→', projPath)
      failed++
      continue
    }
    const j = JSON.parse(readFileSync(projPath, 'utf8'))
    const expect = expectedDurationFromProject(j)
    if (expect == null) {
      console.error('[check] bad duration in', projPath)
      failed++
      continue
    }
    const file = join(outDirAbs, name)
    const got = ffprobeDurationSeconds(file)
    const diff = Math.abs(got - expect)
    const ok = diff <= args.epsilon
    if (!ok) failed++
    console.log(
      ok ? '[check] PASS' : '[check] FAIL',
      stem,
      'got',
      got.toFixed(3),
      'exp',
      expect.toFixed(3),
      '|Δ|',
      diff.toFixed(3),
    )
  }
  process.exit(failed ? 1 : 0)
}

if (!args.file) {
  console.error(
    'usage: node scripts/check-phase-a-export.mjs <output.mp4> [--expect SECONDS] [--epsilon SECONDS] [--from-project path.json]',
  )
  console.error(
    '   or: node scripts/check-phase-a-export.mjs --out-dir DIR [--prepared-dir DIR] [--epsilon 0.65]',
  )
  process.exit(2)
}

const file = resolve(args.file)
if (!existsSync(file)) {
  console.error('[check] file not found:', file)
  process.exit(1)
}

let expect = args.expect
if (args.fromProject) {
  const p = resolve(args.fromProject)
  if (!existsSync(p)) {
    console.error('[check] project json not found:', p)
    process.exit(1)
  }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  expect = expectedDurationFromProject(j)
  if (expect == null) {
    console.error('[check] project.duration missing in', p)
    process.exit(1)
  }
}

if (expect == null || !Number.isFinite(expect)) {
  console.error('[check] set --expect SECONDS or --from-project with duration field')
  process.exit(2)
}

const got = ffprobeDurationSeconds(file)
const diff = Math.abs(got - expect)
const ok = diff <= args.epsilon

console.log('[check] file       ', file)
console.log('[check] duration   ', got.toFixed(3), 's')
console.log('[check] expected   ', expect.toFixed(3), 's')
console.log('[check] |delta|    ', diff.toFixed(3), 's (epsilon', args.epsilon, ')')
console.log(ok ? '[check] PASS' : '[check] FAIL')
process.exit(ok ? 0 : 1)
