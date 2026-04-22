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

export function registerProjectIpc(projectsDir: string) {
  ipcMain.handle('project:list', async () => {
    const files = (await readdir(projectsDir)).filter((f) => f.endsWith('.json'))
    const projects = (await Promise.all(
      files.map((f) => readJson<Project>(path.join(projectsDir, f)).catch(() => null)),
    )) as (Project | null)[]
    return projects
      .filter((p): p is Project => p != null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  })

  ipcMain.handle('project:save', async (_, id: string, data: object) =>
    writeJson(path.join(projectsDir, `${id}.json`), data),
  )

  ipcMain.handle('project:load', async (_, id: string) => readJson(path.join(projectsDir, `${id}.json`)))

  ipcMain.handle('project:delete', async (_, id: string) => removeFile(path.join(projectsDir, `${id}.json`)))
}
