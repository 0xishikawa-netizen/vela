/**
 * Phase D-3 / D-4: exportDiagnostics 純粋関数・保存ドキュメントの assert。
 */
import assert from 'node:assert/strict'

import {
  buildExportDiagnosticsSaveDocument,
  formatExportErrorSummary,
  MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS,
  parseFfmpegExitCode,
  previewFilterComplex,
  redactOrTrimArgv,
  tailStderr,
  userFacingMessageLooksSafe,
  type ExportDiagnostics,
} from '../src/lib/exportDiagnostics'

function run(): void {
  const hugeStderr = 'line\n'.repeat(500) + 'ERR final'
  const tailed = tailStderr(hugeStderr, 2000, 40)
  assert.ok(tailed.length <= 2500)
  assert.ok(tailed.includes('ERR final'))

  const longArg = '-vf ' + 'a'.repeat(500)
  const trimmed = redactOrTrimArgv(['ffmpeg', '-i', 'in.mp4', longArg, '-y', 'out.mp4'], {
    maxArgs: 10,
    maxArgLen: 80,
  })
  assert.ok(trimmed.every((s) => s.length < 200))
  assert.ok(trimmed.some((s) => s.includes('chars)')))

  const fc = '[0:v]scale=1920:1080[v];[v]format=yuv420p[outv]' + 'x'.repeat(1000)
  const prev = previewFilterComplex(fc, 80)
  assert.ok(prev.length < fc.length)
  assert.ok(prev.includes('…'))

  assert.equal(parseFfmpegExitCode('ffmpeg exited with code 1: blah'), 1)
  assert.equal(parseFfmpegExitCode('Exit code: 255'), 255)

  const softFail = formatExportErrorSummary({ exitCode: 1, retriedWithSoftware: true })
  const directFail = formatExportErrorSummary({ exitCode: 2, retriedWithSoftware: false })
  assert.notEqual(softFail, directFail)
  assert.ok(userFacingMessageLooksSafe(softFail))
  assert.ok(userFacingMessageLooksSafe(directFail))
  assert.ok(!userFacingMessageLooksSafe(softFail + '[0:v]scale=2:2;[v]null'))
  assert.ok(!userFacingMessageLooksSafe('x'.repeat(800)))

  const fcLeak = formatExportErrorSummary({ exitCode: 1 }) + ' filter_complex=evil'
  assert.ok(!userFacingMessageLooksSafe(fcLeak))

  const baseMeta = {
    timelineDurationSec: 10,
    format: 'web_1080p',
    outputPath: '/tmp/out.mp4',
    includeAudio: true,
    audioPostMix: 'none' as const,
    videoEncoder: 'auto',
    presetWidth: 1920,
    presetHeight: 1080,
    presetFps: 30,
    presetBitrate: '8000k',
    presetCodec: 'h264' as const,
    useOverlay: false,
    visualClipCount: 1,
    audioClipCount: 0,
  }
  const attempt1: ExportDiagnostics = {
    attemptPhase: 'primary',
    presetId: 'web_1080p',
    ffmpegExitCode: 1,
    stderrTail: 'err tail',
    filterComplexPreview: '[0:v]scale',
    resolvedVideoEncoderFirst: 'h264_nvenc',
    resolvedVideoEncoderFinal: 'h264_nvenc',
    hardwareFallbackAttempted: false,
  }
  const doc = buildExportDiagnosticsSaveDocument({
    generatedAtIso: '2026-01-01T00:00:00.000Z',
    appName: 'Vela',
    appVersion: '0.0.0',
    platform: 'darwin',
    debugEnvEnabled: false,
    userFacingMessage: formatExportErrorSummary({ exitCode: 1, retriedWithSoftware: false }),
    settingsSummary: baseMeta,
    attempts: [attempt1],
  })
  assert.ok(doc.includes('web_1080p'))
  assert.ok(doc.includes('Hardware fallback occurred'))
  assert.ok(doc.includes('err tail'))
  assert.ok(doc.includes('Privacy'))
  assert.ok(doc.length < MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS)

  const attemptFull: ExportDiagnostics = {
    ...attempt1,
    filterComplexFull: 'x'.repeat(5000),
    argvFull: ['ffmpeg', '-y', '-i', 'a'.repeat(300)],
  }
  const docDebug = buildExportDiagnosticsSaveDocument({
    generatedAtIso: '2026-01-01T00:00:00.000Z',
    appName: 'Vela',
    appVersion: '0.0.0',
    platform: 'linux',
    debugEnvEnabled: true,
    settingsSummary: baseMeta,
    attempts: [attemptFull],
  })
  assert.ok(docDebug.includes('xxx'))
  assert.ok(docDebug.includes('Debug env was on'))

  const docFb = buildExportDiagnosticsSaveDocument({
    generatedAtIso: '2026-01-01T00:00:00.000Z',
    appName: 'Vela',
    appVersion: '0.0.0',
    platform: 'win32',
    debugEnvEnabled: false,
    settingsSummary: baseMeta,
    attempts: [
      { ...attempt1, attemptPhase: 'primary', hardwareFallbackAttempted: false },
      {
        ...attempt1,
        attemptPhase: 'software_retry',
        hardwareFallbackAttempted: true,
        resolvedVideoEncoderFinal: 'libx264',
      },
    ],
  })
  assert.ok(docFb.includes('Hardware fallback occurred (software retry path used): yes'))
}

run()
console.log('export-diagnostics check: ok')
