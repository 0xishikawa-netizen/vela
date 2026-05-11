#!/usr/bin/env node
/**
 * previewLook 単体確認。esbuild で `scripts/preview-look-check-runner.ts` を Node 向けバンドルして実行。
 */
import { buildSync } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const entry = path.join(repoRoot, 'scripts', 'preview-look-check-runner.ts')
const stamp = `_pl_${Date.now()}_${Math.random().toString(16).slice(2)}`
const outDir = path.join(repoRoot, 'out')
try {
  mkdirSync(outDir, { recursive: true })
} catch {
  /* noop */
}
const outfile = path.join(outDir, `${stamp}-preview-look-check.mjs`)

buildSync({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
})

const abs = outfile

async function runBundle() {
  await import(pathToFileURL(abs).href)
}

try {
  await runBundle()
} finally {
  try {
    rmSync(abs)
  } catch {
    /* noop */
  }
}
