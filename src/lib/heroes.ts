import type { Character } from '../db/db'

/** Names listed in a Ficbook header: "Пэйринг и персонажи: Том Реддл/Гермиона Грейнджер, Антонин Долохов, …". */
export function heroesFromDescription(desc: string | undefined): string[] {
  if (!desc) return []
  const line = desc.split('\n').find((l) => /^\s*(Пэйринг и персонажи|Персонажи|Пейринг и персонажи)\s*:/i.test(l))
  if (!line) return []
  const list = line.replace(/^[^:]*:/, '')
  const names = list
    .split(/[,/]|\s+и\s+/)
    .map((n) => n.replace(/\(.*?\)/g, '').trim())
    .filter((n) => n.length > 1 && n.length < 60 && /\p{Lu}/u.test(n[0] ?? ''))
  return [...new Set(names)]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Patterns that find a character in Russian prose despite endings: "Гермиона" also matches
 * "Гермионы", "Гермионе"; "Том" matches "Тома", "Тому", "Томом". A name part shared by
 * two characters (a family name like "Блэк") is skipped, so it does not tag both.
 */
export function mentionPatterns(characters: Pick<Character, 'id' | 'name'>[]): Map<string, RegExp> {
  const parts = new Map<string, string[]>()
  const count = new Map<string, number>()
  for (const c of characters) {
    const ps = c.name.split(/\s+/).filter((p) => p.length >= 3 && /^\p{Lu}/u.test(p))
    parts.set(c.id, ps)
    for (const p of new Set(ps)) count.set(p, (count.get(p) ?? 0) + 1)
  }
  const out = new Map<string, RegExp>()
  for (const c of characters) {
    const own = (parts.get(c.id) ?? []).filter((p) => count.get(p) === 1)
    if (!own.length) continue
    const stems = own.map((p) => (p.length > 4 && /[аяоеиыйьу]$/i.test(p) ? p.slice(0, -1) : p))
    out.set(c.id, new RegExp(`(?<!\\p{L})(?:${stems.map(escape).join('|')})\\p{Ll}{0,3}(?!\\p{L})`, 'gu'))
  }
  return out
}

export function countMentions(text: string, re: RegExp): number {
  re.lastIndex = 0
  return text.match(re)?.length ?? 0
}
