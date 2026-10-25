import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Project, type Scene } from '../db/db'
import * as repo from '../db/repo'
import { createChapter, createScene } from '../db/repo'
import { createTailChapter, trimHead } from '../components/ChapterMeter'

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...t: string[]) => ({ type: 'doc', content: t.map(para) })

let n = 0
describe('chapter split keeps the tail', () => {
  let scene: Scene
  const project = { id: 'p' } as Project

  beforeEach(async () => {
    const d = new ManuscriptDB(`split-${++n}`)
    useDatabase(d)
    await d.open()
    const c = await createChapter('p', 'Глава 1')
    scene = await createScene('p', c.id, 'Сцена', {}, doc('один', 'два', 'три', 'четыре'), 4)
  })
  afterEach(() => vi.restoreAllMocks())

  const textOf = async (id: string) => JSON.stringify((await db.texts.get(id))?.content)

  it('creates the new scene with the tail first, then cuts the head', async () => {
    const next = await createTailChapter(project, scene, doc('три', 'четыре'))
    // Before the head is cut, the text exists in both scenes: duplicated, not lost.
    expect(await textOf(next.id)).toContain('четыре')
    expect(await textOf(scene.id)).toContain('четыре')

    await trimHead(scene.id, doc('один', 'два'))
    expect(await textOf(scene.id)).not.toContain('три')
    expect(await textOf(next.id)).toContain('три')
    expect((await db.scenes.get(scene.id))?.wordCount).toBe(2)
  })

  it('leaves the original text untouched when creating the new chapter fails', async () => {
    const before = await textOf(scene.id)
    vi.spyOn(repo, 'splitChapterAt').mockRejectedValue(new Error('boom'))
    await expect(createTailChapter(project, scene, doc('три', 'четыре'))).rejects.toThrow('boom')
    // createTailChapter never touches the original scene; trimHead is not reached by the caller.
    expect(await textOf(scene.id)).toBe(before)
    expect((await db.scenes.get(scene.id))?.wordCount).toBe(4)
  })
})
