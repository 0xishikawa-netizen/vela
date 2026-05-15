#!/usr/bin/env node
/**
 * docs/whisper-local-smoke.md に必須キーワードがあることを検証（実 whisper / GPU 不要）。
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const docPath = path.join(repoRoot, 'docs', 'whisper-local-smoke.md')

if (!existsSync(docPath)) {
  console.error('[check:whisper-local-smoke-doc] missing:', docPath)
  process.exit(1)
}

const text = readFileSync(docPath, 'utf8')

const required = [
  'binary',
  'model',
  'json',
  'srt',
  'vtt',
  'progress',
  'stderr',
  'exit code',
  'subtitleTracks',
  'whisper-local-smoke-doc',
]

let failed = false
for (const s of required) {
  if (!text.includes(s)) {
    console.error(`[check:whisper-local-smoke-doc] missing substring: ${JSON.stringify(s)}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log('[check:whisper-local-smoke-doc] PASS')
