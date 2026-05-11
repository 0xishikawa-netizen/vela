/**
 * Phase C-1 / C-3: `previewLook`・`colorGradeFfmpeg` 純粋関数の軽量回帰（DOM / Electron なし）。
 * `npm run check:preview-look` から esbuild バンドル後に実行。
 */
import assert from 'node:assert/strict'

import { buildColorGradeFfmpegFilterParts } from '../src/lib/colorGradeFfmpeg'
import {
  buildCssFilterFromColorGrade,
  buildCssFilterFromPreset,
  buildCssTemperatureApprox,
  buildPreviewLookCssFilter,
  buildPreviewLookStyle,
} from '../src/lib/previewLook'

function assertNoLutLeak(css: string, ctx: string) {
  const lower = css.toLowerCase()
  assert.ok(!lower.includes('lut3d'), `${ctx}: must not reference lut3d`)
  assert.ok(!lower.includes('.cube'), `${ctx}: must not reference .cube`)
  assert.ok(!lower.includes('url('), `${ctx}: must not use url() (LUT は CSS では扱わない)`)
}

function run(): void {
  assert.equal(buildPreviewLookCssFilter({ filter: 'none' }), '')
  assert.deepEqual(buildPreviewLookStyle({ filter: 'none' }), {})

  assert.equal(buildPreviewLookCssFilter({}), '')
  assert.deepEqual(buildPreviewLookStyle({}), {})
  assert.equal(buildPreviewLookCssFilter({ filter: undefined, colorGrade: undefined }), '')
  assert.deepEqual(buildPreviewLookStyle({ filter: undefined, colorGrade: undefined }), {})

  const bOnly = buildPreviewLookCssFilter({
    filter: 'none',
    colorGrade: { brightness: 10, contrast: 0, saturation: 0 },
  })
  assert.match(bOnly, /brightness\(110%\)/)
  assert.ok(!bOnly.includes('contrast('))
  assert.ok(!bOnly.includes('saturate('))
  assertNoLutLeak(bOnly, 'brightness-only')

  const cOnly = buildPreviewLookCssFilter({
    filter: 'none',
    colorGrade: { brightness: 0, contrast: -15, saturation: 0 },
  })
  assert.match(cOnly, /contrast\(85%\)/)
  assertNoLutLeak(cOnly, 'contrast-only')

  const sOnly = buildPreviewLookCssFilter({
    filter: 'none',
    colorGrade: { brightness: 0, contrast: 0, saturation: 20 },
  })
  assert.match(sOnly, /saturate\(120%\)/)
  assertNoLutLeak(sOnly, 'saturation-only')

  const allGrade = buildPreviewLookCssFilter({
    filter: 'none',
    colorGrade: { brightness: 5, contrast: 10, saturation: -10 },
  })
  assert.match(allGrade, /brightness\(105%\)/)
  assert.match(allGrade, /contrast\(110%\)/)
  assert.match(allGrade, /saturate\(90%\)/)
  assertNoLutLeak(allGrade, 'all-grade')

  assert.equal(buildCssFilterFromColorGrade(undefined), '')
  assert.equal(buildCssFilterFromColorGrade({}), '')
  assert.equal(
    buildCssFilterFromColorGrade({ brightness: 0.005, contrast: 0, saturation: 0 }),
    '',
    'below 0.01 should omit brightness',
  )

  const hueOnly = buildCssFilterFromColorGrade({
    hue: 72,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
  })
  assert.match(hueOnly, /hue-rotate\(72\.0deg\)/)
  assert.ok(!hueOnly.includes('sepia('), 'hue-only must not add temperature sepia')
  assertNoLutLeak(hueOnly, 'hue-only')

  assert.equal(buildCssTemperatureApprox(0), '')
  assert.equal(buildCssTemperatureApprox(0.3), '')
  const warmT = buildCssTemperatureApprox(50)
  assert.match(warmT, /sepia\(/)
  assert.match(warmT, /saturate\(/)
  const coolT = buildCssTemperatureApprox(-40)
  assert.match(coolT, /hue-rotate\(/)
  assertNoLutLeak(warmT, 'temp-warm')
  assertNoLutLeak(coolT, 'temp-cool')

  const tempWarmGrade = buildCssFilterFromColorGrade({
    hue: 0,
    temperature: 55,
    brightness: 0,
    contrast: 0,
    saturation: 0,
  })
  assert.match(tempWarmGrade, /sepia\(/)
  assert.ok(!tempWarmGrade.includes('hue-rotate'), 'warm temp uses sepia path only')

  const tempCoolGrade = buildCssFilterFromColorGrade({
    temperature: -50,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
  })
  assert.match(tempCoolGrade, /hue-rotate\(/)

  assert.equal(
    buildCssFilterFromColorGrade({
      hue: 0,
      temperature: 0,
      brightness: 0,
      contrast: 0,
      saturation: 0,
    }),
    '',
    'all grade defaults → empty CSS',
  )
  assert.equal(buildCssFilterFromColorGrade({ hue: 0.005 }), '', 'hue below eps omitted')

  const bThenHue = buildCssFilterFromColorGrade({
    brightness: 10,
    hue: 45,
    contrast: 0,
    saturation: 0,
    temperature: 0,
  })
  assert.ok(
    bThenHue.indexOf('brightness') < bThenHue.indexOf('hue-rotate'),
    'eq-equivalent before hue in CSS grade string',
  )

  assert.equal(buildCssFilterFromPreset('none'), '')
  assert.equal(buildCssFilterFromPreset(undefined), '')
  assert.equal(buildCssFilterFromPreset('bw'), 'grayscale(100%)')

  const warm = buildCssFilterFromPreset('warm')
  assert.ok(warm.includes('sepia('), 'preset warm')
  assertNoLutLeak(warm, 'preset-warm')

  const combined = buildPreviewLookCssFilter({
    filter: 'vivid',
    colorGrade: { brightness: 0, contrast: 0, saturation: 10 },
  })
  assert.ok(combined.startsWith('saturate(1.35)'), 'preset before grade (vivid prefix)')
  assert.match(combined, /saturate\(110%\)/, 'grade after preset')
  assertNoLutLeak(combined, 'combined')

  const style = buildPreviewLookStyle({ filter: 'cinematic', colorGrade: { brightness: 0 } })
  assert.ok('filter' in style && typeof style.filter === 'string' && style.filter.length > 0)
  assert.equal(Object.keys(style).length, 1, 'style should only set filter (no LUT props)')
  assertNoLutLeak(style.filter as string, 'buildPreviewLookStyle')

  /** `VideoFilter` 全種（型と並びを揃える。未知は default で ''） */
  const allVideoFilters = [
    'none',
    'cinematic',
    'vintage',
    'sepia',
    'bw',
    'warm',
    'cool',
    'vivid',
    'matte',
    'fade',
  ] as const
  for (const f of allVideoFilters) {
    const css = buildPreviewLookCssFilter({ filter: f })
    assertNoLutLeak(css, `filter=${f}`)
    if (f === 'none') assert.equal(css, '', 'none は空')
    else assert.ok(css.length > 0, `${f} は非空の CSS 断片`)
  }

  assert.equal(buildCssFilterFromPreset('not-a-preset' as 'none'), '', '未知キーは空（LUT 等を足さない）')

  const gradeOnlyStyle = buildPreviewLookStyle({
    filter: 'none',
    colorGrade: { brightness: -20, contrast: 0, saturation: 0 },
  })
  assert.equal(Object.keys(gradeOnlyStyle).length, 1)
  assert.match(String(gradeOnlyStyle.filter), /brightness\(80%\)/)

  assert.deepEqual(buildColorGradeFfmpegFilterParts(undefined), [])
  assert.deepEqual(buildColorGradeFfmpegFilterParts({}), [])
  const ffHue = buildColorGradeFfmpegFilterParts({ hue: 45 })
  assert.equal(ffHue.length, 1)
  assert.match(ffHue[0], /^hue=h=/)
  const ffTemp = buildColorGradeFfmpegFilterParts({ temperature: -35 })
  assert.equal(ffTemp.length, 1)
  assert.match(ffTemp[0], /^colorbalance=rm=/)
  const ffOrder = buildColorGradeFfmpegFilterParts({
    hue: 12,
    temperature: 20,
    brightness: 8,
    contrast: 0,
    saturation: 0,
  })
  assert.equal(ffOrder.length, 3)
  assert.match(ffOrder[0], /^eq=/)
  assert.match(ffOrder[1], /^hue=h=/)
  assert.match(ffOrder[2], /^colorbalance=/)
}

run()
console.info('[preview-look-check] PASS')
