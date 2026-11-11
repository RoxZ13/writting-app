import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project, type SyncConflict } from '../db/db'
import { createProject, patch, save } from '../db/repo'
import { conflictChanges, dismissConflict, restoreConflict } from '../lib/conflicts'

let n = 0

describe('conflict recovery', () => {
  beforeEach(async () => {
    const database = new ManuscriptDB(`conflicts-${++n}`)
    useDatabase(database)
    await database.open()
  })

  async function fixture() {
    const created = await createProject('Текущий вариант')
    await patch<Project>('projects', created.id, { nextStep: 'Поздняя отдельная правка' })
    const winning = (await db.projects.get(created.id))!
    const losing: Project = { ...winning, title: 'Сохранённый вариант', nextStep: undefined }
    const winningAtConflict: Project = { ...winning, nextStep: undefined }
    const now = Date.now()
    const conflict = await save<SyncConflict>('conflicts', {
      id: `conflict-${n}`,
      table: 'projects',
      recordId: created.id,
      projectId: created.id,
      losing,
      winning: winningAtConflict,
      reason: 'Одновременная правка',
      createdAt: now,
      updatedAt: now,
    })
    return { created, conflict }
  }

  it('shows only domain fields that differ', async () => {
    const { conflict } = await fixture()
    expect(conflictChanges(conflict).map((change) => change.field)).toEqual(['title'])
  })

  it('restores the losing fields without overwriting later unrelated edits', async () => {
    const { created, conflict } = await fixture()
    await restoreConflict(conflict)

    const project = await db.projects.get(created.id)
    expect(project?.title).toBe('Сохранённый вариант')
    expect(project?.nextStep).toBe('Поздняя отдельная правка')
    expect((await db.conflicts.get(conflict.id))?.deleted).toBe(true)
    expect(await db.outbox.get(`projects:${created.id}`)).toBeDefined()
    expect(await db.outbox.get(`conflicts:${conflict.id}`)).toBeDefined()
  })

  it('can keep the current variant and close the conflict', async () => {
    const { created, conflict } = await fixture()
    await dismissConflict(conflict)
    expect((await db.projects.get(created.id))?.title).toBe('Текущий вариант')
    expect((await db.conflicts.get(conflict.id))?.deleted).toBe(true)
  })
})
