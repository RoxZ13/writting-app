import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createLine, createMarker, createProject, createScene, patch } from '../db/repo'
import { editionTitle, newEdition } from '../lib/edition'
import type { Scene } from '../db/db'

let n = 0
describe('new edition', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`edition-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('names editions in order', () => {
    expect(editionTitle('Геката')).toBe('Геката — редакция 2')
    expect(editionTitle('Геката — редакция 2')).toBe('Геката — редакция 3')
  })

  it('copies the skeleton with empty pages and the old text beside each scene', async () => {
    const p = await createProject('Геката')
    const ch = await createChapter(p.id, 'Часть 1')
    const line = await createLine(p.id, 'Том')
    const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
    const a = await createScene(p.id, ch.id, 'Бал', { goal: 'встреча', lineIds: [line.id], beats: [{ id: 'b', text: 'танец', done: true }] }, { type: 'doc', content: [para('Музыка гремела.')] }, 2)
    await createMarker(p.id, { title: 'кольцо', setupSceneId: a.id, setupChapterId: ch.id })
    await patch<Scene>('scenes', a.id, { wordCount: 2 })

    const { projectId } = await newEdition(p.id)
    const scenes = alive(await db.scenes.where('projectId').equals(projectId).toArray())
    const lines = alive(await db.lines.where('projectId').equals(projectId).toArray())
    const ball = scenes.find((s) => s.title === 'Бал')!
    expect(ball.goal).toBe('встреча')
    expect(ball.beats[0]).toMatchObject({ text: 'танец', done: false })
    expect(ball.lineIds).toEqual([lines[0].id])
    expect(ball.wordCount).toBe(0)
    expect(JSON.stringify((await db.texts.get(ball.id))!.content)).not.toContain('Музыка')
    const old = await db.snapshots.get(ball.rewriteFrom!)
    expect(JSON.stringify(old!.content)).toContain('Музыка')
    const markers = alive(await db.markers.where('projectId').equals(projectId).toArray())
    expect(markers[0]).toMatchObject({ title: 'кольцо', setupSceneId: ball.id, resolved: false })
    // The old edition is untouched.
    expect(JSON.stringify((await db.texts.get(a.id))!.content)).toContain('Музыка')
  })
})
