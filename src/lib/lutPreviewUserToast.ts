import { useUiToastStore } from '../store/uiToastStore'

export type CubeLutReadFailureReason = 'not_found' | 'not_cube_extension' | 'too_large' | 'read_error'

export type LutPreviewFailureKind =
  | 'read_api_unavailable'
  | 'lut_canvas_missing'
  | 'webgl_init_failed'
  | CubeLutReadFailureReason
  | 'parse_failed'
  | 'renderer_not_ready'
  | 'render_failed'

/** 書き出しは FFmpeg の lut3d が正とする旨（プレビューは近似） */
const EXPORT_HINT =
  '書き出しでは FFmpeg の LUT が適用されます。プレビューは画面表示用の近似です。'

function messageForReadReason(reason: CubeLutReadFailureReason): string {
  switch (reason) {
    case 'not_found':
      return '.cube ファイルが見つかりません。パスを確認するか、ルックパネルから再度選択してください。'
    case 'not_cube_extension':
      return 'LUT は拡張子 .cube のファイルを指定してください。'
    case 'too_large':
      return 'LUT ファイルが大きすぎます（32MB 上限）。別のファイルを選んでください。'
    case 'read_error':
      return 'LUT ファイルの読み込みに失敗しました。権限やディスクを確認してください。'
  }
}

function messageForKind(kind: LutPreviewFailureKind, parseDetail?: string): string {
  switch (kind) {
    case 'read_api_unavailable':
      return `LUT プレビュー用の読込 API が使えません。Electron で起動しているか確認してください。${EXPORT_HINT}`
    case 'lut_canvas_missing':
      return `内部エラーにより LUT プレビューを初期化できませんでした。${EXPORT_HINT}`
    case 'webgl_init_failed':
      return `この環境では WebGL の LUT プレビューを表示できません。映像はソースに近い表示になります。${EXPORT_HINT}`
    case 'not_found':
    case 'not_cube_extension':
    case 'too_large':
    case 'read_error':
      return messageForReadReason(kind)
    case 'parse_failed': {
      const d = parseDetail?.trim()
      return d
        ? `.cube の解析に失敗しました: ${d}`
        : '.cube の解析に失敗しました。ファイル形式を確認してください。'
    }
    case 'renderer_not_ready':
      return `LUT プレビューの GPU 初期化に失敗しました。${EXPORT_HINT}`
    case 'render_failed':
      return `LUT の描画に失敗したため、ソース映像を表示しています。${EXPORT_HINT}`
    default:
      return `LUT プレビューを表示できませんでした。${EXPORT_HINT}`
  }
}

export function pushLutPreviewFailureToast(
  kind: LutPreviewFailureKind,
  opts: { dedupeBase: string; parseDetail?: string },
): void {
  useUiToastStore.getState().pushToast({
    variant: 'warning',
    message: messageForKind(kind, opts.parseDetail),
    dedupeKey: `${opts.dedupeBase}:${kind}`,
  })
}
