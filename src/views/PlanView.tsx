import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { Chapter, Scene, SceneStatus } from '../db/db'
import {
  applyOutline,
  createChapter,
  createScene,
  deleteChapter,
  mergeIntoPrevious,
  patch,
  splitChapterAt,
  type OutlineItem,
} from '../db/repo'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { STATUSES, statusOf } from '../lib/status'
import { InlineEdit, toast } from '../lib/ui'

type Filter = 'all' | 'nogoal' | SceneStatus

export function PlanView({ data }: { data: ProjectData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [arrange, setArrange] = useState(false)

  const visible = (s: Scene) =>
    filter === 'all' ? true : filter === 'nogoal' ? !s.goal.trim() && s.beats.length === 0 : s.status === filter
  const sceneNo = (s: Scene) => (data.sceneIndex.get(s.id) ?? 0) + 1

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allCollapsed = collapsed.size > 0

  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: 'auto' }}>План</h1>
        {!arrange && (
          <>
            <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">Все сцены</option>
              <option value="nogoal">Без цели и плана</option>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  Только «{s.label}»
                </option>
              ))}
            </select>
            <button
              className="btn ghost"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(data.chapters.map((c) => c.id)))}
            >
              {allCollapsed ? 'Развернуть главы' : 'Свернуть главы'}
            </button>
          </>
        )}
        <button
          className={`btn ${arrange ? 'primary' : ''}`}
          onClick={() => {
            setArrange(!arrange)
            setFilter('all')
          }}
        >
          {arrange ? 'Готово' : 'Переставить'}
        </button>
      </div>

      {arrange ? (
        <ArrangeList data={data} />
      ) : (
        <>
          {data.outline.map(({ chapter, scenes }, i) => {
            const shown = scenes.filter(visible)
            if (filter !== 'all' && shown.length === 0) return null
            return (
              <section className="chapter" key={chapter.id}>
                <ChapterHeader
                  chapter={chapter}
                  number={i + 1}
                  scenes={scenes}
                  collapsed={collapsed.has(chapter.id)}
                  onToggle={() => toggle(chapter.id)}
                />
                {!collapsed.has(chapter.id) && (
                  <div className="scene-list">
                    {shown.map((s, j) => (
                      <SceneRow
                        key={s.id}
                        data={data}
                        scene={s}
                        number={sceneNo(s)}
                        canSplit={j > 0 || scenes.indexOf(s) > 0}
                      />
                    ))}
                    {filter === 'all' && (
                      <button
                        className="add-row"
                        onClick={async () => {
                          const s = await createScene(data.project.id, chapter.id, 'Новая сцена')
                          go({ view: 'write', sceneId: s.id })
                        }}
                      >
                        + сцена в эту главу
                      </button>
                    )}
                  </div>
                )}
              </section>
            )
          })}
          <button className="btn" onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}>
            + Глава в конец
          </button>
        </>
      )}
    </div>
  )
}

function ChapterHeader({
  chapter,
  number,
  scenes,
  collapsed,
  onToggle,
}: {
  chapter: Chapter
  number: number
  scenes: Scene[]
  collapsed: boolean
  onToggle: () => void
}) {
  const words = scenes.reduce((n, s) => n + s.wordCount, 0)
  const done = scenes.filter((s) => s.status === 'done').length
  const first = number === 1
  return (
    <div className="chapter-head">
      <button className="icon-btn" onClick={onToggle} aria-label={collapsed ? 'Развернуть' : 'Свернуть'}>
        {collapsed ? '▸' : '▾'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          {!/^\s*(глава|часть|пролог|эпилог|интерлюдия)/i.test(chapter.title) && <span className="chapter-num">Глава {number}</span>}
          <InlineEdit className="chapter-title" value={chapter.title} onSave={(title) => void patch<Chapter>('chapters', chapter.id, { title })} />
        </div>
        <InlineEdit
          className="chapter-goal"
          multiline
          placeholder="О чём эта глава? Что в ней должно сдвинуться?"
          value={chapter.goal}
          onSave={(goal) => void patch<Chapter>('chapters', chapter.id, { goal })}
        />
        <div className="small muted">
          {scenes.length} сц. · {words.toLocaleString('ru-RU')} сл.{done ? ` · готово ${done}/${scenes.length}` : ''}
        </div>
      </div>
      <details className="menu">
        <summary className="icon-btn" aria-label="Действия с главой">
          ⋯
        </summary>
        <div className="menu-list card">
          {!first && (
            <button
              onClick={async (e) => {
                ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
                await mergeIntoPrevious(chapter.id)
                toast('Сцены перенесены в предыдущую главу')
              }}
            >
              Объединить с предыдущей главой
            </button>
          )}
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Удалить «${chapter.title}» вместе со сценами (${scenes.length})? Это не отменить.`)) void deleteChapter(chapter.id)
            }}
          >
            Удалить главу со сценами
          </button>
        </div>
      </details>
    </div>
  )
}

function SceneRow({ data, scene, number, canSplit }: { data: ProjectData; scene: Scene; number: number; canSplit: boolean }) {
  const st = statusOf(scene.status)
  const setups = data.markers.filter((m) => m.setupSceneId === scene.id)
  const hanging = setups.filter((m) => markerStatus(m, data) === 'hanging').length
  const openPayoffs = data.markers.filter((m) => m.payoffSceneId === scene.id && !m.resolved).length
  const done = scene.beats.filter((b) => b.done).length
  const current = data.project.lastSceneId === scene.id

  return (
    <div className={`scene-row ${current ? 'current' : ''}`} onClick={() => go({ view: 'write', sceneId: scene.id })}>
      <span className="scene-num">{number}</span>
      <span className="status-dot" style={{ background: st.color }} title={st.label} />
      <div className="scene-main">
        <div className="title">
          {scene.title}
          {current && <span className="chip here">ты здесь</span>}
        </div>
        {scene.goal && <div className="goal">{scene.goal}</div>}
      </div>
      <div className="scene-meta">
        {scene.beats.length > 0 && <span title="Пункты плана">☑ {done}/{scene.beats.length}</span>}
        {setups.length > 0 && (
          <span style={{ color: hanging ? 'var(--mk-hanging)' : undefined }} title={hanging ? 'Висят маячки без раскрытия' : 'Маячки посеяны здесь'}>
            ✦ {setups.length}
          </span>
        )}
        {openPayoffs > 0 && (
          <span style={{ color: 'var(--mk-waiting)' }} title="Здесь нужно раскрыть маячки">
            ◎ {openPayoffs}
          </span>
        )}
        <span className="words">{scene.wordCount.toLocaleString('ru-RU')}</span>
      </div>
      {canSplit && (
        <button
          className="split-btn"
          title="Сделать эту сцену началом новой главы"
          onClick={async (e) => {
            e.stopPropagation()
            const title = prompt('Название новой главы (она начнётся с этой сцены):', `Глава ${(data.chapterIndex.get(scene.chapterId) ?? 0) + 2}`)
            if (title === null) return
            await splitChapterAt(scene.id, title.trim() || 'Новая глава')
            toast('Новая глава начинается с этой сцены')
          }}
        >
          ⤒ глава отсюда
        </button>
      )}
    </div>
  )
}

/** Rearrange mode: one list in reading order. A scene belongs to the nearest chapter above it. */
function ArrangeList({ data }: { data: ProjectData }) {
  const items: OutlineItem[] = data.outline.flatMap(({ chapter, scenes }) => [
    { type: 'chapter' as const, id: chapter.id },
    ...scenes.map((s) => ({ type: 'scene' as const, id: s.id })),
  ])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = items.map((i) => i.id)
    const next = arrayMove(items, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    if (next[0]?.type !== 'chapter') return // a scene cannot sit above the first chapter
    void applyOutline(next)
  }
  const move = (id: string, dir: -1 | 1) => {
    const i = items.findIndex((x) => x.id === id)
    const j = i + dir
    if (j < 1 || j >= items.length) return
    void applyOutline(arrayMove(items, i, j))
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -8 }}>
        Тащи сцену за ⋮⋮ или жми стрелки. Если перетащить сцену ниже заголовка другой главы, она перейдёт в эту главу.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="arrange-list">
            {items.map((item) =>
              item.type === 'chapter' ? (
                <ArrangeChapter key={item.id} data={data} chapter={data.chapterById.get(item.id)!} />
              ) : (
                <ArrangeScene key={item.id} data={data} scene={data.sceneById.get(item.id)!} onMove={(d) => move(item.id, d)} />
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}

function ArrangeChapter({ data, chapter }: { data: ProjectData; chapter: Chapter }) {
  const { setNodeRef, transform, transition } = useSortable({ id: chapter.id, disabled: true })
  return (
    <div ref={setNodeRef} className="arrange-chapter" style={{ transform: CSS.Transform.toString(transform), transition }}>
      {/^\s*(глава|часть|пролог|эпилог|интерлюдия)/i.test(chapter.title) ? chapter.title : `Глава ${(data.chapterIndex.get(chapter.id) ?? 0) + 1} · ${chapter.title}`}
    </div>
  )
}

function ArrangeScene({ data, scene, onMove }: { data: ProjectData; scene: Scene; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  return (
    <div
      ref={setNodeRef}
      className={`arrange-scene ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button ref={setActivatorNodeRef} className="handle" aria-label="Перетащить" {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <span className="scene-num">{(data.sceneIndex.get(scene.id) ?? 0) + 1}</span>
      <span className="status-dot" style={{ background: statusOf(scene.status).color }} />
      <span className="arrange-title">{scene.title}</span>
      <button className="icon-btn" title="Выше" onClick={() => onMove(-1)}>
        ↑
      </button>
      <button className="icon-btn" title="Ниже" onClick={() => onMove(1)}>
        ↓
      </button>
    </div>
  )
}
