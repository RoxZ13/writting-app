import { describe, expect, it } from 'vitest'
import type { Note } from '../db/db'
import { loreForScene, loreInText } from '../lib/lore'

const entry = (title: string): Note => ({ id: title, title, text: '', kind: 'lore', archived: false, createdAt: 0, updatedAt: 0 })

describe('lore in text', () => {
  const lore = ['Хогвартс', 'Выручай-комната', 'Дары Смерти', 'окклюменция', 'Орден'].map(entry)
  it('finds names in other cases', () => {
    const text = 'Она вернулась в Хогвартсе, нашла выручай-комнату и думала о Дарах Смерти. Окклюменцией она не владела.'
    expect(loreInText(lore, text).map((n) => n.title)).toEqual(['Хогвартс', 'Выручай-комната', 'Дары Смерти', 'окклюменция'])
  })
  it('does not match inside other words', () => {
    expect(loreInText([entry('Орден')], 'Она была упорденной')).toEqual([])
    expect(loreInText([entry('Орден')], 'Члены Ордена молчали').length).toBe(1)
  })
})

describe('lore for a scene', () => {
  const pinned = (title: string, extra: Partial<Note>): Note => ({ ...entry(title), ...extra })
  it('collects pinned, chapter, hero and mentioned entries, strongest reason first', () => {
    const lore = [
      pinned('Выручай-комната', {}),
      pinned('Орден', { characterIds: ['tom'] }),
      pinned('Дата миссии', { chapterIds: ['ch1'] }),
      pinned('Маховик', { sceneIds: ['s1'] }),
      pinned('Азкабан', {}),
    ]
    const r = loreForScene(lore, { id: 's1', chapterId: 'ch1', characterIds: ['tom'] }, 'Она нашла выручай-комнату.')
    expect(r.map((x) => [x.note.title, x.reason])).toEqual([
      ['Маховик', 'scene'],
      ['Дата миссии', 'chapter'],
      ['Орден', 'hero'],
      ['Выручай-комната', 'mention'],
    ])
  })
})
