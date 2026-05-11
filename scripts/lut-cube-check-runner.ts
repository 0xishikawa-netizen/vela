/**
 * `lutCube.parseCubeLut` の純粋関数検証（DOM / Electron 不要）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCubeLut } from '../src/lib/lutCube'
import {
  PREVIEW_LUT_ATLAS_MAX_SIZE,
  buildPreviewLutAtlasRgba,
  previewLutAtlasDimensions,
  previewLutShouldSkipAtlasReupload,
} from '../src/lib/previewLutAtlas'
import { makePreviewLutCacheKey, makePreviewLutCacheKeyFromReadResult } from '../src/lib/previewLut'
import {
  PREVIEW_LUT_DPR_MAX,
  clampPreviewLutDpr,
  previewLutCanvasBackingSize,
  previewLutObjectContainDisplaySize,
} from '../src/lib/previewLutLayout'
import {
  lutPreviewIsDisabled,
  lutPreviewShowLutOverlay,
  previewLookStyleTarget,
} from '../src/lib/previewLutPreviewUi'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const identityCube = join(repoRoot, 'fixtures', 'export', 'phase-a', 'media', 'identity-lut.cube')
const warmStrongCube = join(repoRoot, 'fixtures', 'export', 'phase-c', 'media', 'warm-strong-lut.cube')

function run(): void {
  const withComments = `
# header comment
TITLE "Test LUT"

# size
LUT_3D_SIZE 2

DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

# corner colors
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`
  const p = parseCubeLut(withComments)
  assert.equal(p.title, 'Test LUT')
  assert.equal(p.size, 2)
  assert.deepEqual(p.domainMin, [0, 0, 0])
  assert.deepEqual(p.domainMax, [1, 1, 1])
  assert.equal(p.rgb.length, 8 * 3)
  assert.equal(p.rgb[0], 0)
  assert.equal(p.rgb[21], 1)

  const fileText = readFileSync(identityCube, 'utf8')
  const id = parseCubeLut(fileText)
  assert.ok(id.title?.includes('identity'), 'TITLE from fixture')
  assert.equal(id.size, 2)
  assert.equal(id.rgb.length, 8 * 3)

  assert.throws(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0\n'), /Expected 8 RGB rows/)
  assert.throws(() => parseCubeLut('LUT_3D_SIZE 3\n' + '0 0 0\n'.repeat(10)), /Expected 27 RGB rows/)
  assert.throws(() => parseCubeLut('0 0 0\n'), /Missing LUT_3D_SIZE/)

  const trailingComment = 'LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1 # end\n'
  assert.doesNotThrow(() => parseCubeLut(trailingComment))

  const emptyOk = parseCubeLut('\n\n# only\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n' + '0 0 0\n'.repeat(8).trim() + '\n')
  assert.equal(emptyOk.size, 2)

  assert.equal(makePreviewLutCacheKey('/tmp/x.cube'), '/tmp/x.cube')
  assert.equal(makePreviewLutCacheKey('/tmp/x.cube', 42), '/tmp/x.cube\n42')
  assert.equal(
    makePreviewLutCacheKey({ path: 'C:\\a\\b.cube', mtimeMs: 7, sizeBytes: 120 }),
    'C:/a/b.cube\n7\n120',
  )
  assert.equal(
    makePreviewLutCacheKeyFromReadResult('/x.cube', { mtimeMs: 3, sizeBytes: 9 }),
    '/x.cube\n3\n9',
  )

  assert.deepEqual(previewLutAtlasDimensions(2), { width: 4, height: 2 })
  assert.deepEqual(previewLutAtlasDimensions(3), { width: 9, height: 3 })
  assert.equal(previewLutAtlasDimensions(1), null)
  assert.equal(previewLutAtlasDimensions(1.5), null)
  assert.equal(previewLutAtlasDimensions(PREVIEW_LUT_ATLAS_MAX_SIZE + 1), null)

  assert.equal(previewLutShouldSkipAtlasReupload(undefined, 'a'), false)
  assert.equal(previewLutShouldSkipAtlasReupload('x', 'x'), true)
  assert.equal(previewLutShouldSkipAtlasReupload('x', 'y'), false)
  assert.equal(previewLutShouldSkipAtlasReupload('x', ''), false)

  const idParsed = parseCubeLut(readFileSync(identityCube, 'utf8'))
  const atlas = buildPreviewLutAtlasRgba(idParsed)
  assert.ok(atlas)
  assert.equal(atlas!.length, 4 * 2 * 4)
  assert.equal(atlas![0], 0)
  assert.equal(atlas![atlas!.length - 4], 255)
  assert.equal(atlas![atlas!.length - 3], 255)
  assert.equal(atlas![atlas!.length - 2], 255)

  const warmText = readFileSync(warmStrongCube, 'utf8')
  const warm = parseCubeLut(warmText)
  assert.ok(warm.title?.includes('warm-strong'), 'warm LUT TITLE')
  assert.equal(warm.size, 4)
  assert.equal(warm.rgb.length, 64 * 3)
  assert.deepEqual(warm.domainMin, [0, 0, 0])
  assert.deepEqual(warm.domainMax, [1, 1, 1])
  assert.ok(Math.abs(warm.rgb[0]! - 0.15) < 1e-5)
  assert.equal(warm.rgb[1], 0)
  assert.equal(warm.rgb[2], 0)
  const lastIdx = (4 * 4 * 4 - 1) * 3
  assert.equal(warm.rgb[lastIdx], 1)
  assert.equal(warm.rgb[lastIdx + 1], 1)
  assert.ok(Math.abs(warm.rgb[lastIdx + 2]! - 0.5) < 1e-5)

  assert.equal(lutPreviewIsDisabled(false, true), true)
  assert.equal(lutPreviewIsDisabled(true, false), true)
  assert.equal(lutPreviewIsDisabled(true, true), false)

  assert.equal(previewLookStyleTarget('disabled'), 'source')
  assert.equal(previewLookStyleTarget('loading'), 'source')
  assert.equal(previewLookStyleTarget('fallback'), 'source')
  assert.equal(previewLookStyleTarget('ready'), 'lutCanvas')

  assert.equal(lutPreviewShowLutOverlay('disabled'), false)
  assert.equal(lutPreviewShowLutOverlay('ready'), true)

  assert.equal(clampPreviewLutDpr(0), 1)
  assert.equal(clampPreviewLutDpr(1), 1)
  assert.equal(clampPreviewLutDpr(2), 2)
  assert.equal(clampPreviewLutDpr(PREVIEW_LUT_DPR_MAX + 10), PREVIEW_LUT_DPR_MAX)
  assert.equal(clampPreviewLutDpr(Number.NaN), 1)

  assert.deepEqual(previewLutObjectContainDisplaySize(10, 10, 20, 10), { displayCssW: 10, displayCssH: 5 })
  assert.deepEqual(previewLutObjectContainDisplaySize(10, 10, 10, 20), { displayCssW: 5, displayCssH: 10 })
  assert.equal(previewLutObjectContainDisplaySize(0, 10, 1, 1), null)
  assert.equal(previewLutObjectContainDisplaySize(10, 10, 0, 1), null)

  assert.deepEqual(previewLutCanvasBackingSize(100, 50, 2), { width: 200, height: 100 })
  assert.equal(previewLutCanvasBackingSize(-1, 10, 2), null)
}

run()
console.info('[lut-cube-check] PASS')
