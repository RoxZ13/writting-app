import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db } from '../db/db'
import { alive, createChapter, createScene, remove } from '../db/repo'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { archiveStash, createStashNote, stashNodes, stashTransaction } from '../lib/stash'

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

describe('stashTransaction: no empty paragraph left behind', () => {
  const schema = getSchema([StarterKit])
  const para = (text?: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })
  const make = (...texts: (string | undefined)[]) =>
    EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: texts.map(para) }) })
  /** Start and end (text positions) of paragraph `i`, from its first to its last character. */
  const bounds = (state: EditorState, i: number) => {
    let pos = 0
    for (let k = 0; k < i; k++) pos += state.doc.child(k).nodeSize
    return [pos + 1, pos + 1 + state.doc.child(i).content.size] as const
  }
  const texts = (state: EditorState) => state.doc.children.map((c) => c.textContent)

  it('a whole last paragraph goes without leaving an empty one', () => {
    const s = make('Первый.', 'Второй.')
    const [a, b] = bounds(s, 1)
    const next = s.apply(stashTransaction(s, a, b))
    expect(texts(next)).toEqual(['Первый.'])
  })

  it('a whole paragraph in the middle goes too', () => {
    const s = make('Первый.', 'Второй.', 'Третий.')
    const [a, b] = bounds(s, 1)
    const next = s.apply(stashTransaction(s, a, b))
    expect(texts(next)).toEqual(['Первый.', 'Третий.'])
  })

  it('several whole paragraphs go together', () => {
    const s = make('Первый.', 'Второй.', 'Третий.')
    const next = s.apply(stashTransaction(s, bounds(s, 1)[0], bounds(s, 2)[1]))
    expect(texts(next)).toEqual(['Первый.'])
  })

  it('the only paragraph of the scene stays, empty', () => {
    const s = make('Единственный.')
    const [a, b] = bounds(s, 0)
    const next = s.apply(stashTransaction(s, a, b))
    expect(texts(next)).toEqual([''])
  })

  it('a piece that does not start at a paragraph start leaves the rest in place', () => {
    const s = make('Первый.', 'Второй абзац.')
    const [a, b] = bounds(s, 1)
    const next = s.apply(stashTransaction(s, a + 7, b))
    expect(texts(next)).toEqual(['Первый.', 'Второй '])
  })

  it('a piece that does not reach the end of its paragraph keeps the tail', () => {
    const s = make('Первый.', 'Второй абзац.')
    const [a] = bounds(s, 1)
    const next = s.apply(stashTransaction(s, a, a + 7))
    expect(texts(next)).toEqual(['Первый.', 'абзац.'])
  })

  it('the cursor lands at the end of the paragraph before', () => {
    const s = make('Первый.', 'Второй.')
    const [a, b] = bounds(s, 1)
    const next = s.apply(stashTransaction(s, a, b))
    expect(next.selection.from).toBe(1 + 'Первый.'.length)
  })
})
