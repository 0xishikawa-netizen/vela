#!/usr/bin/env node
/**
 * ビルド済み main の ffmpeg チャンクから exportVideo を読み込み、
 * fixtures/export/phase-a/prepared/*.json を順に書き出す（Electron UI 不要）。
 *
 * 前提: npm run build 済み（out/main/chunks/ffmpeg-*.js が存在すること）
 */
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const preparedDir = join(repoRoot, 'fixtures', 'export', 'phase-a', 'prepared')
const outDir = join(repoRoot, 'fixtures', 'export', 'phase-a', 'out')

/** 書き出し時に隣接 xfade を有効にする fixture（ExportModal のクロスフェード相当） */
const XFADE_PROJECT_IDS = new Set(['phase-a-xfade', 'phase-a-xfade-no-clip-transition'])
const CROSSFADE_SEC = 0.35

/** カンマ区切り project id。トラブル時に個別除外するために予約（通常はすべて書き出す）。 */
const SKIP_IDS = new Set(
  (process.env.VELA_PHASE_A_SKIP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

function findFfmpegChunk() {
  const chunksDir = join(repoRoot, 'out', 'main', 'chunks')
  if (!existsSync(chunksDir)) return null
  const f = readdirSync(chunksDir).find((name) => name.startsWith('ffmpeg-') && name.endsWith('.js'))
  return f ? join(chunksDir, f) : null
}

async function loadExportVideo() {
  const chunkPath = findFfmpegChunk()
  if (!chunkPath) {
    console.error('[export-phase-a] ffmpeg chunk not found. Run: npm run build')
    process.exit(1)
  }
  const mod = await import(pathToFileURL(chunkPath).href)
  if (typeof mod.exportVideo !== 'function') {
    console.error('[export-phase-a] exportVideo not exported from', chunkPath)
    process.exit(1)
  }
  return mod.exportVideo
}

function buildSettings(project, projectId) {
  const { width, height } = project.resolution
  const fps = typeof project.fps === 'number' && project.fps > 0 ? project.fps : 30
  const useXfade = XFADE_PROJECT_IDS.has(projectId)
  return {
    outputPath: join(outDir, `${projectId}.mp4`),
    format: 'custom',
    preset: {
      label: 'fixture',
      width,
      height,
      fps,
      bitrate: '4000k',
      codec: 'h264',
    },
    includeAudio: true,
    crossfadeAdjacent: useXfade,
    crossfadeDurationSec: CROSSFADE_SEC,
    audioPostMix: 'none',
    videoEncoder: 'off',
  }
}

async function main() {
  const exportVideo = await loadExportVideo()
  mkdirSync(outDir, { recursive: true })

  const jsonFiles = readdirSync(preparedDir).filter((f) => f.startsWith('phase-a-') && f.endsWith('.json'))
  if (jsonFiles.length === 0) {
    console.error('[export-phase-a] no prepared JSON in', preparedDir, '— run npm run fixture:phase-a:prepare')
    process.exit(1)
  }

  const failures = []
  let okCount = 0
  let skipCount = 0
  for (const file of jsonFiles.sort()) {
    const full = join(preparedDir, file)
    let project
    try {
      project = JSON.parse(readFileSync(full, 'utf8'))
    } catch (e) {
      failures.push({ file, error: e })
      console.error('[export-phase-a] parse failed', file, e)
      continue
    }
    const id = typeof project.id === 'string' ? project.id : file.replace(/\.json$/, '')
    if (SKIP_IDS.has(id)) {
      skipCount++
      console.log(`[export-phase-a] ${id} … skip (VELA_PHASE_A_SKIP_IDS)`)
      continue
    }
    const settings = buildSettings(project, id)
    if (process.env.VELA_PHASE_A_DEBUG === '1' || process.env.VELA_EXPORT_DEBUG === '1') {
      process.env.VELA_PHASE_A_DEBUG_PROJECT_ID = id
    }
    process.stdout.write(`[export-phase-a] ${id} … `)
    try {
      await exportVideo(project, settings, () => {})
      okCount++
      console.log('ok →', settings.outputPath)
    } catch (e) {
      console.log('FAIL')
      failures.push({ file, id, error: e })
      console.error(e)
    }
  }

  if (failures.length) {
    console.error('[export-phase-a]', failures.length, 'failure(s)')
    process.exit(1)
  }
  console.log(
    `[export-phase-a] done: ${okCount} exported, ${skipCount} skipped (of ${jsonFiles.length} fixtures)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
