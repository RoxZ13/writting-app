import { describe, expect, it } from 'vitest'
import type { Note } from '../db/db'
import { loreInText } from '../lib/lore'

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
