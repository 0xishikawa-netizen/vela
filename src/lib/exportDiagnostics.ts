/**
 * 書き出し失敗時の診断・ログ整形（純粋関数）。メイン／レンダラの両方から import 可。
 */

/** 書き出し試行時に取れる診断スナップショット（すべて任意） */
export type ExportDiagnostics = {
  ffmpegPath?: string
  ffmpegVersionHead?: string
  platform?: string
  presetCodec?: 'h264' | 'h265'
  /** `ExportSettings.format`（プリセット ID） */
  presetId?: string
  /** 解像度・fps・ビットレートなど一行要約 */
  resolvedPresetSummary?: string
  requestedVideoEncoder?: string
  /** 1 回目試行で選ばれた `-c:v` 相当 */
  resolvedVideoEncoderFirst?: string
  /** 最終試行の `-c:v`（フォールバック後） */
  resolvedVideoEncoderFinal?: string
  hardwareFallbackAttempted?: boolean
  /** フォールバック後に成功したとき true */
  hardwareFallbackSucceeded?: boolean
  outputPath?: string
  timelineDurationSec?: number
  hasFilterComplex?: boolean
  filterComplexCharCount?: number
  /** 常に短いプレビュー（ログ用・UI には載せない） */
  filterComplexPreview?: string
  /** `VELA_EXPORT_DEBUG` / `VELA_PHASE_A_DEBUG` 時のみ */
  filterComplexFull?: string
  argvPreview?: string[]
  argvFull?: string[]
  ffmpegExitCode?: number | null
  stderrTail?: string
  attemptPhase?: 'primary' | 'software_retry'
}

export type FormatExportErrorSummaryInput = {
  exitCode?: number | null
  /** ハードウェア失敗後にソフトへ再試行し、それでも失敗した */
  retriedWithSoftware?: boolean
}

const DEFAULT_STDERR_TAIL_CHARS = 4000
const DEFAULT_STDERR_TAIL_LINES = 80
const DEFAULT_ARGV_MAX_ARGS = 24
const DEFAULT_ARGV_MAX_ARG_LEN = 200
const DEFAULT_FILTER_PREVIEW_CHARS = 320

/** 保存ファイルの上限（プライバシー・メモリの両面） */
export const MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS = 100_000

/** メインが 1 回の書き出し開始時に記録する設定要約（JSON 可） */
export type ExportDiagnosticsRunMeta = {
  timelineDurationSec: number
  format: string
  outputPath: string
  includeAudio: boolean
  crossfadeAdjacent?: boolean
  crossfadeDurationSec?: number
  audioPostMix: string
  videoEncoder?: string
  presetWidth: number
  presetHeight: number
  presetFps: number
  presetBitrate: string
  presetCodec: string
  useOverlay: boolean
  visualClipCount: number
  audioClipCount: number
}

/** IPC `export:getLastDiagnostics` の戻り値 */
export type ExportDiagnosticsRunBuffer = {
  meta: ExportDiagnosticsRunMeta
  attempts: ExportDiagnostics[]
}

export type ExportDiagnosticsSaveInput = {
  generatedAtIso: string
  appName: string
  appVersion: string
  platform: string
  /** `VELA_EXPORT_DEBUG` / `VELA_PHASE_A_DEBUG` が有効だったか（保存時点） */
  debugEnvEnabled: boolean
  /** 画面に出したユーザー向け短文（任意） */
  userFacingMessage?: string
  settingsSummary: ExportDiagnosticsRunMeta
  attempts: ExportDiagnostics[]
}

/**
 * stderr をログ向けにトリム（過大なバッファを避ける）。
 */
export function tailStderr(
  text: string | undefined | null,
  maxChars = DEFAULT_STDERR_TAIL_CHARS,
  maxLines = DEFAULT_STDERR_TAIL_LINES,
): string {
  if (text == null || text === '') return ''
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const tailedLines = lines.length > maxLines ? lines.slice(-maxLines) : lines
  let s = tailedLines.join('\n').trimEnd()
  if (s.length > maxChars) s = `…(truncated)\n` + s.slice(-maxChars)
  return s
}

/**
 * argv をログ用に短縮（巨大な filter / パスを抑える）。
 */
export function redactOrTrimArgv(
  argv: string[],
  opts?: { maxArgs?: number; maxArgLen?: number },
): string[] {
  const maxArgs = opts?.maxArgs ?? DEFAULT_ARGV_MAX_ARGS
  const maxArgLen = opts?.maxArgLen ?? DEFAULT_ARGV_MAX_ARG_LEN
  const slice = argv.slice(0, maxArgs)
  const mapped = slice.map((a) => {
    if (a.length <= maxArgLen) return a
    return `${a.slice(0, Math.max(0, maxArgLen - 12))}…(${a.length} chars)`
  })
  if (argv.length > maxArgs) {
    mapped.push(`…(${argv.length - maxArgs} more args)`)
  }
  return mapped
}

/**
 * filter_complex 文字列の先頭だけ（ログプレビュー用）。
 */
export function previewFilterComplex(filterComplex: string, maxChars = DEFAULT_FILTER_PREVIEW_CHARS): string {
  if (!filterComplex) return ''
  if (filterComplex.length <= maxChars) return filterComplex
  return `${filterComplex.slice(0, maxChars)}…(+${filterComplex.length - maxChars} chars)`
}

/**
 * fluent-ffmpeg / ffmpeg のメッセージから終了コードを推定。
 */
export function parseFfmpegExitCode(message: string): number | undefined {
  const m =
    message.match(/exited with code\s*(-?\d+)/i) ||
    message.match(/Exit code\s*[:=]\s*(-?\d+)/i) ||
    message.match(/code\s*(-?\d+)\s*$/im)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

/**
 * ユーザー向けの短い失敗文（filter_complex・長い stderr は含めない）。
 */
export function formatExportErrorSummary(input: FormatExportErrorSummaryInput): string {
  const code = input.exitCode != null ? `（FFmpeg 終了コード ${input.exitCode}）` : ''
  if (input.retriedWithSoftware) {
    return `書き出しに失敗しました${code}。ハードウェアエンコードが失敗したためソフトウェアで再試行しましたが、完了できませんでした。`
  }
  return `書き出しに失敗しました${code}。エンコーダ設定・解像度・素材パスを確認するか、しばらくしてから再度お試しください。`
}

/**
 * メインプロセス向け: 診断を複数行テキストに（console.error 用）。
 */
export function formatExportDiagnosticsLogBlock(d: ExportDiagnostics): string {
  const lines: string[] = ['[vela-export-diagnostics]']
  const push = (k: string, v: string | number | boolean | undefined | null) => {
    if (v === undefined || v === '') return
    lines.push(`  ${k}: ${v}`)
  }
  push('platform', d.platform)
  push('ffmpegPath', d.ffmpegPath)
  if (d.ffmpegVersionHead) lines.push(`  ffmpegVersionHead:\n${d.ffmpegVersionHead.split('\n').map((l) => `    ${l}`).join('\n')}`)
  push('presetId', d.presetId)
  push('presetCodec', d.presetCodec)
  push('resolvedPreset', d.resolvedPresetSummary)
  push('requestedVideoEncoder', d.requestedVideoEncoder)
  push('resolvedEncoder (first)', d.resolvedVideoEncoderFirst)
  push('resolvedEncoder (final)', d.resolvedVideoEncoderFinal)
  push('hardwareFallbackAttempted (this attempt)', d.hardwareFallbackAttempted)
  push('hardwareFallbackSucceeded', d.hardwareFallbackSucceeded)
  push('outputPath', d.outputPath)
  push('timelineDurationSec', d.timelineDurationSec)
  push('hasFilterComplex', d.hasFilterComplex)
  push('filterComplexCharCount', d.filterComplexCharCount)
  push('attemptPhase', d.attemptPhase)
  push('ffmpegExitCode', d.ffmpegExitCode)
  if (d.filterComplexPreview) lines.push(`  filterComplexPreview: ${d.filterComplexPreview}`)
  if (d.filterComplexFull) {
    lines.push(`  filterComplexFull:\n${d.filterComplexFull.split('\n').map((l) => `    ${l}`).join('\n')}`)
  }
  if (d.argvPreview?.length) lines.push(`  argvPreview: ${JSON.stringify(d.argvPreview)}`)
  if (d.argvFull?.length) lines.push(`  argvFull: ${JSON.stringify(d.argvFull)}`)
  if (d.stderrTail) lines.push(`  stderrTail:\n${d.stderrTail.split('\n').map((l) => `    ${l}`).join('\n')}`)
  return lines.join('\n')
}

/**
 * ユーザー向けメッセージに巨大な filter を混ぜないためのガード（テスト用にも利用）。
 */
export function userFacingMessageLooksSafe(message: string, maxLen = 600): boolean {
  if (message.length > maxLen) return false
  if (/filter_complex/i.test(message) && message.length > 80) return false
  /** filter グラフのストリームラベルがそのまま出ていないか */
  if (/\[\d+:[avas]\]/.test(message)) return false
  if (/\[[^\]]+\]\[[^\]]+\]/.test(message) && message.includes(';')) return false
  if (message.includes(';') && message.includes('[') && message.includes(']') && message.length > 200) return false
  return true
}

function hardwareFallbackOccurred(attempts: ExportDiagnostics[]): boolean {
  return attempts.some((a) => a.attemptPhase === 'software_retry')
}

/**
 * サポート用に保存するプレーンテキスト（パス等を含む。長すぎる場合は末尾を切る）。
 * `debugEnvEnabled` が true のとき、各 attempt に `filterComplexFull` / `argvFull` があればそのまま含める。
 */
export function buildExportDiagnosticsSaveDocument(input: ExportDiagnosticsSaveInput): string {
  const lines: string[] = []
  lines.push('Vela — export diagnostics')
  lines.push(`Generated (ISO): ${input.generatedAtIso}`)
  lines.push(`App: ${input.appName} ${input.appVersion}`)
  lines.push(`Platform: ${input.platform}`)
  lines.push(`VELA_EXPORT_DEBUG / VELA_PHASE_A_DEBUG: ${input.debugEnvEnabled ? 'on' : 'off'}`)
  lines.push('')
  lines.push('--- Privacy ---')
  lines.push(
    'このファイルにはローカルパス（書き出し先・FFmpeg バイナリ・素材パスが argv に含まれる場合）が含まれることがあります。共有の際は内容を確認してください。',
  )
  lines.push('')
  if (input.userFacingMessage) {
    lines.push('--- User-facing error (short) ---')
    lines.push(input.userFacingMessage)
    lines.push('')
  }
  lines.push('--- Export settings (summary) ---')
  lines.push(JSON.stringify(input.settingsSummary, null, 2))
  lines.push('')
  lines.push('--- Run ---')
  lines.push(`FFmpeg attempts recorded: ${input.attempts.length}`)
  lines.push(`Hardware fallback occurred (software retry path used): ${hardwareFallbackOccurred(input.attempts) ? 'yes' : 'no'}`)
  lines.push('')
  for (let i = 0; i < input.attempts.length; i++) {
    const a = input.attempts[i]!
    lines.push(`========== FFmpeg attempt ${i + 1} (phase=${a.attemptPhase ?? 'unknown'}) ==========`)
    lines.push(formatExportDiagnosticsLogBlock(a))
    lines.push('')
  }
  if (input.debugEnvEnabled) {
    lines.push('--- Note ---')
    lines.push('Debug env was on: full filter_complex / argv may appear in attempt blocks above when captured.')
    lines.push('')
  }
  let body = lines.join('\n')
  if (body.length > MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS) {
    const over = body.length - MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS + 400
    body =
      body.slice(0, MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS - 400) +
      `\n\n…(truncated; omitted approx ${over} chars; see MAX_EXPORT_DIAGNOSTICS_SAVE_DOC_CHARS)\n`
  }
  return body
}
