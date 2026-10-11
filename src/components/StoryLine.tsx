import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Chapter, Line, Scene } from '../db/db'
import { arrangeScenes, createChapter, createLine, createScene, ensurePool, PALETTE, patch } from '../db/repo'
import { sceneName, type ProjectData } from '../lib/hooks'
import { changed, fits, MAIN, momentsOf, place, type Drop, type Span } from '../lib/moments'
import { STATUSES, statusOf } from '../lib/status'
import { formatScenes } from '../lib/text'
import { InlineEdit, toast } from '../lib/ui'
import { Icon } from './Icon'
import { sceneHints } from '../lib/hints'

const COL = 216 // one moment of story time
const CARD_W = 188
const ROW = 100 // one branch
const CARD_H = 78
const HEAD = 64 // chapter title + progress
const CH_GAP = 40
const TAIL = 76 // the free column at the end of a chapter; full width while dragging
const PAD = (ROW - CARD_H) / 2
const HINT_KEY = 'manuscript.lineHint'

type Lane = { id: string; name: string; color: string; line?: Line }
type Reach = { join?: Lane; busy?: Lane; leave?: Line }
const laneVar = (color: string) => ({ '--lane': color }) as CSSProperties

/**
 * «Линия истории» as a grid: rows are branches, columns are moments of story time.
 * What stands in one column happens at once; left to right is «потом».
 * Every card carries its branch's colour; a scene on several branches stretches over their rows
 * like a metro interchange, with each branch's colour where its line comes in.
 * Everything is done right here, by hand: drag a card into a cell (at the same time) or between
 * columns (a new moment), «＋» on a card's edge joins the next branch, the tray below holds
 * scenes that don't have a place yet.
 */
export function StoryLine({ data, dim, onOpenScene }: { data: ProjectData; dim: (s: Scene) => boolean; onOpenScene: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null) // a cell key with an open input
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const unbranched = (s: Scene) => !(s.lineIds ?? []).some((id) => data.lineById.has(id))
  const hasMain = !data.lines.length || data.scenes.some((s) => s.chapterId !== data.pool.chapter?.id && unbranched(s))
  const lanes: Lane[] = [
    ...data.lines.map((l) => ({ id: l.id, name: l.name, color: l.color, line: l })),
    ...(hasMain ? [{ id: MAIN, name: data.lines.length ? 'Без линии' : 'Сцены', color: 'var(--ink-3)' }] : []),
  ]
  const rowOf = new Map(lanes.map((l, i) => [l.id, i]))
  const branchesOf = (s: Scene) => (s.lineIds ?? []).filter((id) => data.lineById.has(id))
  const lanesOf = (s: Scene) => (branchesOf(s).length ? branchesOf(s) : [MAIN])
  const colorOf = (s: Scene) => {
    const top = lanes[span(s)[0]]
    return top && lanesOf(s).includes(top.id) ? top.color : 'var(--ink-3)'
  }
  const span: Span = (s) => {
    const r = lanesOf(s).map((id) => rowOf.get(id) ?? lanes.length - 1)
    return [Math.min(...r), Math.max(...r)]
  }

  // Layout: chapters one after another, each with its moments and a narrow free column for «what next».
  const tail = dragging ? COL : TAIL
  let x = 20
  const chapters = data.outline.map(({ chapter, scenes }, k) => {
    const moments = momentsOf(scenes, span)
    const w = moments.length * COL + tail
    const c = { chapter, scenes, moments, x, w, k }
    x += w + CH_GAP
    return c
  })
  const width = x + 120
  const height = HEAD + lanes.length * ROW + 12
  const rowY = (i: number) => HEAD + i * ROW
  const midY = (i: number) => rowY(i) + ROW / 2
  const colW = (c: (typeof chapters)[number], j: number) => (j < c.moments.length ? COL : tail)
  const current = data.project.lastSceneId

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.ln-card.here')
    if (el && box.current) box.current.scrollLeft = Math.max(0, el.offsetLeft - box.current.clientWidth / 2)
  }, []) // only on first show

  /** Move (or place a freshly made) scene, write what changed and offer to undo it. */
  const move = async (scene: Scene, drop: Drop, fresh = false) => {
    const map = new Map<string, Scene[]>(data.outline.map((o) => [o.chapter.id, o.scenes]))
    if (data.pool.chapter) map.set(data.pool.chapter.id, data.pool.scenes)
    if (drop.kind === 'pool' && !map.has(drop.poolId)) map.set(drop.poolId, [])
    if (fresh) map.set(scene.chapterId, [...(map.get(scene.chapterId) ?? []), scene])
    const before = new Map([...map.values()].flat().map((s) => [s.id, s]))
    const after = place(map, scene, drop, span)
    const diff = changed(before, after)
    if (!diff.length) return
    const undo = await arrangeScenes(diff)
    if (fresh) return
    const mine = after.find((p) => p.id === scene.id)
    toast(drop.kind === 'pool' ? 'Сцена в «Пока без места»' : mine?.together ? 'Теперь в то же время' : 'Сцена перенесена', undo)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null)
    const scene = data.sceneById.get(String(e.active.id))
    const over = e.over ? String(e.over.id).split(':') : null
    if (!scene || !over) return
    if (over[0] === 'pool') return void move(scene, { kind: 'pool', poolId: (await ensurePool(data.project.id)).id })
    if (over[0] === 'gap') return void move(scene, { kind: 'gap', chapterId: over[1], moment: Number(over[2]) })
    if (over[0] === 'cell') return void move(scene, { kind: 'cell', chapterId: over[1], moment: Number(over[2]), lane: over[3] })
  }

  const addAt = async (chapterId: string, moment: number, lane: string, title: string) => {
    setAdding(null)
    if (!title.trim()) return
    const s = await createScene(data.project.id, chapterId, title.trim(), { status: 'idea', lineIds: lane === MAIN ? [] : [lane] })
    await move(s, { kind: 'cell', chapterId, moment, lane }, true)
  }

  /** Join the next branch above or below — or let go of the outer one. */
  const reach = (s: Scene, moment: Scene[], dir: -1 | 1): Reach => {
    const own = branchesOf(s)
    if (!own.length) return {}
    const [top, bottom] = span(s)
    const near = lanes[dir < 0 ? top - 1 : bottom + 1]
    const next = near && near.id !== MAIN ? near : undefined
    const free = !!next && fits(moment, { ...s, lineIds: [...own, next.id] }, span)
    const edge = own.find((id) => rowOf.get(id) === (dir < 0 ? top : bottom))
    const leave = own.length > 1 && edge ? data.lineById.get(edge) : undefined
    return { join: free ? next : undefined, busy: free ? undefined : next, leave }
  }
  const setBranches = async (s: Scene, lineIds: string[], msg: string) => {
    const undo = await arrangeScenes([{ id: s.id, chapterId: s.chapterId, order: s.order, together: s.together, lineIds }])
    toast(msg, undo)
  }

  // Branch lines, metro-style: solid between scenes; dashed with «молчит N гл.» where a branch skips whole chapters.
  const branchLines = lanes.flatMap((l, i) => {
    const stops = chapters.flatMap((c) =>
      c.moments.flatMap((m, j) => (m.some((s) => lanesOf(s).includes(l.id)) ? [{ x: c.x + j * COL + COL / 2, k: c.k }] : [])),
    )
    return stops.slice(1).map((b, n) => {
      const a = stops[n]
      const silent = b.k - a.k - 1
      return { key: `${l.id}:${n}`, color: l.color, y: midY(i), x1: a.x, x2: b.x, silent }
    })
  })

  const collide: CollisionDetection = (args) => {
    const hits = pointerWithin(args)
    const gap = hits.find((h) => String(h.id).startsWith('gap:'))
    return gap ? [gap] : hits.length ? hits : rectIntersection(args)
  }

  const [hint, setHintState] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const setHint = (on: boolean) => {
    setHintState(on)
    try {
      localStorage.setItem(HINT_KEY, on ? 'on' : 'off')
    } catch {
      /* ignore */
    }
  }

  const dragged = dragging ? data.sceneById.get(dragging) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={(e) => setDragging(String(e.active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={(e) => void onDragEnd(e)}
    >
      <div className={`line-board ${dragging ? 'is-dragging' : ''}`}>
        {hint && (
          <div className="ln-hint">
            <span>
              Перетащи карточку, чтобы переставить сцену. Сцены в одном столбике идут одновременно. «+» на краю карточки добавляет сцену в другую линию.
            </span>
            <button className="icon-btn" aria-label="Понятно, скрыть подсказку" onClick={() => setHint(false)}>
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        <div className="ln-body">
          <div className="ln-side" style={{ height: height + 56 }}>
            <div className="ln-side-head">
              <span>Линии</span>
              {!hint && (
                <button className="ln-help" aria-label="Как пользоваться линией" title="Как пользоваться" onClick={() => setHint(true)}>
                  ?
                </button>
              )}
            </div>
            {lanes.map((l, i) => (
              <LaneName key={l.id} data={data} lane={l} index={i} top={rowY(i)} count={[...data.scenes].filter((s) => s.chapterId !== data.pool.chapter?.id && lanesOf(s).includes(l.id)).length} />
            ))}
            <NewLane data={data} top={rowY(lanes.length)} />
          </div>
          <div className="ln-scroll" ref={box}>
            <div className="ln-grid" style={{ width, height: height + 56 }}>
              <svg className="ln-svg" width={width} height={height}>
                {/* Every other chapter on a faint ground, so chapters read as blocks. */}
                {chapters.map((c) =>
                  c.k % 2 ? <rect key={c.chapter.id} className="ln-chapter-bg" x={c.x - CH_GAP / 2} y={0} width={c.w + CH_GAP} height={height} /> : null,
                )}
                {lanes.map((l, i) => (
                  <rect key={l.id} className="ln-band" style={laneVar(l.color)} x={4} y={rowY(i) + 6} width={width - 8} height={ROW - 12} rx={12} />
                ))}
                {branchLines.map((b) => (
                  <g key={b.key}>
                    <line className={`ln-branch ${b.silent > 0 ? 'silent' : ''}`} style={{ stroke: b.color }} x1={b.x1} x2={b.x2} y1={b.y} y2={b.y} />
                    {b.silent > 0 && (
                      <g className="ln-silent" transform={`translate(${(b.x1 + b.x2) / 2} ${b.y})`}>
                        <rect x={-46} y={-11} width={92} height={22} rx={11} style={{ stroke: b.color }} />
                        <text textAnchor="middle" y={4}>
                          молчит {b.silent} гл.
                        </text>
                      </g>
                    )}
                  </g>
                ))}
              </svg>

              {chapters.map((c) => {
                const done = c.scenes.filter((s) => s.status === 'done').length
                return (
                  <div key={c.chapter.id}>
                    <div className="ln-chapter" style={{ left: c.x + 6, width: Math.max(c.w - 12, 160) }}>
                      <div className="ln-chapter-row">
                        <InlineEdit
                          className="ln-chapter-title"
                          value={c.chapter.title}
                          onSave={(title) => title.trim() && void patch<Chapter>('chapters', c.chapter.id, { title: title.trim() })}
                        />
                        <span className="ln-chapter-count">
                          {c.scenes.length ? formatScenes(c.scenes.length) : 'пусто'}
                          {done > 0 && ` · готово ${done}`}
                        </span>
                      </div>
                      {c.scenes.length > 0 && (
                        <div className="ln-progress" title={STATUSES.map((st) => `${st.label}: ${c.scenes.filter((s) => s.status === st.id).length}`).join(' · ')}>
                          {[...c.scenes]
                            .sort((a, b) => STATUSES.findIndex((st) => st.id === b.status) - STATUSES.findIndex((st) => st.id === a.status))
                            .map((s) => (
                              <span key={s.id} style={{ background: statusOf(s.status).color }} />
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Cells: every moment × every branch, plus the free column at the end of the chapter. */}
                    {Array.from({ length: c.moments.length + 1 }, (_, j) =>
                      lanes.map((l, i) => {
                        const m = c.moments[j] ?? []
                        const taken = m.some((s) => span(s)[0] <= i && i <= span(s)[1])
                        const key = `${c.chapter.id}:${j}:${l.id}`
                        return (
                          <Cell
                            key={key}
                            id={`cell:${key}`}
                            left={c.x + j * COL}
                            top={rowY(i)}
                            width={colW(c, j)}
                            color={l.color}
                            taken={taken}
                            narrow={j === c.moments.length && !dragging}
                            editing={adding === key}
                            placeholder={l.id === MAIN ? 'Что происходит?' : `Что у «${l.name}»?`}
                            onStart={() => setAdding(key)}
                            onDone={(t) => void addAt(c.chapter.id, j, l.id, t)}
                          />
                        )
                      }),
                    )}
                    {Array.from({ length: c.moments.length + 1 }, (_, j) => (
                      <Gap key={j} id={`gap:${c.chapter.id}:${j}`} left={c.x + j * COL} top={HEAD} height={lanes.length * ROW} />
                    ))}

                    {c.moments.map((m, j) =>
                      m.map((s) => {
                        const [a, b] = span(s)
                        const own = lanesOf(s)
                        return (
                          <Card
                            key={s.id}
                            data={data}
                            scene={s}
                            left={c.x + j * COL + (COL - CARD_W) / 2}
                            top={rowY(a) + PAD}
                            height={(b - a) * ROW + CARD_H}
                            color={colorOf(s)}
                            stops={
                              own.length > 1
                                ? lanes.flatMap((l, i) => (own.includes(l.id) ? [{ color: l.color, name: l.name, y: (i - a) * ROW + CARD_H / 2 }] : []))
                                : []
                            }
                            here={s.id === current}
                            dim={dim(s)}
                            ghost={s.id === dragging}
                            onOpen={() => onOpenScene(s.id)}
                            up={reach(s, m, -1)}
                            down={reach(s, m, 1)}
                            onJoin={(l) => void setBranches(s, [...branchesOf(s), l.id], `Сцена соединяет линии — добавлена «${l.name}»`)}
                            onLeave={(l) => void setBranches(s, branchesOf(s).filter((id) => id !== l.id), `Сцена больше не в линии «${l.name}»`)}
                          />
                        )
                      }),
                    )}
                  </div>
                )
              })}

              <button className="ln-add-chapter" style={{ left: x }} onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}>
                + Глава
              </button>
            </div>
          </div>
        </div>
        <Tray data={data} dragging={!!dragging} ghost={dragging} onOpen={onOpenScene} />
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged ? (
          <div className={`ln-card overlay st-${dragged.status}`} style={{ ...laneVar(colorOf(dragged)), width: CARD_W, height: CARD_H }}>
            <span className="ln-title">{sceneName(data, dragged)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Card({
  data,
  scene,
  left,
  top,
  height,
  color,
  stops,
  here,
  dim,
  ghost,
  onOpen,
  up,
  down,
  onJoin,
  onLeave,
}: {
  data: ProjectData
  scene: Scene
  left: number
  top: number
  height: number
  color: string
  /** For a node: each branch it joins, where its line comes in. */
  stops: { color: string; name: string; y: number }[]
  here: boolean
  dim: boolean
  ghost: boolean
  onOpen: () => void
  up: Reach
  down: Reach
  onJoin: (l: Lane) => void
  onLeave: (l: Line) => void
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: scene.id })
  const label = sceneName(data, scene)
  const node = stops.length > 1
  const st = statusOf(scene.status)
  // Who is in the scene and which hints touch it: small, quiet, and only when there is something.
  const heroes = (scene.characterIds ?? []).map((id) => data.characterById.get(id)).filter((c) => c !== undefined)
  const hints = sceneHints(scene.id, data.markers, data.sceneIndex)
  const hintTitle = [
    hints.planted.length ? `Посеяно здесь: ${hints.planted.map((m) => m.title).join(', ')}` : '',
    hints.payoff.length ? `Срабатывает здесь: ${hints.payoff.map((m) => m.title).join(', ')}` : '',
    hints.waiting.length ? `Ждут места: ${hints.waiting.map((m) => m.title).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  // Scenes are often «Сцена 1», «Сцена 2» in every chapter: name the chapter too.
  const where = (s: Scene) => `${data.chapterById.get(s.chapterId)?.title ?? ''} · ${sceneName(data, s)}`
  const broken = hints.broken.map((m) => {
    const a = m.setupSceneId ? data.sceneById.get(m.setupSceneId) : undefined
    const b = m.payoffSceneId ? data.sceneById.get(m.payoffSceneId) : undefined
    return `«${m.title}» посеян в «${a ? where(a) : '?'}», а срабатывает раньше — в «${b ? where(b) : '?'}»`
  })
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() }
  const edge = (side: 'up' | 'down', r: Reach) =>
    (r.join || r.busy || r.leave) && (
      <span className={`ln-edge ${side}`}>
        {r.join && (
          <button
            {...stop}
            className="ln-edge-btn join"
            style={laneVar(r.join.color)}
            title={`Эта сцена — и в линии «${r.join.name}»`}
            onClick={(e) => (e.stopPropagation(), onJoin(r.join!))}
          >
            ＋<span className="ln-edge-name">{r.join.name}</span>
          </button>
        )}
        {r.busy && (
          <button
            {...stop}
            className="ln-edge-btn busy"
            aria-disabled
            title={`Соединить с «${r.busy.name}» пока нельзя`}
            onClick={(e) => {
              e.stopPropagation()
              toast(`У «${r.busy!.name}» в этот момент своя сцена. Перетащи её в соседний столбик — и сцены можно будет соединить`)
            }}
          >
            ＋
          </button>
        )}
        {r.leave && (
          <button
            {...stop}
            className="ln-edge-btn leave"
            title={`Убрать из линии «${r.leave.name}»`}
            onClick={(e) => (e.stopPropagation(), onLeave(r.leave!))}
          >
            −
          </button>
        )}
      </span>
    )
  return (
    <div
      ref={setNodeRef}
      className={`ln-card st-${scene.status} ${node ? 'node' : ''} ${here ? 'here' : ''} ${dim ? 'dim' : ''} ${ghost ? 'ghost' : ''} ${scene.tempo ? `tempo-${scene.tempo}` : ''}`}
      style={{ ...laneVar(color), left, top, width: CARD_W, height }}
      {...attributes}
      {...listeners}
      aria-label={`${label}${node ? `, узел: здесь сходятся ${stops.map((s) => s.name).join(' и ')}` : ''}. ${st.label}. Перетащи, чтобы переставить`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.preventDefault(), onOpen())
        else listeners?.onKeyDown?.(e)
      }}
    >
      {node &&
        stops.map((s) => {
          const from = Math.max(0, s.y - ROW / 2 + 6)
          const to = Math.min(height, s.y + ROW / 2 - 6)
          return (
          <span key={s.name}>
            <span className="ln-seg" style={{ ...laneVar(s.color), top: from, height: to - from }} />
            <span className="ln-port left" style={{ ...laneVar(s.color), top: s.y }} />
            <span className="ln-port right" style={{ ...laneVar(s.color), top: s.y }} />
          </span>
          )
        })}
      <span className="ln-main">
        <span className="ln-title">
          {scene.node && <span className="ln-key" title="Ключевая сцена" />}
          {label}
        </span>
        {scene.goal && height > CARD_H && <span className="ln-goal">{scene.goal}</span>}
      </span>
      <span className="ln-meta">
        <span className="ln-status" style={{ background: st.color }} />
        {st.label}
        {here && <span className="ln-here">ты здесь</span>}
        <span className="spacer" />
        {broken.length > 0 && (
          <span className="ln-broken" title={broken.join('\n')} aria-label={broken.join('. ')}>
            !
          </span>
        )}
        {hints.total > 0 && (
          <span className={`ln-hints ${hints.waiting.length ? 'waiting' : ''}`} title={hintTitle}>
            <Icon name="spark" size={11} />
            {hints.total}
          </span>
        )}
        {heroes.length > 0 && (
          <span className="ln-heroes" aria-label={`В сцене: ${heroes.map((c) => c.name).join(', ')}`}>
            {heroes.slice(0, 3).map((c) => (
              <span key={c.id} className="ln-hero" style={{ background: c.color }} title={c.name}>
                {c.name.trim()[0]?.toUpperCase()}
              </span>
            ))}
            {heroes.length > 3 && <span className="ln-hero more">+{heroes.length - 3}</span>}
          </span>
        )}
      </span>
      {edge('up', up)}
      {edge('down', down)}
    </div>
  )
}

function Cell({
  id,
  left,
  top,
  width,
  color,
  taken,
  narrow,
  editing,
  placeholder,
  onStart,
  onDone,
}: {
  id: string
  left: number
  top: number
  width: number
  color: string
  taken: boolean
  narrow: boolean
  editing: boolean
  placeholder: string
  onStart: () => void
  onDone: (title: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`ln-cell ${isOver ? 'over' : ''} ${taken ? 'taken' : ''} ${narrow ? 'narrow' : ''}`}
      style={{ ...laneVar(color), left, top, width, height: ROW }}
    >
      {!taken &&
        (editing ? (
          <input
            className="ln-cell-input"
            autoFocus
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onDone(e.currentTarget.value)
              if (e.key === 'Escape') onDone('')
            }}
            onBlur={(e) => onDone(e.currentTarget.value)}
          />
        ) : (
          <button className="ln-cell-add" aria-label="Новая сцена здесь" title={narrow ? 'Новая сцена в конце главы' : undefined} onClick={onStart}>
            {narrow ? '+' : '+ сцена'}
          </button>
        ))}
    </div>
  )
}

/** Between two moments: drop here and the scene becomes a moment of its own. */
function Gap({ id, left, top, height }: { id: string; left: number; top: number; height: number }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`ln-gap ${isOver ? 'over' : ''}`} style={{ left: left - 10, top, height }}>
      {isOver && <span className="ln-gap-k">новый момент</span>}
    </div>
  )
}

function LaneName({ data, lane, index, top, count }: { data: ProjectData; lane: Lane; index: number; top: number; count: number }) {
  const l = lane.line
  const swap = (dir: -1 | 1) => {
    const ids = data.lines.map((x) => x.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    ids.forEach((id, k) => data.lineById.get(id)?.order !== k && void patch<Line>('lines', id, { order: k }))
  }
  return (
    <div className="ln-lane" style={{ ...laneVar(lane.color), top, height: ROW }}>
      {l ? (
        <button
          className="ln-dot"
          title="Другой цвет"
          aria-label={`Цвет линии «${lane.name}»`}
          onClick={() => void patch<Line>('lines', l.id, { color: PALETTE[(PALETTE.indexOf(l.color) + 1) % PALETTE.length] })}
        />
      ) : (
        <span className="ln-dot" />
      )}
      <span className="ln-lane-text">
        {l ? (
          <InlineEdit className="ln-lane-name" value={l.name} onSave={(name) => name.trim() && void patch<Line>('lines', l.id, { name: name.trim() })} />
        ) : (
          <span className="ln-lane-name muted">{lane.name}</span>
        )}
        <span className="ln-lane-count">{count ? formatScenes(count) : 'пока пусто'}</span>
      </span>
      {l && data.lines.length > 1 && (
        <span className="ln-lane-move">
          <button aria-label="Линию выше" disabled={index === 0} onClick={() => swap(-1)}>
            ↑
          </button>
          <button aria-label="Линию ниже" disabled={index === data.lines.length - 1} onClick={() => swap(1)}>
            ↓
          </button>
        </span>
      )}
    </div>
  )
}

function NewLane({ data, top }: { data: ProjectData; top: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="ln-lane new" style={{ top }}>
      {draft === null ? (
        <button className="ln-new-lane" onClick={() => setDraft('')}>
          + линия
        </button>
      ) : (
        <input
          className="ln-cell-input"
          autoFocus
          placeholder="Чья линия?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={async (e) => {
            if (e.key === 'Escape') setDraft(null)
            if (e.key !== 'Enter' || !draft.trim()) return
            await createLine(data.project.id, draft.trim())
            setDraft(null)
          }}
        />
      )}
    </div>
  )
}

/** «Пока без места»: throw scenes in fast, one after another; drag them onto the line when their place is clear. */
function Tray({ data, dragging, ghost, onOpen }: { data: ProjectData; dragging: boolean; ghost: string | null; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  const [draft, setDraft] = useState('')
  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('') // the field stays focused: the next idea goes right in
    await createScene(data.project.id, (await ensurePool(data.project.id)).id, title, { status: 'idea' })
  }
  const n = data.pool.scenes.length
  return (
    <div ref={setNodeRef} className={`ln-tray ${isOver ? 'over' : ''} ${dragging ? 'open' : ''}`}>
      <div className="ln-tray-head">
        <span className="ln-tray-k">
          Пока без места{n > 0 && <span className="ln-tray-n">{n}</span>}
        </span>
        <span className="ln-tray-sub">{dragging ? 'отпусти здесь — сцена уйдёт с линии и подождёт' : n ? 'перетащи на линию, когда станет ясно, где им место' : 'идеи, которым ещё не нашлось места'}</span>
      </div>
      <div className="ln-tray-items">
        {data.pool.scenes.map((s) => (
          <TrayChip key={s.id} data={data} scene={s} ghost={s.id === ghost} onOpen={() => onOpen(s.id)} />
        ))}
        <input
          className="ln-tray-input"
          placeholder={n ? '+ ещё идея' : '+ сцена из головы'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
      </div>
    </div>
  )
}

function TrayChip({ data, scene, ghost, onOpen }: { data: ProjectData; scene: Scene; ghost: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: scene.id })
  const line = (scene.lineIds ?? []).map((id) => data.lineById.get(id)).find(Boolean)
  return (
    <span
      ref={setNodeRef}
      className={`ln-chip ${ghost ? 'ghost' : ''} ${line ? 'branched' : ''}`}
      style={line ? laneVar(line.color) : undefined}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      title="Перетащи на линию"
    >
      <span className="ln-status" style={{ background: statusOf(scene.status).color }} />
      {sceneName(data, scene)}
    </span>
  )
}
