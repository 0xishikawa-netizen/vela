#!/usr/bin/env node
/**
 * Phase A 回帰用の短尺メディアを fixtures/export/phase-a/media/ に生成する。
 * ffmpeg-static（依存パッケージ）のバイナリを使用（システム ffmpeg 不要）。
 * 素材は lavfi の単色・サイン波のみ（著作権フリー）。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static')

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const outDir = join(repoRoot, 'fixtures', 'export', 'phase-a', 'media')

function runFfmpeg(args) {
  const r = spawnSync(ffmpegPath, args, { stdio: 'inherit', encoding: 'utf8' })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status ?? 1)
}

mkdirSync(outDir, { recursive: true })

const w = 640
const h = 360

console.log('[phase-a] ffmpeg:', ffmpegPath)
console.log('[phase-a] output dir:', outDir)

runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  `color=c=0x2244aa:s=${w}x${h}:r=30:d=10`,
  '-pix_fmt',
  'yuv420p',
  '-c:v',
  'libx264',
  '-t',
  '10',
  join(outDir, 'video-a.mp4'),
])

runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  `color=c=0x228822:s=${w}x${h}:r=30:d=6`,
  '-pix_fmt',
  'yuv420p',
  '-c:v',
  'libx264',
  '-t',
  '6',
  join(outDir, 'video-b.mp4'),
])

runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000:duration=1',
  '-c:a',
  'pcm_s16le',
  join(outDir, 'audio-1s.wav'),
])

runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=330:sample_rate=48000:duration=5',
  '-c:a',
  'pcm_s16le',
  join(outDir, 'audio-5s.wav'),
])

runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=220:sample_rate=48000:duration=15',
  '-c:a',
  'pcm_s16le',
  join(outDir, 'audio-15s.wav'),
])

/** Phase B: 元からステレオの入力（L=440Hz / R=880Hz）— pan / aformat=stereotools 経路の回帰用 */
runFfmpeg([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000:duration=10',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:sample_rate=48000:duration=10',
  '-filter_complex',
  '[0:a][1:a]amerge=inputs=2',
  '-c:a',
  'pcm_s16le',
  '-t',
  '10',
  join(outDir, 'stereo-lr-10s.wav'),
])

console.log('[phase-a] done. Next: npm run fixture:phase-a:prepare')
