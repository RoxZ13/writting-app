import { useCallback, useEffect, useState } from 'react'
import { getSyncStatus, onSyncStatus, startCloudSync, type SyncStatus } from './db/cloud'
import { useProjectData, useProjects, type ProjectData } from './lib/hooks'
import { go, useRoute, type Route } from './lib/router'
import { getCurrentProjectId, returnFocus, setCurrentProjectId } from './lib/session'
import { Toaster } from './lib/ui'
import { Icon } from './components/Icon'
import { QuickCapture } from './components/QuickCapture'
import { BoardView } from './views/BoardView'
import { CharactersView } from './views/CharactersView'
import { InboxView } from './views/InboxView'
import { SettingsView } from './views/SettingsView'
import { WriteView } from './views/WriteView'
import { Welcome } from './views/Welcome'

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
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus)

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

  const selectProject = useCallback((id: string) => {
    setProjectId(id)
    setCurrentProjectId(id)
    go({ view: 'text' })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setCapture(true)
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

  return (
    <div className={`app app-${route.view}`}>
      <AppHeader data={data} route={route} sync={sync} />
      {route.view === 'text' && textScene && (
        <WriteView key={textScene} data={data} sceneId={textScene} onCapture={() => setCapture(true)} />
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
          {route.view === 'inbox' && <InboxView data={data} />}
          {route.view === 'settings' && <SettingsView data={data} projects={projects} onSelectProject={selectProject} sync={sync} />}
        </main>
      )}
      {route.view !== 'text' && (
        <button className="fab" title="Быстро записать мысль, цитату, маячок (Ctrl/⌘ + J)" onClick={() => setCapture(true)}>
          <Icon name="bolt" size={22} />
        </button>
      )}
      {capture && <QuickCapture data={data} onClose={closeCapture} />}
      <Toaster />
    </div>
  )
}

function AppHeader({ data, route, sync }: { data: ProjectData; route: Route; sync: SyncStatus }) {
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
        <span className="logo">Manuscript.</span>
        <span className="slash">/</span>
        <span className="project-name">{data.project.title}</span>
        <span className="sync-dot" data-state={sync.state} title={syncTitle} />
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.view} aria-current={route.view === t.view ? 'page' : undefined} onClick={() => go({ view: t.view } as Route)}>
            <span className="tab-ico">
              <Icon name={t.ico} />
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
        <button className="tab-aux" aria-current={route.view === 'inbox' ? 'page' : undefined} title="Входящие: быстрые мысли" onClick={() => go({ view: 'inbox' })}>
          <span className="tab-ico">
            <Icon name="inbox" />
          </span>
          <span className="tab-label">Входящие</span>
          {inbox > 0 && <span className="badge">{inbox}</span>}
        </button>
        <button className="tab-aux" aria-current={route.view === 'settings' ? 'page' : undefined} title="Настройки" onClick={() => go({ view: 'settings' })}>
          <span className="tab-ico">
            <Icon name="settings" />
          </span>
          <span className="tab-label">Ещё</span>
        </button>
      </nav>
    </header>
  )
}
