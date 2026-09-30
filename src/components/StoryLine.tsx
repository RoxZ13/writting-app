import { useEffect, useRef } from 'react'
import type { Scene } from '../db/db'
import { createChapter, createScene, ensurePool, patch } from '../db/repo'
import { markerPayoffChapter, markerSetupChapter, sceneName, type ProjectData } from '../lib/hooks'

const SLOT = 64
const GAP = 28
const HEAD = 56 // chapter titles
const LANE = 64 // distance between branches
const STRIP = 44 // heat strip at the bottom
const MAIN = '__main'

type Lane = { id: string; name: string; color: string; y: number }
type Pt = { scene: Scene; x: number; y: number; lanes: Lane[] }

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

/**
 * «Линия истории» as a metro map: every branch runs on its own lane, side by side, because
 * branches go at the same time, not one after another. A scene that belongs to several branches
 * is where their lanes meet — that meeting point is the node, it is not a mark you set.
 * Scenes without a branch run on the main lane. Heat is the small strip at the bottom.
 */
export function StoryLine({ data, dim, onOpenScene }: { data: ProjectData; dim: (s: Scene) => boolean; onOpenScene: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const all = data.outline.flatMap((o) => o.scenes)
  const hasMain = !data.lines.length || all.some((s) => !s.lineIds?.some((id) => data.lineById.has(id)))
  const lanes: Lane[] = [
    ...data.lines.map((l, i) => ({ id: l.id, name: l.name, color: l.color, y: HEAD + 30 + i * LANE })),
    ...(hasMain ? [{ id: MAIN, name: data.lines.length ? 'Без ветки' : 'Сцены', color: 'var(--ink-3)', y: HEAD + 30 + data.lines.length * LANE }] : []),
  ]
  const laneById = new Map(lanes.map((l) => [l.id, l]))
  const bottom = HEAD + 30 + (lanes.length - 1) * LANE + 40
  const H = bottom + STRIP + 16

  const chapters: { id: string; title: string; x: number; w: number; count: number }[] = []
  const pts: Pt[] = []
  let x = 24
  for (const { chapter, scenes } of data.outline) {
    const w = (scenes.length + 1) * SLOT // one extra slot: «+» for a new scene
    chapters.push({ id: chapter.id, title: chapter.title, x, w, count: scenes.length })
    scenes.forEach((s, i) => {
      const own = (s.lineIds ?? []).map((id) => laneById.get(id)).filter(Boolean) as Lane[]
      const on = own.length ? own : [laneById.get(MAIN)!]
      // Where several branches meet, the point sits between their lanes.
      const y = on.reduce((n, l) => n + l.y, 0) / on.length
      pts.push({ scene: s, x: x + SLOT / 2 + i * SLOT, y, lanes: on })
    })
    x += w + GAP
  }
  const width = x + 100
  const byScene = new Map(pts.map((p) => [p.scene.id, p]))
  const chapterMid = new Map(chapters.map((c) => [c.id, c.x + c.w / 2]))
  const current = data.project.lastSceneId

  // Markers: arcs over the lanes, from where a detail is planted to where it pays off.
  const end = (sceneId: string | undefined, chapterId: string | undefined) => {
    const p = sceneId ? byScene.get(sceneId) : undefined
    if (p) return { x: p.x, y: p.y }
    const cx = chapterId ? chapterMid.get(chapterId) : undefined
    return cx === undefined ? undefined : { x: cx, y: HEAD + 20 }
  }
  const arcs = data.markers
    .map((m, i) => {
      const a = end(m.setupSceneId, markerSetupChapter(m, data))
      const b = end(m.payoffSceneId, markerPayoffChapter(m, data))
      if (!a || !b || a.x === b.x) return null
      // Several arcs over the same stretch are nested, not drawn on top of each other.
      const peak = Math.max(10, HEAD + 6 - Math.min(40, Math.abs(b.x - a.x) / 14) - (i % 4) * 9)
      return { m, d: `M${a.x} ${a.y} C${a.x} ${peak}, ${b.x} ${peak}, ${b.x} ${b.y}` }
    })
    .filter(Boolean) as { m: (typeof data.markers)[number]; d: string }[]

  useEffect(() => {
    const at = current ? byScene.get(current)?.x : undefined
    if (box.current && at !== undefined) box.current.scrollLeft = Math.max(0, at - box.current.clientWidth / 2)
  }, []) // only on first show

  const open = (id: string) => onOpenScene(id)
  const addScene = async (chapterId: string, laneId: string) => {
    const s = await createScene(data.project.id, chapterId, '', { status: 'idea', lineIds: laneId === MAIN ? [] : [laneId] })
    open(s.id)
  }
  const setHeat = (s: Scene, heat: number | undefined) => heat !== s.heat && void patch<Scene>('scenes', s.id, { heat })

  return (
    <div className="story-line">
      <div className="sl-body">
        <div className="sl-lanes" style={{ height: H }}>
          {lanes.map((l) => (
            <div key={l.id} className="sl-lane-name" style={{ top: l.y - 10 }}>
              <span className="dot" style={{ background: l.color }} />
              {l.name}
            </div>
          ))}
          <div className="sl-lane-name muted" style={{ top: bottom + STRIP / 2 - 10 }}>
            накал
          </div>
        </div>
        <div className="sl-scroll" ref={box}>
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Линия истории: ветки идут рядом, сцены на пересечении веток — узлы">
            {chapters.map((c, i) => (
              <g key={c.id}>
                {i > 0 && <line className="sl-band" x1={c.x - GAP / 2} x2={c.x - GAP / 2} y1={8} y2={H - 8} />}
                <text className="sl-chapter" x={c.x + 4} y={24}>
                  {c.title}
                </text>
                {lanes.map((l) => (
                  <g
                    key={l.id}
                    className="sl-add"
                    role="button"
                    tabIndex={0}
                    aria-label={`Новая сцена в «${c.title}»${l.id === MAIN ? '' : `, ветка «${l.name}»`}`}
                    onClick={() => void addScene(c.id, l.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void addScene(c.id, l.id))}
                  >
                    <title>{l.id === MAIN ? 'Новая сцена в этой главе' : `Новая сцена ветки «${l.name}» в этой главе`}</title>
                    <circle cx={c.x + SLOT / 2 + c.count * SLOT} cy={l.y} r={9} />
                    <text x={c.x + SLOT / 2 + c.count * SLOT} y={l.y + 5} textAnchor="middle">
                      +
                    </text>
                  </g>
                ))}
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
              <text x={x} y={24}>
                + Глава
              </text>
            </g>

            {/* Each branch: a line through its own scenes, bending to meet the others. */}
            {lanes.map((l) => {
              const own = pts.filter((p) => p.lanes.includes(l))
              return own.length ? <path key={l.id} className="sl-lane" style={{ stroke: l.color }} d={path(own)} /> : null
            })}

            {arcs.map(({ m, d }) => (
              <path key={m.id} className={`sl-arc ${m.resolved ? 'done' : ''}`} d={d}>
                <title>{`✦ ${m.title || 'маячок'} → ◎ ${m.resolved ? 'раскрыт' : 'раскроется здесь'}`}</title>
              </path>
            ))}

            {/* Heat: a small bar under each scene. */}
            <line className="sl-base" x1={24} x2={width - 100} y1={bottom + STRIP} y2={bottom + STRIP} />
            {pts.map((p) =>
              p.scene.heat ? (
                <rect key={p.scene.id} className="sl-heat" x={p.x - 5} width={10} y={bottom + STRIP - p.scene.heat * 7} height={p.scene.heat * 7} rx={2} />
              ) : null,
            )}

            {pts.map(({ scene: s, x: px, y, lanes: on }) => {
              const node = on.length > 1
              const here = s.id === current
              const label = sceneName(data, s)
              return (
                <g
                  key={s.id}
                  className={`sl-scene ${dim(s) ? 'dim' : ''} ${node ? 'node' : ''} ${here ? 'here' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${label}${node ? `, здесь сходятся: ${on.map((l) => l.name).join(', ')}` : ''}${s.heat ? `, накал ${s.heat}` : ''}`}
                  onClick={() => open(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), open(s.id))
                    if (e.key === 'ArrowUp') (e.preventDefault(), setHeat(s, Math.min(5, (s.heat ?? 0) + 1)))
                    if (e.key === 'ArrowDown') (e.preventDefault(), setHeat(s, s.heat && s.heat > 1 ? s.heat - 1 : undefined))
                  }}
                >
                  <title>{`${label}${s.goal ? ` — ${s.goal}` : ''}`}</title>
                  <circle className="sl-hit" cx={px} cy={y} r={16} />
                  {node ? (
                    <circle className="sl-junction" cx={px} cy={y} r={9} />
                  ) : (
                    <circle className="sl-dot" cx={px} cy={y} r={here ? 7 : 5.5} style={{ stroke: on[0].color }} />
                  )}
                  <text className={`sl-label ${node || here ? '' : 'hover'}`} x={px} y={y - 14} textAnchor="middle">
                    {here ? `${label} · ты здесь` : label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      <div className="sl-foot">
        <span className="sl-pool">
          <span className="sl-pool-k">Пока без места</span>
          {data.pool.scenes.map((s) => (
            <button key={s.id} className="sl-chip" onClick={() => open(s.id)}>
              {sceneName(data, s)}
            </button>
          ))}
          <button className="sl-chip add" onClick={async () => void open((await createScene(data.project.id, (await ensurePool(data.project.id)).id, '', { status: 'idea' })).id)}>
            + сцена из головы
          </button>
        </span>
      </div>
    </div>
  )
}
