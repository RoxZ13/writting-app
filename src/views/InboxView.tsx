import { useState } from 'react'
import { uid, type Note, type NoteKind } from '../db/db'
import { updateBeats } from '../components/ChapterContext'
import { createMarker, createNote, patch, remove } from '../db/repo'
import { sceneLabel, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { NOTE_KINDS, noteKind, timeAgo } from '../lib/status'
import { toast } from '../lib/ui'

type Filter = 'inbox' | 'questions' | 'attached' | 'archive'

export function InboxView({ data }: { data: ProjectData }) {
  const [filter, setFilter] = useState<Filter>('inbox')
  const [text, setText] = useState('')
  const [kind, setKind] = useState<NoteKind>('idea')

  const lists: Record<Filter, Note[]> = {
    inbox: data.notes.filter((n) => !n.archived && !n.sceneId && !n.used && !(n.characterIds ?? []).length),
    questions: data.notes.filter((n) => !n.archived && n.kind === 'question'),
    attached: data.notes.filter((n) => !n.archived && n.sceneId),
    archive: data.notes.filter((n) => n.archived),
  }
  const shown = lists[filter]

  const add = async () => {
    if (!text.trim()) return
    await createNote(text.trim(), kind, data.project.id)
    setText('')
  }

  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: 'auto' }}>Входящие</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Сюда падает всё, что ты быстро записала. Разбирать не обязательно сразу — когда будет настроение, привяжи к
        сцене, превращи в маячок или пункт плана.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <textarea
          className="capture-text"
          style={{ minHeight: 50 }}
          placeholder="Записать мысль…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void add()
            }
          }}
        />
        <div className="row">
          <div className="seg">
            {NOTE_KINDS.map((k) => (
              <button key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                {k.icon} {k.label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button className="btn primary sm" onClick={() => void add()}>
            Сохранить
          </button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        {(
          [
            ['inbox', 'Неразобранные'],
            ['questions', 'Вопросы'],
            ['attached', 'Привязанные к сценам'],
            ['archive', 'Архив'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label} <span className="muted">{lists[f].length}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty card">{filter === 'inbox' ? 'Всё разобрано. Голова свободна 🌿' : 'Пусто'}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {shown.map((n) => (
            <NoteRow key={n.id} note={n} data={data} />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteRow({ note, data }: { note: Note; data: ProjectData }) {
  const [open, setOpen] = useState(false)
  const k = noteKind(note.kind)
  const scene = note.sceneId ? data.sceneById.get(note.sceneId) : undefined

  const toBeat = async () => {
    if (!scene) return
    await updateBeats(scene.id, (all) => [...all, { id: uid(), text: note.text, done: false }])
    await patch<Note>('notes', note.id, { archived: true })
    toast('Добавлено в план сцены')
  }
  const toMarker = async () => {
    await createMarker(data.project.id, { title: note.text, setupSceneId: note.sceneId })
    await patch<Note>('notes', note.id, { archived: true })
    toast('Теперь это маячок')
  }

  return (
    <div className="note-item">
      <span className="note-kind" title={k.label}>
        {k.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="note-text">{note.text}</div>
        <div className="small muted" style={{ marginTop: 4 }}>
          {timeAgo(note.createdAt)}
          {scene && (
            <>
              {' · '}
              <a href="#" onClick={(e) => (e.preventDefault(), go({ view: 'write', sceneId: scene.id }))}>
                {sceneLabel(data, scene.id)}
              </a>
            </>
          )}
        </div>
        {open && (
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            <select
              className="select"
              value={note.sceneId ?? ''}
              onChange={(e) => void patch<Note>('notes', note.id, { sceneId: e.target.value || undefined })}
            >
              <option value="">Привязать к сцене…</option>
              {data.outline.map(({ chapter, scenes }) => (
                <optgroup key={chapter.id} label={chapter.title}>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="row">
              {scene && (
                <button className="btn sm" onClick={() => void toBeat()}>
                  ☑ В план сцены
                </button>
              )}
              <button className="btn sm" onClick={() => void toMarker()}>
                ✦ Сделать маячком
              </button>
              <div className="seg">
                {NOTE_KINDS.map((x) => (
                  <button key={x.id} aria-pressed={note.kind === x.id} onClick={() => void patch<Note>('notes', note.id, { kind: x.id })}>
                    {x.icon}
                  </button>
                ))}
              </div>
              <button className="btn sm ghost" onClick={() => void remove('notes', note.id)}>
                Удалить
              </button>
            </div>
          </div>
        )}
      </div>
      <button className="btn sm ghost" onClick={() => setOpen(!open)}>
        {open ? 'Готово' : 'Разобрать'}
      </button>
      <button
        className="icon-btn"
        title={note.archived ? 'Вернуть' : note.kind === 'question' ? 'Вопрос решён' : 'В архив'}
        onClick={() => void patch<Note>('notes', note.id, { archived: !note.archived })}
      >
        {note.archived ? '↩' : '✓'}
      </button>
    </div>
  )
}
