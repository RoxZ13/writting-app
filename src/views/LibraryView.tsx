import { useLiveQuery } from 'dexie-react-hooks'
import { chapterProgress } from '../lib/pace'
import { useState } from 'react'
import { db, type Project } from '../db/db'
import { alive, patch, remove } from '../db/repo'
import { COVERS, createStory, deadlineText } from '../lib/stories'
import { timeAgo } from '../lib/status'
import { formatWords } from '../lib/text'
import { FilePick, toast } from '../lib/ui'
import { BookCover, CoverPicker } from '../components/BookCover'
import { useCover } from '../lib/cover'
import { DateChip } from '../components/DateChip'
import { Icon } from '../components/Icon'
import { StartStoryChoice } from '../components/StartStoryChoice'
import { NewStoryImport } from '../components/NewStoryImport'
import type { ImportedBook } from '../lib/importer'

/** All stories side by side — authors rarely write just one. */
export function LibraryView({
  projects,
  currentId,
  onOpen,
}: {
  projects: Project[]
  currentId: string
  onOpen: (id: string, view?: 'text' | 'board' | 'book') => void
}) {
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const create = async (view: 'text' | 'board', file?: File, book?: ImportedBook) => {
    setBusy(true)
    try {
      const id = await createStory({ file, book })
      onOpen(id, file ? 'text' : view)
    } catch (error) {
      toast(`Не удалось создать историю: ${error instanceof Error ? error.message : error}`)
    } finally {
      setBusy(false)
    }
  }
  const stats = useLiveQuery(async () => {
    const scenes = alive(await db.scenes.toArray())
    const chapters = alive(await db.chapters.toArray())
    const by: Record<string, { words: number; scenes: number; chapters: number; written: number; total: number; of: string }> = {}
    for (const p of projects) {
      const own = chapters.filter((c) => c.projectId === p.id)
      const ownScenes = scenes.filter((s) => s.projectId === p.id)
      const cp = chapterProgress(p, own, ownScenes)
      by[p.id] = { words: 0, scenes: 0, chapters: own.filter((c) => !c.pool).length, written: cp.written, total: cp.total, of: cp.of }
    }
    for (const s of scenes) if (by[s.projectId]) (by[s.projectId].words += s.wordCount), by[s.projectId].scenes++
    return by
  }, [projects.map((p) => p.id).join()])
  const groups = [...projects.reduce((all, project) => {
    const key = project.workId ?? project.id
    const group = all.get(key) ?? []
    group.push(project)
    all.set(key, group)
    return all
  }, new Map<string, Project[]>()).entries()]

  return (
    <div className="lib-page">
      <div className="lib-head library-head">
        <h1>Истории</h1>
        <div className="library-actions">
          <button className="btn primary" disabled={busy} onClick={() => setChoosing(true)}>
            + Новая история
          </button>
          <FilePick className="btn" accept=".docx,.txt,.md,.html,.htm" disabled={busy} onFile={setImportFile}>
            {busy ? 'Раскладываю…' : 'Импорт .docx / .txt'}
          </FilePick>
        </div>
      </div>

      <div className="library">
        {groups.map(([workId, editions]) => editions.length === 1 ? (
          <StoryCard key={editions[0].id} p={editions[0]} current={editions[0].id === currentId} stats={stats?.[editions[0].id]} onOpen={(view) => onOpen(editions[0].id, view)} />
        ) : (
          <section className="story-group" key={workId}>
            <div className="story-group-head">
              <strong>{editions[0].title.replace(/ — редакция \d+$/, '')}</strong>
              <span className="small muted">{editions.length} редакции</span>
            </div>
            <div className="story-group-grid">
              {[...editions].sort((a, b) => (b.editionNumber ?? 1) - (a.editionNumber ?? 1)).map((p) => (
                <StoryCard key={p.id} p={p} current={p.id === currentId} stats={stats?.[p.id]} onOpen={(view) => onOpen(p.id, view)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {choosing && (
        <StartStoryChoice
          busy={busy}
          onClose={() => setChoosing(false)}
          onChoose={(view) => void create(view)}
        />
      )}
      {importFile && (
        <NewStoryImport
          file={importFile}
          busy={busy}
          onClose={() => setImportFile(null)}
          onConfirm={(book) => void create('text', importFile, book).finally(() => setImportFile(null))}
        />
      )}

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
  stats?: { words: number; scenes: number; chapters: number; written: number; total: number; of: string }
  onOpen: (view?: 'text' | 'board' | 'book') => void
}) {
  const dl = deadlineText(p.deadline)
  const color = p.color ?? '#0b0b0c'
  const cover = useCover(p.id)
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <article className={`story ${current ? 'current' : ''}`}>
      <BookCover project={p} onClick={() => onOpen()} />
      <div className="story-body">
        <div className="story-heading">
          <button className="story-title" onClick={() => onOpen()}>
            <span>{p.title}</span>
          </button>
          <button
            type="button"
            className="btn sm ghost story-settings"
            aria-label={`Настроить «${p.title}»`}
            aria-expanded={settingsOpen}
            title="Настроить историю"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Icon name="settings" size={18} />
          </button>
          {settingsOpen && (
            <div className="menu-list card story-menu">
              <button onClick={() => onOpen('book')}>Параметры книги</button>
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
                  toast('История удалена', () => patch('projects', p.id, { deleted: false }))
                }}
              >
                Удалить историю
              </button>
            </div>
          )}
        </div>
        {p.genre && <div className="story-meta">{p.genre}</div>}
        <div className="story-meta">
          {stats ? `${stats.written} из ${stats.of} гл. · ${formatWords(stats.words)}` : '…'}
          {' · '}
          {timeAgo(p.updatedAt)}
        </div>
        {dl && <div className={`deadline ${dl.late ? 'late' : ''}`}><Icon name="clock" size={13} /> {dl.text}</div>}
        <button className="btn sm story-continue" onClick={() => onOpen('text')}>
          Продолжить
        </button>
      </div>
    </article>
  )
}
