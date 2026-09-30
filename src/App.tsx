import { useCallback, useEffect, useState } from 'react'
import { getSyncStatus, onSyncStatus, startCloudSync, type SyncStatus } from './db/cloud'
import { markerStatus, useProjectData, useProjects, type ProjectData } from './lib/hooks'
import { recountWords, tidyImportedScenes } from './db/repo'
import { go, useRoute, type Route } from './lib/router'
import { getCurrentProjectId, hotkey, returnFocus, setCurrentProjectId } from './lib/session'
import { Toaster } from './lib/ui'
import { Icon } from './components/Icon'
import { QuickCapture } from './components/QuickCapture'
import { FocusDone } from './components/Focus'
import { SearchModal } from './components/SearchModal'
import { BoardView } from './views/BoardView'
import { CharactersView } from './views/CharactersView'
import { InboxView } from './views/InboxView'
import { SettingsView } from './views/SettingsView'
import { WriteView } from './views/WriteView'
import { Welcome } from './views/Welcome'
import { LibraryView } from './views/LibraryView'
import { BookView } from './views/BookView'
import { HelpView } from './views/HelpView'
import { LoreView } from './views/LoreView'
import { deadlineText } from './lib/stories'
import { chapterProgress } from './lib/pace'
import { backupDue, downloadBackup, snoozeBackup } from './lib/backup'

const TABS: { view: Route['view']; label: string; ico: string }[] = [
  { view: 'text', label: 'Текст', ico: 'pen' },
  { view: 'board', label: 'Доска', ico: 'plan' },
  { view: 'characters', label: 'Герои', ico: 'people' },
]

export function App() {
  const route = useRoute()
  const projects = useProjects()
  const [projectId, setProjectId] = useState(getCurrentProjectId)
  const [capture, setCapture] = useState(false)
  const [searching, setSearching] = useState(false)
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus)
  const reveal = useReveal(route.view === 'text')
  // A brand-new, still empty story keeps its header in view until the first key: the author sees once where things are.
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    const on = (e: Event) => setFresh((e as CustomEvent<boolean>).detail)
    window.addEventListener('manuscript:fresh', on)
    return () => window.removeEventListener('manuscript:fresh', on)
  }, [])

  // Tell the boot watchdog in index.html that storage answered and the app is alive.
  useEffect(() => {
    if (projects !== undefined) document.getElementById('root')?.setAttribute('data-ready', '1')
  }, [projects])

  useEffect(() => {
    startCloudSync()
    return onSyncStatus(setSync)
  }, [])

  // Fall back to the most recently touched project if the remembered one is gone.
  useEffect(() => {
    if (!projects) return
    if (!projects.find((p) => p.id === projectId) && projects[0]) {
      setProjectId(projects[0].id)
      setCurrentProjectId(projects[0].id)
    }
  }, [projects, projectId])

  const data = useProjectData(projectId)
  useEffect(() => {
    if (projectId) void tidyImportedScenes(projectId).then(() => recountWords(projectId))
  }, [projectId])

  // A story opens where it was left: the text, or the board for someone who plans first.
  const selectProject = useCallback((id: string, view?: 'text' | 'board') => {
    setProjectId(id)
    setCurrentProjectId(id)
    go({ view: view ?? lastView(id) })
  }, [])
  useEffect(() => {
    if (projectId && (route.view === 'text' || route.view === 'board')) rememberView(projectId, route.view)
  }, [projectId, route.view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setCapture(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (projects === undefined || (projects.length > 0 && data === undefined)) {
    return <div className="empty" style={{ paddingTop: '30vh' }}>Открываю…</div>
  }
  if (!projects.length || !data) return <Welcome onCreated={selectProject} sync={sync} />

  const closeCapture = () => {
    setCapture(false)
    returnFocus()
  }

  // "Текст" opens where the author stopped; with no scenes yet, the board is the place to start.
  const textScene =
    route.view === 'text'
      ? (route.sceneId && data.sceneById.has(route.sceneId) ? route.sceneId : undefined) ??
        (data.project.lastSceneId && data.sceneById.has(data.project.lastSceneId) ? data.project.lastSceneId : undefined) ??
        data.scenes[0]?.id
      : undefined

  if (route.view === 'library' || route.view === 'settings' || route.view === 'help') {
    return (
      <div className="lib-shell">
        <aside className="lib-side">
          <div className="brand">
            <div className="logo">Manuscript.</div>
            <div className="tagline">тихое место для историй</div>
          </div>
          <div className="side-label">Menu</div>
          <nav className="lib-nav">
            {(
              [
                ['library', 'Истории', 'book'],
                ['settings', 'Настройки', 'settings'],
                ['help', 'Справка', 'help'],
              ] as [Route['view'], string, string][]
            ).map(([v, label, ico]) => (
              <button key={v} aria-current={route.view === v ? 'page' : undefined} onClick={() => go({ view: v } as Route)}>
                <Icon name={ico} />
                {label}
              </button>
            ))}
          </nav>
          <button className="lib-back" onClick={() => go({ view: lastView(data.project.id) })}>
            ← К истории
          </button>
        </aside>
        <main className="lib-main">
          {route.view === 'library' && <LibraryView projects={projects} currentId={data.project.id} onOpen={selectProject} />}
          {route.view === 'settings' && <SettingsView sync={sync} />}
          {route.view === 'help' && <HelpView />}
        </main>
        <Toaster />
      </div>
    )
  }

  return (
    <div className={`app app-${route.view} ${reveal || (fresh && route.view === 'text') ? 'reveal' : ''}`}>
      <AppHeader data={data} route={route} sync={sync} onSearch={() => setSearching(true)} />
      {sync.state !== 'ok' && <BackupReminder />}
      {route.view === 'text' && textScene && (
        <WriteView key={textScene} data={data} sceneId={textScene} onCapture={() => setCapture(true)} onSearch={() => setSearching(true)} />
      )}
      {route.view === 'text' && !textScene && (
        <main className="page">
          <div className="empty card">
            <h2>Пока нет ни одной сцены</h2>
            <p>Набросай главы и сцены на доске — одной строкой, без текста. Потом открывай любую и пиши.</p>
            <button className="btn primary" onClick={() => go({ view: 'board' })}>
              Открыть доску
            </button>
          </div>
        </main>
      )}
      {route.view !== 'text' && (
        <main className={`page ${route.view === 'board' ? 'wide' : ''}`}>
          {route.view === 'board' && <BoardView data={data} />}
          {route.view === 'characters' && <CharactersView data={data} />}
          {route.view === 'lore' && <LoreView data={data} />}
          {route.view === 'inbox' && <InboxView data={data} />}
          {route.view === 'book' && <BookView data={data} />}
        </main>
      )}
      {route.view !== 'text' && (
        <button className="fab" title="Быстрая запись: мысль, цитата, маячок (Ctrl/⌘ + J)" aria-label="Быстрая запись" onClick={() => setCapture(true)}>
          <Icon name="bolt" size={22} />
        </button>
      )}
      <FocusDone data={data} />
      {capture && <QuickCapture data={data} onClose={closeCapture} />}
      {searching && <SearchModal data={data} onClose={() => setSearching(false)} />}
      <Toaster />
    </div>
  )
}

function AppHeader({ data, route, sync, onSearch }: { data: ProjectData; route: Route; sync: SyncStatus; onSearch: () => void }) {
  const inbox = data.notes.filter((n) => !n.archived && !n.sceneId && !n.used && !(n.characterIds ?? []).length).length
  const syncTitle =
    sync.state === 'ok'
      ? 'Синхронизировано'
      : sync.state === 'syncing'
        ? 'Синхронизация…'
        : sync.state === 'offline'
          ? 'Нет интернета — всё сохраняется на устройстве'
          : sync.state === 'error'
            ? `Ошибка синхронизации: ${sync.message}`
            : 'Сохраняется на этом устройстве'
  return (
    <header className="app-header">
      <div className="crumb">
        <button className="logo" title="Все истории" onClick={() => go({ view: 'library' })}>
          Manuscript.
        </button>
        <span className="slash">/</span>
        <button className="project-name" title="Все истории" onClick={() => go({ view: 'library' })}>
          {data.project.title} <span className="caret">▾</span>
        </button>
        <span className="sync-dot" data-state={sync.state} title={syncTitle} />
        {/* While writing, no counters or dates in sight: they live on the board and the book page. */}
        {route.view !== 'text' && <MarkerStatus data={data} />}
        {route.view !== 'text' && <Landmark data={data} />}
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.view}
            aria-current={route.view === t.view || (t.view === 'characters' && route.view === 'lore') ? 'page' : undefined}
            onClick={() => go({ view: t.view } as Route)}
          >
            <span className="tab-ico">
              <Icon name={t.ico} />
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
        <button className="tab-aux hide-on-phone" title={`Поиск по книге${hotkey(' (⌘/Ctrl + Shift + F)')}`} onClick={onSearch}>
          <span className="tab-ico">
            <Icon name="search" />
          </span>
          <span className="tab-label">Поиск</span>
        </button>
        <button className="tab-aux" aria-current={route.view === 'inbox' ? 'page' : undefined} title="Входящие: быстрые мысли" onClick={() => go({ view: 'inbox' })}>
          <span className="tab-ico">
            <Icon name="inbox" />
          </span>
          <span className="tab-label">Входящие</span>
          {inbox > 0 && <span className="badge">{inbox}</span>}
        </button>
        <button className="tab-aux" aria-current={route.view === 'book' ? 'page' : undefined} title="О книге: обложка, дедлайн, экспорт" onClick={() => go({ view: 'book' })}>
          <span className="tab-ico">
            <Icon name="book" />
          </span>
          <span className="tab-label">Книга</span>
        </button>
      </nav>
    </header>
  )
}

/** Always visible: are all markers accounted for? One tap shows the ones waiting. */
function MarkerStatus({ data }: { data: ProjectData }) {
  if (!data.markers.length) return null
  const waiting = data.markers.filter((m) => ['hanging', 'late'].includes(markerStatus(m, data))).length
  return (
    <button
      className={`marker-status ${waiting ? 'due' : ''}`}
      title={waiting ? 'Маячки без места раскрытия или пропущенные' : 'У каждого маячка есть место раскрытия'}
      onClick={() => {
        sessionStorage.setItem('manuscript.lens', 'markers')
        go({ view: 'board' })
      }}
    >
      ✦ {waiting ? `маячки: ${waiting} без раскрытия` : 'маячки на месте'}
    </button>
  )
}

/** Once a week, a quiet nudge to keep a copy of everything somewhere else. */
function BackupReminder() {
  const [days, setDays] = useState(() => backupDue())
  if (days === null) return null
  return (
    <div className="backup-note">
      <span>
        Копию всех историй не сохраняли {days} дн. Пусть будет файл на всякий случай — в «Файлах», на Яндекс Диске или в почте.
      </span>
      <button
        className="btn sm primary"
        onClick={async () => {
          await downloadBackup()
          setDays(null)
        }}
      >
        Скачать копию
      </button>
      <button
        className="btn sm ghost"
        onClick={() => {
          snoozeBackup()
          setDays(null)
        }}
      >
        Позже
      </button>
    </div>
  )
}

/** The quiet landmark in the header: the deadline, and how many chapters are left. */
function Landmark({ data }: { data: ProjectData }) {
  const due = deadlineText(data.project.deadline)
  const cp = chapterProgress(data.project, data.chapters, data.scenes)
  const chapters = (data.project.targetChapters || due) && cp.left > 0 ? `ещё ${cp.left} гл.` : ''
  if (!due && !chapters) return null
  return (
    <button
      className={`deadline hide-sm ${due?.late ? 'late' : ''}`}
      title={`Написано ${cp.written} из ${cp.total} глав${cp.daysPerChapter ? ` · к дедлайну ≈ глава в ${cp.daysPerChapter} дн.` : ''}`}
      onClick={() => go({ view: 'book' })}
    >
      {due ? `⏳ ${due.text}` : ''}
      {due && chapters ? ' · ' : ''}
      {chapters}
    </button>
  )
}

const VIEW_KEY = 'manuscript.view.'
function lastView(projectId: string): 'text' | 'board' {
  try {
    return localStorage.getItem(VIEW_KEY + projectId) === 'board' ? 'board' : 'text'
  } catch {
    return 'text'
  }
}
function rememberView(projectId: string, view: 'text' | 'board') {
  try {
    localStorage.setItem(VIEW_KEY + projectId, view)
  } catch {
    /* ignore */
  }
}

/**
 * «Тихий вид» (as in Calmly Writer): while writing, the header and toolbar stay hidden and come back when
 * the mouse goes to the top of the screen, or on Esc. Only with a mouse; phones keep their bars.
 */
function useReveal(active: boolean) {
  const [reveal, setReveal] = useState(false)
  useEffect(() => {
    if (!active || !matchMedia('(pointer: fine)').matches) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onMove = (e: MouseEvent) => {
      const near = e.clientY < 100 || !!(e.target as HTMLElement | null)?.closest?.('.app-header, .write-top, .write-side')
      clearTimeout(timer)
      if (near) setReveal(true)
      else timer = setTimeout(() => setReveal(false), 700)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal, .sheet, .typo-pop')) setReveal((r) => !r)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [active])
  return active && reveal
}
