import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, uid, type Beat, type Marker, type Note, type Scene, type SceneText } from '../db/db'
import { createMarker, mergeSceneIntoPrevious, patch, remove, save, snapshotScene } from '../db/repo'
import { markerPayoffChapter, markerStatus, unusedLines, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { MARKER_STATES, noteKind, STATUSES, timeAgo } from '../lib/status'
import { hotkey } from '../lib/session'
import { toast } from '../lib/ui'
import { Faces, RefChips } from './Refs'

/** Update beats from the freshest stored copy, so quick successive edits never overwrite each other. */
export async function updateBeats(sceneId: string, fn: (beats: Beat[]) => Beat[]) {
  await db.transaction('rw', db.scenes, db.outbox, async () => {
    const current = await db.scenes.get(sceneId)
    if (current) await patch<Scene>('scenes', sceneId, { beats: fn(current.beats) })
  })
}

const OPEN_KEY = 'manuscript.passport'

/** Markers that belong to this scene: planted in it, to be paid off in it, or planned for its chapter. */
export function sceneMarkers(data: ProjectData, scene: Scene) {
  const toPay = data.markers.filter(
    (m) =>
      !m.resolved &&
      (m.payoffSceneId === scene.id || (!m.payoffSceneId && markerPayoffChapter(m, data) === scene.chapterId)),
  )
  const toPlant = data.markers.filter((m) => !m.setupSceneId && m.setupChapterId === scene.chapterId && !toPay.includes(m))
  const planted = data.markers.filter((m) => m.setupSceneId === scene.id && !toPay.includes(m))
  return { toPay, toPlant, planted }
}

/**
 * Everything about the scene in one place, right above its text: what it is for, the plan,
 * the markers to plant or pay off here, who is in it. Folded, it is one quiet line with the
 * current plan item; unfolded, a card. Rare things live under "Ещё".
 */
export function ScenePassport({
  data,
  scene,
  editor,
  onOpenMarker,
}: {
  data: ProjectData
  scene: Scene
  editor: Editor | null
  onOpenMarker: (id: string) => void
}) {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const goalRef = useRef<HTMLTextAreaElement>(null)
  const { toPay, toPlant, planted } = sceneMarkers(data, scene)
  const markerCount = toPay.length + toPlant.length + planted.length
  const people = scene.characterIds ?? []
  const quotes = unusedLines(data, people)
  const done = scene.beats.filter((b) => b.done).length
  const next = scene.beats.find((b) => !b.done)
  const empty = !scene.goal && !scene.beats.length && !markerCount && !people.length

  // Opening an empty passport lands in the first field, so typing never goes into the manuscript.
  useEffect(() => {
    if (open && empty) goalRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const tick = (b: Beat) => void updateBeats(scene.id, (all) => all.map((x) => (x.id === b.id ? { ...x, done: true } : x)))

  return (
    <section className={`passport ${open ? 'open' : ''}`} aria-label="Паспорт сцены">
      <div className="pp-bar">
        <button className="pp-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="pp-caret">{open ? '▾' : '▸'}</span>
          {open ? (
            <span className="pp-title">Паспорт сцены</span>
          ) : empty ? (
            <span className="pp-empty">Паспорт сцены — цель, план, маячки, герои</span>
          ) : (
            <span className="pp-goal">{scene.goal || 'Цель сцены не записана'}</span>
          )}
          <span className="pp-chips">
            {scene.beats.length > 0 && (
              <span title="План сцены">
                ☑ {done}/{scene.beats.length}
              </span>
            )}
            {markerCount > 0 && (
              <span className={toPay.length ? 'pp-mk due' : 'pp-mk'} title="Маячки этой сцены">
                ✦ {markerCount}
              </span>
            )}
            <Faces data={data} ids={people} max={3} />
          </span>
        </button>
      </div>

      {!open && next && (
        <div className="pp-now">
          <button className="compass-check" title="Готово — к следующему пункту" onClick={() => tick(next)} />
          <span className="muted">Сейчас:</span> <span className="pp-now-text">{next.text}</span>
        </div>
      )}
      {!open && toPay.length > 0 && (
        <div className="pp-now pp-due">
          <span>◎</span> Здесь раскрыть: {toPay.map((m) => m.title).join(' · ')}
        </div>
      )}

      {open && (
        <div className="pp-body">
          <Field
            inputRef={goalRef}
            value={scene.goal}
            placeholder="Зачем эта сцена? Что в ней меняется?"
            onSave={(goal) => void patch<Scene>('scenes', scene.id, { goal })}
          />

          <div className="pp-section">
            <h4>План</h4>
            <Beats beats={scene.beats} onChange={(fn) => void updateBeats(scene.id, fn)} />
          </div>

          <div className="pp-section">
            <h4>Маячки</h4>
            <MarkerRows title="Раскрыть здесь" icon="◎" list={toPay} data={data} onOpen={onOpenMarker} />
            <MarkerRows title="Посеять в этой главе" icon="✦" list={toPlant} data={data} onOpen={onOpenMarker} />
            <MarkerRows title="Посеяны здесь" icon="✦" list={planted} data={data} onOpen={onOpenMarker} />
            <MarkerAdd data={data} scene={scene} />
          </div>

          <div className="pp-section">
            <h4>Кто в сцене</h4>
            <RefChips data={data} sceneId={scene.id} field="characterIds" selected={people} />
            {quotes.length > 0 && <Quotes data={data} scene={scene} editor={editor} quotes={quotes} />}
          </div>

          <More data={data} scene={scene} editor={editor} />
        </div>
      )}
    </section>
  )
}

function MarkerRows({ title, icon, list, data, onOpen }: { title: string; icon: string; list: Marker[]; data: ProjectData; onOpen: (id: string) => void }) {
  if (!list.length) return null
  return (
    <div className="pp-markers">
      <div className="pp-hint">{title}</div>
      {list.map((m) => {
        const st = MARKER_STATES[markerStatus(m, data)]
        return (
          <div key={m.id} className="pp-marker" style={{ '--mk-color': st.color } as React.CSSProperties}>
            <input
              type="checkbox"
              className="mk-check"
              title="Раскрыт"
              checked={m.resolved}
              onChange={(e) => void patch<Marker>('markers', m.id, { resolved: e.target.checked })}
            />
            <span className="mk-ico">{icon}</span>
            <button className="link-plain" onClick={() => onOpen(m.id)}>
              {m.title || 'без названия'}
            </button>
            {!m.payoffSceneId && !m.payoffChapterId && <span className="pp-hang">висит</span>}
          </div>
        )
      })}
    </div>
  )
}

function MarkerAdd({ data, scene }: { data: ProjectData; scene: Scene }) {
  const [v, setV] = useState('')
  return (
    <input
      className="quick-add small"
      placeholder={`+ маячок в этой сцене${hotkey(' (или ⌘/Ctrl+M прямо в тексте)')}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key !== 'Enter' || !v.trim()) return
        await createMarker(data.project.id, { title: v.trim(), setupSceneId: scene.id, setupChapterId: scene.chapterId })
        setV('')
      }}
    />
  )
}

function Quotes({ data, scene, editor, quotes }: { data: ProjectData; scene: Scene; editor: Editor | null; quotes: Note[] }) {
  const insert = (n: Note) => {
    if (!editor) return
    editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: n.text }] }).run()
    void patch<Note>('notes', n.id, { used: true, sceneId: scene.id })
    toast('Вставлено. Цитата отмечена использованной')
  }
  return (
    <details className="pp-quotes">
      <summary>
        Их цитаты и диалоги, ещё не в тексте: {quotes.length}
      </summary>
      {quotes.map((q) => (
        <div key={q.id} className="quote">
          <div className="quote-who">
            {noteKind(q.kind).label} · {(q.characterIds ?? []).map((id) => data.characterById.get(id)?.name).filter(Boolean).join(', ')}
          </div>
          <div className="quote-text">{q.text}</div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm" onClick={() => insert(q)}>
              Вставить в текст
            </button>
            <button className="btn sm ghost" onClick={() => void patch<Note>('notes', q.id, { used: true })}>
              Уже есть
            </button>
          </div>
        </div>
      ))}
    </details>
  )
}

function More({ data, scene, editor }: { data: ProjectData; scene: Scene; editor: Editor | null }) {
  const chapter = data.chapterById.get(scene.chapterId)
  const notes = data.notes.filter((n) => n.sceneId === scene.id && !n.archived && n.kind !== 'quote' && n.kind !== 'dialogue')
  return (
    <details className="pp-more">
      <summary>Ещё: ветки, глава, заметки, версии</summary>
      <div className="stack" style={{ gap: 16, marginTop: 12 }}>
        <div>
          <h4>Ветки</h4>
          <RefChips data={data} sceneId={scene.id} field="lineIds" selected={scene.lineIds ?? []} />
        </div>
        {chapter && (
          <div>
            <h4>{chapter.title}</h4>
            <div className="small muted">{chapter.goal || 'Цель главы не записана — её можно задать на доске.'}</div>
          </div>
        )}
        {notes.length > 0 && (
          <div>
            <h4>Заметки к сцене</h4>
            {notes.map((n) => (
              <div key={n.id} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', padding: '4px 0' }}>
                <span className="muted">{noteKind(n.kind).label}</span>
                <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{n.text}</span>
                <button className="icon-btn" title="Разобрано" onClick={() => void patch<Note>('notes', n.id, { archived: true })}>
                  ✓
                </button>
              </div>
            ))}
          </div>
        )}
        <label>
          <h4>Состояние</h4>
          <select className="select" value={scene.status} onChange={(e) => void patch<Scene>('scenes', scene.id, { status: e.target.value as Scene['status'] })}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Versions scene={scene} editor={editor} />
        <div className="row">
          {data.scenes.filter((s) => s.chapterId === scene.chapterId).indexOf(scene) > 0 && (
            <button
              className="btn sm"
              onClick={async () => {
                if (!confirm('Склеить эту сцену с предыдущей? Текст станет одним.')) return
                const prev = await mergeSceneIntoPrevious(scene.id)
                if (prev) go({ view: 'text', sceneId: prev })
              }}
            >
              Склеить с предыдущей
            </button>
          )}
          <button
            className="btn sm ghost"
            style={{ color: 'var(--mk-hanging)' }}
            onClick={async () => {
              if (!confirm('Удалить эту сцену вместе с текстом?')) return
              await remove('scenes', scene.id)
              await remove('texts', scene.id)
              go({ view: 'board' })
            }}
          >
            Удалить сцену
          </button>
        </div>
      </div>
    </details>
  )
}
function Field({ value, placeholder, onSave, inputRef }: { value: string; placeholder: string; onSave: (v: string) => void; inputRef?: React.Ref<HTMLTextAreaElement> }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <textarea
      ref={inputRef}
      className="textarea"
      rows={2}
      placeholder={placeholder}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  )
}

function Beats({ beats, onChange }: { beats: Beat[]; onChange: (fn: (b: Beat[]) => Beat[]) => void }) {
  const [draft, setDraft] = useState('')
  const update = (id: string, changes: Partial<Beat>) => onChange((all) => all.map((b) => (b.id === id ? { ...b, ...changes } : b)))
  const drop = (id: string) => onChange((all) => all.filter((x) => x.id !== id))
  return (
    <div style={{ marginTop: 8 }}>
      {beats.map((b) => (
        <div key={b.id} className={`beat ${b.done ? 'done' : ''}`}>
          <input type="checkbox" checked={b.done} onChange={(e) => update(b.id, { done: e.target.checked })} />
          <BeatText value={b.text} onSave={(text) => (text.trim() ? update(b.id, { text }) : drop(b.id))} />
          <button className="icon-btn" title="Удалить" onClick={() => drop(b.id)}>
            ×
          </button>
        </div>
      ))}
      <input
        className="quick-add small"
        placeholder={beats.length ? '+ ещё пункт плана' : '+ что должно произойти (по пунктам)'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            const text = draft.trim()
            onChange((all) => [...all, { id: uid(), text, done: false }])
            setDraft('')
          }
        }}
      />
    </div>
  )
}

function BeatText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea rows={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

function Versions({ scene, editor }: { scene: Scene; editor: Editor | null }) {
  const snaps = useLiveQuery(
    async () =>
      (await db.snapshots.where('sceneId').equals(scene.id).toArray()).filter((s) => !s.deleted).sort((a, b) => b.createdAt - a.createdAt),
    [scene.id],
  )
  const saveVersion = async () => {
    const t = await db.texts.get(scene.id)
    if (!t) return
    const when = new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    await snapshotScene(t, `Версия от ${when}`)
    toast('Версия сохранена')
  }
  const restore = async (content: unknown, wordCount: number) => {
    const t = await db.texts.get(scene.id)
    if (!t || !editor) return
    if (!confirm('Вернуть эту версию? Текущий текст тоже сохранится как версия.')) return
    await snapshotScene(t, 'Перед восстановлением')
    await save<SceneText>('texts', { ...t, content, wordCount })
    editor.commands.setContent(content as object, { emitUpdate: false })
    toast('Версия восстановлена')
  }
  return (
    <div>
      <span className="field-label">Версии</span>
      <button className="btn sm" onClick={() => void saveVersion()}>
        Сохранить текущий текст как версию
      </button>
      {snaps?.map((s) => (
        <div key={s.id} className="snapshot">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{s.reason}</div>
            <div className="muted">
              {timeAgo(s.createdAt)} · {s.wordCount} сл.
            </div>
          </div>
          <button className="btn sm ghost" onClick={() => void restore(s.content, s.wordCount)}>
            Вернуть
          </button>
        </div>
      ))}
    </div>
  )
}
