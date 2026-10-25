import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createLine, createScene, mergeIntoPrevious, mergeSceneIntoPrevious, moveScene, patch, save } from '../db/repo'
import type { Scene } from '../db/db'
import { canRedo, canUndo, clearHistory, once, redo, undo, undoable } from '../lib/undo'

let n = 0
describe('board undo', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`undo-${++n}`)
    useDatabase(d)
    await d.open()
    clearHistory()
  })

  async function twoChapters() {
    const a = await createChapter('p', 'Глава 1')
    const b = await createChapter('p', 'Глава 2')
    const s1 = await createScene('p', a.id, 'один')
    const s2 = await createScene('p', a.id, 'два')
    return { a, b, s1, s2 }
  }

  it('undo puts a moved scene back, redo moves it again', async () => {
    const { a, b, s1, s2 } = await twoChapters()
    await undoable('перенос сцены', () => moveScene(s1.id, b.id, 0))
    expect((await db.scenes.get(s1.id))!.chapterId).toBe(b.id)

    expect(await undo()).toBe(true)
    const back = (await db.scenes.get(s1.id))!
    expect(back.chapterId).toBe(a.id)
    expect(back.order).toBe(0)
    expect((await db.scenes.get(s2.id))!.order).toBe(1)

    expect(await redo()).toBe(true)
    expect((await db.scenes.get(s1.id))!.chapterId).toBe(b.id)
  })

  it('a record created by the action is soft-deleted by undo and brought back by redo', async () => {
    const line = await undoable('новая линия', () => createLine('p', 'Вторая'))
    expect(alive(await db.lines.toArray())).toHaveLength(1)
    await undo()
    const row = (await db.lines.get(line.id))!
    expect(row.deleted).toBe(true) // never a real delete
    expect(alive(await db.lines.toArray())).toHaveLength(0)
    await redo()
    expect(alive(await db.lines.toArray()).map((l) => l.name)).toEqual(['Вторая'])
  })

  it('two actions are undone in reverse order', async () => {
    const { a, b, s1, s2 } = await twoChapters()
    await undoable('первое', () => moveScene(s1.id, b.id, 0))
    await undoable('второе', () => moveScene(s2.id, b.id, 1))
    await undo()
    expect((await db.scenes.get(s2.id))!.chapterId).toBe(a.id)
    expect((await db.scenes.get(s1.id))!.chapterId).toBe(b.id)
    await undo()
    expect((await db.scenes.get(s1.id))!.chapterId).toBe(a.id)
    expect(canUndo()).toBe(false)
    expect(canRedo()).toBe(true)
  })

  it('undo with an empty history does nothing', async () => {
    const { s1 } = await twoChapters()
    expect(await undo()).toBe(false)
    expect(await redo()).toBe(false)
    expect((await db.scenes.get(s1.id))!.title).toBe('один')
  })

  it('writes outside undoable are not recorded', async () => {
    const { s1 } = await twoChapters()
    await patch<Scene>('scenes', s1.id, { title: 'вне' })
    expect(canUndo()).toBe(false)
    expect(await undo()).toBe(false)
    expect((await db.scenes.get(s1.id))!.title).toBe('вне')
    // and a plain write after an action does not join it
    await undoable('правка', () => patch<Scene>('scenes', s1.id, { goal: 'цель' }))
    await patch<Scene>('scenes', s1.id, { title: 'потом' })
    await undo()
    const s = (await db.scenes.get(s1.id))!
    expect(s.goal).toBe('')
    expect(s.title).toBe('потом')
  })

  it('undo restores only the fields the action changed (a word count saved meanwhile stays)', async () => {
    const { b, s1 } = await twoChapters()
    await undoable('перенос сцены', () => moveScene(s1.id, b.id, 0))
    await save<Scene>('scenes', { ...(await db.scenes.get(s1.id))!, wordCount: 120 })
    await undo()
    const s = (await db.scenes.get(s1.id))!
    expect(s.wordCount).toBe(120)
    expect(s.chapterId).not.toBe(b.id)
  })

  it('a merged chapter comes back with its scenes', async () => {
    const { a, b, s1 } = await twoChapters()
    const s3 = await createScene('p', b.id, 'три')
    await undoable('склейка глав', () => mergeIntoPrevious(b.id))
    expect(alive(await db.chapters.toArray()).map((c) => c.id)).toEqual([a.id])
    expect((await db.scenes.get(s3.id))!.chapterId).toBe(a.id)
    await undo()
    expect(alive(await db.chapters.toArray()).map((c) => c.id).sort()).toEqual([a.id, b.id].sort())
    expect((await db.scenes.get(s3.id))!.chapterId).toBe(b.id)
    expect((await db.scenes.get(s1.id))!.chapterId).toBe(a.id)
  })

  it('a new action drops what could be redone; the history keeps at most 50 actions', async () => {
    const { b, s1 } = await twoChapters()
    await undoable('перенос', () => moveScene(s1.id, b.id, 0))
    await undo()
    expect(canRedo()).toBe(true)
    await undoable('правка', () => patch<Scene>('scenes', s1.id, { goal: 'x' }))
    expect(canRedo()).toBe(false)

    clearHistory()
    for (let i = 0; i < 55; i++) await undoable('шаг', () => patch<Scene>('scenes', s1.id, { goal: `g${i}` }))
    let undone = 0
    while (await undo()) undone++
    expect(undone).toBe(50)
  })

  it('an action that changes nothing leaves no history', async () => {
    const { a, s1 } = await twoChapters()
    await undoable('ничего', () => moveScene(s1.id, a.id, 0))
    expect(canUndo()).toBe(false)
  })

  it('once ignores a second call while the first is running', async () => {
    let runs = 0
    const job = () =>
      once('k', async () => {
        runs++
        await new Promise((r) => setTimeout(r, 10))
        return 1
      })
    const [x, y] = await Promise.all([job(), job()])
    expect([x, y]).toEqual([1, undefined])
    expect(runs).toBe(1)
    await job()
    expect(runs).toBe(2)
  })

  // A text written after the action must not vanish when the action is undone later.
  it('undoing a scene merge keeps the text typed after it, in versions', async () => {
    const { s1, s2 } = await twoChapters()
    const para = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
    await save('texts', { ...(await db.texts.get(s1.id))!, content: para('Первая.') })
    await save('texts', { ...(await db.texts.get(s2.id))!, content: para('Вторая.') })
    await undoable('склейка сцен', () => mergeSceneIntoPrevious(s2.id))
    const merged = (await db.texts.get(s1.id))!
    const later = { ...merged, content: para('Первая. Вторая. И ещё час письма.') }
    await save('texts', later)
    await undo()
    const snaps = await db.snapshots.where('sceneId').equals(s1.id).toArray()
    expect(snaps.map((x) => JSON.stringify(x.content)).join()).toContain('И ещё час письма.')
  })
})
