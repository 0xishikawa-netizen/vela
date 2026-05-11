/**
 * Phase D-1: `exportVideoEncoder` の純粋 assert（CI・実機 GPU 不要）。
 */
import assert from 'node:assert/strict'

import {
  exportEncoderOptionAvailable,
  resolveExportVideoEncoder,
} from '../src/lib/exportVideoEncoder'

function run(): void {
  const h264 = 'h264' as const
  const h265 = 'h265' as const

  const dAuto = resolveExportVideoEncoder(h264, 'auto', 'darwin')
  assert.equal(dAuto.encoderKind, 'videotoolbox')
  assert.ok(dAuto.vcodec.includes('videotoolbox'))
  assert.equal(dAuto.usePresetLibx, false)

  const wAuto = resolveExportVideoEncoder(h264, 'auto', 'win32')
  assert.equal(wAuto.encoderKind, 'nvenc')
  assert.ok(wAuto.vcodec.includes('nvenc'))

  const lAuto = resolveExportVideoEncoder(h265, 'auto', 'linux')
  assert.equal(lAuto.encoderKind, 'libx')
  assert.equal(lAuto.vcodec, 'libx265')

  const off = resolveExportVideoEncoder(h264, 'off', 'darwin')
  assert.equal(off.vcodec, 'libx264')
  assert.equal(off.usePresetLibx, true)

  const vtWin = resolveExportVideoEncoder(h264, 'videotoolbox', 'win32')
  assert.equal(vtWin.encoderKind, 'libx')
  assert.equal(vtWin.vcodec, 'libx264')

  const nvLinux = resolveExportVideoEncoder(h264, 'nvenc', 'linux')
  assert.equal(nvLinux.encoderKind, 'nvenc')

  const amfWin = resolveExportVideoEncoder(h265, 'amf', 'win32')
  assert.equal(amfWin.encoderKind, 'amf')
  assert.ok(amfWin.vcodec.includes('amf'))

  const amfLinux = resolveExportVideoEncoder(h264, 'amf', 'linux')
  assert.equal(amfLinux.encoderKind, 'libx')

  const qsv = resolveExportVideoEncoder(h264, 'qsv', 'win32')
  assert.equal(qsv.encoderKind, 'qsv')
  assert.ok(qsv.extraAfterBitrate.includes('medium'))

  assert.equal(exportEncoderOptionAvailable('off', 'linux'), true)
  assert.equal(exportEncoderOptionAvailable('auto', 'linux'), true)
  assert.equal(exportEncoderOptionAvailable('videotoolbox', 'darwin'), true)
  assert.equal(exportEncoderOptionAvailable('videotoolbox', 'win32'), false)
  assert.equal(exportEncoderOptionAvailable('nvenc', 'win32'), true)
  assert.equal(exportEncoderOptionAvailable('amf', 'darwin'), false)
}

run()
console.info('[export-encoder-check] PASS')
