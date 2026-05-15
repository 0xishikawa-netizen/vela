/**
 * Phase E-11: `whisperLocal:start` と同一処理（`invokeWhisperLocalStart`）を UI なしで検証する Electron main entry。
 * 既定でリポジトリの短尺 wav をメディアに使う。binary/model は環境変数で渡す（リポジトリに同梱しない）。
 *
 *   npm run build
 *   VELA_SMOKE_WHISPER_BIN=/path/to/whisper-cli VELA_SMOKE_WHISPER_MODEL=/path/to/ggml-tiny.bin npx electron out/main/smoke-whisper-local.js
 */
import { app, type WebContents } from 'electron'
import path from 'node:path'

import { invokeWhisperLocalStart } from './ipc/whisperLocal'

async function run(): Promise<void> {
  await app.whenReady()

  const bin = process.env.VELA_SMOKE_WHISPER_BIN?.trim()
  const model = process.env.VELA_SMOKE_WHISPER_MODEL?.trim()
  let media = process.env.VELA_SMOKE_WHISPER_MEDIA?.trim()
  if (!media) {
    const repoRoot = process.cwd()
    media = path.join(repoRoot, 'fixtures/export/phase-a/media/audio-1s.wav')
  }

  if (!bin || !model) {
    console.error(
      '[smoke-whisper-local] VELA_SMOKE_WHISPER_BIN と VELA_SMOKE_WHISPER_MODEL を設定してください（CI では本エントリを実行しない想定）。',
    )
    app.exit(2)
    return
  }

  const runId = `smoke-${Date.now()}`
  const sender = {
    send(channel: string, payload: unknown): void {
      if (channel === 'whisperLocal:progress') {
        console.log('[smoke-whisper-local] progress', JSON.stringify(payload))
      }
    },
  } as WebContents

  const result = await invokeWhisperLocalStart(sender, {
    runId,
    binaryPath: bin,
    modelPath: model,
    sourceMediaPath: media,
    options: { language: 'en' },
  })

  if (result.ok) {
    console.log(
      '[smoke-whisper-local] OK',
      JSON.stringify({
        rawOutputKind: result.rawOutputKind,
        segmentCount: result.segments.length,
        exitCode: result.exitCode,
        language: result.language,
      }),
    )
    app.exit(0)
  } else {
    console.error(
      '[smoke-whisper-local] FAIL',
      JSON.stringify({ kind: result.kind, errorMessage: result.errorMessage, exitCode: result.exitCode }),
    )
    app.exit(1)
  }
}

void run().catch((e) => {
  console.error(e)
  app.exit(1)
})
