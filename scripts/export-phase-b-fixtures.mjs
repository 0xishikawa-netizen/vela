#!/usr/bin/env node
/**
 * prepared の phase-b-*.json を exportVideo で書き出す（Electron UI 不要）。
 * 前提: npm run build 済み
 */
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const preparedDir = join(repoRoot, 'fixtures', 'export', 'phase-b', 'prepared')
const outDir = join(repoRoot, 'fixtures', 'export', 'phase-b', 'out')

const SKIP_IDS = new Set(
  (process.env.VELA_PHASE_B_SKIP_IDS ?? '')
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
    console.error('[export-phase-b] ffmpeg chunk not found. Run: npm run build')
    process.exit(1)
  }
  const mod = await import(pathToFileURL(chunkPath).href)
  if (typeof mod.exportVideo !== 'function') {
    console.error('[export-phase-b] exportVideo not exported from', chunkPath)
    process.exit(1)
  }
  return mod.exportVideo
}

function buildSettings(project, projectId) {
  const { width, height } = project.resolution
  const fps = typeof project.fps === 'number' && project.fps > 0 ? project.fps : 30
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
    crossfadeAdjacent: false,
    audioPostMix: 'none',
    videoEncoder: 'off',
  }
}

async function main() {
  const exportVideo = await loadExportVideo()
  mkdirSync(outDir, { recursive: true })

  const jsonFiles = readdirSync(preparedDir).filter((f) => f.startsWith('phase-b-') && f.endsWith('.json'))
  if (jsonFiles.length === 0) {
    console.error('[export-phase-b] no prepared JSON — run npm run fixture:phase-b:prepare')
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
      console.error('[export-phase-b] parse failed', file, e)
      continue
    }
    const id = typeof project.id === 'string' ? project.id : file.replace(/\.json$/, '')
    if (SKIP_IDS.has(id)) {
      skipCount++
      console.log(`[export-phase-b] ${id} … skip (VELA_PHASE_B_SKIP_IDS)`)
      continue
    }
    const settings = buildSettings(project, id)
    process.stdout.write(`[export-phase-b] ${id} … `)
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
    console.error('[export-phase-b]', failures.length, 'failure(s)')
    process.exit(1)
  }
  console.log(`[export-phase-b] done: ${okCount} exported, ${skipCount} skipped (of ${jsonFiles.length})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
