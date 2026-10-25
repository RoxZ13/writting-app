import { describe, expect, it } from 'vitest'
import { fixQuotes, typograf } from '../lib/typograf'

describe('typograf', () => {
  it('turns a hyphen at the start of a paragraph into a dialogue dash', () => {
    expect(typograf('- Ты опять не спишь?')).toBe('— Ты опять не спишь?')
    expect(typograf('-- Нет.\n- Да.')).toBe('— Нет.\n— Да.')
  })

  it('turns hyphens between words into a dash and keeps real hyphens', () => {
    expect(typograf('Москва - город, кто-то пришёл')).toBe('Москва — город, кто-то пришёл')
    expect(typograf('спросил он -- тихо')).toBe('спросил он — тихо')
    expect(typograf('— Нет, - сказал он.')).toBe('— Нет, — сказал он.')
  })

  it('makes «ёлочки» and nested „лапки“', () => {
    expect(fixQuotes('Он сказал "привет".')).toBe('Он сказал «привет».')
    expect(fixQuotes('"Книга "Мастер" лежала"')).toBe('«Книга „Мастер“ лежала»')
    expect(fixQuotes('“English” quotes')).toBe('«English» quotes')
  })

  it('cleans ellipses and spaces', () => {
    expect(typograf('  Ну...   и что ?')).toBe('Ну… и что?')
    expect(typograf('Стой , — сказала она')).toBe('Стой, — сказала она')
  })

  it('leaves typeset text alone', () => {
    const done = '— «Гость» придёт сегодня… — сказала Мара. Кто-то постучал.'
    expect(typograf(done)).toBe(done)
    expect(typograf(typograf('- "Да" - сказал он...'))).toBe('— «Да» — сказал он…')
  })
})
