/**
 * Hints for the «Править» mode, no AI: the same word again too soon, sentences that run too long,
 * and words that usually weaken Russian prose. They only point; the author decides.
 */
export type HintKind = 'repeat' | 'long' | 'filler'
export interface Hint {
  from: number
  to: number
  kind: HintKind
}

export const LONG_SENTENCE = 35
const REPEAT_WINDOW = 40

const FILLERS = new Set(
  (
    'было был была были быть это этот эта эти этого этой этих который которая которое которые которого которой которому которых ' +
    'очень просто вдруг внезапно словно будто немного слегка кажется казалось почему-то как-то какой-то какая-то что-то кто-то ' +
    'начал начала начали стал стала стали являлся являлась является'
  ).split(' '),
)
// Common words that repeat by nature and are not worth flagging.
const IGNORE = new Set('который которая которое которые которого которой которых потому только теперь сейчас снова может могла может всего'.split(' '))

const norm = (w: string) => w.toLowerCase().replace(/ё/g, 'е')
const stem = (w: string) => (w.length > 6 ? w.slice(0, w.length - 2) : w.length > 5 ? w.slice(0, -1) : w)

/** blocks: paragraphs with the document position their text starts at. */
export function checkBlocks(blocks: { text: string; base: number }[]): Hint[] {
  const hints: Hint[] = []
  const recent: { stem: string; from: number; to: number; index: number }[] = []
  let wordIndex = 0
  for (const { text, base } of blocks) {
    // Long sentences.
    const sentenceRe = /[^.!?…]+(?:[.!?…]+[»"')]*|$)/g
    for (let m; (m = sentenceRe.exec(text)); ) {
      if (!m[0].trim()) break
      const words = m[0].match(/\p{L}[\p{L}-]*/gu)?.length ?? 0
      if (words > LONG_SENTENCE) {
        const lead = m[0].length - m[0].trimStart().length
        hints.push({ from: base + m.index + lead, to: base + m.index + m[0].trimEnd().length, kind: 'long' })
      }
    }
    // Words: fillers and repeats.
    const wordRe = /\p{L}[\p{L}-]*/gu
    for (let m; (m = wordRe.exec(text)); ) {
      const raw = m[0]
      const w = norm(raw)
      const from = base + m.index
      const to = from + raw.length
      wordIndex++
      if (FILLERS.has(w)) {
        hints.push({ from, to, kind: 'filler' })
        continue
      }
      // Names repeat by necessity; short words are grammar.
      if (w.length < 5 || IGNORE.has(w) || (/^\p{Lu}/u.test(raw) && m.index > 0 && !/[.!?…]\s*$/.test(text.slice(0, m.index)))) continue
      const s = stem(w)
      while (recent.length && wordIndex - recent[0].index > REPEAT_WINDOW) recent.shift()
      const prev = recent.find((r) => r.stem === s)
      if (prev) {
        hints.push({ from: prev.from, to: prev.to, kind: 'repeat' }, { from, to, kind: 'repeat' })
      }
      recent.push({ stem: s, from, to, index: wordIndex })
    }
  }
  // One hint per range and kind.
  const seen = new Set<string>()
  return hints.filter((h) => {
    const k = `${h.kind}:${h.from}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function countHints(hints: Hint[]) {
  return {
    repeat: hints.filter((h) => h.kind === 'repeat').length,
    long: hints.filter((h) => h.kind === 'long').length,
    filler: hints.filter((h) => h.kind === 'filler').length,
  }
}
