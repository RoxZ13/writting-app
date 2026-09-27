import { useCallback, useEffect, useState } from 'react'
import { getSyncStatus, onSyncStatus, startCloudSync, type SyncStatus } from './db/cloud'
import { markerStatus, useProjectData, useProjects, type ProjectData } from './lib/hooks'
import { go, useRoute, type Route } from './lib/router'
import { getCurrentProjectId, returnFocus, setCurrentProjectId } from './lib/session'
import { Toaster } from './lib/ui'
import { Icon } from './components/Icon'
import { QuickCapture } from './components/QuickCapture'
import { HomeView } from './views/HomeView'
import { PlanView } from './views/PlanView'
import { MarkersView } from './views/MarkersView'
import { InboxView } from './views/InboxView'
import { SettingsView } from './views/SettingsView'
import { WriteView } from './views/WriteView'
import { Welcome } from './views/Welcome'

const NAV: { view: Exclude<Route['view'], 'write'>; label: string; ico: string }[] = [
  { view: 'home', label: 'Сейчас', ico: 'now' },
  { view: 'plan', label: 'План', ico: 'plan' },
  { view: 'markers', label: 'Маячки', ico: 'markers' },
  { view: 'inbox', label: 'Входящие', ico: 'inbox' },
  { view: 'settings', label: 'Настройки', ico: 'settings' },
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
    go({ view: 'home' })
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

  return (
    <>
      {route.view === 'write' ? (
        <WriteView key={route.sceneId} data={data} sceneId={route.sceneId} onCapture={() => setCapture(true)} />
      ) : (
        <div className="shell">
          <TopBar data={data} route={route} sync={sync} />
          <main className="page">
            {route.view === 'home' && <HomeView data={data} />}
            {route.view === 'plan' && <PlanView data={data} />}
            {route.view === 'markers' && <MarkersView data={data} />}
            {route.view === 'inbox' && <InboxView data={data} />}
            {route.view === 'settings' && (
              <SettingsView data={data} projects={projects} onSelectProject={selectProject} sync={sync} />
            )}
          </main>
          <button className="fab" title="Быстро записать мысль (Ctrl/⌘ + J)" onClick={() => setCapture(true)}>
            <Icon name="pen" size={22} />
          </button>
        </div>
      )}
      {capture && <QuickCapture data={data} onClose={closeCapture} />}
      <Toaster />
    </>
  )
}

function TopBar({ data, route, sync }: { data: ProjectData; route: Route; sync: SyncStatus }) {
  const inbox = data.notes.filter((n) => !n.archived && !n.sceneId).length
  const alarming = data.markers.filter((m) => {
    const s = markerStatus(m, data)
    return s === 'hanging' || s === 'late'
  }).length
  const syncTitle =
    sync.state === 'ok'
      ? 'Синхронизировано'
      : sync.state === 'syncing'
        ? 'Синхронизация…'
        : sync.state === 'offline'
          ? 'Нет интернета — всё сохраняется на устройстве'
          : sync.state === 'error'
            ? `Ошибка синхронизации: ${sync.message}`
            : 'Сохраняется только на этом устройстве'
  return (
    <header className="sidebar">
      <div className="brand">
        <div className="logo">Manuscript.</div>
        <div className="tagline">The writer’s studio</div>
      </div>
      <div className="side-project" title={syncTitle}>
        <span className="sync-dot" data-state={sync.state} />
        <span className="project-name">{data.project.title}</span>
      </div>
      <div className="side-label">Menu</div>
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.view} aria-current={route.view === n.view ? 'page' : undefined} onClick={() => go({ view: n.view })}>
            <span className="ico">
              <Icon name={n.ico} />
            </span>
            <span className="nav-label">{n.label}</span>
            {n.view === 'inbox' && inbox > 0 && <span className="badge">{inbox}</span>}
            {n.view === 'markers' && alarming > 0 && <span className="badge">{alarming}</span>}
          </button>
        ))}
      </nav>
    </header>
  )
}
