import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../db/db'
import { createChapter, createScene, ensurePool, moveScene, patch } from '../db/repo'
import { isPlaceholder, sceneShort, type ProjectData } from '../lib/hooks'
import { sceneHints } from '../lib/hints'
import { MAIN } from '../lib/moments'

const SLOT = 104 // one scene: a point and its name under it
const GAP = 24 // between chapters
const HEAD = 44 // chapter titles
const LANE = 84 // between plot lines
const TOP = HEAD + 34
const NAME = 15 // characters of a scene's name under its point

type Lane = { id: string; name: string; color: string; y: number }
type Pt = { scene: Scene; x: number; y: number; lanes: Lane[] }
type Drag = { id: string; fromPool: boolean; x0: number; y0: number; x: number; y: number; moved: boolean }

/** A smooth path through points: flat along a lane, bending where lanes meet. */
function path(pts: { x: number; y: number }[]): string {
  if (!pts.length) return ''
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const mid = (a.x + b.x) / 2
    d += a.y === b.y ? ` L${b.x} ${b.y}` : ` C${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}

const short = (s: string) => (s.length > NAME ? `${s.slice(0, NAME - 1).trimEnd()}…` : s)

/**
 * «Сюжетные линии», as in Aeon Timeline and a metro map: each plot line is a thin line, each scene
 * a point on it with its name underneath. A scene on several lines is where they bend together.
 * Everything else stays out of sight until asked for: hover a point — its hints arc to their scenes;
 * click — the scene opens; drag — it moves (onto another line or chapter, or down to «Пока без места»).
 */
export function StoryLine({ data, dim, onOpenScene }: { data: ProjectData; dim: (s: Scene) => boolean; onOpenScene: (id: string) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const poolRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  // The untouched «Первая сцена» of a new story is not drawn: it is not part of any plan yet.
  const outline = data.outline.map((o) => ({ ...o, scenes: o.scenes.filter((s) => !isPlaceholder(s, data)) }))
  const all = outline.flatMap((o) => o.scenes)
  const hasMain = !data.lines.length || all.some((s) => !s.lineIds?.some((id) => data.lineById.has(id)))
  const lanes: Lane[] = [
    ...data.lines.map((l, i) => ({ id: l.id, name: l.name, color: l.color, y: TOP + i * LANE })),
    ...(hasMain ? [{ id: MAIN, name: data.lines.length ? 'Без линии' : 'Сцены', color: 'var(--ink-3)', y: TOP + data.lines.length * LANE }] : []),
  ]
  const laneById = new Map(lanes.map((l) => [l.id, l]))
  const H = TOP + (lanes.length - 1) * LANE + 52

  const chapters: { id: string; title: string; x: number; w: number; count: number; locked: boolean; k: number }[] = []
  const pts: Pt[] = []
  let x = 24
  outline.forEach(({ chapter, scenes }, k) => {
    // One more slot at the end for «+», a new scene — not in a chapter fixed in place.
    const w = (scenes.length + (chapter.locked ? 0 : 1)) * SLOT || SLOT
    chapters.push({ id: chapter.id, title: chapter.title, x, w, count: scenes.length, locked: !!chapter.locked, k })
    scenes.forEach((s, i) => {
      const own = (s.lineIds ?? []).map((id) => laneById.get(id)).filter((l): l is Lane => !!l)
      const on = own.length ? own : [laneById.get(MAIN)!]
      pts.push({ scene: s, x: x + SLOT / 2 + i * SLOT, y: on.reduce((n, l) => n + l.y, 0) / on.length, lanes: on })
    })
    x += w + GAP
  })
  const width = x + 120
  const byScene = new Map(pts.map((p) => [p.scene.id, p]))
  const current = data.project.lastSceneId

  useEffect(() => {
    const p = current ? byScene.get(current) : undefined
    if (p && box.current) box.current.scrollLeft = Math.max(0, p.x - box.current.clientWidth / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only on first show

  // Hover a point: arcs over the lines from where each of its hints is planted to where it pays off.
  const hovered = hover ? data.sceneById.get(hover) : undefined
  const arcs = hovered
    ? sceneHints(hovered.id, data.markers, data.sceneIndex)
        .planted.concat(sceneHints(hovered.id, data.markers, data.sceneIndex).payoff)
        .flatMap((m) => {
          const a = m.setupSceneId ? byScene.get(m.setupSceneId) : undefined
          const b = m.payoffSceneId ? byScene.get(m.payoffSceneId) : undefined
          if (!a || !b || a === b) return []
          const lift = 26 + Math.min(70, Math.abs(b.x - a.x) / 6)
          // Kept inside the map: the arc never rises above the chapter titles.
          const top = Math.max(HEAD - 6, Math.min(a.y, b.y) - lift)
          return [{ id: m.id, title: m.title, d: `M${a.x} ${a.y} C${a.x} ${top}, ${b.x} ${top}, ${b.x} ${b.y}`, mx: (a.x + b.x) / 2, my: top + 14 }]
        })
    : []

  // ---------- dragging: points on the map and chips from «Пока без места» ----------
  const toSvg = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }
  const start = (e: React.PointerEvent, id: string, fromPool: boolean) => {
    if (e.button !== 0) return
    const p = toSvg(e.clientX, e.clientY)
    setDrag({ id, fromPool, x0: e.clientX, y0: e.clientY, x: p.x, y: p.y, moved: false })
  }
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const p = toSvg(e.clientX, e.clientY)
      const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5
      setDrag({ ...drag, x: p.x, y: p.y, moved })
    }
    const up = (e: PointerEvent) => {
      setDrag(null)
      if (!drag.moved) return void onOpenScene(drag.id)
      const p = toSvg(e.clientX, e.clientY)
      void drop(drag.id, p.x, p.y, e.clientY)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  /** Where a drop lands: a chapter, a place in it and the nearest line — or the pool below the map. */
  const target = (px: number, py: number) => {
    const c = chapters.find((ch) => px >= ch.x - GAP / 2 && px < ch.x + ch.w + GAP / 2)
    if (!c || c.locked || py > H + 8) return null
    const lane = lanes.reduce((best, l) => (Math.abs(l.y - py) < Math.abs(best.y - py) ? l : best), lanes[0])
    const slot = Math.max(0, Math.min(c.count, Math.round((px - c.x - SLOT / 2) / SLOT)))
    return { c, lane, slot }
  }
  const drop = async (id: string, px: number, py: number, clientY: number) => {
    const s = data.sceneById.get(id)
    if (!s) return
    const poolTop = poolRef.current?.getBoundingClientRect().top
    if (poolTop !== undefined && clientY >= poolTop) {
      const pool = await ensurePool(data.project.id)
      if (s.chapterId !== pool.id) await moveScene(id, pool.id, data.pool.scenes.length)
      return
    }
    const t = target(px, py)
    if (!t) return
    const old = data.outline.find((o) => o.chapter.id === t.c.id)?.scenes.filter((x) => !isPlaceholder(x, data)) ?? []
    const was = old.findIndex((x) => x.id === id)
    await moveScene(id, t.c.id, was !== -1 && t.slot > was ? t.slot - 1 : t.slot)
    // A scene on one line moves to the line it was dropped on; a scene joining several lines keeps them.
    const own = (s.lineIds ?? []).filter((l) => data.lineById.has(l))
    if (own.length <= 1 && (own[0] ?? MAIN) !== t.lane.id) await patch<Scene>('scenes', id, { lineIds: t.lane.id === MAIN ? [] : [t.lane.id] })
  }
  const ghost = drag?.moved ? target(drag.x, drag.y) : null

  const addScene = async (chapterId: string, laneId: string) => {
    const s = await createScene(data.project.id, chapterId, '', { status: 'idea', lineIds: laneId === MAIN ? [] : [laneId] })
    onOpenScene(s.id)
  }
  const dragged = drag?.moved ? data.sceneById.get(drag.id) : undefined

  return (
    <div className={`sm ${drag?.moved ? 'dragging' : ''}`}>
      <div className="sm-body">
        <div className="sm-names" style={{ height: H }}>
          {lanes.map((l) => (
            <div key={l.id} className="sm-name" style={{ top: l.y }}>
              <span className="sm-name-dot" style={{ background: l.color }} />
              <span className="sm-name-text">{l.name}</span>
            </div>
          ))}
        </div>
        <div className="sm-scroll" ref={box}>
          <svg ref={svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Сюжетные линии: точки — сцены, подпись под точкой">
            {chapters.map((c) => (
              <g key={c.id}>
                {c.locked && <rect className="sm-locked" x={c.x - GAP / 2 + 2} y={4} width={c.w + GAP - 4} height={H - 8} rx={10} />}
                {c.k > 0 && <line className="sm-sep" x1={c.x - GAP / 2} x2={c.x - GAP / 2} y1={10} y2={H - 10} />}
                <text className="sm-chapter" x={c.x + 6} y={26}>
                  {c.title}
                </text>
                {!c.locked &&
                  lanes.map((l) => (
                    <g
                      key={l.id}
                      className="sm-add"
                      role="button"
                      tabIndex={0}
                      aria-label={`Новая сцена в «${c.title}»${l.id === MAIN ? '' : `, линия «${l.name}»`}`}
                      onClick={() => void addScene(c.id, l.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void addScene(c.id, l.id))}
                    >
                      <circle cx={c.x + SLOT / 2 + c.count * SLOT} cy={l.y} r={8} />
                      <text x={c.x + SLOT / 2 + c.count * SLOT} y={l.y + 4} textAnchor="middle">
                        +
                      </text>
                    </g>
                  ))}
              </g>
            ))}

            {/* Each line: a thin guide across the map, and its own path through its scenes. */}
            {lanes.map((l) => (
              <line key={`g${l.id}`} className="sm-guide" x1={0} x2={width} y1={l.y} y2={l.y} />
            ))}
            {lanes.map((l) => {
              const own = pts.filter((p) => p.lanes.includes(l))
              return own.length > 1 ? <path key={l.id} className="sm-lane" style={{ stroke: l.color }} d={path(own)} /> : null
            })}

            {arcs.map((a) => (
              <g key={a.id} className="sm-arc">
                <path d={a.d} />
                <text x={a.mx} y={a.my} textAnchor="middle">
                  {a.title}
                </text>
              </g>
            ))}

            {ghost && (
              <circle className="sm-ghost" cx={ghost.c.x + SLOT / 2 + ghost.slot * SLOT - SLOT / 2} cy={ghost.lane.y} r={4}>
                <title>Сюда</title>
              </circle>
            )}

            {pts.map(({ scene: s, x: px, y, lanes: on }) => {
              const here = s.id === current
              const hints = sceneHints(s.id, data.markers, data.sceneIndex)
              const name = sceneShort(data, s)
              const heroes = (s.characterIds ?? []).map((id) => data.characterById.get(id)?.name).filter(Boolean)
              const tip = [
                name,
                s.goal,
                heroes.length ? `В сцене: ${heroes.join(', ')}` : '',
                hints.broken.length ? `Намёк после развязки: ${hints.broken.map((m) => m.title).join(', ')}` : '',
              ]
                .filter(Boolean)
                .join('\n')
              const color = on.length > 1 ? 'var(--ink)' : on[0].color
              return (
                <g
                  key={s.id}
                  className={`sm-scene ${dim(s) ? 'dim' : ''} ${here ? 'here' : ''} ${s.node ? 'key' : ''} ${s.tempo ?? ''} ${drag?.id === s.id && drag.moved ? 'lifted' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={tip.replace(/\n/g, '. ')}
                  onPointerDown={(e) => start(e, s.id, false)}
                  onPointerEnter={() => setHover(s.id)}
                  onPointerLeave={() => setHover((h) => (h === s.id ? null : h))}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenScene(s.id))}
                >
                  <title>{tip}</title>
                  <circle className="sm-hit" cx={px} cy={y} r={18} />
                  {hints.broken.length > 0 && <circle className="sm-broken" cx={px} cy={y} r={s.node ? 13 : 11} />}
                  {here && <circle className="sm-here" cx={px} cy={y} r={s.node ? 14 : 12} />}
                  <circle className="sm-dot" cx={px} cy={y} r={s.node ? 8 : 5.5} style={{ stroke: color, fill: s.tempo === 'tense' ? color : undefined }} />
                  {hints.total > 0 && (
                    <text className="sm-count" x={px + 10} y={y - 8}>
                      {hints.total}
                    </text>
                  )}
                  <text className="sm-label" x={px} y={y + 24} textAnchor="middle">
                    {short(name)}
                  </text>
                </g>
              )
            })}

            {/* After the last chapter: a new one. */}
            <g
              className="sm-new-chapter"
              role="button"
              tabIndex={0}
              onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}
              onKeyDown={(e) => e.key === 'Enter' && void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}
            >
              <text x={x + 4} y={26}>
                + Глава
              </text>
            </g>

            {dragged && drag && <circle className="sm-dot sm-drag" cx={drag.x} cy={drag.y} r={7} />}
          </svg>
        </div>
      </div>

      <div ref={poolRef} className={`sm-pool ${drag?.moved ? 'target' : ''}`}>
        <span className="sm-pool-k">{data.pool.scenes.length ? 'Пока без места — перетащи на линию' : 'Пока без места'}</span>
        {data.pool.scenes.map((s) => (
          <button key={s.id} className={`sm-chip ${drag?.id === s.id && drag.moved ? 'lifted' : ''}`} onPointerDown={(e) => start(e, s.id, true)}>
            {sceneShort(data, s)}
          </button>
        ))}
        <button
          className="sm-chip add"
          onClick={async () => onOpenScene((await createScene(data.project.id, (await ensurePool(data.project.id)).id, '', { status: 'idea' })).id)}
        >
          + сцена из головы
        </button>
      </div>
    </div>
  )
}
