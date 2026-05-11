import { ipcMain } from 'electron'
import path from 'node:path'
import { readdir, readFile, writeFile, rm } from 'node:fs/promises'
import type { Project } from '../../src/lib/types'

async function readJson<T>(p: string): Promise<T> {
  const raw = await readFile(p, 'utf8')
  return JSON.parse(raw) as T
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function removeFile(p: string): Promise<void> {
  await rm(p, { force: true })
}

function assertSafeProjectId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('ID が不正です')
  const s = id.trim()
  if (/[/\\]/.test(s) || s.includes('..')) throw new Error('無効なプロジェクト ID です')
  return s
}

export function registerProjectIpc(projectsDir: string) {
  ipcMain.handle('project:list', async () => {
    try {
      const files = (await readdir(projectsDir)).filter((f) => f.endsWith('.json'))
      const projects = (await Promise.all(
        files.map((f) => readJson<Project>(path.join(projectsDir, f)).catch(() => null)),
      )) as (Project | null)[]
      return projects
        .filter((p): p is Project => p != null)
        .sort((a, b) => {
          const tb = new Date(b.updatedAt).getTime()
          const ta = new Date(a.updatedAt).getTime()
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
        })
    } catch (err) {
      console.error('[vela] project:list', err)
      return []
    }
  })

  ipcMain.handle('project:save', async (_, id: string, data: object) => {
    try {
      const safe = assertSafeProjectId(id)
      await writeJson(path.join(projectsDir, `${safe}.json`), data)
    } catch (err) {
      console.error('[vela] project:save', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'プロジェクトを保存できませんでした'
      throw new Error(msg)
    }
  })

  ipcMain.handle('project:load', async (_, id: string) => {
    try {
      const safe = assertSafeProjectId(id)
      return await readJson(path.join(projectsDir, `${safe}.json`))
    } catch (err) {
      console.error('[vela] project:load', err)
      const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: string }).code : undefined
      const msg =
        code === 'ENOENT'
          ? 'プロジェクトファイルが見つかりません。'
          : err instanceof Error
            ? err.message
            : 'プロジェクトを読み込めませんでした'
      throw new Error(msg)
    }
  })

  ipcMain.handle('project:delete', async (_, id: string) => {
    try {
      const safe = assertSafeProjectId(id)
      await removeFile(path.join(projectsDir, `${safe}.json`))
    } catch (err) {
      console.error('[vela] project:delete', err)
      throw new Error(err instanceof Error ? err.message : '削除に失敗しました')
    }
  })
}
