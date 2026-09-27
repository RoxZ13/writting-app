import { useState } from 'react'
import { createStory } from '../lib/stories'
import { go } from '../lib/router'
import type { SyncStatus } from '../db/cloud'
import { SyncSection } from './SettingsView'

export function Welcome({ onCreated, sync }: { onCreated: (id: string) => void; sync: SyncStatus }) {
  const [title, setTitle] = useState('')
  const [cloud, setCloud] = useState(false)
  const [busy, setBusy] = useState(false)

  const create = async (file?: File) => {
    setBusy(true)
    const id = await createStory({ title, file })
    setBusy(false)
    onCreated(id)
    go({ view: file ? 'board' : 'text' })
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
