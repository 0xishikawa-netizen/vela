#!/usr/bin/env node
/**
 * fixtures/export/phase-b/phase-b-*.json の <REPO_ROOT> を絶対パスに置換し prepared/ に出力。
 * メディアは Phase A と共用（先有効な npm run fixture:phase-a:media）。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const srcDir = join(repoRoot, 'fixtures', 'export', 'phase-b')
const dstDir = join(srcDir, 'prepared')

mkdirSync(dstDir, { recursive: true })

const files = readdirSync(srcDir).filter((f) => f.endsWith('.json') && f.startsWith('phase-b-'))

if (files.length === 0) {
  console.error('[phase-b] no phase-b-*.json in', srcDir)
  process.exit(1)
}

const norm = repoRoot.replace(/\\/g, '/')
for (const f of files) {
  const raw = readFileSync(join(srcDir, f), 'utf8')
  const out = raw.split('<REPO_ROOT>').join(norm)
  writeFileSync(join(dstDir, f), `${out}\n`, 'utf8')
  console.log('[phase-b] wrote', join('fixtures/export/phase-b/prepared', f))
}

console.log('[phase-b] prepared', files.length, 'files')
