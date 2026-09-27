import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, uid, type Beat, type Note, type Scene, type SceneText } from '../db/db'
import { createMarker, mergeSceneIntoPrevious, patch, remove, save, snapshotScene } from '../db/repo'
import { chapterCharacters, markerPayoffChapter, markerSetupChapter, unusedLines, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { noteKind, STATUSES, timeAgo } from '../lib/status'
import { toast } from '../lib/ui'
import { MarkerCard } from './MarkerCard'
import { RefChips } from './Refs'

/** Update beats from the freshest stored copy, so quick successive edits never overwrite each other. */
export async function updateBeats(sceneId: string, fn: (beats: Beat[]) => Beat[]) {
  await db.transaction('rw', db.scenes, db.outbox, async () => {
    const current = await db.scenes.get(sceneId)
    if (current) await patch<Scene>('scenes', sceneId, { beats: fn(current.beats) })
  })
}

/**
 * Everything that belongs to the chapter being written, in one column:
 * what this scene is for, its plan, the chapter's markers, the people in it and their
 * not-yet-used quotes, story lines. Rare things (status, versions, merge) sit under "Ещё".
 */
export function ChapterContext({ data, scene, editor }: { data: ProjectData; scene: Scene; editor: Editor | null }) {
  const chapter = data.chapterById.get(scene.chapterId)
  const markers = data.markers.filter(
    (m) => markerSetupChapter(m, data) === scene.chapterId || markerPayoffChapter(m, data) === scene.chapterId,
  )
  const toPay = markers.filter((m) => markerPayoffChapter(m, data) === scene.chapterId && !m.resolved)
  const planted = markers.filter((m) => !toPay.includes(m))
  const people = [...new Set([...(scene.characterIds ?? []), ...chapterCharacters(data, scene.chapterId)])]
  const quotes = unusedLines(data, people)
  const notes = data.notes.filter((n) => n.sceneId === scene.id && !n.archived && n.kind !== 'quote' && n.kind !== 'dialogue')
  const [markerDraft, setMarkerDraft] = useState('')

  const insertQuote = (n: Note) => {
    if (!editor) return
    editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: n.text }] }).run()
    void patch<Note>('notes', n.id, { used: true, sceneId: scene.id })
    toast('Вставлено. Цитата отмечена использованной')
  }

  return (
    <div className="ctx">
      {chapter?.goal && (
        <section className="ctx-section">
          <h3>{chapter.title}</h3>
          <p className="ctx-goal">{chapter.goal}</p>
        </section>
      )}

      <section className="ctx-section">
        <h3>Эта сцена</h3>
        <Field value={scene.goal} placeholder="Кратко: что здесь происходит и что меняется" onSave={(goal) => void patch<Scene>('scenes', scene.id, { goal })} />
        <Beats beats={scene.beats} onChange={(fn) => void updateBeats(scene.id, fn)} />
      </section>

      <section className="ctx-section">
        <h3>Маячки главы</h3>
        <div className="stack" style={{ gap: 6 }}>
          {toPay.length > 0 && <div className="ctx-hint">Нужно раскрыть в этой главе</div>}
          {toPay.map((m) => (
            <MarkerCard key={m.id} data={data} marker={m} />
          ))}
          {planted.length > 0 && <div className="ctx-hint">Посеяны здесь</div>}
          {planted.map((m) => (
            <MarkerCard key={m.id} data={data} marker={m} />
          ))}
          <input
            className="quick-add small"
            placeholder="✦ новый маячок в этой сцене… (или ⌘/Ctrl+M в тексте)"
            value={markerDraft}
            onChange={(e) => setMarkerDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || !markerDraft.trim()) return
              await createMarker(data.project.id, { title: markerDraft.trim(), setupSceneId: scene.id, setupChapterId: scene.chapterId })
              setMarkerDraft('')
            }}
          />
        </div>
      </section>

      <section className="ctx-section">
        <h3>Герои</h3>
        <RefChips data={data} sceneId={scene.id} field="characterIds" selected={scene.characterIds ?? []} />
        {quotes.length > 0 && (
          <div className="quotes">
            <div className="ctx-hint">Их цитаты и диалоги, ещё не в тексте</div>
            {quotes.map((q) => (
              <div key={q.id} className="quote">
                <div className="quote-who">
                  {noteKind(q.kind).icon}{' '}
                  {(q.characterIds ?? []).map((id) => data.characterById.get(id)?.name).filter(Boolean).join(', ')}
                </div>
                <div className="quote-text">{q.text}</div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => insertQuote(q)}>
                    Вставить в текст
                  </button>
                  <button className="btn sm ghost" onClick={() => void patch<Note>('notes', q.id, { used: true })}>
                    Уже есть
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ctx-section">
        <h3>Ветки</h3>
        <RefChips data={data} sceneId={scene.id} field="lineIds" selected={scene.lineIds ?? []} />
      </section>

      {notes.length > 0 && (
        <section className="ctx-section">
          <h3>Заметки к сцене</h3>
          {notes.map((n) => (
            <div key={n.id} className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', padding: '4px 0' }}>
              <span>{noteKind(n.kind).icon}</span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{n.text}</span>
              <button className="icon-btn" title="Разобрано" onClick={() => void patch<Note>('notes', n.id, { archived: true })}>
                ✓
              </button>
            </div>
          ))}
        </section>
      )}

      <details className="sheet-more ctx-section">
        <summary>Ещё: состояние, версии, склеить</summary>
        <div className="stack" style={{ gap: 14, marginTop: 12 }}>
          <label>
            <span className="field-label">Состояние</span>
            <select className="select" value={scene.status} onChange={(e) => void patch<Scene>('scenes', scene.id, { status: e.target.value as Scene['status'] })}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Versions scene={scene} editor={editor} />
          {data.scenes.filter((s) => s.chapterId === scene.chapterId).indexOf(scene) > 0 && (
            <button
              className="btn sm"
              onClick={async () => {
                if (!confirm('Склеить эту сцену с предыдущей? Текст станет одним.')) return
                const prev = await mergeSceneIntoPrevious(scene.id)
                if (prev) go({ view: 'text', sceneId: prev })
              }}
            >
              Склеить с предыдущей сценой
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
      </details>
    </div>
  )
}

function Field({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <textarea
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
    const reason = prompt('Как назвать эту версию?', 'Вариант')
    if (reason === null) return
    await snapshotScene(t, reason || 'Вариант')
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
