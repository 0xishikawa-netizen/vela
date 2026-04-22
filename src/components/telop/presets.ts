import type { TelopPreset } from '../../lib/types'
import { DEFAULT_TELOP_ANIMATION, DEFAULT_TELOP_STYLE } from '../../lib/types'

export const TELOP_PRESETS: TelopPreset[] = [
  {
    id: 'tv',
    name: 'テレビ字幕風',
    style: {
      ...DEFAULT_TELOP_STYLE,
      fontSize: 40,
      align: 'center',
      strokeWidth: 3,
    },
    animation: { ...DEFAULT_TELOP_ANIMATION, in: 'fade_in', out: 'fade_out' },
  },
  {
    id: 'title',
    name: 'タイトル風',
    style: {
      ...DEFAULT_TELOP_STYLE,
      fontSize: 72,
      fontWeight: 'bold',
    },
    animation: { ...DEFAULT_TELOP_ANIMATION, in: 'zoom_in', inDuration: 0.6 },
  },
  {
    id: 'pop',
    name: 'ポップ風',
    style: {
      ...DEFAULT_TELOP_STYLE,
      fontSize: 52,
      color: '#ffe066',
      strokeColor: '#1a1a2e',
    },
    animation: { ...DEFAULT_TELOP_ANIMATION, in: 'bounce', inDuration: 0.5 },
  },
  {
    id: 'news',
    name: 'ニュース速報風',
    style: {
      ...DEFAULT_TELOP_STYLE,
      fontSize: 36,
      color: '#ffffff',
      backgroundColor: '#cc0000',
      backgroundOpacity: 0.9,
      align: 'left',
    },
    animation: { ...DEFAULT_TELOP_ANIMATION, in: 'slide_left' },
  },
  {
    id: 'vlog',
    name: 'Vlog 風',
    style: {
      ...DEFAULT_TELOP_STYLE,
      fontSize: 28,
      fontWeight: 'normal',
      color: '#e9eaee',
      strokeWidth: 1,
    },
    animation: { ...DEFAULT_TELOP_ANIMATION, in: 'fade_in', inDuration: 0.2 },
  },
]
