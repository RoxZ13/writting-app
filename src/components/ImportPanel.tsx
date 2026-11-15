import { useState } from 'react'
import type { Table } from 'dexie'
import type { Base } from '../db/db'
import { db, type Chapter, type Note, type OutboxEntry, type Project, type Scene, type SceneText } from '../db/db'
import { alive, createChapter, createNote, createScene, patch, save } from '../db/repo'
import {
  parseBook,
  htmlToBlocks,
  readFileAsBlocks,
  textToBlocks,
  type Block,
  type ImportedBook,
} from '../lib/importer'
import { formatWords } from '../lib/text'
import { FilePick, toast } from '../lib/ui'

export interface ImportResult {
  firstSceneId?: string
  lastSceneId?: string
  chapterIds: string[]
  sceneIds: string[]
}

interface ImportState {
  project?: Project
  chapters: Chapter[]
  scenes: Scene[]
  texts: SceneText[]
  notes: Note[]
  outbox: OutboxEntry[]
}

async function captureImportState(projectId: string): Promise<ImportState> {
  const [project, chapters, scenes, texts, notes, outbox] = await Promise.all([
    db.projects.get(projectId),
    db.chapters.where('projectId').equals(projectId).toArray(),
    db.scenes.where('projectId').equals(projectId).toArray(),
    db.texts.where('projectId').equals(projectId).toArray(),
    db.notes.where('projectId').equals(projectId).toArray(),
    db.outbox.toArray(),
  ])
  return { project, chapters, scenes, texts, notes, outbox }
}

/** Restore the exact pre-import rows if reading or storage fails halfway through. */
async function restoreImportState(projectId: string, before: ImportState): Promise<void> {
  const current = await captureImportState(projectId)
  const groups = [
    ['chapters', db.chapters, before.chapters, current.chapters],
    ['scenes', db.scenes, before.scenes, current.scenes],
    ['texts', db.texts, before.texts, current.texts],
    ['notes', db.notes, before.notes, current.notes],
  ] as const
  const touchedOutbox = new Set<string>([`projects:${projectId}`])
  for (const [name, table, oldRows, currentRows] of groups) {
    const ids = new Set([...oldRows, ...currentRows].map((row) => row.id))
    ids.forEach((id) => touchedOutbox.add(`${name}:${id}`))
    const target = table as Table<Base, string>
    if (currentRows.length) await target.bulkDelete(currentRows.map((row) => row.id))
    if (oldRows.length) await target.bulkPut(oldRows as Base[])
  }
  if (before.project) await db.projects.put(before.project)
  else await db.projects.delete(projectId)
  await db.outbox.bulkDelete([...touchedOutbox])
  const oldJobs = before.outbox.filter((entry) => touchedOutbox.has(entry.key))
  if (oldJobs.length) await db.outbox.bulkPut(oldJobs)
}

async function rollbackImport<T>(projectId: string, action: () => Promise<T>): Promise<T> {
  const before = await captureImportState(projectId)
  try {
    return await action()
  } catch (error) {
    await restoreImportState(projectId, before).catch(() => {})
    throw error
  }
}

async function writeImportedChapters(projectId: string, chapters: ImportedBook['chapters']): Promise<ImportResult> {
  const existing = alive(await db.chapters.where('projectId').equals(projectId).toArray())
  let order = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0
  let firstScene: string | undefined
  let lastImportedScene: string | undefined
  const chapterIds: string[] = []
  const sceneIds: string[] = []
  for (const ch of chapters) {
    const chapter = await createChapter(projectId, ch.title, order++)
    chapterIds.push(chapter.id)
    let lastScene: string | undefined
    for (const sc of ch.scenes) {
      const scene = await createScene(projectId, chapter.id, sc.title, { status: 'written', excerpt: sc.excerpt, epigraph: sc.epigraph }, sc.doc, sc.wordCount)
      firstScene ??= scene.id
      lastScene = scene.id
      lastImportedScene = scene.id
      sceneIds.push(scene.id)
    }
    // The author's note to readers is not prose: it hangs on the part's last scene as a note.
    if (ch.comment) await createNote(`Комментарий к части «${ch.title}»:\n${ch.comment}`, 'note', projectId, lastScene)
  }
  // Written chapters came in: the board asks once whether to fix them in place.
  if (chapters.length > 1) await patch<Project>('projects', projectId, { lockAsked: false })
  return { firstSceneId: firstScene, lastSceneId: lastImportedScene, chapterIds, sceneIds }
}

export async function importBook(projectId: string, book: ImportedBook): Promise<ImportResult> {
  return rollbackImport(projectId, async () => {
    const project = await db.projects.get(projectId)
    if (project && book.preface) {
      if (!project.description) await save<Project>('projects', { ...project, description: book.preface })
      // The project already has its own description: do not drop the file's header, keep it as a note.
      else await createNote(`Шапка из файла:\n${book.preface}`, 'note', projectId)
    }
    const result = await writeImportedChapters(projectId, book.chapters)
    // Continue an imported manuscript where its text actually ends, not at its first scene.
    if (project && result.lastSceneId) await patch<Project>('projects', projectId, { lastSceneId: result.lastSceneId })
    return result
  })
}

export async function importChapters(projectId: string, chapters: ImportedBook['chapters']): Promise<ImportResult> {
  return rollbackImport(projectId, () => writeImportedChapters(projectId, chapters))
}

/** Import from .docx / .txt / pasted text, with a preview before anything is written. */
export function ImportPanel({ projectId, onDone }: { projectId: string; onDone?: (firstSceneId?: string) => void }) {
  const [book, setBook] = useState<ImportedBook | null>(null)
  const preview = book?.chapters ?? null
  const [pasted, setPasted] = useState('')
  const [pastedHtml, setPastedHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const show = (blocks: Block[]) => {
    const parsed = parseBook(blocks)
    const chapters = parsed.chapters
    if (!chapters.length || !chapters.some((c) => c.scenes.length)) {
      setError('В файле нет текста. Попробуй другой файл или вставь текст вручную.')
      return
    }
    setError(null)
    setBook(parsed)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      show(await readFileAsBlocks(file))
    } catch (e) {
      setError(`Не удалось прочитать файл: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!book) return
    setBusy(true)
    try {
      const result = await importBook(projectId, book)
      toast('Текст импортирован')
      setBook(null)
      setPasted('')
      setPastedHtml(null)
      onDone?.(result.lastSceneId)
    } catch (cause) {
      setError(`Импорт не завершён, история не изменилась: ${cause instanceof Error ? cause.message : cause}`)
    } finally {
      setBusy(false)
    }
  }

  if (preview) {
    const scenes = preview.reduce((n, c) => n + c.scenes.length, 0)
    const words = preview.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.wordCount, 0), 0)
    return (
      <div className="stack">
        <div>
          <strong>
            В файле: {preview.length} {plural(preview.length, 'глава', 'главы', 'глав')}, {scenes}{' '}
            {plural(scenes, 'сцена', 'сцены', 'сцен')}, {formatWords(words)}.
          </strong>
          <div className="small muted">
            Главы — по заголовкам «Глава…», «Пролог», «Chapter…». Сцены — по разделителям «* * *». Всё это потом
            можно переименовать и перетащить.
          </div>
        </div>
        <div className="card" style={{ maxHeight: 260, overflowY: 'auto', padding: 12, boxShadow: 'none' }}>
          {preview.map((c, i) => (
            <div key={i} className="small" style={{ padding: '3px 0' }}>
              <strong>{c.title}</strong> <span className="muted">— {c.scenes.length} сц.</span>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Импортирую…' : 'Импортировать'}
          </button>
          <button className="btn ghost" onClick={() => setBook(null)}>
            Назад
          </button>
        </div>
        {error && <div className="small" style={{ color: 'var(--danger-ink)' }}>{error}</div>}
      </div>
    )
  }

  return (
    <div className="stack">
      <FilePick className="btn" style={{ alignSelf: 'flex-start' }} accept=".docx,.txt,.md,.html,.htm" onFile={(f) => void onFile(f)}>
        {busy ? 'Читаю…' : 'Выбрать файл (.docx, .txt)'}
      </FilePick>
      <div className="small muted">
        Google Docs: Файл → Скачать → Microsoft Word (.docx). Фикбук: скопируй текст главы и вставь ниже — курсив
        сохранится.
      </div>
      <textarea
        className="textarea"
        rows={4}
        placeholder="…или вставь текст сюда"
        value={pasted}
        onPaste={(e) => {
          const html = e.clipboardData.getData('text/html')
          if (html) setPastedHtml(html)
        }}
        onChange={(e) => {
          setPasted(e.target.value)
          if (!e.target.value) setPastedHtml(null)
        }}
      />
      {pasted.trim() && (
        <button
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => show(pastedHtml ? htmlToBlocks(pastedHtml) : textToBlocks(pasted))}
        >
          Разобрать вставленный текст
        </button>
      )}
      {error && <div className="small" style={{ color: 'var(--accent)' }}>{error}</div>}
    </div>
  )
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
