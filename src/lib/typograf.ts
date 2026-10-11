/**
 * Russian typesetting for prose, as in Лебедевский «Типограф» but only what fiction needs:
 * dashes, «ёлочки» with „лапками“ inside, the ellipsis, single spaces.
 * Pure string → string, so it works on pasted text, on a whole scene and in tests.
 */

/** Opening quote position: start of text, after a space, an opening bracket, a dash or another quote. */
const OPENS_BEFORE = /[\s([{«„—–-]/

/** Straight and “English” quotes → «ёлочки», nested ones → „лапки“. */
export function fixQuotes(s: string): string {
  let depth = 0
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '"' && c !== '“' && c !== '”' && c !== '«' && c !== '»' && c !== '„') {
      out += c
      continue
    }
    const prev = s[i - 1]
    const opening = c === '«' || c === '„' || (c !== '»' && (i === 0 || OPENS_BEFORE.test(prev)))
    if (opening) {
      out += depth === 0 ? '«' : '„'
      depth++
    } else {
      depth = Math.max(0, depth - 1)
      out += depth === 0 ? '»' : '“'
    }
  }
  return out
}

/** How many quotes are open at the end of `s` — tells whether the next `"` opens or closes. */
export function quoteDepth(s: string): number {
  let depth = 0
  for (const c of fixQuotes(s)) {
    if (c === '«' || c === '„') depth++
    else if (c === '»' || c === '“') depth = Math.max(0, depth - 1)
  }
  return depth
}

/** Whether a `"` typed right after `before` opens a quote. */
export const quoteOpens = (before: string) => before === '' || OPENS_BEFORE.test(before[before.length - 1])

/**
 * A paragraph split into pieces (text with different marks: italic, a marker…). The pieces are
 * typeset together, so quotes pair up across them, and each comes back on its own.
 */
export function typografPieces(pieces: string[]): string[] {
  const SEP = '\u0000'
  const out = typograf(pieces.join(SEP)).split(SEP)
  return out.length === pieces.length ? out : pieces
}

/** Every rule at once. Safe to run twice: typeset text stays the same. */
export function typograf(s: string): string {
  return fixQuotes(
    s
      .replace(/\.{3,}/g, '…')
      // A hyphen or two at the start of a paragraph is a line of dialogue.
      .replace(/^[ \t]*(?:-{1,3}|–)[ \t]+/gm, '— ')
      // Between words: «слово - слово», «слово -- слово», «слово – слово».
      .replace(/([^\s])[ \t]+(?:-{1,3}|–|—)[ \t]+/g, '$1 — ')
      .replace(/([^\s-])---?(?=[^\s-])/g, '$1—')
      .replace(/[ \t]{2,}/g, ' ')
      // No spaces at the start of a paragraph: the indent comes from the settings.
      .replace(/^[ \t]+/gm, '')
      .replace(/[ \t]+([,.;:!?…»“)])/g, (m, p: string, off: number, all: string) =>
        // «— Нет , — сказал» → «— Нет, — сказал»; keep a space before «…» that opens a phrase.
        p === '…' && /\S/.test(all[off + m.length] ?? '') ? m : p,
      ),
  )
}
