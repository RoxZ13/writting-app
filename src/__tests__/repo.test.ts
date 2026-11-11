import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project } from '../db/db'
import { createProject, deleteChapter, patch } from '../db/repo'

let n = 0

describe('repository writes', () => {
  beforeEach(async () => {
    const database = new ManuscriptDB(`repo-${++n}`)
    useDatabase(database)
    await database.open()
  })

  it('keeps two concurrent patches of different fields', async () => {
    const project = await createProject('Черновик')

    await Promise.all([
      patch<Project>('projects', project.id, { title: 'Новое название' }),
      patch<Project>('projects', project.id, { nextStep: 'Дополнить финал' }),
    ])

    const saved = await db.projects.get(project.id)
    expect(saved?.title).toBe('Новое название')
    expect(saved?.nextStep).toBe('Дополнить финал')
    expect(await db.outbox.get(`projects:${project.id}`)).toBeDefined()
  })

  it('rolls back the whole new book when its first text cannot be stored', async () => {
    const fail = () => {
      throw new Error('quota')
    }
    db.texts.hook('creating', fail)
    try {
      await expect(createProject('Не целиком')).rejects.toThrow('quota')
    } finally {
      db.texts.hook('creating').unsubscribe(fail)
    }

    expect(await db.projects.count()).toBe(0)
    expect(await db.chapters.count()).toBe(0)
    expect(await db.scenes.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('rolls back scene deletion when the chapter write fails', async () => {
    const project = await createProject('Книга')
    const chapter = await db.chapters.where('projectId').equals(project.id).first()
    const scene = await db.scenes.where('projectId').equals(project.id).first()
    const fail = () => {
      throw new Error('quota')
    }
    db.chapters.hook('updating', fail)
    try {
      await expect(deleteChapter(chapter!.id)).rejects.toThrow('quota')
    } finally {
      db.chapters.hook('updating').unsubscribe(fail)
    }

    expect((await db.chapters.get(chapter!.id))?.deleted).not.toBe(true)
    expect((await db.scenes.get(scene!.id))?.deleted).not.toBe(true)
    expect((await db.texts.get(scene!.id))?.deleted).not.toBe(true)
  })
})
