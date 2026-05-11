#!/usr/bin/env node
import { buildSync } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const entry = path.join(repoRoot, 'scripts', 'subtitle-format-check-runner.ts')
const stamp = `_sub_${Date.now()}_${Math.random().toString(16).slice(2)}`
const outDir = path.join(repoRoot, 'out')
try {
  mkdirSync(outDir, { recursive: true })
} catch {
  /* noop */
}
const outfile = path.join(outDir, `${stamp}-subtitle-check.mjs`)

buildSync({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
})

try {
  await import(pathToFileURL(outfile).href)
} finally {
  try {
    rmSync(outfile)
  } catch {
    /* noop */
  }
}
