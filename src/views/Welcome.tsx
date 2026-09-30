import { useState } from 'react'
import { createStory } from '../lib/stories'
import { go } from '../lib/router'
import type { SyncStatus } from '../db/cloud'
import { SyncSection } from './SettingsView'
import { readBackupFile, restoreBackup } from '../lib/backup'
import { toast } from '../lib/ui'

export function Welcome({ onCreated, sync }: { onCreated: (id: string, view: 'text' | 'board') => void; sync: SyncStatus }) {
  const [cloud, setCloud] = useState(false)
  const [busy, setBusy] = useState(false)

  // No name asked: the page opens at once, the name can come later (or from the first phrase).
  const create = async (file?: File) => {
    setBusy(true)
    const id = await createStory({ file })
    setBusy(false)
    onCreated(id, file ? 'board' : 'text')
  }

  return (
    <div className="welcome">
      <div className="card welcome-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="logo">Manuscript.</div>
          <div className="tagline">тихое место для историй</div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Пиши с первой фразы или начни с плана — сцены, главы и всё, что нельзя забыть, будут рядом.
        </p>
        <div className="stack">
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={() => void create()}>
              Начать историю
            </button>
            <label className="btn">
              Импортировать .docx / .txt
              <input type="file" hidden accept=".docx,.txt,.md,.html,.htm" onChange={(e) => e.target.files?.[0] && void create(e.target.files[0])} />
            </label>
          </div>
          {busy && <div className="small muted">Раскладываю текст по главам…</div>}
          <div className="welcome-more">
            <label className="link-plain">
              Вернуть из копии
              <input
                type="file"
                hidden
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const { added } = await restoreBackup(await readBackupFile(file))
                    toast(added ? 'Всё на месте — истории вернулись из копии' : 'В этой копии нет историй')
                    go({ view: 'library' })
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Не получилось прочитать файл')
                  }
                }}
              />
            </label>
            <button className="link-plain" onClick={() => setCloud(!cloud)}>
              Уже пишу на другом устройстве
            </button>
          </div>
          {cloud && <SyncSection sync={sync} />}
        </div>
      </div>
    </div>
  )
}
