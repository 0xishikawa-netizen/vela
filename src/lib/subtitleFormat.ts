/**
 * SRT / VTT のパース・シリアライズ（純粋関数）。Whisper 前の字幕トラック用。
 */

import type { SubtitleSegment, SubtitleTrack } from './types'

const MAX_CUE_SEC = 86400 * 7

/** SRT / VTT のタイムスタンプを秒に（不正は NaN） */
export function parseTimestampToSeconds(ts: string): number {
  const t = ts.trim().replace(',', '.')
  const m = t.match(
    /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  )
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  const s = Number(m[3])
  const frac = m[4] ? m[4].padEnd(3, '0').slice(0, 3) : '000'
  const ms = Number(frac)
  if (![h, min, s, ms].every((n) => Number.isFinite(n))) return NaN
  if (min > 59 || s > 59) return NaN
  return h * 3600 + min * 60 + s + ms / 1000
}

/** 秒を SRT 用 `HH:MM:SS,mmm` に */
export function formatSecondsToSrtTimestamp(sec: number): string {
  const s = Math.max(0, Math.min(MAX_CUE_SEC, Number.isFinite(sec) ? sec : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60
  const whole = Math.floor(x)
  const ms = Math.round((x - whole) * 1000)
  const msClamped = ms >= 1000 ? 999 : ms
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')},${String(msClamped).padStart(3, '0')}`
}

/** 秒を WebVTT 用 `HH:MM:SS.mmm` に */
export function formatSecondsToVttTimestamp(sec: number): string {
  const s = Math.max(0, Math.min(MAX_CUE_SEC, Number.isFinite(sec) ? sec : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60
  const whole = Math.floor(x)
  const ms = Math.round((x - whole) * 1000)
  const msClamped = ms >= 1000 ? 999 : ms
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(msClamped).padStart(3, '0')}`
}

/** 最低限のタグ除去（VTT / SRT の `<i>` 等）。完全な HTML サニタイズではない */
export function stripSimpleMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '').trimEnd()
}

function normalizeSegmentTimes(start: number, end: number): { startSec: number; endSec: number } {
  let a = Number.isFinite(start) ? Math.max(0, start) : 0
  let b = Number.isFinite(end) ? Math.max(0, end) : a
  if (b < a) [a, b] = [b, a]
  if (b - a < 1e-4) b = a + 0.04
  a = Math.min(a, MAX_CUE_SEC)
  b = Math.min(b, MAX_CUE_SEC)
  if (b <= a) b = Math.min(MAX_CUE_SEC, a + 0.04)
  return { startSec: a, endSec: b }
}

/** 生セグメントを正規化（不正時間・空テキスト方針: 空はそのまま保持し、シリアライズで行として出す） */
export function sanitizeSubtitleSegment(seg: SubtitleSegment): SubtitleSegment {
  const { startSec, endSec } = normalizeSegmentTimes(seg.startSec, seg.endSec)
  return {
    id: typeof seg.id === 'string' && seg.id.trim() ? seg.id.trim() : '',
    startSec,
    endSec,
    text: typeof seg.text === 'string' ? seg.text : '',
    speaker: typeof seg.speaker === 'string' && seg.speaker.trim() ? seg.speaker.trim() : undefined,
    confidence:
      typeof seg.confidence === 'number' && Number.isFinite(seg.confidence)
        ? Math.min(1, Math.max(0, seg.confidence))
        : undefined,
  }
}

export type SubtitleSegmentPatch = Partial<
  Pick<SubtitleSegment, 'startSec' | 'endSec' | 'text' | 'speaker' | 'confidence'>
>

/** 既存セグメントに patch を当ててから sanitize（id は base を維持） */
export function applySubtitleSegmentPatch(base: SubtitleSegment, patch: SubtitleSegmentPatch): SubtitleSegment {
  return sanitizeSubtitleSegment({
    ...base,
    ...patch,
    id: base.id,
  })
}

/** 開始時刻昇順（同一時刻は endSec、次に id で安定ソート） */
export function sortSubtitleSegmentsByStart(segments: SubtitleSegment[]): SubtitleSegment[] {
  return [...segments].sort((a, b) => {
    const d = a.startSec - b.startSec
    if (d !== 0) return d
    const d2 = a.endSec - b.endSec
    if (d2 !== 0) return d2
    return a.id.localeCompare(b.id)
  })
}

/** SRT 本文をパース（複数行テキスト可） */
export function parseSrt(raw: string): SubtitleSegment[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const blocks = text.split(/\n\n+/)
  const out: SubtitleSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd())
    if (lines.length < 2) continue
    let i = 0
    if (/^\d+$/.test(lines[0]!.trim())) i = 1
    const timeLine = lines[i]
    if (!timeLine) continue
    const tm = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/,
    )
    if (!tm) continue
    const start = parseTimestampToSeconds(tm[1]!)
    const end = parseTimestampToSeconds(tm[2]!)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const cueLines = lines.slice(i + 1).join('\n')
    const body = stripSimpleMarkup(cueLines).replace(/^\uFEFF/, '')
    out.push(
      sanitizeSubtitleSegment({
        id: '',
        startSec: start,
        endSec: end,
        text: body,
      }),
    )
  }
  return out
}

export function serializeSrt(segments: SubtitleSegment[]): string {
  const parts: string[] = []
  segments.forEach((seg, idx) => {
    const s = sanitizeSubtitleSegment(seg)
    const a = formatSecondsToSrtTimestamp(s.startSec)
    const b = formatSecondsToSrtTimestamp(s.endSec)
    parts.push(`${idx + 1}\n${a} --> ${b}\n${s.text}\n`)
  })
  return parts.join('\n')
}

/** WEBVTT（ヘッダ以降のキューブロック） */
export function parseVtt(raw: string): SubtitleSegment[] {
  let body = raw.replace(/\r\n/g, '\n')
  const webvtt = /^WEBVTT[^\n]*\n/i
  if (webvtt.test(body)) {
    body = body.replace(webvtt, '').trimStart()
  }
  /** REGION / STYLE ブロックをスキップ */
  while (/^(REGION|STYLE|NOTE)\b/im.test(body.split('\n')[0] ?? '')) {
    const end = body.search(/\n\n/)
    if (end < 0) break
    body = body.slice(end + 2).trimStart()
  }
  const blocks = body.split(/\n\n+/)
  const out: SubtitleSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd())
    if (lines.length < 1) continue
    let i = 0
    if (lines[0] && !lines[0].includes('-->') && lines.length > 1) i = 1
    const timeLine = lines[i]
    if (!timeLine || !timeLine.includes('-->')) continue
    const tm = timeLine.match(
      /([\d:.]+)\s*-->\s*([\d:.]+)/,
    )
    if (!tm) continue
    const start = parseTimestampToSeconds(tm[1]!.replace(',', '.'))
    const end = parseTimestampToSeconds(tm[2]!.replace(',', '.'))
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const cueLines = lines.slice(i + 1).join('\n')
    const bodyText = stripSimpleMarkup(cueLines).replace(/^\uFEFF/, '')
    out.push(
      sanitizeSubtitleSegment({
        id: '',
        startSec: start,
        endSec: end,
        text: bodyText,
      }),
    )
  }
  return out
}

export function serializeVtt(segments: SubtitleSegment[]): string {
  const lines = ['WEBVTT', '']
  for (const seg of segments) {
    const s = sanitizeSubtitleSegment(seg)
    lines.push(`${formatSecondsToVttTimestamp(s.startSec)} --> ${formatSecondsToVttTimestamp(s.endSec)}`)
    lines.push(s.text)
    lines.push('')
  }
  return lines.join('\n')
}

/** 複数トラックを開始時刻順に 1 列にし、書き出し用に正規化 */
export function flattenSubtitleTracksForExport(tracks: SubtitleTrack[]): SubtitleSegment[] {
  const all: SubtitleSegment[] = []
  for (const t of tracks) {
    for (const seg of t.segments) {
      all.push(sanitizeSubtitleSegment(seg))
    }
  }
  all.sort((a, b) => a.startSec - b.startSec)
  return all
}
