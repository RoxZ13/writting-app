import { useState } from 'react'
import { createStory } from '../lib/stories'
import { go } from '../lib/router'
import { getCloudConfig, type SyncStatus } from '../db/cloud'
import { SyncSection } from './SettingsView'
import { CloudDisks } from '../components/CloudDisks'
import { readBackupFile, restoreBackup } from '../lib/backup'
import { FilePick, toast } from '../lib/ui'
import { remoteSyncAllowed } from '../lib/environment'
import { getYandexToken } from '../lib/yandex'
import { StartStoryChoice } from '../components/StartStoryChoice'
import { NewStoryImport } from '../components/NewStoryImport'
import type { ImportedBook } from '../lib/importer'

export function Welcome({ onCreated, sync }: { onCreated: (id: string, view: 'text' | 'board') => void; sync: SyncStatus }) {
  const [cloud, setCloud] = useState(false)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)

  // No name asked: the page opens at once, the name can come later (or from the first phrase).
  const create = async (view: 'text' | 'board', file?: File, book?: ImportedBook) => {
    setBusy(true)
    try {
      const id = await createStory({ file, book })
      onCreated(id, file ? 'text' : view)
    } catch (error) {
      toast(`Не удалось создать историю: ${error instanceof Error ? error.message : error}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="welcome">
      <div className="card welcome-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <h1 className="logo">Manuscript.</h1>
          <div className="tagline">тихое место для историй</div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Пиши с первой фразы или начни с плана — сцены, главы и всё, что нельзя забыть, будут рядом.
        </p>
        <div className="stack">
          <div className="row welcome-actions">
            <button className="btn primary" disabled={busy} onClick={() => setChoosing(true)}>
              Начать историю
            </button>
            <FilePick className="btn" accept=".docx,.txt,.md,.html,.htm" onFile={setImportFile}>
              Импортировать .docx / .txt
            </FilePick>
          </div>
          {busy && <div className="small muted">Раскладываю текст по главам…</div>}
          <div className="welcome-more">
            <FilePick
              className="link-plain"
              accept=".json,application/json"
              onFile={async (file) => {
                try {
                  const { added } = await restoreBackup(await readBackupFile(file))
                  toast(added ? 'Всё на месте — истории вернулись из копии' : 'В этой копии нет историй')
                  go({ view: 'library' })
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Не получилось прочитать файл')
                }
              }}
            >
              Вернуть из копии
            </FilePick>
            {remoteSyncAllowed() ? (
              <button className="link-plain" onClick={() => setCloud(!cloud)}>
                Уже пишу на другом устройстве
              </button>
            ) : (
              <span className="small muted">Тестовая версия — облако отключено</span>
            )}
          </div>
          {/* Another device already holds the stories: they come from the author's own Disk. */}
          {remoteSyncAllowed() && cloud && (
            <>
              <CloudDisks />
              {!getYandexToken() && getCloudConfig() && <SyncSection sync={sync} />}
            </>
          )}
        </div>
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
    </main>
  )
}
