import { describe, expect, it } from 'vitest'
import { countMentions, heroesFromDescription, heroScenes, mentionPatterns } from '../lib/heroes'

describe('heroes from a Ficbook header', () => {
  it('reads names from "Пэйринг и персонажи"', () => {
    const desc = 'Фэндом: Гарри Поттер\nПэйринг и персонажи: Том Марволо Реддл/Гермиона Грейнджер, Антонин Долохов, Альфард Блэк, Вальбурга Блэк\nРейтинг: NC-17'
    expect(heroesFromDescription(desc)).toEqual(['Том Марволо Реддл', 'Гермиона Грейнджер', 'Антонин Долохов', 'Альфард Блэк', 'Вальбурга Блэк'])
  })

  it('finds names in any case ending, but not a shared family name', () => {
    const chars = [
      { id: 'tom', name: 'Том Марволо Реддл' },
      { id: 'her', name: 'Гермиона Грейнджер' },
      { id: 'alf', name: 'Альфард Блэк' },
      { id: 'wal', name: 'Вальбурга Блэк' },
    ]
    const re = mentionPatterns(chars)
    const text = 'Тому было всё равно. Гермионы не было. Грейнджер вздохнула. Блэк молчал. Это был том энциклопедии.'
    expect(countMentions(text, re.get('tom')!)).toBe(1)
    expect(countMentions(text, re.get('her')!)).toBe(2)
    expect(countMentions(text, re.get('alf')!)).toBe(0)
  })
})

describe('branches from heroes', () => {
  it('takes scenes where the hero is marked or named twice, not once in passing', () => {
    const chars = [
      { id: 'her', name: 'Гермиона' },
      { id: 'tom', name: 'Том', ignoreSceneIds: ['c'] },
    ]
    const scenes = [{ id: 'a' }, { id: 'b', characterIds: ['tom'] }, { id: 'c' }]
    const texts = new Map([
      ['a', 'Гермиона вошла. Гермионе было холодно. Том был далеко.'],
      ['b', 'Пусто.'],
      ['c', 'Том и Тому, и Гермиона.'],
    ])
    const r = heroScenes(scenes, texts, chars)
    expect(r.get('her')).toEqual(['a'])
    expect(r.get('tom')).toEqual(['b'])
  })
})
