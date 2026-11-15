import { useEffect, useState } from 'react'
import { parseBook, readFileAsBlocks, type ImportedBook } from '../lib/importer'
import { formatWords } from '../lib/text'
import { Modal } from '../lib/ui'

/** The same promise everywhere: inspect the structure before a file becomes a story. */
export function NewStoryImport({ file, busy, onConfirm, onClose }: { file: File; busy: boolean; onConfirm: (book: ImportedBook) => void; onClose: () => void }) {
  const [book, setBook] = useState<ImportedBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void readFileAsBlocks(file)
      .then(parseBook)
      .then((parsed) => {
        if (!parsed.chapters.some((chapter) => chapter.scenes.length)) throw new Error('в файле нет текста')
        if (alive) setBook(parsed)
      })
      .catch((cause) => alive && setError(cause instanceof Error ? cause.message : String(cause)))
    return () => { alive = false }
  }, [file])
  const scenes = book?.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0) ?? 0
  const words = book?.chapters.reduce((sum, chapter) => sum + chapter.scenes.reduce((n, scene) => n + scene.wordCount, 0), 0) ?? 0
  return (
    <Modal label="Импорт истории" onClose={onClose} className="new-story-import">
      <div className="stack">
        <h2>Импортировать историю?</h2>
        <div className="small muted">{file.name}</div>
        {!book && !error && <div>Читаю файл…</div>}
        {error && <div style={{ color: 'var(--danger-ink)' }}>Не удалось разобрать файл: {error}</div>}
        {book && (
          <>
            <strong>{book.chapters.length} глав · {scenes} сцен · {formatWords(words)}</strong>
            <div className="import-preview-list">
              {book.chapters.map((chapter, index) => (
                <div key={`${chapter.title}:${index}`}><span>{chapter.title}</span><span className="muted small">{chapter.scenes.length} сц.</span></div>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button className="btn primary" disabled={!book || busy} onClick={() => book && onConfirm(book)}>{busy ? 'Импортирую…' : 'Импортировать'}</button>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Отмена</button>
        </div>
      </div>
    </Modal>
  )
}
