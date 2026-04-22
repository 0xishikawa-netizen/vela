import path from 'node:path'
import { createWriteStream, existsSync } from 'node:fs'
import { access, constants, readdir, readFile, mkdir, rm } from 'node:fs/promises'
import https from 'node:https'
import type { Caption } from '../src/lib/types'

const MODEL_URLS: Record<string, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function downloadUrlToFile(
  fromUrl: string,
  dest: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(fromUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        res.resume()
        if (!loc) return reject(new Error('Redirect without location'))
        return downloadUrlToFile(new URL(loc, fromUrl).href, dest, onProgress).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let received = 0
      const file = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total > 0) onProgress(Math.round((received / total) * 100))
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    })
    req.on('error', reject)
  })
}

export async function downloadModel(
  modelId: string,
  modelsDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const url = MODEL_URLS[modelId]
  if (!url) throw new Error(`Unknown model: ${modelId}`)

  const dest = path.join(modelsDir, `ggml-${modelId}.bin`)
  if (existsSync(dest)) {
    onProgress(100)
    return dest
  }

  await ensureDir(modelsDir)
  try {
    await downloadUrlToFile(url, dest, onProgress)
  } catch (e) {
    await rm(dest, { force: true }).catch(() => {})
    throw e
  }
  onProgress(100)
  return dest
}

function parseTimeToSeconds(t: string): number {
  const [hms, ms] = t.split(',')
  const [h, m, s] = hms.split(':').map(Number)
  return h * 3600 + m * 60 + s + (ms ? Number(ms) / 1000 : 0)
}

function parseSrt(content: string): Caption[] {
  const blocks = content.trim().split(/\n\s*\n/)
  const captions: Caption[] = []
  let i = 0
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue
    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue
    const [a, b] = timeLine.split('-->').map((x) => x.trim())
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim()
    if (!text) continue
    captions.push({
      id: `caption-${i++}`,
      startTime: parseTimeToSeconds(a),
      endTime: parseTimeToSeconds(b),
      text,
      isAiGenerated: true,
    })
  }
  return captions
}

export async function transcribe(
  videoPath: string,
  modelId: string,
  language: string,
  modelsDir: string,
  onProgress: (pct: number) => void,
): Promise<Caption[]> {
  onProgress(5)
  const { nodewhisper } = await import('nodejs-whisper')
  const dir = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))

  const before = new Set(await readdir(dir).catch(() => []))

  await nodewhisper(videoPath, {
    modelName: modelId,
    modelRootPath: modelsDir,
    autoDownloadModelName: modelId,
    whisperOptions: {
      outputInSrt: true,
      language: language === 'auto' ? 'auto' : language,
    },
  })

  onProgress(85)

  const after = await readdir(dir)
  const newSrts = after.filter((f) => f.endsWith('.srt') && !before.has(f))
  const srtName = newSrts.sort().pop() ?? `${base}.wav.srt`
  const srtPath = path.join(dir, srtName)
  if (!(await pathExists(srtPath))) {
    const fallback = path.join(dir, `${base}.srt`)
    if (await pathExists(fallback)) {
      const raw = await readFile(fallback, 'utf8')
      onProgress(100)
      return parseSrt(raw)
    }
    onProgress(100)
    return []
  }
  const raw = await readFile(srtPath, 'utf8')
  onProgress(100)
  return parseSrt(raw)
}
