import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createScene, ensurePool, mergeIntoPrevious, moveScene, splitChapterAt } from '../db/repo'

let n = 0
async function titles() {
  const chapters = alive(await db.chapters.toArray()).sort((a, b) => a.order - b.order)
  const scenes = alive(await db.scenes.toArray())
  return chapters.map((c) => [c.title, ...scenes.filter((s) => s.chapterId === c.id).sort((a, b) => a.order - b.order).map((s) => s.title)])
}

describe('"Пока без места" pool', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`pool-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('is created once per project', async () => {
    const a = await ensurePool('p')
    const b = await ensurePool('p')
    expect(a.id).toBe(b.id)
    expect(alive(await db.chapters.toArray()).filter((c) => c.pool)).toHaveLength(1)
  })

  it('is left alone when chapters are split or merged', async () => {
    const pool = await ensurePool('p')
    await createScene('p', pool.id, 'idea')
    const story = await createChapter('p', 'Вся история')
    for (const t of ['a', 'b', 'c']) await createScene('p', story.id, t)
    const b = (await db.scenes.toArray()).find((s) => s.title === 'b')!
    const second = await splitChapterAt(b.id, 'Глава 2')
    expect(await titles()).toEqual([['Пока без места', 'idea'], ['Вся история', 'a'], ['Глава 2', 'b', 'c']])
    await mergeIntoPrevious(story.id)
    // The first real chapter has nothing before it: merging it must not pour it into the pool.
    expect(await titles()).toEqual([['Пока без места', 'idea'], ['Вся история', 'a'], ['Глава 2', 'b', 'c']])
    await mergeIntoPrevious(second!.id)
    expect(await titles()).toEqual([['Пока без места', 'idea'], ['Вся история', 'a', 'b', 'c']])
  })

  it('hands a scene over to a chapter', async () => {
    const pool = await ensurePool('p')
    const idea = await createScene('p', pool.id, 'idea')
    const story = await createChapter('p', 'Вся история')
    await createScene('p', story.id, 'a')
    await createScene('p', story.id, 'b')
    await moveScene(idea.id, story.id, 1)
    expect(await titles()).toEqual([['Пока без места'], ['Вся история', 'a', 'idea', 'b']])
  })
})
