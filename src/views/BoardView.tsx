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
import { useEffect, useState } from 'react'
import type { Chapter, Marker, Scene } from '../db/db'
import {
  createChapter,
  createLine,
  createMarker,
  createScene,
  deleteChapter,
  ensurePool,
  mergeIntoPrevious,
  moveScene,
  patch,
  reorderChapters,
} from '../db/repo'
import { MarkerCard } from '../components/MarkerCard'
import { Arc, Essence } from '../components/Plot'
import { SceneSheet } from '../components/SceneSheet'
import { markerPayoffChapter, markerSetupChapter, markerStatus, sceneName, type ProjectData } from '../lib/hooks'
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

  // Open on "ты здесь", not wherever the previous screen was scrolled to.
  const phone = usePhone()
  useEffect(() => {
    window.scrollTo(0, 0)
    requestAnimationFrame(() =>
      document
        .querySelector('.card-scene.current, .tl-scene.current')
        ?.scrollIntoView({ inline: 'center', block: phone ? 'center' : 'nearest' }),
    )
  }, [phone])
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
    const scenesOf = (chapterId: string) =>
      chapterId === data.pool.chapter?.id ? data.pool.scenes : data.scenes.filter((s) => s.chapterId === chapterId)
    if (over === 'col:pool') {
      void ensurePool(data.project.id).then((pool) => moveScene(sceneId, pool.id, data.pool.scenes.length))
      return
    }
    if (over.startsWith('col:')) {
      const chapterId = over.slice(4)
      const count = scenesOf(chapterId).filter((s) => s.id !== sceneId).length
      void moveScene(sceneId, chapterId, count)
      return
    }
    const target = data.sceneById.get(over)
    if (!target) return
    void moveScene(sceneId, target.chapterId, scenesOf(target.chapterId).indexOf(target))
  }

  const showArc = [...data.scenes, ...data.pool.scenes].some((s) => s.heat)
  const hanging = data.markers.filter((m) => ['hanging', 'late'].includes(markerStatus(m, data)))
  const lineName = lens.kind === 'line' ? data.lineById.get(lens.id)?.name : undefined

  const addChapterAfter = async (i: number) => {
    const c = await createChapter(data.project.id, `Глава ${i + 2}`)
    const ids = data.chapters.map((x) => x.id)
    ids.splice(i + 1, 0, c.id)
    await reorderChapters(ids)
  }

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
        <span className="lens-label hide-sm">Показать:</span>
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
              placeholder="Например, «линия второго героя»"
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

      <Essence project={data.project} />

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
          Ветка «{lineName}»: пунктир — главы, где её сцен нет. Так видно, где линия пропадает надолго.
        </div>
      )}

      {phone ? (
        <Timeline data={data} lens={lens} onOpenScene={setOpenScene} onOpenMarker={setOpenMarker} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="board">
            <PoolColumn data={data} lens={lens} onOpenScene={setOpenScene} />
            {data.outline.map(({ chapter, scenes }, i) => (
              <Column
                key={chapter.id}
                data={data}
                chapter={chapter}
                scenes={scenes}
                lens={lens}
                isFirst={i === 0}
                showArc={showArc}
                onMove={(d) => moveChapter(i, d)}
                onAddAfter={() => void addChapterAfter(i)}
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
      )}

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
  showArc,
  onMove,
  onAddAfter,
  onOpenScene,
  onOpenMarker,
}: {
  data: ProjectData
  chapter: Chapter
  scenes: Scene[]
  lens: Lens
  isFirst: boolean
  showArc: boolean
  onMove: (dir: -1 | 1) => void
  onAddAfter: () => void
  onOpenScene: (id: string) => void
  onOpenMarker: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${chapter.id}` })
  const [draft, setDraft] = useState('')
  const [markerDraft, setMarkerDraft] = useState('')
  const [markerSide, setMarkerSide] = useState<'setup' | 'payoff'>('setup')
  const plant = data.markers.filter((m) => markerSetupChapter(m, data) === chapter.id)
  const pay = data.markers.filter((m) => markerPayoffChapter(m, data) === chapter.id)
  const lineMissing = lens.kind === 'line' && !scenes.some((s) => s.lineIds?.includes(lens.id))
  const hasCurrent = scenes.some((s) => s.id === data.project.lastSceneId)
  // On phones chapters are a list; only the chapter you are in starts unfolded.
  const [folded, setFolded] = useState(!hasCurrent && !isFirst)

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
    <section ref={setNodeRef} className={`column ${isOver ? 'over' : ''} ${folded ? 'folded' : ''}`}>
      <header className="column-head">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <button className="fold-btn" aria-label={folded ? 'Развернуть главу' : 'Свернуть главу'} onClick={() => setFolded(!folded)}>
            {folded ? '▸' : '▾'}
          </button>
          <InlineEdit className="column-title" value={chapter.title} onSave={(title) => void patch<Chapter>('chapters', chapter.id, { title })} />
          <span className="column-count">
            {scenes.length} сц.
            {chapter.publishedAt && (
              <span className="published" title="Выложена на Фикбук">
                ✓ {new Date(chapter.publishedAt + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </span>
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
              <button onClick={onAddAfter}>+ Новая глава после этой</button>
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
          placeholder="+ о чём глава"
          value={chapter.goal}
          onSave={(goal) => void patch<Chapter>('chapters', chapter.id, { goal })}
        />
        {deadlineText(chapter.deadline) && (
          <div className={`deadline column-deadline ${deadlineText(chapter.deadline)!.late ? 'late' : ''}`}>
            ⏳ {deadlineText(chapter.deadline)!.text}
            {scenes.some((x) => x.status !== 'done') && ` · не готово ${scenes.filter((x) => x.status !== 'done').length} сц.`}
          </div>
        )}
        {showArc && scenes.some((s) => s.heat || s.node) && <Arc scenes={scenes} />}
      </header>

      <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="cards">
          {scenes.map((s) => (
            <SortableCard key={s.id} data={data} scene={s} lens={lens} onOpen={() => onOpenScene(s.id)} />
          ))}
          {lineMissing && <div className="gap-slot">нет сцен этой ветки</div>}
          {!scenes.length && !lineMissing && <EmptyChapterHint />}
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

      {lens.kind === 'markers' && (
        <div className="column-markers">
          {pay.map((m) => (
            <MarkerPill key={m.id} data={data} marker={m} side="payoff" onOpen={() => onOpenMarker(m.id)} />
          ))}
          {plant.map((m) => (
            <MarkerPill key={m.id} data={data} marker={m} side="setup" onOpen={() => onOpenMarker(m.id)} />
          ))}
        </div>
      )}
      {lens.kind === 'markers' && (
      <div className="marker-add">
        <input
          className="quick-add small"
          placeholder={markerSide === 'setup' ? '✦ заложить маячок здесь…' : '◎ здесь раскрыть…'}
          value={markerDraft}
          onChange={(e) => setMarkerDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addMarker()}
        />
        <button
          className="side-toggle"
          title="Переключить: заложить / раскрыть"
          onClick={() => setMarkerSide(markerSide === 'setup' ? 'payoff' : 'setup')}
        >
          {markerSide === 'setup' ? '✦' : '◎'}
        </button>
      </div>
      )}
    </section>
  )
}

/** A quiet hint in an empty chapter, gone as soon as the first scene lands. Nothing pops up, nothing asks. */
function EmptyChapterHint() {
  return (
    <div className="empty-hint">
      о чём глава — строкой выше · чем зацепить в конце · перетащи сцены из «Пока без места» или добавь строкой ниже
    </div>
  )
}

/** "Пока без места": scenes from the author's head, jotted down before they have a chapter. */
function PoolColumn({ data, lens, onOpenScene }: { data: ProjectData; lens: Lens; onOpenScene: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'col:pool' })
  const [draft, setDraft] = useState('')
  const scenes = data.pool.scenes
  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const pool = await ensurePool(data.project.id)
    await createScene(data.project.id, pool.id, title, { status: 'idea' })
  }
  return (
    <section ref={setNodeRef} className={`column pool ${isOver ? 'over' : ''}`}>
      <header className="column-head">
        <div className="column-title pool-title">Пока без места</div>
        <div className="column-meta">{scenes.length ? `${scenes.length} сц. — перетащи в главу` : 'Выпиши сцены, которые уже есть в голове. Место найдёшь потом.'}</div>
      </header>
      <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="cards">
          {scenes.map((s) => (
            <SortableCard key={s.id} data={data} scene={s} lens={lens} onOpen={() => onOpenScene(s.id)} />
          ))}
        </div>
      </SortableContext>
      <input
        className="quick-add"
        placeholder="+ сцена из головы"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
        onBlur={() => void add()}
      />
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

/**
 * A scene on the board, kept quiet: its name and one line about it. Details (status, words, people,
 * the song) live in the scene sheet; the marker count only shows under «Показать: маячки».
 */
function Card({ data, scene, lens, overlay }: { data: ProjectData; scene: Scene; lens: Lens; overlay?: boolean }) {
  const lines = (scene.lineIds ?? []).map((id) => data.lineById.get(id)).filter(Boolean)
  const markers = data.markers.filter((m) => m.setupSceneId === scene.id || m.payoffSceneId === scene.id)
  const dim =
    (lens.kind === 'line' && !scene.lineIds?.includes(lens.id)) || (lens.kind === 'markers' && markers.length === 0)
  const current = data.project.lastSceneId === scene.id
  const showMarkers = lens.kind === 'markers' && markers.length > 0
  return (
    <article className={`card-scene ${dim ? 'dim' : ''} ${overlay ? 'overlay' : ''} ${current ? 'current' : ''} ${scene.node ? 'node' : ''}`}>
      {lines.length > 0 && (
        <div className="line-strip">
          {lines.map((l) => (
            <span key={l!.id} style={{ background: l!.color }} title={l!.name} />
          ))}
        </div>
      )}
      <div className={`card-title ${scene.title.trim() ? '' : 'untitled'}`}>
        {scene.node && <span title="Узловая точка">◆ </span>}
        {sceneName(data, scene)}
      </div>
      {scene.goal ? <div className="card-goal">{scene.goal}</div> : scene.excerpt && <div className="card-excerpt">{scene.excerpt}</div>}
      {(current || showMarkers) && (
        <div className="card-foot">
          {showMarkers && <span className="mk-count">✦ {markers.length}</span>}
          {current && <span className="here">ты здесь</span>}
        </div>
      )}
    </article>
  )
}

/** Phones: a horizontal board does not fit, so chapters become a quiet vertical list of scenes. */
function usePhone() {
  const query = '(max-width: 760px)'
  const [phone, setPhone] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

function Timeline({
  data,
  lens,
  onOpenScene,
  onOpenMarker,
}: {
  data: ProjectData
  lens: Lens
  onOpenScene: (id: string) => void
  onOpenMarker: (id: string) => void
}) {
  const here = data.project.lastSceneId ? data.sceneById.get(data.project.lastSceneId)?.chapterId : undefined
  const [open, setOpen] = useState<Set<string>>(() => new Set(here ? [here] : data.chapters.slice(0, 1).map((c) => c.id)))
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const poolOpen = open.has('pool')
  return (
    <div className="timeline">
      <section className={`tl-chapter pool ${poolOpen ? 'open' : ''} ${data.pool.scenes.length ? '' : 'is-empty'}`}>
        <button className="tl-head" aria-expanded={poolOpen} onClick={() => toggle('pool')}>
          <span className="tl-caret">{poolOpen ? '▾' : '▸'}</span>
          <span className="tl-title">Пока без места</span>
          <span className="spacer" />
          <span className="tl-meta">{data.pool.scenes.length ? `${data.pool.scenes.length} сц.` : 'сцены из головы'}</span>
        </button>
        {poolOpen && (
          <div className="tl-body">
            {data.pool.scenes.map((s) => (
              <TimelineScene key={s.id} data={data} scene={s} lens={lens} onOpen={() => onOpenScene(s.id)} />
            ))}
            <TimelineAdd data={data} lens={lens} />
          </div>
        )}
      </section>
      {data.outline.map(({ chapter, scenes }) => {
        const pay = data.markers.filter((m) => !m.resolved && markerPayoffChapter(m, data) === chapter.id)
        const plant = data.markers.filter((m) => !m.resolved && markerSetupChapter(m, data) === chapter.id)
        const lineMissing = lens.kind === 'line' && !scenes.some((s) => s.lineIds?.includes(lens.id))
        const isOpen = open.has(chapter.id)
        return (
          <section key={chapter.id} className={`tl-chapter ${isOpen ? 'open' : ''} ${lineMissing ? 'missing' : ''}`}>
            <button className="tl-head" aria-expanded={isOpen} onClick={() => toggle(chapter.id)}>
              <span className="tl-caret">{isOpen ? '▾' : '▸'}</span>
              <span className="tl-title">{chapter.title}</span>
              {chapter.id === here && !isOpen && <span className="here">ты здесь</span>}
              <span className="spacer" />
              {pay.length > 0 && <span className="tl-mk">◎ {pay.length}</span>}
              {plant.length > 0 && <span className="tl-mk">✦ {plant.length}</span>}
              <span className="tl-meta">{scenes.length} сц.</span>
            </button>
            {lineMissing && <div className="tl-gap">нет сцен этой ветки</div>}
            {isOpen && (
              <div className="tl-body">
                {chapter.goal && <div className="tl-goal">{chapter.goal}</div>}
                {!scenes.length && <EmptyChapterHint />}
                {scenes.map((s) => (
                  <TimelineScene key={s.id} data={data} scene={s} lens={lens} onOpen={() => onOpenScene(s.id)} />
                ))}
                <TimelineAdd data={data} chapter={chapter} lens={lens} />
                {(pay.length > 0 || plant.length > 0) && (
                  <div className="column-markers">
                    {pay.map((m) => (
                      <MarkerPill key={m.id} data={data} marker={m} side="payoff" onOpen={() => onOpenMarker(m.id)} />
                    ))}
                    {plant.map((m) => (
                      <MarkerPill key={m.id} data={data} marker={m} side="setup" onOpen={() => onOpenMarker(m.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
      <button className="btn ghost" onClick={() => void createChapter(data.project.id, `Глава ${data.chapters.length + 1}`)}>
        + Глава
      </button>
    </div>
  )
}

function TimelineScene({ data, scene, lens, onOpen }: { data: ProjectData; scene: Scene; lens: Lens; onOpen: () => void }) {
  const markers = data.markers.filter((m) => m.setupSceneId === scene.id || m.payoffSceneId === scene.id)
  const dim = (lens.kind === 'line' && !scene.lineIds?.includes(lens.id)) || (lens.kind === 'markers' && markers.length === 0)
  const current = data.project.lastSceneId === scene.id
  const sub = scene.goal || scene.excerpt
  return (
    <button className={`tl-scene ${dim ? 'dim' : ''} ${current ? 'current' : ''} ${scene.node ? 'node' : ''}`} onClick={onOpen}>
      {scene.node ? <span className="tl-node">◆</span> : <span className="status-dot" style={{ background: statusOf(scene.status).color }} />}
      <span className="tl-text">
        <span className={`tl-name ${scene.title.trim() ? '' : 'untitled'}`}>{sceneName(data, scene)}</span>
        {sub && <span className="tl-sub">{sub}</span>}
      </span>
      {markers.length > 0 && <span className="tl-mk">✦ {markers.length}</span>}
      {current && <span className="here">ты здесь</span>}
    </button>
  )
}

/** Without a chapter, the scene goes to "Пока без места". */
function TimelineAdd({ data, chapter, lens }: { data: ProjectData; chapter?: Chapter; lens: Lens }) {
  const [draft, setDraft] = useState('')
  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const to = chapter ?? (await ensurePool(data.project.id))
    await createScene(data.project.id, to.id, title, { status: 'idea', lineIds: lens.kind === 'line' ? [lens.id] : [] })
  }
  return (
    <input
      className="quick-add small"
      placeholder={chapter ? '+ сцена: кратко, что происходит' : '+ сцена из головы'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && void add()}
      onBlur={() => void add()}
    />
  )
}
