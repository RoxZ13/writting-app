/** A calm «what changed» between two versions of a scene: paragraphs first, then words inside changed ones. */
export type Piece = { text: string; kind: 'same' | 'del' | 'add' }

/** Index pairs of the longest common subsequence. Plain DP: callers keep inputs small. */
function lcs<T>(a: T[], b: T[]): [number, number][] {
  const n = a.length
  const m = b.length
  const w = m + 1
  const t = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j])
      i++
      j++
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++
    else j++
  }
  return out
}

function push(out: Piece[], text: string, kind: Piece['kind']) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.kind === kind) last.text += text
  else out.push({ text, kind })
}

const MAX_CELLS = 2_000_000

export function diffWords(a: string, b: string): Piece[] {
  const ta = a.split(/(\s+)/).filter(Boolean)
  const tb = b.split(/(\s+)/).filter(Boolean)
  const out: Piece[] = []
  if (ta.length * tb.length > MAX_CELLS) {
    push(out, a, 'del')
    push(out, b, 'add')
    return out
  }
  let i = 0
  let j = 0
  for (const [x, y] of [...lcs(ta, tb), [ta.length, tb.length] as [number, number]]) {
    push(out, ta.slice(i, x).join(''), 'del')
    push(out, tb.slice(j, y).join(''), 'add')
    if (x < ta.length) push(out, ta[x], 'same')
    i = x + 1
    j = y + 1
  }
  return out
}

/** One entry per paragraph to show, in the order of the new text, with removed paragraphs in place. */
export function diffParagraphs(a: string[], b: string[]): Piece[][] {
  const out: Piece[][] = []
  const pairs = a.length * b.length > MAX_CELLS ? [] : lcs(a, b)
  let i = 0
  let j = 0
  for (const [x, y] of [...pairs, [a.length, b.length] as [number, number]]) {
    const gone = a.slice(i, x)
    const come = b.slice(j, y)
    // Paragraphs replaced one for one are compared word by word; the rest are whole.
    for (let k = 0; k < Math.max(gone.length, come.length); k++) {
      if (k < gone.length && k < come.length) out.push(diffWords(gone[k], come[k]))
      else if (k < gone.length) out.push([{ text: gone[k], kind: 'del' }])
      else out.push([{ text: come[k], kind: 'add' }])
    }
    if (x < a.length) out.push([{ text: a[x], kind: 'same' }])
    i = x + 1
    j = y + 1
  }
  return out
}
