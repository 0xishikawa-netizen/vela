/**
 * Whisper local のユーザー設定（純粋）。永続化は main `userData/whisper-local-settings.json`。
 */

import type { WhisperLocalSettings } from './types'
import type { WhisperLocalRunnerConfig } from './whisperLocalRunner'
import { buildWhisperLocalArgs } from './whisperLocalRunner'

export function sanitizeWhisperLocalSettings(raw: unknown): WhisperLocalSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
  return {
    binaryPath: str(o.binaryPath)?.trim() || undefined,
    modelPath: str(o.modelPath)?.trim() || undefined,
    defaultLanguage: str(o.defaultLanguage)?.trim() || undefined,
    defaultModelSize: str(o.defaultModelSize)?.trim() || undefined,
    preferGpu: bool(o.preferGpu),
  }
}

export function settingsToRunnerConfig(settings: WhisperLocalSettings): WhisperLocalRunnerConfig {
  const s = sanitizeWhisperLocalSettings(settings)
  return {
    binaryPath: s.binaryPath,
    modelPath: s.modelPath,
    language: s.defaultLanguage,
    translateToJapanese: false,
    outputFormat: 'json',
    preferGpu: s.preferGpu === true,
  }
}

export function buildWhisperLocalArgsFromSettings(
  settings: WhisperLocalSettings,
  inputMediaPath: string,
  outputBasePathWithoutExt: string,
): string[] {
  return buildWhisperLocalArgs(settingsToRunnerConfig(settings), inputMediaPath, outputBasePathWithoutExt)
}
