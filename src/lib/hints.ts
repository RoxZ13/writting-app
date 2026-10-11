import type { Marker } from '../db/db'

/** What the board needs to know about the reading order: a scene's place, or nothing for the pool. */
type Order = Pick<Map<string, number>, 'get'>

/**
 * A hint (маячок) planted after the scene it leads to: the reader would meet the payoff first.
 * Only when both scenes have a place in the book; a hint without a place is simply «ждёт места».
 */
export function outOfOrder(m: Marker, sceneIndex: Order): boolean {
  if (!m.setupSceneId || !m.payoffSceneId) return false
  const a = sceneIndex.get(m.setupSceneId)
  const b = sceneIndex.get(m.payoffSceneId)
  return a !== undefined && b !== undefined && a > b
}

/** The hints of one scene: planted here, paying off here, and those of them that broke the order. */
export function sceneHints(sceneId: string, markers: Marker[], sceneIndex: Order) {
  const planted = markers.filter((m) => m.setupSceneId === sceneId)
  const payoff = markers.filter((m) => m.payoffSceneId === sceneId)
  const broken = [...planted, ...payoff].filter((m) => outOfOrder(m, sceneIndex))
  /** Hints leading to this scene that are not planted anywhere yet. */
  const waiting = payoff.filter((m) => !m.setupSceneId && !m.setupChapterId)
  return { planted, payoff, broken, waiting, total: planted.length + payoff.length }
}
