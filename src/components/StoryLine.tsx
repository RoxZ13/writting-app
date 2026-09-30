import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../db/db'
import { createChapter, createScene, ensurePool, patch } from '../db/repo'
import { markerPayoffChapter, markerSetupChapter, sceneName, type ProjectData } from '../lib/hooks'

const SLOT = 64
const GAP = 28
const TOP = 110 // where the highest scene sits
const LOW = 300 // heat 1
const BASE = 340 // scenes whose heat is not marked yet
const H = 400

type Pt = { scene: Scene; x: number; y?: number }

const yForHeat = (heat?: number) => (heat ? LOW - ((heat - 1) / 4) * (LOW - TOP) : undefined)
/** Where a point is dropped → its heat; low enough → «not marked». */
const heatForY = (y: number) => (y > LOW + (BASE - LOW) / 2 ? undefined : Math.max(1, Math.min(5, Math.round(1 + ((LOW - y) / (LOW - TOP)) * 4))))

/** A smooth curve through the points (Catmull-Rom turned into cubic Béziers). */
function curve(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`
  }
  return d
}

/**
 * «Линия истории»: the same scenes as the board, laid out in reading order along one line —
 * the higher, the stronger the scene. Nodes are diamonds, markers are arcs from where they are
 * planted to where they pay off. A second way to look at the board, not a second board.
 */
export function StoryLine({ data, dim, onOpenScene }: { data: ProjectData; dim: (s: Scene) => boolean; onOpenScene: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  // A point being dragged up or down: its live position.
  const [drag, setDrag] = useState<{ id: string; y: number; startY: number; moved: boolean } | null>(null)

  const chapters: { id: string; title: string; x: number; w: number; count: number }[] = []
  const pts: Pt[] = []
  const byScene = new Map<string, number>()
  // Room on the left for the first scene's label.
  let x = 48
  for (const { chapter, scenes } of data.outline) {
    // One extra slot per chapter: the «+» for a new scene right there.
    const w = (scenes.length + 1) * SLOT
    chapters.push({ id: chapter.id, title: chapter.title, x, w, count: scenes.length })
    scenes.forEach((s, i) => {
      const px = x + SLOT / 2 + i * SLOT
      byScene.set(s.id, px)
      const y = drag?.id === s.id ? (drag.moved ? drag.y : yForHeat(s.heat)) : yForHeat(s.heat)
      pts.push({ scene: s, x: px, y: drag?.id === s.id && drag.moved && heatForY(drag.y) === undefined ? undefined : y })
    })
    x += w + GAP
  }
  const width = Math.max(x + 120, 400)
  const chapterMid = new Map(chapters.map((c) => [c.id, c.x + c.w / 2]))
  const heated = pts.filter((p) => p.y !== undefined) as (Pt & { y: number })[]
  const current = data.project.lastSceneId

  // A marker is an arc from the scene where it is planted to the one where it pays off
  // (or the middle of the planned chapter, when the exact scene is not known yet).
  const yOf = new Map(pts.map((p) => [p.scene.id, p.y ?? BASE]))
  const end = (sceneId: string | undefined, chapterId: string | undefined) =>
    sceneId && byScene.has(sceneId)
      ? { x: byScene.get(sceneId)!, y: yOf.get(sceneId)! }
      : chapterId && chapterMid.has(chapterId)
        ? { x: chapterMid.get(chapterId)!, y: BASE }
        : undefined
  const arcs = data.markers
    .map((m) => {
      const a = end(m.setupSceneId, markerSetupChapter(m, data))
      const b = end(m.payoffSceneId, markerPayoffChapter(m, data))
      if (!a || !b || a.x === b.x) return null
      const peak = Math.max(44, Math.min(a.y, b.y) - 40 - Math.min(90, Math.abs(b.x - a.x) / 8))
      return { m, d: `M${a.x} ${a.y} C${a.x} ${peak}, ${b.x} ${peak}, ${b.x} ${b.y}` }
    })
    .filter(Boolean) as { m: (typeof data.markers)[number]; d: string }[]

  // Open with the scene being written in view.
  useEffect(() => {
    const at = current ? byScene.get(current) : undefined
    if (box.current && at !== undefined) box.current.scrollLeft = Math.max(0, at - box.current.clientWidth / 2)
  }, []) // only on first show

  const open = (id: string) => onOpenScene(id)
  const addScene = async (chapterId: string, extra: Partial<Scene> = {}) => {
    const s = await createScene(data.project.id, chapterId, '', { status: 'idea', ...extra })
    open(s.id)
  }
  const svgY = (clientY: number) => {
    const top = svg.current?.getBoundingClientRect().top ?? 0
    return Math.max(TOP - 20, Math.min(BASE + 10, clientY - top))
  }
  const setHeat = (s: Scene, heat: number | undefined) => heat !== s.heat && void patch<Scene>('scenes', s.id, { heat })

  return (
    <div className="story-line">
      <div className="sl-scroll" ref={box}>
        <svg ref={svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Линия истории: сцены по порядку, высота — накал. Точку можно тянуть вверх и вниз">
          {chapters.map((c, i) => (
            <g key={c.id}>
              {i > 0 && <line className="sl-band" x1={c.x - GAP / 2} x2={c.x - GAP / 2} y1={8} y2={H - 8} />}
              <text className="sl-chapter" x={c.x + 4} y={24}>
                {c.title}
              </text>
              <g
                className="sl-add"
                role="button"
                tabIndex={0}
                aria-label={`Новая сцена в «${c.title}»`}
                onClick={() => void addScene(c.id, { heat: 3 })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void addScene(c.id, { heat: 3 }))}
              >
                <title>Новая сцена в этой главе</title>
                <circle cx={c.x + SLOT / 2 + c.count * SLOT} cy={LOW - (LOW - TOP) / 2} r={11} />
                <text x={c.x + SLOT / 2 + c.count * SLOT} y={LOW - (LOW - TOP) / 2 + 5} textAnchor="middle">
                  +
                </text>
              </g>
            </g>
          ))}
          <g
            className="sl-add chapter"
            role="button"
            tabIndex={0}
            aria-label="Новая глава"
            onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`))}
          >
            <text x={x + 10} y={24}>
              + Глава
            </text>
          </g>
          <line className="sl-base" x1={0} x2={width} y1={BASE} y2={BASE} />
          {arcs.map(({ m, d }) => (
            <path key={m.id} className={`sl-arc ${m.resolved ? 'done' : ''}`} d={d}>
              <title>{`✦ ${m.title || 'маячок'} → ◎ ${m.resolved ? 'раскрыт' : 'раскроется здесь'}`}</title>
            </path>
          ))}
          <path className="sl-curve" d={curve(heated)} />
          {pts.map(({ scene: s, x: px, y }) => {
            const cy = y ?? BASE
            const faded = dim(s)
            const here = s.id === current
            const label = sceneName(data, s)
            return (
              <g
                key={s.id}
                className={`sl-scene ${faded ? 'dim' : ''} ${y === undefined ? 'unset' : ''} ${here ? 'here' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${label}${s.heat ? `, накал ${s.heat}` : ''}${s.node ? ', узловая точка' : ''}`}
                onPointerDown={(e) => {
                  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                  setDrag({ id: s.id, y: svgY(e.clientY), startY: e.clientY, moved: false })
                }}
                onPointerMove={(e) => {
                  if (drag?.id !== s.id) return
                  const moved = drag.moved || Math.abs(e.clientY - drag.startY) > 5
                  setDrag({ ...drag, y: svgY(e.clientY), moved })
                }}
                onPointerUp={() => {
                  if (drag?.id !== s.id) return
                  if (drag.moved) setHeat(s, heatForY(drag.y))
                  else open(s.id)
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), open(s.id))
                  if (e.key === 'ArrowUp') (e.preventDefault(), setHeat(s, Math.min(5, (s.heat ?? 0) + 1)))
                  if (e.key === 'ArrowDown') (e.preventDefault(), setHeat(s, s.heat && s.heat > 1 ? s.heat - 1 : undefined))
                }}
              >
                <title>{`${label}${s.goal ? ` — ${s.goal}` : ''}`}</title>
                <circle className="sl-hit" cx={px} cy={cy} r={16} />
                {s.node ? (
                  <rect className="sl-node" x={px - 7} y={cy - 7} width={14} height={14} transform={`rotate(45 ${px} ${cy})`} />
                ) : (
                  <circle className="sl-dot" cx={px} cy={cy} r={here ? 7 : 5} />
                )}
                {(here || s.node) && (
                  <text className="sl-label" x={px} y={cy + 26} textAnchor="middle">
                    {here ? `${label} · ты здесь` : label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="sl-foot">
        <span className="sl-pool">
          <span className="sl-pool-k">Пока без места</span>
          {data.pool.scenes.map((s) => (
            <button key={s.id} className="sl-chip" onClick={() => open(s.id)}>
              {sceneName(data, s)}
            </button>
          ))}
          <button className="sl-chip add" onClick={async () => void addScene((await ensurePool(data.project.id)).id)}>
            + сцена из головы
          </button>
        </span>
      </div>
    </div>
  )
}
