/**
 * セッション境界で複数 store をまとめる（`projectStore` ↔ `transcriptionStore` の dynamic import 回避用）。
 */
import { useEditorStore } from './editorStore'
import { useTranscriptionStore } from './transcriptionStore'

/** 新規プロジェクト作成・別プロジェクトを開いたとき（波形リセット + 文字起こしジョブ破棄） */
export function resetEditorSessionAndClearTranscriptionJobs(): void {
  useEditorStore.getState().resetSession()
  useTranscriptionStore.getState().clearTranscriptionJobs()
}

/** プロジェクトを閉じたとき（エディタ波形は維持、文字起こしジョブのみ破棄） */
export function clearTranscriptionJobsOnly(): void {
  useTranscriptionStore.getState().clearTranscriptionJobs()
}
