/**
 * Phase E-3〜E-5: mock transcription / engine I/F / whisper local skeleton の純粋 assert。
 */
import assert from 'node:assert/strict'

import {
  applyTranscriptionCancel,
  buildMockTranscriptionSegments,
  isTranscriptionJobTerminal,
  mockTranscriptionProgressForStep,
  mockTranscriptionSegmentCountFromPath,
  validateTranscriptionSourcePath,
} from '../src/lib/mockTranscription'
import type { TranscriptionEngineRequest } from '../src/lib/transcriptionEngine'
import { runMockTranscriptionEngine, runTranscriptionEngine, runWhisperLocalTranscriptionEngine } from '../src/lib/transcriptionEngine'
import type { SubtitleTrack, TranscriptionJob } from '../src/lib/types'
import {
  buildWhisperLocalArgs,
  parseWhisperJsonOrSrtOutput,
  validateWhisperLocalConfig,
  WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED,
} from '../src/lib/whisperLocalRunner'

async function run(): Promise<void> {
  assert.equal(validateTranscriptionSourcePath('').ok, false)
  assert.equal(validateTranscriptionSourcePath('   ').ok, false)
  assert.ok(validateTranscriptionSourcePath('/tmp/x.wav').ok)

  const req: TranscriptionEngineRequest = {
    sourceMediaPath: '/media/a.wav',
    options: { language: 'ja', modelSize: 'base' },
    maxDurationSec: 30,
  }
  assert.ok(req.sourceMediaPath.length > 0)

  assert.equal(validateWhisperLocalConfig({}).ok, false)
  assert.equal(validateWhisperLocalConfig({ binaryPath: '/b' }).ok, false)
  assert.equal(validateWhisperLocalConfig({ modelPath: '/m' }).ok, false)
  assert.ok(validateWhisperLocalConfig({ binaryPath: '/bin/whisper', modelPath: '/models/m.bin' }).ok)

  const args = buildWhisperLocalArgs(
    { binaryPath: '/bin/whisper', modelPath: '/models/m.bin', language: 'ja', outputFormat: 'json' },
    '/in.wav',
    '/tmp/job/out',
  )
  assert.ok(args.includes('-m'))
  assert.ok(args.includes('/models/m.bin'))
  assert.ok(args.includes('-f'))
  assert.ok(args.includes('/in.wav'))
  assert.ok(args.some((a) => a.endsWith('.json')))

  const argsTr = buildWhisperLocalArgs(
    { binaryPath: '/w', modelPath: '/m', translateToJapanese: true, outputFormat: 'srt' },
    '/x.mp3',
    '/tmp/o',
  )
  assert.ok(argsTr.includes('--translate'))
  assert.ok(argsTr.some((a) => a.endsWith('.srt')))

  const parseStub = parseWhisperJsonOrSrtOutput('{}', 'json')
  assert.equal(parseStub.segments.length, 0)
  assert.ok(parseStub.parseError?.includes('未実装'))

  assert.equal(mockTranscriptionSegmentCountFromPath('/a/b.mp4'), mockTranscriptionSegmentCountFromPath('/a/b.mp4'))
  const c1 = mockTranscriptionSegmentCountFromPath('/a/b.mp4')
  assert.ok(c1 === 1 || c1 === 2 || c1 === 3)

  let id = 0
  const makeId = () => `seg-${++id}`

  const segs = buildMockTranscriptionSegments(12, { language: 'ja' }, '/fixture/video.mp4', makeId)
  assert.ok(segs.length >= 1 && segs.length <= 3)
  const cap = 12
  for (const s of segs) {
    assert.ok(s.endSec > s.startSec, 'sanitize keeps positive duration')
    assert.ok(s.startSec >= 0 && s.endSec <= cap + 1e-6, 'segments within timeline cap')
  }

  const track: SubtitleTrack = {
    id: 'tr-mock',
    name: 'mock',
    language: 'ja',
    segments: segs,
  }
  assert.ok(track.segments.length > 0)

  const running: TranscriptionJob = {
    id: 'j1',
    sourceMediaPath: '/x.mp4',
    status: 'running',
    progress: 0.4,
    createdAt: 't0',
    updatedAt: 't0',
  }
  const canceled = applyTranscriptionCancel(running, 't1')
  assert.equal(canceled.status, 'canceled')

  const completed: TranscriptionJob = { ...running, status: 'completed', progress: 1 }
  assert.equal(applyTranscriptionCancel(completed, 't2').status, 'completed')

  assert.ok(isTranscriptionJobTerminal('completed'))
  assert.ok(!isTranscriptionJobTerminal('running'))

  assert.equal(mockTranscriptionProgressForStep(0, 4), 0.25)
  assert.equal(mockTranscriptionProgressForStep(3, 4), 1)

  const segsNoCap = buildMockTranscriptionSegments(undefined, {}, '/z.mov', makeId)
  for (const s of segsNoCap) {
    assert.ok(s.endSec <= 6 + 1e-6)
  }

  const segsTr = buildMockTranscriptionSegments(8, { translateToJapanese: true }, '/z.mov', makeId)
  assert.ok(segsTr[0]!.text.includes('mock 仮訳'))

  const bad = runMockTranscriptionEngine(
    { sourceMediaPath: '  ', options: {} },
    () => {},
    { makeId },
  )
  const badRes = await bad.finished
  assert.ok(badRes.errorMessage)

  const stub = await runWhisperLocalTranscriptionEngine(
    { sourceMediaPath: '/x.wav', options: {} },
    () => {},
    { makeId },
  ).finished
  assert.ok(stub.errorMessage?.includes('準備中'))

  const stubWired = await runWhisperLocalTranscriptionEngine(
    { sourceMediaPath: '/x.wav', options: {} },
    () => {},
    { makeId, whisperLocalConfig: { binaryPath: '/bin/w', modelPath: '/m.gguf' } },
  ).finished
  assert.equal(stubWired.errorMessage, WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED)

  const hCancel = runMockTranscriptionEngine({ sourceMediaPath: '/c.mp4', options: {} }, () => {}, { makeId })
  hCancel.cancel()
  const rc = await hCancel.finished
  assert.equal(rc.canceled, true)

  const progressSteps: string[] = []
  const hOk = runMockTranscriptionEngine(
    { sourceMediaPath: '/ok.mp4', options: { language: 'en' } },
    (e) => progressSteps.push(`${e.status}:${e.progress}`),
    { makeId },
  )
  const rOk = await hOk.finished
  assert.ok(rOk.segments.length >= 1)
  assert.ok(progressSteps.some((p) => p.startsWith('running:')))

  const hDispatch = runTranscriptionEngine('mock', { sourceMediaPath: '/d.mp4', options: {} }, () => {}, { makeId })
  const rDispatch = await hDispatch.finished
  assert.ok(rDispatch.segments.length >= 1)
}

await run()
console.log('transcription check: ok')
