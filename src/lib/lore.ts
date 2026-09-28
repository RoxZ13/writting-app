import type { Note } from '../db/db'

const letters = '\\p{L}'

/** A loose pattern for a name in Russian text: every word of 4+ letters by its stem, so «Хогвартса» finds «Хогвартс». */
export function lorePattern(title: string): RegExp[] {
  const words = title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}-]+/u)
    .filter((w) => w.length >= 3)
  const sig = words.filter((w) => w.length >= 4)
  return (sig.length ? sig : words).map((w) => {
    const stem = w.length > 5 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w
    return new RegExp(`(?<![${letters}])${stem}`, 'iu')
  })
}

/** Entries of the world's lore that the text mentions. */
export function loreInText(lore: Note[], text: string): Note[] {
  const plain = text.toLowerCase().replace(/ё/g, 'е')
  return lore.filter((n) => {
    const pats = lorePattern(n.title ?? '')
    return pats.length > 0 && pats.every((re) => re.test(plain))
  })
}
