import type { Scene } from '../db/db'

/** The lane of scenes without a branch. */
export const MAIN = '__main'

/** Rows a scene takes on «Линия истории»: from its top branch to its bottom one. */
export type Span = (s: Scene) => [number, number]

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

/** Whether a scene can stand in this moment: one scene per branch at a time. */
export const fits = (moment: Scene[], s: Scene, span: Span) => moment.every((o) => o.id === s.id || !overlaps(span(o), span(s)))

/**
 * A chapter's scenes (in reading order) as moments of story time. A scene marked `together`
 * happens at the same time as the one before it, so it shares that moment — unless the branches
 * collide, then it simply goes next.
 */
export function momentsOf(scenes: Scene[], span: Span): Scene[][] {
  const out: Scene[][] = []
  for (const s of scenes) {
    const last = out[out.length - 1]
    if (s.together && last && fits(last, s, span)) last.push(s)
    else out.push([s])
  }
  return out
}

/** Where a scene is dropped on the line. */
export type Drop =
  | { kind: 'cell'; chapterId: string; moment: number; lane: string }
  | { kind: 'gap'; chapterId: string; moment: number }
  | { kind: 'pool'; poolId: string }

export type Placement = Pick<Scene, 'id' | 'chapterId' | 'order' | 'together' | 'lineIds'>

/**
 * Move a scene to a drop point and return the new reading order of every chapter it touched.
 * `chapters` holds the scenes of each chapter in reading order (the pool included).
 * Dropping a one-branch scene into another branch's row moves it to that branch;
 * a scene on several branches keeps them and only moves in time.
 */
export function place(chapters: Map<string, Scene[]>, scene: Scene, drop: Drop, span: Span): Placement[] {
  const one = (scene.lineIds ?? []).length <= 1
  const lineIds = drop.kind === 'cell' && one ? (drop.lane === MAIN ? [] : [drop.lane]) : (scene.lineIds ?? [])
  const moved: Scene = { ...scene, lineIds }
  const target = drop.kind === 'pool' ? drop.poolId : drop.chapterId

  const layout = (chapterId: string) => {
    // Indices in the drop refer to the line as drawn, with the scene still on it: keep its place empty.
    return momentsOf(chapters.get(chapterId) ?? [], span).map((m) => m.filter((s) => s.id !== scene.id))
  }

  const out = new Map<string, Scene[][]>()
  if (scene.chapterId !== target) out.set(scene.chapterId, layout(scene.chapterId))
  const moments = layout(target)
  if (drop.kind === 'pool') moments.push([moved])
  else if (drop.kind === 'gap') moments.splice(drop.moment, 0, [moved])
  else if (drop.moment < moments.length && fits(moments[drop.moment], moved, span)) moments[drop.moment].push(moved)
  else moments.splice(drop.moment, 0, [moved])
  out.set(target, moments)

  const result: Placement[] = []
  for (const [chapterId, ms] of out) {
    let order = 0
    for (const m of ms.filter((x) => x.length))
      m.forEach((s, i) => {
        result.push({
          id: s.id,
          chapterId,
          order: order++,
          together: i > 0 ? true : undefined,
          lineIds: s.id === scene.id ? lineIds : s.lineIds,
        })
      })
  }
  return result
}

/** What actually changed, so only those records are written (and synced). */
export function changed(before: Map<string, Scene>, after: Placement[]): Placement[] {
  return after.filter((p) => {
    const s = before.get(p.id)
    return (
      !s ||
      s.chapterId !== p.chapterId ||
      s.order !== p.order ||
      !!s.together !== !!p.together ||
      (s.lineIds ?? []).join() !== (p.lineIds ?? []).join()
    )
  })
}
