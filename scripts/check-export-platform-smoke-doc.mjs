#!/usr/bin/env node
/**
 * docs/export-platform-smoke.md に必須セクション・キーワードがあることを検証（GPU 不要）。
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const docPath = path.join(repoRoot, 'docs', 'export-platform-smoke.md')

if (!existsSync(docPath)) {
  console.error('[check:export-platform-smoke-doc] missing:', docPath)
  process.exit(1)
}

const text = readFileSync(docPath, 'utf8')

/** 見出し・用語（配布前チェックの網羅性） */
const required = [
  '## 共通確認',
  '## macOS',
  '## Windows',
  '## Linux',
  '## 失敗時',
  'web_1080p',
  'custom',
  'faststart',
  'VAAPI',
  '診断ログ',
  'プリセット',
  'フォールバック',
  '1 回',
  'VideoToolbox',
  'NVENC',
  'Software H.264',
  'Software H.265',
  'ASS',
  'LUT',
  'ColorGrade',
  'npm run fixture:phase-a:verify',
  'check:export-platform-smoke-doc',
]

let failed = false
for (const s of required) {
  if (!text.includes(s)) {
    console.error(`[check:export-platform-smoke-doc] missing substring: ${JSON.stringify(s)}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log('[check:export-platform-smoke-doc] PASS')
