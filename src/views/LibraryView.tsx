import { useLiveQuery } from 'dexie-react-hooks'
import { chapterProgress } from '../lib/pace'
import { useState } from 'react'
import { db, type Project } from '../db/db'
import { alive, patch, remove } from '../db/repo'
import { COVERS, createStory, deadlineText } from '../lib/stories'
import { timeAgo } from '../lib/status'
import { formatWords } from '../lib/text'
import { Modal, toast } from '../lib/ui'
import { BookCover, CoverPicker } from '../components/BookCover'
import { useCover } from '../lib/cover'

/** All stories side by side — authors rarely write just one. */
export function LibraryView({ projects, currentId, onOpen }: { projects: Project[]; currentId: string; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false)
  const stats = useLiveQuery(async () => {
    const scenes = alive(await db.scenes.toArray())
    const chapters = alive(await db.chapters.toArray())
    const by: Record<string, { words: number; scenes: number; chapters: number; written: number; total: number }> = {}
    for (const p of projects) {
      const own = chapters.filter((c) => c.projectId === p.id)
      const ownScenes = scenes.filter((s) => s.projectId === p.id)
      const cp = chapterProgress(p, own, ownScenes)
      by[p.id] = { words: 0, scenes: 0, chapters: own.filter((c) => !c.pool).length, written: cp.written, total: cp.total }
    }
    for (const s of scenes) if (by[s.projectId]) (by[s.projectId].words += s.wordCount), by[s.projectId].scenes++
    return by
  }, [projects.map((p) => p.id).join()])

  return (
    <div className="lib-page">
      <div className="lib-head row">
        <div style={{ marginRight: 'auto' }}>
          <h1>Истории</h1>
          <div className="muted">Твои рукописи и черновики</div>
        </div>
        <button className="btn primary big-pill" onClick={() => setCreating(true)}>
          + Новая история
        </button>
      </div>

      <div className="library">
        {projects.map((p) => (
          <StoryCard key={p.id} p={p} current={p.id === currentId} stats={stats?.[p.id]} onOpen={() => onOpen(p.id)} />
        ))}
        <button className="story add" onClick={() => setCreating(true)}>
          <span className="plus">+</span>
          Новая история
        </button>
      </div>

      {creating && <NewStory onClose={() => setCreating(false)} onCreated={onOpen} />}
    </div>
  )
}

function StoryCard({
  p,
  current,
  stats,
  onOpen,
}: {
  p: Project
  current: boolean
  stats?: { words: number; scenes: number; chapters: number; written: number; total: number }
  onOpen: () => void
}) {
  const dl = deadlineText(p.deadline)
  const color = p.color ?? '#0b0b0c'
  const cover = useCover(p.id)
  return (
    <article className={`story ${current ? 'current' : ''}`}>
      <BookCover project={p} onClick={onOpen} />
      <div className="story-body">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <strong className="story-title" onClick={onOpen}>
            {p.title}
          </strong>
          <details className="menu">
            <summary className="icon-btn" aria-label="Действия">
              ⋯
            </summary>
            <div className="menu-list card story-menu">
              <label className="menu-field">
                <span>Название</span>
                <input
                  className="input"
                  defaultValue={p.title}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && void patch<Project>('projects', p.id, { title: e.target.value.trim() })}
                />
              </label>
              <label className="menu-field">
                <span>Дедлайн</span>
                <input
                  className="input"
                  type="date"
                  defaultValue={p.deadline ?? ''}
                  onChange={(e) => void patch<Project>('projects', p.id, { deadline: e.target.value || undefined })}
                />
              </label>
              <div className="menu-field">
                <span>Обложка</span>
                <CoverPicker projectId={p.id} />
                {!cover && (
                  <div className="covers">
                    {COVERS.map((c) => (
                      <button
                        key={c}
                        className={`swatch ${c === color ? 'on' : ''}`}
                        style={{ background: c }}
                        aria-label="Цвет обложки"
                        onClick={() => void patch<Project>('projects', p.id, { color: c })}
                      />
                    ))}
                  </div>
                )}
              </div>
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
                  await remove('projects', p.id)
                  toast('История удалена')
                }}
              >
                Удалить историю
              </button>
            </div>
          </details>
        </div>
        {p.genre && <div className="story-meta">{p.genre}</div>}
        <div className="story-meta">
          {stats ? `${stats.written} из ${stats.total} гл. · ${formatWords(stats.words)}` : '…'}
          {' · '}
          {timeAgo(p.updatedAt)}
        </div>
        {dl && <div className={`deadline ${dl.late ? 'late' : ''}`}>⏳ {dl.text}</div>}
        <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={onOpen}>
          {current ? 'Продолжить' : 'Открыть'}
        </button>
      </div>
    </article>
  )
}

function NewStory({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(COVERS[0])
  const [deadline, setDeadline] = useState('')
  const [genre, setGenre] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async (file?: File) => {
    setBusy(true)
    const id = await createStory({ title, file, color, deadline, genre })
    setBusy(false)
    onClose()
    onCreated(id)
  }
  return (
    <Modal onClose={onClose} label="Новая история">
      <div className="stack">
        <h2>Новая история</h2>
        <label>
          <span className="field-label">Название</span>
          <input className="input" autoFocus value={title} placeholder="Как она называется?" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
        </label>
        <label>
          <span className="field-label">Жанр</span>
          <input className="input" value={genre} placeholder="Например, «Фэнтези»" onChange={(e) => setGenre(e.target.value)} />
        </label>
        <div>
          <span className="field-label">Цвет обложки</span>
          <div className="covers">
            {COVERS.map((c) => (
              <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} aria-label="Цвет" onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <label>
          <span className="field-label">Дедлайн (необязательно)</span>
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => void create()}>
            Создать
          </button>
          <label className="btn">
            {busy ? 'Раскладываю…' : 'Из файла .docx / .txt'}
            <input type="file" hidden accept=".docx,.txt,.md,.html,.htm" onChange={(e) => e.target.files?.[0] && void create(e.target.files[0])} />
          </label>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  )
}
