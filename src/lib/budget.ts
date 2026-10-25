import type { Project, Scene } from '../db/db'
import { CHARS_PER_WORD } from './length'

/** A key scene gets this much more room than an ordinary one. */
const KEY_WEIGHT = 1.5
/** The budget never falls below this share of the scene's fair share, however much the earlier scenes ate. */
const FLOOR = 0.5
/** From this share of the budget the ring changes colour. */
const NEAR_AT = 0.8
/** Written scenes needed before the book's own median means anything. */
const MIN_FOR_MEDIAN = 3

type Sized = Pick<Scene, 'charCount' | 'wordCount'>
type Budgeted = Pick<Scene, 'id' | 'charCount' | 'status' | 'node'>

/** Characters with spaces per word, measured on the book's own scenes; a typical Russian text when there are none. */
export function charsPerWord(scenes: Sized[]): number {
  let chars = 0
  let words = 0
  for (const s of scenes) {
    if ((s.wordCount ?? 0) > 0) {
      chars += s.charCount ?? 0
      words += s.wordCount
    }
  }
  return words > 0 && chars > 0 ? chars / words : CHARS_PER_WORD
}

const weight = (s: Pick<Scene, 'node'>) => (s.node ? KEY_WEIGHT : 1)
const written = (s: Pick<Scene, 'charCount'>) => (s.charCount ?? 0) > 0

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

export interface SceneBudget {
  /** Characters with spaces the scene is expected to fit in. */
  budget: number
  /** Where it comes from: the chapter norm, or the median of the scenes already written. */
  source: 'norm' | 'median'
}

/**
 * The scene's share of the chapter norm, worked out from what already exists — the author fills in nothing.
 * The norm is split between the scenes (a key scene weighs 1.5); scenes with text spend what they really took,
 * the rest is shared by the scenes still empty, never below half of an equal share.
 * Without a norm, or for a scene without a chapter, it is the median of the scenes written so far.
 * `chapterScenes` are the alive scenes of the scene's chapter (this one included), or null for «Пока без места».
 * The scene's own text is never counted, so its budget stays put while the author types.
 */
export function sceneBudget(
  project: Pick<Project, 'chapterMin' | 'chapterMax'>,
  chapterScenes: Budgeted[] | null,
  sceneId: string,
  bookScenes: Budgeted[],
): SceneBudget | null {
  const T = project.chapterMax || project.chapterMin
  const mine = chapterScenes?.find((s) => s.id === sceneId)
  if (T && chapterScenes && mine) {
    const others = chapterScenes.filter((s) => s.id !== sceneId)
    const wk = weight(mine)
    const fair = (T * wk) / (wk + others.reduce((n, s) => n + weight(s), 0))
    const spent = others.filter(written).reduce((n, s) => n + (s.charCount ?? 0), 0)
    const open = wk + others.filter((s) => !written(s)).reduce((n, s) => n + weight(s), 0)
    return { budget: Math.max(FLOOR * fair, ((T - spent) * wk) / open), source: 'norm' }
  }
  const sizes = bookScenes.filter((s) => s.id !== sceneId && written(s) && s.status !== 'idea').map((s) => s.charCount ?? 0)
  if (sizes.length < MIN_FOR_MEDIAN) return null
  const key = (mine ?? bookScenes.find((s) => s.id === sceneId))?.node
  return { budget: median(sizes) * (key ? KEY_WEIGHT : 1), source: 'median' }
}

export type BudgetKind = 'calm' | 'near' | 'over'

/** Where the scene stands against its budget: calm, from 80 % «near», past 100 % «over» (and by how much). */
export function budgetState(chars: number, budget: number): { ratio: number; state: BudgetKind; over: number } {
  const ratio = budget > 0 ? chars / budget : 0
  const state: BudgetKind = ratio > 1 ? 'over' : ratio >= NEAR_AT ? 'near' : 'calm'
  return { ratio, state, over: ratio > 1 ? chars - budget : 0 }
}
