/**
 * Adobe / Iridas `.cube` 3D LUT（テキスト）のパース。
 * **Export（FFmpeg `lut3d`）が canonical**。本モジュールは preview 用データ準備の入口（Phase C-2）。
 *
 * ファイル順序は一般的な「**R が最も速く変化**」する並び（連続行で R が刻まれる）として RGB を格納する。
 * WebGL 側の 2D アトラス詰め方は `previewLutAtlas.ts` / `previewLutWebgl.ts` で整合。
 */

export type ParsedCubeLut = {
  title?: string
  /** 各軸の格子数（全行数は `size ** 3`） */
  size: number
  domainMin: readonly [number, number, number]
  domainMax: readonly [number, number, number]
  /** ファイル出現順の RGB 連続値、長さ `size ** 3 * 3` */
  rgb: Float32Array
}

function stripLineComment(line: string): string {
  const i = line.indexOf('#')
  return (i >= 0 ? line.slice(0, i) : line).trim()
}

/**
 * `.cube` 全文をパースする。
 * @throws 必須ヘッダ欠落、行数不一致、数値として読めない行
 */
export function parseCubeLut(text: string): ParsedCubeLut {
  const lines = text.split(/\r?\n/)

  let title: string | undefined
  let size: number | undefined
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  const dataRows: [number, number, number][] = []

  for (const raw of lines) {
    const line = stripLineComment(raw)
    if (!line) continue

    const upper = line.toUpperCase()

    const titleM = line.match(/^TITLE\s+(.+)$/i)
    if (titleM) {
      let rest = titleM[1]!.trim()
      if (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) {
        title = rest.slice(1, -1)
      } else {
        title = rest.replace(/^["']|["']$/g, '') || undefined
      }
      continue
    }

    if (upper.startsWith('LUT_3D_SIZE')) {
      const tok = line.split(/\s+/).filter(Boolean)
      const n = tok.length >= 2 ? parseInt(tok[1]!, 10) : NaN
      if (!Number.isFinite(n) || n < 2) {
        throw new Error(`Invalid LUT_3D_SIZE: ${line}`)
      }
      size = n
      continue
    }

    if (upper.startsWith('DOMAIN_MIN')) {
      const tok = line.split(/\s+/).filter(Boolean)
      if (tok.length < 4) throw new Error(`Invalid DOMAIN_MIN: ${line}`)
      domainMin = [parseFloat(tok[1]!), parseFloat(tok[2]!), parseFloat(tok[3]!)]
      if (domainMin.some((x) => !Number.isFinite(x))) throw new Error(`Invalid DOMAIN_MIN values: ${line}`)
      continue
    }

    if (upper.startsWith('DOMAIN_MAX')) {
      const tok = line.split(/\s+/).filter(Boolean)
      if (tok.length < 4) throw new Error(`Invalid DOMAIN_MAX: ${line}`)
      domainMax = [parseFloat(tok[1]!), parseFloat(tok[2]!), parseFloat(tok[3]!)]
      if (domainMax.some((x) => !Number.isFinite(x))) throw new Error(`Invalid DOMAIN_MAX values: ${line}`)
      continue
    }

    const parts = line.split(/\s+/).filter(Boolean)
    if (parts.length !== 3) {
      throw new Error(`Unexpected LUT line (expected 3 floats): ${line}`)
    }
    const r = parseFloat(parts[0]!)
    const g = parseFloat(parts[1]!)
    const b = parseFloat(parts[2]!)
    if (![r, g, b].every((x) => Number.isFinite(x))) {
      throw new Error(`Invalid RGB floats: ${line}`)
    }
    dataRows.push([r, g, b])
  }

  if (size === undefined) {
    throw new Error('Missing LUT_3D_SIZE')
  }

  const expected = size * size * size
  if (dataRows.length !== expected) {
    throw new Error(`Expected ${expected} RGB rows (size=${size}), got ${dataRows.length}`)
  }

  const rgb = new Float32Array(expected * 3)
  let o = 0
  for (const row of dataRows) {
    rgb[o++] = row[0]!
    rgb[o++] = row[1]!
    rgb[o++] = row[2]!
  }

  return { title, size, domainMin, domainMax, rgb }
}
