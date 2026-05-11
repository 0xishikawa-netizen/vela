#!/usr/bin/env node
/**
 * 後方互換ラッパー: `npm run fixture:phase-a:verify` をそのまま起動するだけ。
 * **`verify:relaxed` は現在スキップしない**（恒久運用の回避用ではない）。意味は `fixtures/export/phase-a/README.md` の「npm scripts の意味」を参照。
 */
import { spawnSync } from 'node:child_process'

const r = spawnSync('npm', ['run', 'fixture:phase-a:verify'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})
process.exit(r.status ?? 1)
