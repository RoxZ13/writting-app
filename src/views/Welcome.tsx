import { useState } from 'react'
import { db } from '../db/db'
import { alive, createProject, remove, save } from '../db/repo'
import { importBook } from '../components/ImportPanel'
import { parseBook, readFileAsBlocks } from '../lib/importer'
import { go } from '../lib/router'
import type { SyncStatus } from '../db/cloud'
import { SyncSection } from './SettingsView'

export function Welcome({ onCreated, sync }: { onCreated: (id: string) => void; sync: SyncStatus }) {
  const [title, setTitle] = useState('')
  const [cloud, setCloud] = useState(false)
  const [busy, setBusy] = useState(false)

  const create = async (file?: File) => {
    setBusy(true)
    const book = file ? parseBook(await readFileAsBlocks(file)) : undefined
    const name = title.trim() || book?.title || file?.name.replace(/\.[^.]+$/, '') || 'Новая история'
    const project = await createProject(name)
    if (file && book) {
      // Replace the starter chapter with the imported text.
      const starter = alive(await db.chapters.where('projectId').equals(project.id).toArray())
      for (const c of starter) {
        for (const s of await db.scenes.where('chapterId').equals(c.id).toArray()) {
          await remove('scenes', s.id)
          await remove('texts', s.id)
        }
        await remove('chapters', c.id)
      }
      const first = await importBook(project.id, book)
      await save('projects', { ...(await db.projects.get(project.id))!, lastSceneId: first })
    }
    setBusy(false)
    onCreated(project.id)
    go({ view: file ? 'plan' : 'home' })
  }

  return (
    <div className="welcome">
      <div className="card" style={{ width: 'min(520px, 100%)', padding: 36 }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="logo">Manuscript.</div>
          <div className="tagline">The writer’s studio</div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Место, где всегда видно, что ты сейчас пишешь, зачем, и какие маячки ещё ждут раскрытия.
        </p>
        <div className="stack">
          <label className="field-label" htmlFor="ptitle">
            Как называется история?
          </label>
          <input
            id="ptitle"
            className="input"
            placeholder="Например, Геката Сотейра"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            autoFocus
          />
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={() => void create()}>
              Начать с чистого листа
            </button>
            <label className="btn">
              Импортировать .docx / .txt
              <input type="file" hidden accept=".docx,.txt,.md,.html,.htm" onChange={(e) => e.target.files?.[0] && void create(e.target.files[0])} />
            </label>
          </div>
          {busy && <div className="small muted">Раскладываю текст по главам…</div>}
          {cloud ? (
            <SyncSection sync={sync} />
          ) : (
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCloud(true)}>
              Уже пишу на другом устройстве — войти
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
