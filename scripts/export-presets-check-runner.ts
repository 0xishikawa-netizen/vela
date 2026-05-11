/**
 * Phase D-2: `exportPresets` の純粋 assert（GPU / FFmpeg 不要）。
 */
import assert from 'node:assert/strict'

import type { ExportPresetId } from '../src/lib/exportPresets'
import {
  EXPORT_PRESET_DEFINITIONS,
  resolveExportPresetSettings,
  sanitizeExportPresetId,
} from '../src/lib/exportPresets'

const FIXED: Exclude<ExportPresetId, 'custom'>[] = ['web_1080p', 'web_720p', 'sns_1080p', 'archive_4k']

const EXPECT: Record<Exclude<ExportPresetId, 'custom'>, { w: number; h: number; fps: number; br: string; c: 'h264' | 'h265' }> = {
  web_1080p: { w: 1920, h: 1080, fps: 30, br: '10000k', c: 'h264' },
  web_720p: { w: 1280, h: 720, fps: 30, br: '5000k', c: 'h264' },
  sns_1080p: { w: 1920, h: 1080, fps: 30, br: '12000k', c: 'h264' },
  archive_4k: { w: 3840, h: 2160, fps: 30, br: '45000k', c: 'h265' },
}

function run(): void {
  for (const id of FIXED) {
    const p = resolveExportPresetSettings(id, { width: 99999 })
    const e = EXPECT[id]
    assert.equal(p.width, e.w, id)
    assert.equal(p.height, e.h, id)
    assert.equal(p.fps, e.fps, id)
    assert.equal(p.bitrate, e.br, id)
    assert.equal(p.codec, e.c, id)
  }

  const customBase = resolveExportPresetSettings('custom', null)
  const defC = EXPORT_PRESET_DEFINITIONS.custom
  assert.equal(customBase.width, defC.width)
  assert.equal(customBase.height, defC.height)

  const customOv = resolveExportPresetSettings('custom', { width: 720, bitrate: '2000k', codec: 'h265' })
  assert.equal(customOv.width, 720)
  assert.equal(customOv.bitrate, '2000k')
  assert.equal(customOv.codec, 'h265')
  assert.equal(customOv.height, defC.height)

  assert.equal(sanitizeExportPresetId('unknown'), 'custom')
  assert.equal(sanitizeExportPresetId(null), 'custom')
  assert.equal(sanitizeExportPresetId('youtube_hd'), 'web_1080p')
  assert.equal(sanitizeExportPresetId('youtube_4k'), 'archive_4k')
  assert.equal(sanitizeExportPresetId('twitter'), 'web_720p')
  assert.equal(sanitizeExportPresetId('tiktok'), 'sns_1080p')
  assert.equal(sanitizeExportPresetId('instagram_reel'), 'sns_1080p')
}

run()
console.log('export-presets check: ok')
