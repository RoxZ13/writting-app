import type { Character, Note } from '../db/db'
import { mentionPatterns } from './heroes'
import { lorePattern } from './lore'

/**
 * «Где встречается», as backlinks in Obsidian but without any markup: a hero or a lore entry is found in
 * a scene when its name (or another name) appears in the text, or when it was marked there by hand.
 */
export interface Found {
  sceneId: string
  /** Marked by hand (hero in «кто в сцене», lore pinned to the scene or its chapter), not just in the text. */
  manual: boolean
}

const splitNames = (s?: string) =>
  (s ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Patterns for heroes: the name and other names; words shared by several heroes (a family name) are skipped. */
export function heroPatterns(characters: Character[]): Map<string, RegExp> {
  return mentionPatterns(characters.map((c) => ({ id: c.id, name: [c.name, ...splitNames(c.aliases)].join(' ') })))
}

/** A lore entry matches when every word of its title, or of any other name, appears. */
export function loreMatches(n: Note, plainLower: string): boolean {
  return [n.title ?? '', ...splitNames(n.aliases)].some((name) => {
    const pats = lorePattern(name)
    return pats.length > 0 && pats.every((re) => re.test(plainLower))
  })
}

export function whereFound(
  scenes: { id: string; chapterId: string; characterIds?: string[] }[],
  texts: Map<string, string>,
  characters: Character[],
  lore: Note[],
): Map<string, Found[]> {
  const out = new Map<string, Found[]>()
  const push = (id: string, f: Found) => out.set(id, [...(out.get(id) ?? []), f])
  const heroes = heroPatterns(characters)
  for (const s of scenes) {
    const text = texts.get(s.id) ?? ''
    const lower = text.toLowerCase().replace(/ё/g, 'е')
    for (const c of characters) {
      if (c.ignoreSceneIds?.includes(s.id)) continue
      const manual = !!s.characterIds?.includes(c.id)
      const re = heroes.get(c.id)
      let inText = false
      if (re) {
        re.lastIndex = 0
        inText = re.test(text)
      }
      if (manual || inText) push(c.id, { sceneId: s.id, manual })
    }
    for (const n of lore) {
      if (n.ignoreSceneIds?.includes(s.id)) continue
      const manual = !!(n.sceneIds?.includes(s.id) || n.chapterIds?.includes(s.chapterId))
      if (manual || loreMatches(n, lower)) push(n.id, { sceneId: s.id, manual })
    }
  }
  return out
}
