import { describe, expect, it } from 'vitest'
import { checkBlocks } from '../lib/editcheck'

const kinds = (text: string, kind: string) =>
  checkBlocks([{ text, base: 0 }])
    .filter((h) => h.kind === kind)
    .map((h) => text.slice(h.from, h.to))

describe('edit hints', () => {
  it('finds a word repeated too soon, in other forms too', () => {
    expect(kinds('Тишина давила. Эта тишина была невыносимой, и тишиной пропах весь коридор.', 'repeat')).toEqual(['Тишина', 'тишина', 'тишиной'])
  })
  it('does not flag names or short words', () => {
    expect(kinds('Гермиона кивнула. Потом Гермиона снова кивнула Тому, и Том ушёл.', 'repeat')).toEqual(['кивнула', 'кивнула'])
  })
  it('flags filler words', () => {
    expect(kinds('Было очень тихо, и она вдруг начала плакать.', 'filler')).toEqual(['Было', 'очень', 'вдруг', 'начала'])
  })
  it('flags a sentence that runs too long', () => {
    const long = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(' ') + '.'
    const hints = kinds(`Короткое. ${long} Ещё одно.`, 'long')
    expect(hints).toEqual([long])
  })
  it('keeps document positions', () => {
    const [h] = checkBlocks([{ text: 'Он был тут.', base: 10 }]).filter((x) => x.kind === 'filler')
    expect([h.from, h.to]).toEqual([13, 16])
  })
})
