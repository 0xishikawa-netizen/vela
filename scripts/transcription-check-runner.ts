/**
 * Phase E-3〜E-11: mock transcription / whisper parse / smoke doc 関連の純粋 assert。
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
  whisperLocalOutputArtifactPaths,
  WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED,
} from '../src/lib/whisperLocalRunner'
import {
  buildWhisperLocalArgsFromSettings,
  sanitizeWhisperLocalSettings,
  settingsToRunnerConfig,
} from '../src/lib/whisperLocalSettings'
import {
  mapWhisperLocalIpcFinishedToEngineFields,
  whisperLocalExitLooksCanceled,
  whisperLocalProgressFromStreamChunks,
} from '../src/lib/whisperLocalIpcMap'

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

  assert.deepEqual(sanitizeWhisperLocalSettings(null), {})
  const sTrim = sanitizeWhisperLocalSettings({ binaryPath: '  /a  ', preferGpu: 'x' as unknown as boolean })
  assert.equal(sTrim.binaryPath, '/a')
  assert.equal(sTrim.preferGpu, undefined)
  assert.equal(validateWhisperLocalConfig(settingsToRunnerConfig({ binaryPath: '/b' })).ok, false)
  assert.equal(validateWhisperLocalConfig(settingsToRunnerConfig({ modelPath: '/m' })).ok, false)
  assert.ok(validateWhisperLocalConfig(settingsToRunnerConfig({ binaryPath: '/b', modelPath: '/m.gguf' })).ok)
  assert.equal(settingsToRunnerConfig({ binaryPath: '/b', modelPath: '/m', defaultLanguage: 'en' }).language, 'en')

  assert.equal(whisperLocalProgressFromStreamChunks(0), 0.1)
  assert.ok(whisperLocalProgressFromStreamChunks(10) > 0.5)
  assert.equal(whisperLocalExitLooksCanceled(true, null), true)
  assert.equal(whisperLocalExitLooksCanceled(false, 'SIGTERM'), true)
  assert.equal(whisperLocalExitLooksCanceled(false, null), false)

  const okFields = mapWhisperLocalIpcFinishedToEngineFields({
    ok: true,
    runId: 'r1',
    exitCode: 0,
    segments: [{ id: 'a', startSec: 0, endSec: 1, text: 'x' }],
    language: 'ja',
    durationSec: 9,
    rawOutputKind: 'json',
  })
  assert.equal(okFields.segments.length, 1)
  assert.equal(okFields.language, 'ja')
  assert.equal(okFields.durationSec, 9)
  assert.equal(okFields.rawOutputKind, 'json')
  const canFields = mapWhisperLocalIpcFinishedToEngineFields({
    ok: false,
    runId: 'r1',
    kind: 'canceled',
    errorMessage: 'x',
  })
  assert.equal(canFields.canceled, true)
  const parseFields = mapWhisperLocalIpcFinishedToEngineFields({
    ok: false,
    runId: 'r1',
    kind: 'parse',
    errorMessage: 'パース失敗',
  })
  assert.ok(parseFields.errorMessage?.includes('パース'))
  const spawnFields = mapWhisperLocalIpcFinishedToEngineFields({
    ok: false,
    runId: 'r1',
    kind: 'spawn',
    errorMessage: '起動失敗',
  })
  assert.equal(spawnFields.errorMessage, '起動失敗')

  const argsFrom = buildWhisperLocalArgsFromSettings(
    { binaryPath: '/bin/w', modelPath: '/models/x.bin', defaultLanguage: 'de' },
    '/in.wav',
    '/tmp/out',
  )
  assert.ok(argsFrom.includes('-l'))
  assert.ok(argsFrom.includes('de'))

  const args = buildWhisperLocalArgs(
    { binaryPath: '/bin/whisper', modelPath: '/models/m.bin', language: 'ja', outputFormat: 'json' },
    '/in.wav',
    '/tmp/job/out',
  )
  assert.ok(args.includes('-m'))
  assert.ok(args.includes('/models/m.bin'))
  assert.ok(args.includes('-f'))
  assert.ok(args.includes('/in.wav'))
  const ofIdxJson = args.indexOf('-of')
  assert.ok(ofIdxJson >= 0 && args[ofIdxJson + 1] === '/tmp/job/out')
  assert.ok(args.includes('-oj'))

  const argsTr = buildWhisperLocalArgs(
    { binaryPath: '/w', modelPath: '/m', translateToJapanese: true, outputFormat: 'srt' },
    '/x.mp3',
    '/tmp/o',
  )
  assert.ok(argsTr.includes('--translate'))
  assert.ok(argsTr.includes('-osrt'))
  assert.equal(argsTr[argsTr.indexOf('-of') + 1], '/tmp/o')

  const argsVtt = buildWhisperLocalArgs(
    { binaryPath: '/w', modelPath: '/m', outputFormat: 'vtt' },
    '/x.wav',
    '/tmp/vb',
  )
  assert.ok(argsVtt.includes('-ovtt'))
  assert.equal(argsVtt[argsVtt.indexOf('-of') + 1], '/tmp/vb')

  const arts = whisperLocalOutputArtifactPaths('/tmp/job/out')
  assert.deepEqual(
    arts.map((x) => x.kind),
    ['json', 'srt', 'vtt'],
  )
  assert.equal(arts[0]!.path, '/tmp/job/out.json')

  const jSample = JSON.stringify({
    language: 'ja',
    duration: 3.5,
    segments: [
      { start: 0, end: 1, text: 'hello' },
      { start: 1, end: 2.2, text: 'world' },
    ],
  })
  const rj = parseWhisperJsonOrSrtOutput(jSample, 'json')
  assert.equal(rj.segments.length, 2)
  assert.equal(rj.language, 'ja')
  assert.equal(rj.durationSec, 3.5)

  const rtx = JSON.stringify({
    result: {
      language: 'en',
      duration: 10,
      transcription: [{ timestamps: { from: '00:00:00,000', to: '00:00:01,500' }, text: 'Line' }],
    },
  })
  const rrtx = parseWhisperJsonOrSrtOutput(rtx, 'json')
  assert.equal(rrtx.segments.length, 1)
  assert.equal(rrtx.language, 'en')

  const topTx = JSON.stringify({
    language: 'en',
    transcription: [{ timestamps: { from: '00:00:00,000', to: '00:00:01,000' }, text: ' [Bell]' }],
  })
  const rtxTop = parseWhisperJsonOrSrtOutput(topTx, 'json')
  assert.equal(rtxTop.segments.length, 1)
  assert.equal(rtxTop.language, 'en')

  const srtSample = '1\n00:00:01,000 --> 00:00:02,500\nHi there\n\n'
  const rs = parseWhisperJsonOrSrtOutput(srtSample, 'srt')
  assert.equal(rs.segments.length, 1)
  assert.ok(!rs.parseError)

  const vttSample = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n'
  const rv = parseWhisperJsonOrSrtOutput(vttSample, 'vtt')
  assert.equal(rv.segments.length, 1)

  const emptyOut = parseWhisperJsonOrSrtOutput('   \n', 'json')
  assert.ok(emptyOut.parseError)

  const badJson = parseWhisperJsonOrSrtOutput('{', 'json')
  assert.ok(badJson.parseError?.includes('JSON'))

  const emptyJson = parseWhisperJsonOrSrtOutput('{}', 'json')
  assert.ok(emptyJson.parseError)

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
  assert.equal(stub.errorMessage, '実行ファイルを指定してください')

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
