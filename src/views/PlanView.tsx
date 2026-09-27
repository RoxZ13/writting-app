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
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { Chapter, Scene, SceneStatus } from '../db/db'
import { createChapter, createScene, deleteChapter, patch, reorderChapters, reorderScenes } from '../db/repo'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { STATUSES, statusOf } from '../lib/status'
import { InlineEdit } from '../lib/ui'

export function PlanView({ data }: { data: ProjectData }) {
  const [filter, setFilter] = useState<SceneStatus | 'all' | 'nogoal'>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const visible = (s: Scene) =>
    filter === 'all' ? true : filter === 'nogoal' ? !s.goal.trim() && s.beats.length === 0 : s.status === filter

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const moveChapter = (i: number, dir: -1 | 1) => {
    const ids = data.chapters.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    void reorderChapters(arrayMove(ids, i, j))
  }

  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: 'auto' }}>План</h1>
        <div className="seg">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Все
          </button>
          {STATUSES.map((s) => (
            <button key={s.id} aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>
              {s.label}
            </button>
          ))}
          <button aria-pressed={filter === 'nogoal'} onClick={() => setFilter('nogoal')} title="Сцены, где не записано, что должно произойти">
            Без цели
          </button>
        </div>
        <button className="btn sm ghost" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(data.chapters.map((c) => c.id)))}>
          {collapsed.size ? 'Развернуть всё' : 'Только главы'}
        </button>
      </div>

      {data.outline.map(({ chapter, scenes }, i) => (
        <ChapterBlock
          key={chapter.id}
          data={data}
          chapter={chapter}
          number={i + 1}
          scenes={scenes.filter(visible)}
          allScenes={scenes}
          collapsed={collapsed.has(chapter.id)}
          onToggle={() => toggle(chapter.id)}
          onMove={(dir) => moveChapter(i, dir)}
          filtered={filter !== 'all'}
        />
      ))}

      <button className="btn" onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}>
        + Глава
      </button>
    </div>
  )
}

function ChapterBlock({
  data,
  chapter,
  number,
  scenes,
  allScenes,
  collapsed,
  onToggle,
  onMove,
  filtered,
}: {
  data: ProjectData
  chapter: Chapter
  number: number
  scenes: Scene[]
  allScenes: Scene[]
  collapsed: boolean
  onToggle: () => void
  onMove: (dir: -1 | 1) => void
  filtered: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = allScenes.map((s) => s.id)
    void reorderScenes(chapter.id, arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  if (filtered && scenes.length === 0) return null
  const words = allScenes.reduce((n, s) => n + s.wordCount, 0)

  return (
    <section className="chapter">
      <div className="chapter-head">
        <button className="icon-btn" onClick={onToggle} aria-label={collapsed ? 'Развернуть' : 'Свернуть'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="num">{number}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineEdit className="chapter-title" value={chapter.title} onSave={(title) => void patch<Chapter>('chapters', chapter.id, { title })} />
          <InlineEdit
            className="chapter-goal"
            multiline
            placeholder="О чём эта глава? Что в ней должно сдвинуться?"
            value={chapter.goal}
            onSave={(goal) => void patch<Chapter>('chapters', chapter.id, { goal })}
          />
          {collapsed && (
            <div className="small muted">
              {allScenes.length} сц. · {words.toLocaleString('ru-RU')} сл.
            </div>
          )}
        </div>
        <button className="icon-btn" title="Выше" onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon-btn" title="Ниже" onClick={() => onMove(1)}>
          ↓
        </button>
        <button
          className="icon-btn"
          title="Удалить главу"
          onClick={() => {
            if (confirm(`Удалить «${chapter.title}» вместе со сценами (${allScenes.length})?`)) void deleteChapter(chapter.id)
          }}
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="scene-grid">
              {scenes.map((s) => (
                <SceneCard key={s.id} scene={s} data={data} />
              ))}
              {!filtered && (
                <button
                  className="add-scene"
                  onClick={async () => {
                    const s = await createScene(data.project.id, chapter.id, 'Новая сцена')
                    go({ view: 'write', sceneId: s.id })
                  }}
                >
                  + Сцена
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

function SceneCard({ scene, data }: { scene: Scene; data: ProjectData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  const st = statusOf(scene.status)
  const setups = data.markers.filter((m) => m.setupSceneId === scene.id)
  const hangingHere = setups.filter((m) => markerStatus(m, data) === 'hanging').length
  const payoffs = data.markers.filter((m) => m.payoffSceneId === scene.id)
  const openPayoffs = payoffs.filter((m) => !m.resolved).length
  const done = scene.beats.filter((b) => b.done).length

  return (
    <div
      ref={setNodeRef}
      className={`scene-card ${data.project.lastSceneId === scene.id ? 'current' : ''}`}
      style={
        {
          '--status-color': st.color,
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.6 : 1,
          zIndex: isDragging ? 5 : undefined,
        } as React.CSSProperties
      }
      onClick={() => go({ view: 'write', sceneId: scene.id })}
      {...attributes}
      {...listeners}
    >
      <div className="title">{scene.title}</div>
      {scene.goal ? <div className="goal">{scene.goal}</div> : <div className="goal muted">Цель не записана</div>}
      <div className="meta">
        <span title={st.label}>{st.label}</span>
        {scene.beats.length > 0 && <span>☑ {done}/{scene.beats.length}</span>}
        {scene.wordCount > 0 && <span>{scene.wordCount.toLocaleString('ru-RU')} сл.</span>}
        {setups.length > 0 && (
          <span
            className="mk-pill"
            style={{ color: hangingHere ? 'var(--mk-hanging)' : 'var(--ink-3)' }}
            title={hangingHere ? `${hangingHere} посеянных здесь маячков без раскрытия` : 'Маячки посеяны здесь'}
          >
            ✦ {setups.length}
          </span>
        )}
        {payoffs.length > 0 && (
          <span
            className="mk-pill"
            style={{ color: openPayoffs ? 'var(--mk-waiting)' : 'var(--mk-closed)' }}
            title={openPayoffs ? `Здесь нужно раскрыть: ${openPayoffs}` : 'Раскрытия здесь выполнены'}
          >
            ◎ {payoffs.length}
          </span>
        )}
      </div>
    </div>
  )
}
