import { describe, expect, it } from 'vitest'
import { formatWords, formatWordsOf, formatWordsPlus, wordNoun } from '../lib/text'

const nb = (s: string) => s.replace(/\u00a0|\u202f/g, ' ')

describe('Russian plural forms of «слово»', () => {
  const cases: [number, string][] = [
    [0, 'слов'],
    [1, 'слово'],
    [2, 'слова'],
    [3, 'слова'],
    [4, 'слова'],
    [5, 'слов'],
    [10, 'слов'],
    [11, 'слов'],
    [12, 'слов'],
    [13, 'слов'],
    [14, 'слов'],
    [15, 'слов'],
    [21, 'слово'],
    [22, 'слова'],
    [25, 'слов'],
    [101, 'слово'],
    [111, 'слов'],
    [112, 'слов'],
    [1002, 'слова'],
  ]
  it.each(cases)('%i → %s', (n, word) => {
    expect(wordNoun(n)).toBe(word)
    expect(nb(formatWords(n))).toBe(`${nb(n.toLocaleString('ru-RU'))} ${word}`)
  })

  it('a gain is shown with a plus and the right form: «+2 слова», not «+2 слов»', () => {
    expect(formatWordsPlus(1)).toBe('+1 слово')
    expect(formatWordsPlus(2)).toBe('+2 слова')
    expect(formatWordsPlus(5)).toBe('+5 слов')
    expect(formatWordsPlus(11)).toBe('+11 слов')
    expect(nb(formatWordsPlus(340))).toBe('+340 слов')
    expect(nb(formatWordsPlus(1204))).toBe('+1 204 слова')
  })

  it('after «из» the genitive is used: «из 1 слова», «из 21 слова», «из 500 слов»', () => {
    expect(formatWordsOf(1)).toBe('1 слова')
    expect(formatWordsOf(2)).toBe('2 слов')
    expect(formatWordsOf(11)).toBe('11 слов')
    expect(formatWordsOf(21)).toBe('21 слова')
    expect(nb(formatWordsOf(500))).toBe('500 слов')
  })
})
