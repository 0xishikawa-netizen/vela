import type { TelopAnimationMeta, TelopAnimationType } from './types'

/** インアニメ（TelopAnimPicker と同期）の書き出し互換メタ */
export const TELOP_IN_ANIMATION_OPTIONS: TelopAnimationMeta[] = [
  {
    key: 'none',
    label: 'なし',
    exportSupport: 'full',
  },
  {
    key: 'fade_in',
    label: 'フェードイン',
    exportSupport: 'full',
  },
  {
    key: 'slide_up',
    label: '下から上',
    exportSupport: 'full',
  },
  {
    key: 'zoom_in',
    label: 'ズームイン',
    exportSupport: 'approx',
    exportNote: '書き出しでは拡大の近似（ASS のスケール）になります',
  },
  {
    key: 'bounce',
    label: 'バウンス',
    exportSupport: 'unsupported',
    exportNote: 'ASS では再現できません（静止表示になります）',
  },
  {
    key: 'blur_in',
    label: 'ブラーイン',
    exportSupport: 'approx',
    exportNote: '書き出しではブラーなし（フェードのみ近い動き）です',
  },
]

const EXTRA_IN_META: TelopAnimationMeta[] = [
  {
    key: 'slide_down',
    label: '上から下',
    exportSupport: 'full',
  },
  {
    key: 'slide_left',
    label: '右から左',
    exportSupport: 'full',
  },
  {
    key: 'slide_right',
    label: '左から右',
    exportSupport: 'full',
  },
  {
    key: 'zoom_out',
    label: 'ズームアウト（終了）',
    exportSupport: 'approx',
    exportNote: '書き出しでは終端の拡大の近似（ASS のスケール）になります',
  },
]

const IN_META_MAP = new Map<TelopAnimationType, TelopAnimationMeta>(
  [...TELOP_IN_ANIMATION_OPTIONS, ...EXTRA_IN_META].map((m) => [m.key, m]),
)

export function getTelopInAnimationMeta(id: TelopAnimationType): TelopAnimationMeta {
  return (
    IN_META_MAP.get(id) ?? {
      key: id,
      label: String(id),
      exportSupport: 'unsupported',
      exportNote: 'ASS 書き出しでは未対応の可能性があります',
    }
  )
}
