import { useState } from 'react'
import { db } from '../db/db'
import { alive, createChapter, createScene } from '../db/repo'
import {
  blocksToChapters,
  htmlToBlocks,
  readFileAsBlocks,
  textToBlocks,
  type Block,
  type ImportedChapter,
} from '../lib/importer'
import { formatWords } from '../lib/text'
import { toast } from '../lib/ui'

export async function importChapters(projectId: string, chapters: ImportedChapter[]) {
  const existing = alive(await db.chapters.where('projectId').equals(projectId).toArray())
  let order = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0
  let firstScene: string | undefined
  for (const ch of chapters) {
    const chapter = await createChapter(projectId, ch.title, order++)
    for (const sc of ch.scenes) {
      const scene = await createScene(projectId, chapter.id, sc.title, { status: 'written' }, sc.doc, sc.wordCount)
      firstScene ??= scene.id
    }
  }
  return firstScene
}

/** Import from .docx / .txt / pasted text, with a preview before anything is written. */
export function ImportPanel({ projectId, onDone }: { projectId: string; onDone?: (firstSceneId?: string) => void }) {
  const [preview, setPreview] = useState<ImportedChapter[] | null>(null)
  const [pasted, setPasted] = useState('')
  const [pastedHtml, setPastedHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const show = (blocks: Block[]) => {
    const chapters = blocksToChapters(blocks)
    if (!chapters.length || !chapters.some((c) => c.scenes.length)) {
      setError('Не нашла текста. Попробуй другой файл или вставь текст вручную.')
      return
    }
    setError(null)
    setPreview(chapters)
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
    if (!preview) return
    setBusy(true)
    const first = await importChapters(projectId, preview)
    setBusy(false)
    toast('Текст импортирован')
    setPreview(null)
    setPasted('')
    setPastedHtml(null)
    onDone?.(first)
  }

  if (preview) {
    const scenes = preview.reduce((n, c) => n + c.scenes.length, 0)
    const words = preview.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.wordCount, 0), 0)
    return (
      <div className="stack">
        <div>
          <strong>
            Нашла {preview.length} {plural(preview.length, 'главу', 'главы', 'глав')}, {scenes}{' '}
            {plural(scenes, 'сцену', 'сцены', 'сцен')}, {formatWords(words)}.
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
          <button className="btn ghost" onClick={() => setPreview(null)}>
            Назад
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <label className="btn" style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Читаю…' : 'Выбрать файл (.docx, .txt)'}
        <input
          type="file"
          accept=".docx,.txt,.md,.html,.htm"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
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
