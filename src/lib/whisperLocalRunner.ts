/**
 * ローカル Whisper 実行の純粋ヘルパー（Phase E-5〜E-8）。
 * spawn は Electron main（`electron/ipc/whisperLocal.ts`）。
 */

import type { SubtitleSegment } from './types'
import {
  parseSrt,
  parseTimestampToSeconds,
  parseVtt,
  sanitizeSubtitleSegment,
  sortSubtitleSegmentsByStart,
  stripSimpleMarkup,
} from './subtitleFormat'

/** whisper.cpp メイン実行ファイル想定。`faster-whisper` CLI 等は別 argv テンプレが必要 */
export interface WhisperLocalRunnerConfig {
  binaryPath?: string
  modelPath?: string
  language?: string
  translateToJapanese?: boolean
  /** `json`（既定）| `srt` | `vtt` — `buildWhisperLocalArgs` が `-oj` / `-osrt` / `-ovtt` と拡張子なしの `-of`（CLI が `.json` 等を付与） */
  outputFormat?: 'json' | 'srt' | 'vtt'
  /** 一時出力のベースパス用ディレクトリ（main が確保） */
  outputDir?: string
  /** 将来: `--gpu` 等。現状 argv には出さない */
  preferGpu?: boolean
}

export type WhisperLocalConfigValidation = { ok: true } | { ok: false; reason: string }

export function validateWhisperLocalConfig(config: WhisperLocalRunnerConfig): WhisperLocalConfigValidation {
  const bin = typeof config.binaryPath === 'string' ? config.binaryPath.trim() : ''
  const model = typeof config.modelPath === 'string' ? config.modelPath.trim() : ''
  if (!bin) return { ok: false, reason: '実行ファイルを指定してください' }
  if (!model) return { ok: false, reason: 'モデルを指定してください' }
  return { ok: true }
}

/**
 * `spawn(binaryPath, args)` 用の argv（先頭に binary は含めない）。
 *
 * **互換性:** whisper.cpp のビルド・バージョンによりフラグ名が異なる場合があります。
 * **`-of`（重要）:** `whisper-cli` v1.8.x では `-of` に渡したパスに **CLI 側で `.json` / `.srt` / `.vtt` を付与**する（例: `-of /tmp/job/out` → `/tmp/job/out.json`）。**拡張子付きで `-of …/out.json` を渡すと `out.json.json` になり**、main の `outBase + ".json"` 探索とずれる。
 * 本テンプレは **拡張子なしのベースパス**を `-of` に渡す（ggerganov/ggml-org whisper.cpp の **`whisper-cli`** 実測に合わせる）。
 *
 * - **json（既定）:** `-oj` + `-of <outBase>`（生成ファイルは `<outBase>.json`）
 * - **srt:** `-osrt` + `-of <outBase>`（`<outBase>.srt`）
 * - **vtt:** `-ovtt` + `-of <outBase>`（`<outBase>.vtt`）
 *
 * main 側の読み取りは **`outBase.json` → `outBase.srt` → `outBase.vtt`** の順（`whisperLocalOutputArtifactPaths`）でフォールバック。別ビルドで `-of` の解釈が違う場合は `read_output` になり得る。
 * **将来:** ユーザー指定の追加 argv（例: `--print-progress`）を settings から差し込む案は未実装。
 */
export function buildWhisperLocalArgs(
  config: WhisperLocalRunnerConfig,
  inputMediaPath: string,
  outputBasePathWithoutExt: string,
): string[] {
  const model = config.modelPath!.trim()
  const fmt = config.outputFormat === 'srt' || config.outputFormat === 'vtt' ? config.outputFormat : 'json'
  const args: string[] = ['-m', model, '-f', inputMediaPath.trim()]
  const lang = typeof config.language === 'string' && config.language.trim() ? config.language.trim() : undefined
  if (lang) args.push('-l', lang)
  if (config.translateToJapanese) args.push('--translate')
  const outBase = outputBasePathWithoutExt.trim()
  if (fmt === 'json') {
    args.push('-oj', '-of', outBase)
  } else if (fmt === 'srt') {
    args.push('-osrt', '-of', outBase)
  } else {
    args.push('-ovtt', '-of', outBase)
  }
  return args
}

/** main が成果物を探す順序（json 優先）。`outBase` は拡張子なし（例: `…/out`）。 */
export function whisperLocalOutputArtifactPaths(outBase: string): Array<{ kind: 'json' | 'srt' | 'vtt'; path: string }> {
  return [
    { kind: 'json', path: `${outBase}.json` },
    { kind: 'srt', path: `${outBase}.srt` },
    { kind: 'vtt', path: `${outBase}.vtt` },
  ]
}

export interface WhisperParseOutputResult {
  segments: SubtitleSegment[]
  /** パース失敗時 */
  parseError?: string
  language?: string
  /** 秒。JSON メタから取れた場合のみ */
  durationSec?: number
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function numSec(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function segmentFromStartEndText(start: number, end: number, text: string, idSuffix: string): SubtitleSegment | null {
  const body = stripSimpleMarkup(text).replace(/^\uFEFF/, '').trim()
  if (!body) return null
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return sanitizeSubtitleSegment({
    id: `whisper-${idSuffix}`,
    startSec: start,
    endSec: end,
    text: body,
  })
}

function parseTimestampsFromTo(ts: unknown): { start: number; end: number } | null {
  const o = asRecord(ts)
  if (!o) return null
  const fromRaw = o.from
  const toRaw = o.to
  if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') return null
  const start = parseTimestampToSeconds(fromRaw.replace(',', '.'))
  const end = parseTimestampToSeconds(toRaw.replace(',', '.'))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end }
}

function parseSegmentLikeItem(item: unknown, idSuffix: string): SubtitleSegment | null {
  const o = asRecord(item)
  if (!o) return null
  const text = typeof o.text === 'string' ? o.text : typeof o.sentence === 'string' ? o.sentence : ''
  const s0 = numSec(o.start)
  const s1 = numSec(o.end)
  if (s0 !== undefined && s1 !== undefined) {
    return segmentFromStartEndText(s0, s1, text, idSuffix)
  }
  const ts = parseTimestampsFromTo(o.timestamps)
  if (ts) return segmentFromStartEndText(ts.start, ts.end, text, idSuffix)
  return null
}

function collectSegmentsFromArray(arr: unknown[], keyPrefix: string): SubtitleSegment[] {
  const out: SubtitleSegment[] = []
  arr.forEach((item, i) => {
    const seg = parseSegmentLikeItem(item, `${keyPrefix}-${i}`)
    if (seg) out.push(seg)
  })
  return out
}

function tryMetaLanguageDuration(root: Record<string, unknown>): { language?: string; durationSec?: number } {
  let language: string | undefined
  let durationSec: number | undefined
  const langTop = root.language
  if (typeof langTop === 'string' && langTop.trim()) language = langTop.trim()
  const durTop = numSec(root.duration)
  if (durTop !== undefined) durationSec = durTop

  const res = asRecord(root.result)
  if (res) {
    const lr = res.language
    if (typeof lr === 'string' && lr.trim()) language = lr.trim()
    const dr = numSec(res.duration)
    if (dr !== undefined) durationSec = dr
  }
  return { language, durationSec }
}

function tryExtractSegmentsFromJsonRoot(root: Record<string, unknown>): SubtitleSegment[] {
  if (Array.isArray(root.segments)) {
    return collectSegmentsFromArray(root.segments as unknown[], 'seg')
  }
  const res = asRecord(root.result)
  if (res) {
    if (Array.isArray(res.segments)) return collectSegmentsFromArray(res.segments as unknown[], 'rseg')
    if (Array.isArray(res.transcription)) return collectSegmentsFromArray(res.transcription as unknown[], 'rtx')
  }
  if (Array.isArray(root.transcription)) {
    return collectSegmentsFromArray(root.transcription as unknown[], 'tx')
  }
  return []
}

function parseWhisperJsonText(text: string): WhisperParseOutputResult {
  const trimmed = text.trim()
  if (!trimmed) return { segments: [], parseError: '出力が空です' }
  let root: unknown
  try {
    root = JSON.parse(trimmed) as unknown
  } catch {
    return { segments: [], parseError: 'JSON が不正です' }
  }
  const o = asRecord(root)
  if (!o) return { segments: [], parseError: 'JSON が不正です' }

  const meta = tryMetaLanguageDuration(o)
  const rawSegs = tryExtractSegmentsFromJsonRoot(o)
  if (rawSegs.length === 0) {
    return { segments: [], parseError: 'セグメントがありません', language: meta.language, durationSec: meta.durationSec }
  }
  const segments = sortSubtitleSegmentsByStart(rawSegs)
  return { segments, language: meta.language, durationSec: meta.durationSec }
}

/**
 * whisper.cpp の JSON（代表的な `segments` / `result.transcription` 等）、または SRT/VTT 本文を `SubtitleSegment[]` に変換。
 */
export function parseWhisperJsonOrSrtOutput(raw: string, format: 'json' | 'srt' | 'vtt'): WhisperParseOutputResult {
  if (!raw.trim()) return { segments: [], parseError: '出力が空です' }
  if (format === 'srt') {
    const segments = sortSubtitleSegmentsByStart(parseSrt(raw))
    if (segments.length === 0) return { segments: [], parseError: 'SRT にキューがありません' }
    return { segments }
  }
  if (format === 'vtt') {
    const segments = sortSubtitleSegmentsByStart(parseVtt(raw))
    if (segments.length === 0) return { segments: [], parseError: 'VTT にキューがありません' }
    return { segments }
  }
  return parseWhisperJsonText(raw)
}

/** ユーザー向け: main spawn 未接続時 */
export const WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED = '実行は未接続です（次フェーズで main から起動します）。'
