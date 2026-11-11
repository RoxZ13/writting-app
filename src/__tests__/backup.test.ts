import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Scene } from '../db/db'
import { createChapter, createProject, createScene, patch, remove } from '../db/repo'
import { backupSummary, makeBackup, parseBackupText, readBackupFile, restoreBackup } from '../lib/backup'

let n = 0
describe('backup', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`backup-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('brings back what was lost and keeps newer local edits', async () => {
    const c = await createChapter('p', 'Глава 1')
    const a = await createScene('p', c.id, 'a')
    const b = await createScene('p', c.id, 'b')
    const dump = JSON.parse(JSON.stringify(await makeBackup()))

    await db.scenes.delete(a.id) // lost on this device
    await new Promise((r) => setTimeout(r, 5))
    await patch<Scene>('scenes', b.id, { title: 'b — правка после копии' })
    await db.outbox.clear()

    const res = await restoreBackup(dump)
    expect(res.added).toBe(1)
    expect((await db.scenes.get(a.id))?.title).toBe('a')
    expect((await db.scenes.get(b.id))?.title).toBe('b — правка после копии')
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`scenes:${a.id}`])
  })

  it('a manual restore brings back a deleted story', async () => {
    const p = await createProject('Потерянная')
    const dump = JSON.parse(JSON.stringify(await makeBackup()))
    await new Promise((r) => setTimeout(r, 5))
    await remove('projects', p.id)
    await db.outbox.clear()

    const res = await restoreBackup(dump)
    const back = await db.projects.get(p.id)
    expect(back?.deleted, 'story must be alive again').toBeFalsy()
    expect(res.updated).toBeGreaterThanOrEqual(1)
    expect((await db.outbox.toArray()).map((o) => o.key)).toContain(`projects:${p.id}`)
  })

  it('accepts both legacy and versioned backups', () => {
    const legacy = { projects: [{ id: 'p', title: 'Книга', updatedAt: 1 }] }
    expect(parseBackupText(JSON.stringify(legacy)).projects).toHaveLength(1)
    const versioned = { format: 'manuscript-backup', version: 2, createdAt: '2026-11-12T00:00:00.000Z', tables: legacy }
    expect(parseBackupText(JSON.stringify(versioned)).projects).toEqual(legacy.projects)
  })

  it('rejects a future, malformed or oversized backup before writing', async () => {
    expect(() => parseBackupText(JSON.stringify({ format: 'manuscript-backup', version: 99, tables: { projects: [] } }))).toThrow('более новой версией')
    expect(() => parseBackupText(JSON.stringify({ projects: [{ id: 'p', title: 'Книга' }] }))).toThrow('нет даты изменения')
    expect(() => parseBackupText(JSON.stringify({ projects: [], scenes: {} }))).toThrow('неверный формат')
    await expect(readBackupFile({ size: 51 * 1024 * 1024 } as File)).rejects.toThrow('больше 50 МБ')
  })

  it('summarizes active stories and all records for the confirmation', () => {
    const dump = parseBackupText(
      JSON.stringify({
        projects: [
          { id: 'a', title: 'A', updatedAt: 1 },
          { id: 'b', title: 'B', updatedAt: 2, deleted: true },
        ],
        chapters: [{ id: 'c', projectId: 'a', title: 'Глава', order: 0, goal: '', updatedAt: 3 }],
      }),
    )
    expect(backupSummary(dump)).toEqual({ projects: 1, records: 3 })
  })
})
