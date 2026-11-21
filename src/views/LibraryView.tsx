import { useLiveQuery } from 'dexie-react-hooks'
import { storyPlan } from '../lib/writing-progress'
import { useState } from 'react'
import { db, type Project } from '../db/db'
import { alive, patch, remove } from '../db/repo'
import { COVERS, createStory, deadlineText } from '../lib/stories'
import { FilePick, Modal, toast } from '../lib/ui'
import { BookCover, CoverPicker } from '../components/BookCover'
import { useCover } from '../lib/cover'
import { DateChip } from '../components/DateChip'
import { Icon } from '../components/Icon'
import { StartStoryChoice } from '../components/StartStoryChoice'
import { NewStoryImport } from '../components/NewStoryImport'
import { GestureActionButton } from '../components/SceneActions'
import type { ImportedBook } from '../lib/importer'

/** All stories side by side — authors rarely write just one. */
export function LibraryView({
  projects,
  currentId,
  onOpen,
}: {
  projects: Project[]
  currentId: string
  onOpen: (id: string, view?: 'text' | 'board' | 'book', sceneId?: string) => void
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
    const [scenes, chapters] = await Promise.all([db.scenes.toArray().then(alive), db.chapters.toArray().then(alive)])
    return new Map(projects.map((project) => [project.id, storyPlan(
      project,
      chapters.filter((chapter) => chapter.projectId === project.id),
      scenes.filter((scene) => scene.projectId === project.id),
    )]))
  }, [projects])
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
          <StoryCard key={editions[0].id} p={editions[0]} current={editions[0].id === currentId} plan={stats?.get(editions[0].id)} onOpen={(view, sceneId) => onOpen(editions[0].id, view, sceneId)} />
        ) : (
          <section className="story-group" key={workId}>
            <div className="story-group-head">
              <strong>{editions[0].title.replace(/ — редакция \d+$/, '')}</strong>
              <span className="small muted">{editions.length} редакции</span>
            </div>
            <div className="story-group-grid">
              {[...editions].sort((a, b) => (b.editionNumber ?? 1) - (a.editionNumber ?? 1)).map((p) => (
                <StoryCard key={p.id} p={p} current={p.id === currentId} plan={stats?.get(p.id)} onOpen={(view, sceneId) => onOpen(p.id, view, sceneId)} />
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
  plan,
  onOpen,
}: {
  p: Project
  current: boolean
  plan?: ReturnType<typeof storyPlan>
  onOpen: (view?: 'text' | 'board' | 'book', sceneId?: string) => void
}) {
  const nextStep = p.nextStep?.trim()
  const nextChapter = plan?.next
  const chapterDeadline = !nextStep && nextChapter?.deadline ? nextChapter.deadline : undefined
  const deadline = deadlineText(chapterDeadline ?? p.deadline)
  const color = p.color ?? '#0b0b0c'
  const cover = useCover(p.id)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)
  const showStep = nextStep || (chapterDeadline && nextChapter?.title)
  return (
    <article className={`story ${current ? 'current' : ''}`}>
      <BookCover project={p} onClick={() => onOpen('text')} onActions={openSettings} />
      <div className="story-body">
        <div className="story-heading">
          <GestureActionButton className="story-title" onOpen={() => onOpen('text')} onActions={openSettings}
            ariaDescription="Зажми или нажми правой кнопкой для настроек истории" ariaExpanded={settingsOpen} swipe={false}>
            <span>{p.title}</span>
          </GestureActionButton>
          {settingsOpen && (
            <Modal className="story-menu" label={`Настройки «${p.title}»`} onClose={() => setSettingsOpen(false)}>
              <h2>Настройки истории</h2>
              <button className="btn" onClick={() => onOpen('book')}>Параметры книги</button>
              <label className="menu-field">
                <span>Название</span>
                <input
                  className="input"
                  defaultValue={p.title}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && void patch<Project>('projects', p.id, { title: e.target.value.trim() })}
                />
              </label>
              <label className="menu-field">
                <span>Следующий шаг</span>
                <input className="input" defaultValue={p.nextStep ?? ''} placeholder="Например, дописать финал"
                  onBlur={(event) => {
                    const value = event.target.value.trim()
                    if (value !== (nextStep ?? '')) void patch<Project>('projects', p.id, { nextStep: value || undefined })
                  }}
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
                className="btn ghost danger"
                onClick={async () => {
                  if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
                  await remove('projects', p.id)
                  toast('История удалена', () => patch('projects', p.id, { deleted: false }))
                }}
              >
                Удалить историю
              </button>
            </Modal>
          )}
        </div>
        {!!plan?.total && <div className="story-progress">
          Главы · готово {plan.ready} из {plan.total}
          {plan.ready < plan.total && <> · осталось {plan.total - plan.ready}</>}
        </div>}
        {(showStep || deadline) && <div className="story-plan">
          {showStep && (
            <button className="story-next" onClick={() => nextStep
              ? onOpen('text')
              : plan?.sceneId ? onOpen('text', plan.sceneId) : onOpen('board')}>
              <span><span className="story-next-label">Дальше · </span>{showStep}</span>
              <Icon name="right" size={15} />
            </button>
          )}
          {deadline && <div className="story-due">
            <Icon name="clock" size={13} /> {chapterDeadline ? 'Срок главы' : 'Финал'} · {deadline.text}
          </div>}
        </div>}
      </div>
    </article>
  )
}
