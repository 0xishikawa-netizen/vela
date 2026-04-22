#!/usr/bin/env node
/**
 * ELECTRON_RUN_AS_NODE=1 のとき Electron が Node モードになり起動に失敗するため、
 * この変数を外してから子プロセスを起動する。
 *
 * 使い方:
 *   node scripts/clear-electron-run-as-node.mjs dev
 *   node scripts/clear-electron-run-as-node.mjs build
 *   node scripts/clear-electron-run-as-node.mjs exec npx electron-builder --mac
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

delete process.env.ELECTRON_RUN_AS_NODE

const sub = process.argv[2]
if (!sub) {
  console.error(
    'Usage: node scripts/clear-electron-run-as-node.mjs <dev|build|preview|exec> [...args]',
  )
  process.exit(1)
}

const env = process.env

if (sub === 'exec') {
  const cmd = process.argv[3]
  const args = process.argv.slice(4)
  if (!cmd) {
    console.error('exec の後にコマンドを指定してください')
    process.exit(1)
  }
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: true, cwd: process.cwd() })
  process.exit(r.status ?? (r.signal ? 1 : 0))
}

const ev = path.join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const extra = process.argv.slice(3)
const r = spawnSync(process.execPath, [ev, sub, ...extra], {
  stdio: 'inherit',
  env,
  cwd: process.cwd(),
})
process.exit(r.status ?? (r.signal ? 1 : 0))
