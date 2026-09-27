import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createScene, mergeIntoPrevious, splitChapterAt, applyOutline } from '../db/repo'

let n = 0
async function outline() {
  const chapters = alive(await db.chapters.toArray()).sort((a, b) => a.order - b.order)
  const scenes = alive(await db.scenes.toArray())
  return chapters.map((c) => [
    c.title,
    ...scenes.filter((s) => s.chapterId === c.id).sort((a, b) => a.order - b.order).map((s) => s.title),
  ])
}

describe('outline restructuring', () => {
  let ch1: string
  beforeEach(async () => {
    const d = new ManuscriptDB(`outline-${++n}`)
    useDatabase(d)
    await d.open()
    const c = await createChapter('p', 'Глава 1')
    ch1 = c.id
    for (const t of ['a', 'b', 'c', 'd']) await createScene('p', c.id, t)
    const c2 = await createChapter('p', 'Глава 2')
    await createScene('p', c2.id, 'e')
  })

  it('splits a chapter at a scene', async () => {
    const c = (await db.scenes.toArray()).find((s) => s.title === 'c')!
    await splitChapterAt(c.id, 'Новая')
    expect(await outline()).toEqual([['Глава 1', 'a', 'b'], ['Новая', 'c', 'd'], ['Глава 2', 'e']])
  })

  it('merges a chapter into the previous one', async () => {
    const c2 = (await db.chapters.toArray()).find((c) => c.title === 'Глава 2')!
    await mergeIntoPrevious(c2.id)
    expect(await outline()).toEqual([['Глава 1', 'a', 'b', 'c', 'd', 'e']])
  })

  it('moves a scene across chapters by reading order', async () => {
    const all = await db.scenes.toArray()
    const id = (t: string) => all.find((s) => s.title === t)!.id
    const c2 = (await db.chapters.toArray()).find((c) => c.title === 'Глава 2')!
    await applyOutline([
      { type: 'chapter', id: ch1 },
      { type: 'scene', id: id('a') },
      { type: 'scene', id: id('b') },
      { type: 'chapter', id: c2.id },
      { type: 'scene', id: id('d') },
      { type: 'scene', id: id('c') },
      { type: 'scene', id: id('e') },
    ])
    expect(await outline()).toEqual([['Глава 1', 'a', 'b'], ['Глава 2', 'd', 'c', 'e']])
  })
})
