import type { Project } from '../db/db'

/** A standard page: 1800 characters with spaces. */
export const PAGE = 1800

export const pageSize = (p: Project) => p.pageChars || PAGE
export const hasNorm = (p: Project) => !!(p.chapterMin || p.chapterMax)

export function sumChars(scenes: { charCount?: number }[]): number {
  return scenes.reduce((n, s) => n + (s.charCount ?? 0), 0)
}

const num = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** «3,5 стр.» under ten pages, «14 стр.» above. */
export function pages(p: Project, chars: number): string {
  const v = chars / pageSize(p)
  return `${v < 10 ? (Math.round(v * 10) / 10).toLocaleString('ru-RU') : num(v)} стр.`
}

/** Length the way the author thinks of it: pages or characters. */
export function lengthText(p: Project, chars: number): string {
  return p.lengthUnit === 'chars' ? `${num(chars)} зн.` : pages(p, chars)
}

export type LengthState = 'none' | 'short' | 'ok' | 'near' | 'over'

/**
 * Where a chapter stands against the norm. «near» is the last tenth before the upper bound —
 * time to look for the ending; «over» says by how much, so the rest can become the next chapter.
 */
export function chapterLength(p: Project, chars: number) {
  const min = p.chapterMin ?? 0
  const max = p.chapterMax
  let state: LengthState = 'none'
  if (min || max) {
    if (max && chars > max) state = 'over'
    else if (max && chars >= max * 0.9) state = 'near'
    else if (chars >= min) state = 'ok'
    else state = 'short'
  }
  const target = max || min
  return {
    state,
    chars,
    /** 0…1 of the upper bound (or the lower one when there is no upper). */
    fill: target ? Math.min(1, chars / target) : 0,
    /** Characters left before the upper bound. */
    left: max ? Math.max(0, max - chars) : undefined,
    over: max && chars > max ? chars - max : 0,
    /** Characters still missing up to the lower bound. */
    toMin: min > chars ? min - chars : 0,
  }
}

/** «10–20 стр.» / «до 30 000 зн.» — the norm itself, in the author's unit. */
export function normText(p: Project): string {
  const t = (n: number) => lengthText(p, n)
  if (p.chapterMin && p.chapterMax) return `${t(p.chapterMin).replace(/ (стр|зн)\.$/, '')}–${t(p.chapterMax)}`
  if (p.chapterMax) return `до ${t(p.chapterMax)}`
  if (p.chapterMin) return `от ${t(p.chapterMin)}`
  return ''
}
