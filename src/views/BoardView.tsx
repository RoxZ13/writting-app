import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { Chapter, Marker, Scene } from '../db/db'
import {
  createChapter,
  createLine,
  createMarker,
  createScene,
  deleteChapter,
  mergeIntoPrevious,
  moveScene,
  patch,
  reorderChapters,
} from '../db/repo'
import { MarkerCard } from '../components/MarkerCard'
import { Faces } from '../components/Refs'
import { SceneSheet } from '../components/SceneSheet'
import { chapterCharacters, markerPayoffChapter, markerSetupChapter, markerStatus, sceneName, type ProjectData } from '../lib/hooks'
import { MARKER_STATES, statusOf } from '../lib/status'
import { InlineEdit, Modal, toast } from '../lib/ui'
import { deadlineText } from '../lib/stories'

type Lens = { kind: 'all' } | { kind: 'line'; id: string } | { kind: 'markers' }

export function BoardView({ data }: { data: ProjectData }) {
  const [lens, setLens] = useState<Lens>(() => {
    const wanted = sessionStorage.getItem('manuscript.lens')
    sessionStorage.removeItem('manuscript.lens')
    return wanted === 'markers' ? { kind: 'markers' } : { kind: 'all' }
  })
  const [newLine, setNewLine] = useState<string | null>(null)
  const [openScene, setOpenScene] = useState<string | null>(null)
  const [openMarker, setOpenMarker] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over || over === e.active.id) return
    const sceneId = String(e.active.id)
    if (over.startsWith('col:')) {
      const chapterId = over.slice(4)
      const count = data.scenes.filter((s) => s.chapterId === chapterId && s.id !== sceneId).length
      void moveScene(sceneId, chapterId, count)
      return
    }
    const target = data.sceneById.get(over)
    if (!target) return
    const list = data.scenes.filter((s) => s.chapterId === target.chapterId)
    void moveScene(sceneId, target.chapterId, list.indexOf(target))
  }

  const hanging = data.markers.filter((m) => ['hanging', 'late'].includes(markerStatus(m, data)))
  const lineName = lens.kind === 'line' ? data.lineById.get(lens.id)?.name : undefined

  const moveChapter = (i: number, dir: -1 | 1) => {
    const ids = data.chapters.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void reorderChapters(ids)
  }

  return (
    <div className="board-page">
      <div className="board-bar">
        <h1>Доска</h1>
        <div className="seg lens">
          <button aria-pressed={lens.kind === 'all'} onClick={() => setLens({ kind: 'all' })}>
            Всё
          </button>
          <button aria-pressed={lens.kind === 'markers'} onClick={() => setLens({ kind: 'markers' })}>
            Маячки{hanging.length > 0 && <span className="lens-count">{hanging.length}</span>}
          </button>
          {data.lines.map((l) => (
            <button
              key={l.id}
              aria-pressed={lens.kind === 'line' && lens.id === l.id}
              onClick={() => setLens({ kind: 'line', id: l.id })}
            >
              <span className="dot" style={{ background: l.color }} /> {l.name}
            </button>
          ))}
          {newLine === null ? (
            <button className="lens-add" title="Новая ветка — например, линия второстепенного героя" onClick={() => setNewLine('')}>
              + ветка
            </button>
          ) : (
            <input
              className="ref-input"
              autoFocus
              placeholder="Например, «Линия Альфарда»"
              value={newLine}
              onChange={(e) => setNewLine(e.target.value)}
              onBlur={() => setNewLine(null)}
              onKeyDown={async (e) => {
                if (e.key === 'Escape') setNewLine(null)
                if (e.key !== 'Enter' || !newLine.trim()) return
                const l = await createLine(data.project.id, newLine.trim())
                setNewLine(null)
                setLens({ kind: 'line', id: l.id })
                toast('Ветка создана. Отмечай её сцены: клик по сцене → «Ветки»')
              }}
            />
          )}
        </div>
      </div>

      {lens.kind === 'markers' && (
        <div className="lens-note">
          {hanging.length === 0 ? (
            'Все маячки на месте: у каждого есть глава, где он раскроется.'
          ) : (
            <>
              <strong>{hanging.length} без места раскрытия или пропущены:</strong>{' '}
              {hanging.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ' · '}
                  <button className="link" onClick={() => setOpenMarker(m.id)}>
                    {m.title || 'без названия'}
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
      )}
      {lens.kind === 'line' && (
        <div className="lens-note">
          Ветка «{lineName}»: пунктир — главы, где её сцен нет. Так видно, где линия провисает.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="board">
          {data.outline.map(({ chapter, scenes }, i) => (
            <Column
              key={chapter.id}
              data={data}
              chapter={chapter}
              scenes={scenes}
              lens={lens}
              isFirst={i === 0}
              onMove={(d) => moveChapter(i, d)}
              onOpenScene={setOpenScene}
              onOpenMarker={setOpenMarker}
            />
          ))}
          <button className="add-column" onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}>
            + Глава
          </button>
        </div>
        <DragOverlay>{dragging && data.sceneById.get(dragging) ? <Card data={data} scene={data.sceneById.get(dragging)!} lens={lens} overlay /> : null}</DragOverlay>
      </DndContext>

      {openScene && data.sceneById.get(openScene) && (
        <SceneSheet data={data} scene={data.sceneById.get(openScene)!} onClose={() => setOpenScene(null)} />
      )}
      {openMarker && data.markers.find((m) => m.id === openMarker) && (
        <Modal onClose={() => setOpenMarker(null)} label="Маячок">
          <MarkerCard data={data} marker={data.markers.find((m) => m.id === openMarker)!} open />
        </Modal>
      )}
    </div>
  )
}

function Column({
  data,
  chapter,
  scenes,
  lens,
  isFirst,
  onMove,
  onOpenScene,
  onOpenMarker,
}: {
  data: ProjectData
  chapter: Chapter
  scenes: Scene[]
  lens: Lens
  isFirst: boolean
  onMove: (dir: -1 | 1) => void
  onOpenScene: (id: string) => void
  onOpenMarker: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${chapter.id}` })
  const [draft, setDraft] = useState('')
  const [markerDraft, setMarkerDraft] = useState('')
  const [markerSide, setMarkerSide] = useState<'setup' | 'payoff'>('setup')
  const words = scenes.reduce((n, s) => n + s.wordCount, 0)
  const plant = data.markers.filter((m) => markerSetupChapter(m, data) === chapter.id)
  const pay = data.markers.filter((m) => markerPayoffChapter(m, data) === chapter.id)
  const people = chapterCharacters(data, chapter.id)
  const lineMissing = lens.kind === 'line' && !scenes.some((s) => s.lineIds?.includes(lens.id))

  const addScene = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await createScene(data.project.id, chapter.id, title, { status: 'idea', lineIds: lens.kind === 'line' ? [lens.id] : [] })
  }
  const addMarker = async () => {
    const title = markerDraft.trim()
    if (!title) return
    setMarkerDraft('')
    await createMarker(data.project.id, markerSide === 'setup' ? { title, setupChapterId: chapter.id } : { title, payoffChapterId: chapter.id })
  }

  return (
    <section ref={setNodeRef} className={`column ${isOver ? 'over' : ''}`}>
      <header className="column-head">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <InlineEdit className="column-title" value={chapter.title} onSave={(title) => void patch<Chapter>('chapters', chapter.id, { title })} />
          <details className="menu">
            <summary className="icon-btn" aria-label="Действия с главой">
              ⋯
            </summary>
            <div className="menu-list card">
              <label className="menu-field" style={{ padding: '4px 10px 8px' }}>
                <span>Дедлайн главы</span>
                <input
                  className="input"
                  type="date"
                  defaultValue={chapter.deadline ?? ''}
                  onChange={(e) => void patch<Chapter>('chapters', chapter.id, { deadline: e.target.value || undefined })}
                />
              </label>
              <button onClick={() => onMove(-1)}>← Сдвинуть левее</button>
              <button onClick={() => onMove(1)}>Сдвинуть правее →</button>
              {!isFirst && (
                <button onClick={() => void mergeIntoPrevious(chapter.id).then(() => toast('Сцены перенесены в предыдущую главу'))}>
                  Склеить с предыдущей главой
                </button>
              )}
              <button
                className="danger"
                onClick={() => confirm(`Удалить «${chapter.title}» вместе со сценами (${scenes.length})?`) && void deleteChapter(chapter.id)}
              >
                Удалить главу
              </button>
            </div>
          </details>
        </div>
        <InlineEdit
          className="column-goal"
          multiline
          placeholder="О чём глава?"
          value={chapter.goal}
          onSave={(goal) => void patch<Chapter>('chapters', chapter.id, { goal })}
        />
        {deadlineText(chapter.deadline) && (
          <div className={`deadline column-deadline ${deadlineText(chapter.deadline)!.late ? 'late' : ''}`}>
            ⏳ {deadlineText(chapter.deadline)!.text}
            {scenes.some((x) => x.status !== 'done') && ` · не готово ${scenes.filter((x) => x.status !== 'done').length} сц.`}
          </div>
        )}
        <div className="column-meta">
          {scenes.length} сц. · {words.toLocaleString('ru-RU')} сл.
          <Faces data={data} ids={people} max={5} />
        </div>
      </header>

      <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="cards">
          {scenes.map((s) => (
            <SortableCard key={s.id} data={data} scene={s} lens={lens} onOpen={() => onOpenScene(s.id)} />
          ))}
          {lineMissing && <div className="gap-slot">нет сцен этой ветки</div>}
        </div>
      </SortableContext>

      <input
        className="quick-add"
        placeholder="+ сцена: кратко, что происходит"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void addScene()}
        onBlur={() => void addScene()}
      />

      {(plant.length > 0 || pay.length > 0 || lens.kind === 'markers') && (
        <div className="column-markers">
          {pay.map((m) => (
            <MarkerPill key={m.id} data={data} marker={m} side="payoff" onOpen={() => onOpenMarker(m.id)} />
          ))}
          {plant.map((m) => (
            <MarkerPill key={m.id} data={data} marker={m} side="setup" onOpen={() => onOpenMarker(m.id)} />
          ))}
        </div>
      )}
      <div className="marker-add">
        <input
          className="quick-add small"
          placeholder={markerSide === 'setup' ? '✦ посеять маячок здесь…' : '◎ здесь раскрыть…'}
          value={markerDraft}
          onChange={(e) => setMarkerDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addMarker()}
        />
        <button
          className="side-toggle"
          title="Переключить: посеять / раскрыть"
          onClick={() => setMarkerSide(markerSide === 'setup' ? 'payoff' : 'setup')}
        >
          {markerSide === 'setup' ? '✦' : '◎'}
        </button>
      </div>
    </section>
  )
}

function MarkerPill({ data, marker, side, onOpen }: { data: ProjectData; marker: Marker; side: 'setup' | 'payoff'; onOpen: () => void }) {
  const st = MARKER_STATES[markerStatus(marker, data)]
  return (
    <button className={`mk-pill ${marker.resolved ? 'done' : ''}`} style={{ '--mk-color': st.color } as React.CSSProperties} onClick={onOpen} title={st.hint}>
      <span className="mk-ico">{side === 'setup' ? '✦' : '◎'}</span>
      <span className="mk-text">{marker.title || 'без названия'}</span>
    </button>
  )
}

function SortableCard({ data, scene, lens, onOpen }: { data: ProjectData; scene: Scene; lens: Lens; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <Card data={data} scene={scene} lens={lens} />
    </div>
  )
}

function Card({ data, scene, lens, overlay }: { data: ProjectData; scene: Scene; lens: Lens; overlay?: boolean }) {
  const lines = (scene.lineIds ?? []).map((id) => data.lineById.get(id)).filter(Boolean)
  const markers = data.markers.filter((m) => m.setupSceneId === scene.id || m.payoffSceneId === scene.id)
  const dim =
    (lens.kind === 'line' && !scene.lineIds?.includes(lens.id)) || (lens.kind === 'markers' && markers.length === 0)
  const st = statusOf(scene.status)
  const current = data.project.lastSceneId === scene.id
  return (
    <article className={`card-scene ${dim ? 'dim' : ''} ${overlay ? 'overlay' : ''} ${current ? 'current' : ''}`}>
      {lines.length > 0 && (
        <div className="line-strip">
          {lines.map((l) => (
            <span key={l!.id} style={{ background: l!.color }} title={l!.name} />
          ))}
        </div>
      )}
      {scene.epigraph && <div className="card-epigraph">♪ {scene.epigraph}</div>}
      <div className={`card-title ${scene.title.trim() ? '' : 'untitled'}`}>{sceneName(data, scene)}</div>
      {scene.goal ? <div className="card-goal">{scene.goal}</div> : scene.excerpt && <div className="card-excerpt">{scene.excerpt}</div>}
      <div className="card-foot">
        <span className="status-dot" style={{ background: st.color }} title={st.label} />
        {scene.wordCount > 0 ? <span>{scene.wordCount.toLocaleString('ru-RU')}</span> : <span>план</span>}
        {markers.length > 0 && <span className="mk-count">✦ {markers.length}</span>}
        {current && <span className="here">ты здесь</span>}
        <span className="spacer" />
        <Faces data={data} ids={scene.characterIds ?? []} max={3} />
      </div>
    </article>
  )
}
