import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Snapshot } from '../db/db'
import { reviewSyncVersion } from '../lib/conflicts'
import { docParagraphs } from '../lib/text'
import { toast } from '../lib/ui'

export function SyncTextReview({ versions }: { versions: Snapshot[] }) {
  return (
    <div className="stack">
      <h4>Текст глав и сцен</h4>
      <div className="conflict-list">
        {versions.map((version) => <SyncTextReviewItem key={version.id} version={version} />)}
      </div>
    </div>
  )
}

function SyncTextReviewItem({ version }: { version: Snapshot }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const names = useLiveQuery(async () => {
    const [project, scene] = await Promise.all([db.projects.get(version.projectId), db.scenes.get(version.sceneId)])
    const chapter = scene ? await db.chapters.get(scene.chapterId) : undefined
    return { label: [project?.title, chapter?.title, scene?.title].filter(Boolean).join(' · '), canOpen: Boolean(project && !project.deleted && scene && !scene.deleted) }
  }, [version.projectId, version.sceneId])
  const current = useLiveQuery(() => open ? db.texts.get(version.sceneId) : undefined, [open, version.sceneId])
  const decide = async (restore: boolean) => {
    if (busy || (restore && (!current || current.deleted))) return
    setBusy(true)
    try {
      await reviewSyncVersion(version.id, restore ? { currentContent: current?.content } : undefined)
      toast(restore ? 'Версия восстановлена. Прежний текст сохранён в истории сцены.' : 'Текущий текст оставлен. Вторая версия сохранена в истории сцены.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось разобрать версии.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="conflict-item" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <div><strong>{names?.label || 'Версия текста'}</strong><div className="small muted">{open ? 'Свернуть текст' : 'Посмотреть текст'}</div></div>
        <span className="small muted">{new Date(version.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </summary>
      {open && (
        <div className="conflict-fields">
          <div><strong>Текущий текст</strong><pre className="sync-version-text">{current && !current.deleted ? docParagraphs(current.content).join('\n\n') || 'Пустой текст' : 'Текст недоступен'}</pre></div>
          <div><strong>Сохранённая версия</strong><pre className="sync-version-text">{docParagraphs(version.content).join('\n\n') || 'Пустой текст'}</pre></div>
          <div className="row conflict-actions">
            <button type="button" className="btn sm primary" disabled={busy || !current || current.deleted} onClick={() => void decide(true)}>Вернуть сохранённый текст</button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void decide(false)}>Оставить текущий</button>
            {names?.canOpen && <button type="button" className="btn sm ghost" onClick={() => {
              window.dispatchEvent(new CustomEvent('manuscript:open', { detail: { id: version.projectId, sceneId: version.sceneId } }))
            }}>Открыть сцену</button>}
          </div>
        </div>
      )}
    </details>
  )
}
