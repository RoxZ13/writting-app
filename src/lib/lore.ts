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

export type LoreReason = 'scene' | 'chapter' | 'hero' | 'mention'

/**
 * Lore for a scene: pinned to the scene, to its chapter or to someone in it, or mentioned in its text.
 * Each entry once, with the strongest reason.
 */
export function loreForScene(
  lore: Note[],
  scene: { id: string; chapterId: string; characterIds?: string[] },
  text: string,
): { note: Note; reason: LoreReason }[] {
  const people = new Set(scene.characterIds ?? [])
  const mentioned = new Set(loreInText(lore, text).map((n) => n.id))
  const out: { note: Note; reason: LoreReason }[] = []
  for (const n of lore) {
    const reason: LoreReason | undefined = n.sceneIds?.includes(scene.id)
      ? 'scene'
      : n.chapterIds?.includes(scene.chapterId)
        ? 'chapter'
        : n.characterIds?.some((id) => people.has(id))
          ? 'hero'
          : mentioned.has(n.id)
            ? 'mention'
            : undefined
    if (reason) out.push({ note: n, reason })
  }
  const rank: Record<LoreReason, number> = { scene: 0, chapter: 1, hero: 2, mention: 3 }
  return out.sort((a, b) => rank[a.reason] - rank[b.reason])
}
