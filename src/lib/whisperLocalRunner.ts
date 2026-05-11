/**
 * ローカル Whisper 実行の純粋ヘルパー（Phase E-5 skeleton）。
 * 実バイナリの spawn・IPC は Electron main 側の後続タスク（`electron/ipc/whisper-local-ipc-memo.md`）。
 */

import type { SubtitleSegment } from './types'

/** whisper.cpp メイン実行ファイル想定。`faster-whisper` CLI 等は別 argv テンプレが必要 */
export interface WhisperLocalRunnerConfig {
  binaryPath?: string
  modelPath?: string
  language?: string
  translateToJapanese?: boolean
  /** whisper.cpp の出力形式に寄せる。実装時はバイナリのフラグに合わせて調整 */
  outputFormat?: 'json' | 'srt' | 'vtt'
  /** 一時出力のベースパス用ディレクトリ（main が確保） */
  outputDir?: string
}

export type WhisperLocalConfigValidation = { ok: true } | { ok: false; reason: string }

export function validateWhisperLocalConfig(config: WhisperLocalRunnerConfig): WhisperLocalConfigValidation {
  const bin = typeof config.binaryPath === 'string' ? config.binaryPath.trim() : ''
  const model = typeof config.modelPath === 'string' ? config.modelPath.trim() : ''
  if (!bin) return { ok: false, reason: 'Whisper の実行ファイルが指定されていません。' }
  if (!model) return { ok: false, reason: 'モデルファイルが指定されていません。' }
  return { ok: true }
}

/**
 * `spawn(binaryPath, args)` 用の argv（先頭に binary は含めない）。
 * whisper.cpp 例: `main -m model.bin -f in.wav -l ja -oj -of /tmp/job/out`
 * 実バイナリのフラグ差は接続時に合わせる（TODO）。
 */
export function buildWhisperLocalArgs(
  config: WhisperLocalRunnerConfig,
  inputMediaPath: string,
  outputBasePathWithoutExt: string,
): string[] {
  const model = config.modelPath!.trim()
  const fmt = config.outputFormat ?? 'json'
  const args: string[] = ['-m', model, '-f', inputMediaPath.trim()]
  const lang = typeof config.language === 'string' && config.language.trim() ? config.language.trim() : undefined
  if (lang) args.push('-l', lang)
  if (config.translateToJapanese) args.push('--translate')
  if (fmt === 'json') {
    args.push('-oj', '-of', `${outputBasePathWithoutExt}.json`)
  } else if (fmt === 'srt') {
    args.push('-osrt', '-of', `${outputBasePathWithoutExt}.srt`)
  } else {
    args.push('-ovtt', '-of', `${outputBasePathWithoutExt}.vtt`)
  }
  return args
}

export interface WhisperParseOutputResult {
  segments: SubtitleSegment[]
  /** パース失敗時 */
  parseError?: string
}

/**
 * whisper.cpp の JSON / SRT を `SubtitleSegment[]` に変換（Phase E-5 は stub）。
 * 後続: 実フォーマットに合わせて実装し、`sanitizeSubtitleSegment` で正規化。
 */
export function parseWhisperJsonOrSrtOutput(_raw: string, _format: 'json' | 'srt' | 'vtt'): WhisperParseOutputResult {
  return {
    segments: [],
    parseError: '出力パースは未実装です（Phase E-5 stub）。',
  }
}

/** ユーザー向け: runner 未接続・設定不足のとき */
export const WHISPER_LOCAL_USER_MESSAGE_NOT_WIRED =
  'ローカル Whisper の実行経路は未接続です。設定と main 側 IPC を後続で追加してください。'
