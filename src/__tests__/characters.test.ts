import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ManuscriptDB, useDatabase, db, type Character, type Note } from '../db/db'
import { alive, createChapter, createNote, createScene, findOrCreateCharacter, mergeCharacters, patch, toggleSceneRef } from '../db/repo'

let n = 0
describe('characters', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`chars-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('does not create a twin when the same name is typed again', async () => {
    const a = await findOrCreateCharacter('p', 'Альфард')
    const b = await findOrCreateCharacter('p', ' альфард ')
    expect(b.id).toBe(a.id)
  })

  it('merges a duplicate with all its scenes and quotes', async () => {
    const tom = await findOrCreateCharacter('p', 'Том')
    const twin = await findOrCreateCharacter('p', 'Томас')
    await patch<Character>('characters', twin.id, { about: 'Любит тайны' })
    const ch = await createChapter('p', 'Часть 1')
    const s = await createScene('p', ch.id, 'Сцена')
    await toggleSceneRef(s.id, 'characterIds', twin.id)
    const q = await createNote('Я сообщаю.', 'quote', 'p')
    await patch<Note>('notes', q.id, { characterIds: [twin.id] })

    await mergeCharacters(twin.id, tom.id)

    expect(alive(await db.characters.toArray()).map((c) => c.name)).toEqual(['Том'])
    expect((await db.scenes.get(s.id))!.characterIds).toEqual([tom.id])
    expect((await db.notes.get(q.id))!.characterIds).toEqual([tom.id])
    expect((await db.characters.get(tom.id))!.about).toBe('Любит тайны')
  })
})

import { tidyImportedScenes } from '../db/repo'

describe('tidy imported scenes', () => {
  beforeEach(async () => {
    const d = new ManuscriptDB(`tidy-${++n}`)
    useDatabase(d)
    await d.open()
  })

  it('drops titles made from the first words and lifts song lines into epigraphs', async () => {
    const ch = await createChapter('p', 'Часть 4')
    const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
    const a = await createScene('p', ch.id, 'Как она и предполагала, Блэк достал…', {}, { type: 'doc', content: [para('Как она и предполагала, Блэк достал где-то карту.')] })
    const b = await createScene('p', ch.id, 'AC/DC — Wild Reputation', {}, { type: 'doc', content: [para('AC/DC — Wild Reputation'), para('Грейнджер готовилась.')] })
    const c = await createScene('p', ch.id, 'Бал у Слизнорта', {}, { type: 'doc', content: [para('Музыка гремела.')] })
    await tidyImportedScenes('p')
    const [sa, sb, sc] = await Promise.all([db.scenes.get(a.id), db.scenes.get(b.id), db.scenes.get(c.id)])
    expect(sa!.title).toBe('')
    expect(sa!.excerpt).toBe('Как она и предполагала, Блэк достал где-то карту.')
    expect(sb!.title).toBe('')
    expect(sb!.epigraph).toBe('AC/DC — Wild Reputation')
    expect(sb!.excerpt).toBe('Грейнджер готовилась.')
    expect(sc!.title).toBe('Бал у Слизнорта') // a real title the author wrote stays
  })
})
