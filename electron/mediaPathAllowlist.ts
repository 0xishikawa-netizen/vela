import path from 'node:path'

/** `media:*` 読取 IPC で許可する絶対パス（ダイアログ選択・プロジェクト読込で登録） */
const allowlistedAbs = new Set<string>()

function toKey(p: string): string {
  const t = p.trim()
  if (!t) return ''
  try {
    return path.resolve(path.normalize(t))
  } catch {
    return ''
  }
}

export function allowlistMediaPaths(paths: readonly string[]): void {
  for (const p of paths) {
    const k = toKey(typeof p === 'string' ? p : '')
    if (k) allowlistedAbs.add(k)
  }
}

export function clearMediaPathAllowlist(): void {
  allowlistedAbs.clear()
}

export function isMediaPathAllowlisted(filePath: string): boolean {
  const k = toKey(filePath)
  return Boolean(k && allowlistedAbs.has(k))
}
