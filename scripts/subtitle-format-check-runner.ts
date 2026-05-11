/**
 * Phase E-1: subtitleFormat / subtitleTelopBridge の純粋 assert。
 */
import assert from 'node:assert/strict'

import {
  applySubtitleSegmentPatch,
  flattenSubtitleTracksForExport,
  formatSecondsToSrtTimestamp,
  parseSrt,
  parseTimestampToSeconds,
  parseVtt,
  sanitizeSubtitleSegment,
  serializeSrt,
  serializeVtt,
  sortSubtitleSegmentsByStart,
  stripSimpleMarkup,
} from '../src/lib/subtitleFormat'
import type { SubtitleTrack } from '../src/lib/types'
import { subtitleSegmentsToTelopClipPayloads } from '../src/lib/subtitleTelopBridge'

function run(): void {
  assert.equal(parseTimestampToSeconds('01:02:03,456'), 3723.456)
  assert.equal(parseTimestampToSeconds('00:00:01.500'), 1.5)
  assert.ok(Number.isNaN(parseTimestampToSeconds('bad')))

  assert.equal(formatSecondsToSrtTimestamp(3661.25), '01:01:01,250')

  const srtMultiline = `1
00:00:01,000 --> 00:00:04,000
line one
line two

2
00:00:05,000 --> 00:00:06,000
single
`
  const p1 = parseSrt(srtMultiline)
  assert.equal(p1.length, 2)
  assert.ok(p1[0]!.text.includes('line one'))
  assert.ok(p1[0]!.text.includes('line two'))
  const r1 = serializeSrt(p1)
  const p1b = parseSrt(r1)
  assert.equal(p1b.length, p1.length)
  assert.equal(p1b[0]!.text, p1[0]!.text)

  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello

00:00:03.000 --> 00:00:04.000
World
`
  const pv = parseVtt(vtt)
  assert.equal(pv.length, 2)
  const rv = serializeVtt(pv)
  const pvb = parseVtt(rv)
  assert.equal(pvb.length, 2)
  assert.equal(pvb[0]!.text, 'Hello')

  const badOrder = sanitizeSubtitleSegment({
    id: 'x',
    startSec: 5,
    endSec: 2,
    text: 'a',
  })
  assert.ok(badOrder.endSec > badOrder.startSec)

  const emptyEnd = sanitizeSubtitleSegment({ id: '1', startSec: 1, endSec: 1, text: '' })
  assert.ok(emptyEnd.endSec > emptyEnd.startSec)

  assert.equal(stripSimpleMarkup('<i>Hi</i>'), 'Hi')

  const tracks: SubtitleTrack[] = [
    { id: 'a', name: 'A', segments: [{ id: '1', startSec: 2, endSec: 3, text: 'b' }] },
    { id: 'b', name: 'B', segments: [{ id: '2', startSec: 0, endSec: 1, text: 'a' }] },
  ]
  const flat = flattenSubtitleTracksForExport(tracks)
  assert.equal(flat[0]!.startSec, 0)
  assert.equal(flat[1]!.startSec, 2)

  const telopPayloads = subtitleSegmentsToTelopClipPayloads([{ id: '1', startSec: 1, endSec: 2, text: 'x' }])
  assert.equal(telopPayloads.length, 1)
  assert.equal(telopPayloads[0]!.type, 'telop')
  assert.equal(telopPayloads[0]!.timelineStart, 1)

  const base = { id: 's1', startSec: 1, endSec: 4, text: 'a' }
  const patched = applySubtitleSegmentPatch(base, { endSec: 2, text: 'b' })
  assert.equal(patched.id, 's1')
  assert.ok(patched.endSec > patched.startSec)
  assert.equal(patched.text, 'b')

  const swapped = applySubtitleSegmentPatch(
    { id: 's2', startSec: 10, endSec: 5, text: 'x' },
    {},
  )
  assert.ok(swapped.endSec > swapped.startSec)

  const sorted = sortSubtitleSegmentsByStart([
    { id: 'b', startSec: 2, endSec: 3, text: '' },
    { id: 'a', startSec: 1, endSec: 2, text: '' },
  ])
  assert.deepEqual(sorted.map((s) => s.id), ['a', 'b'])
}

run()
console.log('subtitle-format check: ok')
