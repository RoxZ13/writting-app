import { useLiveQuery } from 'dexie-react-hooks'
import { chapterProgress } from '../lib/pace'
import { useState } from 'react'
import { db, type Project } from '../db/db'
import { alive, patch, remove } from '../db/repo'
import { COVERS, createStory, deadlineText } from '../lib/stories'
import { timeAgo } from '../lib/status'
import { formatWords } from '../lib/text'
import { toast } from '../lib/ui'
import { BookCover, CoverPicker } from '../components/BookCover'
import { useCover } from '../lib/cover'
import { DateChip } from '../components/DateChip'

/** All stories side by side — authors rarely write just one. */
export function LibraryView({
  projects,
  currentId,
  onOpen,
}: {
  projects: Project[]
  currentId: string
  onOpen: (id: string, view?: 'text' | 'board') => void
}) {
  const [busy, setBusy] = useState(false)
  // A new story opens at once on its page; name, cover and deadline can come later (on «Книга»).
  const create = async (file?: File) => {
    setBusy(true)
    try {
      const id = await createStory({ file })
      onOpen(id, file ? 'board' : 'text')
    } finally {
      setBusy(false)
    }
  }
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
        <label className="btn ghost">
          {busy ? 'Раскладываю…' : 'Импорт .docx / .txt'}
          <input type="file" hidden accept=".docx,.txt,.md,.html,.htm" onChange={(e) => e.target.files?.[0] && void create(e.target.files[0])} />
        </label>
        <button className="btn primary big-pill" disabled={busy} onClick={() => void create()}>
          + Новая история
        </button>
      </div>

      <div className="library">
        {projects.map((p) => (
          <StoryCard key={p.id} p={p} current={p.id === currentId} stats={stats?.[p.id]} onOpen={() => onOpen(p.id)} />
        ))}
        <button className="story add" disabled={busy} onClick={() => void create()}>
          <span className="plus">+</span>
          Новая история
        </button>
      </div>

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
              <div className="menu-field">
                <span>Дедлайн</span>
                <DateChip value={p.deadline} empty="+ поставить дату" onChange={(deadline) => void patch<Project>('projects', p.id, { deadline })} />
              </div>
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
