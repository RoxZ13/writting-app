import { describe, expect, it } from 'vitest'
import type { Character, Note } from '../db/db'
import { whereFound } from '../lib/mentions'

const hero = (id: string, name: string, extra: Partial<Character> = {}): Character => ({ id, name, projectId: 'p', color: '', about: '', order: 0, updatedAt: 0, ...extra })
const lore = (id: string, title: string, extra: Partial<Note> = {}): Note => ({ id, title, text: '', kind: 'lore', archived: false, createdAt: 0, updatedAt: 0, ...extra })

describe('где встречается', () => {
  const scenes = [
    { id: 's1', chapterId: 'c1' },
    { id: 's2', chapterId: 'c1', characterIds: ['tom'] },
    { id: 's3', chapterId: 'c2' },
  ]
  const texts = new Map([
    ['s1', 'Гермиону разбудил стук. Реддл стоял у окна.'],
    ['s2', 'Тишина.'],
    ['s3', 'Они спорили о Дарах Смерти, и Гермионой овладела злость.'],
  ])
  it('finds heroes by name and other names in any case, plus scenes marked by hand', () => {
    const r = whereFound(scenes, texts, [hero('her', 'Гермиона Грейнджер'), hero('tom', 'Том', { aliases: 'Реддл' })], [])
    expect(r.get('her')?.map((f) => f.sceneId)).toEqual(['s1', 's3'])
    expect(r.get('tom')).toEqual([
      { sceneId: 's1', manual: false },
      { sceneId: 's2', manual: true },
    ])
  })
  it('finds lore by title or another name, and forgets a scene marked «не то»', () => {
    const r = whereFound(scenes, texts, [], [lore('dary', 'Дары Смерти', { ignoreSceneIds: ['s1'] }), lore('okno', 'Башня', { aliases: 'окно', chapterIds: ['c2'] })])
    expect(r.get('dary')?.map((f) => f.sceneId)).toEqual(['s3'])
    expect(r.get('okno')?.map((f) => [f.sceneId, f.manual])).toEqual([
      ['s1', false],
      ['s3', true],
    ])
  })
})
