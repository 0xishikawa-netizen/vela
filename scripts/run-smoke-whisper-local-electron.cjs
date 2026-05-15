#!/usr/bin/env node
/**
 * Phase E-11: `invokeWhisperLocalStart` と同一コードパスを Electron 専用 entry で叩く（CI では実行しない想定）。
 * 実 binary / model が無い場合は exit 0 でスキップ（ローカル任意）。
 */
const { spawnSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const smokeJs = path.join(root, 'out', 'main', 'smoke-whisper-local.js')

if (process.env.VELA_SKIP_WHISPER_ELECTRON_SMOKE === '1') {
  console.log('[smoke:whisper-local:electron] SKIP (VELA_SKIP_WHISPER_ELECTRON_SMOKE=1)')
  process.exit(0)
}

if (!existsSync(smokeJs)) {
  console.error('[smoke:whisper-local:electron] 先に npm run build を実行してください:', smokeJs)
  process.exit(1)
}

const defBin = '/tmp/vela-whisper-e10/repo/build/bin/whisper-cli'
const defModel = '/tmp/vela-whisper-e10/repo/models/ggml-tiny.bin'
const bin = (process.env.VELA_SMOKE_WHISPER_BIN || '').trim() || (existsSync(defBin) ? defBin : '')
const model = (process.env.VELA_SMOKE_WHISPER_MODEL || '').trim() || (existsSync(defModel) ? defModel : '')

if (!bin || !model) {
  console.log(
    '[smoke:whisper-local:electron] スキップ: VELA_SMOKE_WHISPER_BIN / VELA_SMOKE_WHISPER_MODEL または',
    defBin,
    'が見つかりません。',
  )
  process.exit(0)
}

const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt')
if (!existsSync(pathTxt)) {
  console.error('[smoke:whisper-local:electron] node_modules/electron/path.txt が見つかりません。')
  process.exit(1)
}
const rel = readFileSync(pathTxt, 'utf8').trim()
const electronExec = path.join(root, 'node_modules', 'electron', 'dist', rel)
if (!existsSync(electronExec)) {
  console.error('[smoke:whisper-local:electron] Electron 実行ファイルが見つかりません:', electronExec)
  process.exit(1)
}

const r = spawnSync(electronExec, [smokeJs], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VELA_SMOKE_WHISPER_BIN: bin,
    VELA_SMOKE_WHISPER_MODEL: model,
  },
})

process.exit(typeof r.status === 'number' ? r.status : 1)
