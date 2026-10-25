import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createScene, remove } from '../db/repo'
import { archiveStash, createStashNote, stashNodes } from '../lib/stash'

let n = 0
describe('stash notes («В запас»)', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`stash-${++n}`)
    useDatabase(d)
    await d.open()
  })

  const nodes = [
    { type: 'paragraph', content: [{ type: 'text', text: 'Она ', marks: [] }, { type: 'text', text: 'не пришла', marks: [{ type: 'italic' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Второй абзац.' }] },
  ]

  it('stores the formatted piece, its plain text and the scene', async () => {
    const ch = await createChapter('p', 'Глава')
    const s = await createScene('p', ch.id, 'Сцена')
    const note = await createStashNote('p', s.id, 'Она не пришла\nВторой абзац.', nodes, 'fixed-id')
    const stored = await db.notes.get('fixed-id')
    expect(stored).toBeTruthy()
    expect(note.id).toBe('fixed-id')
    expect(stored!.sceneId).toBe(s.id)
    expect(stored!.projectId).toBe('p')
    expect(stored!.kind).toBe('note')
    expect(stored!.archived).toBe(false)
    expect(stored!.text).toBe('Она не пришла\nВторой абзац.')
    expect(JSON.stringify(stored!.content)).toContain('italic')
    expect((stored!.content as { type: string }).type).toBe('doc')
  })

  it('«Вернуть» archives the note instead of deleting it', async () => {
    const note = await createStashNote('p', 's1', 'Кусок', nodes)
    await archiveStash(note.id)
    const stored = await db.notes.get(note.id)
    expect(stored!.archived).toBe(true)
    expect(stored!.deleted).toBeFalsy()
  })

  it('an undone stash is soft-deleted, so sync still sees it', async () => {
    const note = await createStashNote('p', 's1', 'Кусок', nodes)
    await remove('notes', note.id)
    const stored = await db.notes.get(note.id)
    expect(stored!.deleted).toBe(true)
    expect(alive(await db.notes.toArray())).toEqual([])
  })

  it('gives back the stored paragraphs, or builds them from plain text', () => {
    expect(stashNodes({ text: 'x', content: { type: 'doc', content: nodes } })).toEqual(nodes)
    expect(stashNodes({ text: 'Один\n\nТри' })).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Один' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Три' }] },
    ])
  })
})
