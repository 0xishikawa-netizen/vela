#!/usr/bin/env node
/**
 * fixtures/export/phase-a/phase-a-*.json 内の <REPO_ROOT> を実パスに置換し、
 * fixtures/export/phase-a/prepared/ に出力する（書き出しは絶対パスが必要）。
 * prepared/ は .gitignore 対象。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const srcDir = join(repoRoot, 'fixtures', 'export', 'phase-a')
const dstDir = join(srcDir, 'prepared')

mkdirSync(dstDir, { recursive: true })

const files = readdirSync(srcDir).filter((f) => f.endsWith('.json') && f.startsWith('phase-a-'))

if (files.length === 0) {
  console.error('[phase-a] no phase-a-*.json in', srcDir)
  process.exit(1)
}

const norm = repoRoot.replace(/\\/g, '/')
for (const f of files) {
  const raw = readFileSync(join(srcDir, f), 'utf8')
  const out = raw.split('<REPO_ROOT>').join(norm)
  writeFileSync(join(dstDir, f), `${out}\n`, 'utf8')
  console.log('[phase-a] wrote', join('fixtures/export/phase-a/prepared', f))
}

console.log('[phase-a] prepared', files.length, 'files')
