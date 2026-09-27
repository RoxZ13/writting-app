import { useState } from 'react'
import { db, type Project } from '../db/db'
import { patch, remove } from '../db/repo'
import { ImportPanel } from '../components/ImportPanel'
import { BookCover } from '../components/BookCover'
import { chapterToFicbook, download, exportDocx, type ExportChapter } from '../lib/exporter'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { COVERS, STAGES } from '../lib/stories'
import { InlineEdit, toast } from '../lib/ui'

async function loadChapters(data: ProjectData, only?: string): Promise<ExportChapter[]> {
  const out: ExportChapter[] = []
  for (const { chapter, scenes } of data.outline) {
    if (only && chapter.id !== only) continue
    const texts = await db.texts.bulkGet(scenes.map((s) => s.id))
    out.push({ chapter, scenes: scenes.map((s, i) => ({ ...s, content: texts[i]?.content })) })
  }
  return out
}

/** Everything about this one book: how it looks on the shelf, its deadline, getting text in and out. */
export function BookView({ data }: { data: ProjectData }) {
  const p = data.project
  const set = (changes: Partial<Project>) => void patch<Project>('projects', p.id, changes)
  const [ficChapter, setFicChapter] = useState(data.chapters[0]?.id ?? '')
  const words = data.scenes.reduce((n, s) => n + s.wordCount, 0)

  const exportWord = async () => download(await exportDocx(p.title, await loadChapters(data)), `${p.title}.docx`)
  const copyFicbook = async () => {
    const [ch] = await loadChapters(data, ficChapter)
    if (!ch) return
    const text = chapterToFicbook(ch)
    try {
      await navigator.clipboard.writeText(text)
      toast('Глава скопирована — вставь её в редактор Фикбука')
    } catch {
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${ch.chapter.title}.txt`)
    }
  }

  return (
    <div className="book-page">
      <div className="book-hero">
        <BookCover project={p} words={words} />
        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">О книге</span>
          <InlineEdit className="book-title" value={p.title} onSave={(title) => title.trim() && set({ title })} />
          <InlineEdit className="book-genre" value={p.genre ?? ''} placeholder="Жанр — например, «Фэнтези, гет, макси»" onSave={(genre) => set({ genre })} />
          <div>
            <span className="field-label">Стадия</span>
            <div className="seg">
              {STAGES.map((s) => (
                <button key={s.id} aria-pressed={(p.stage ?? 'writing') === s.id} onClick={() => set({ stage: s.id })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
            <div>
              <span className="field-label">Обложка</span>
              <div className="covers">
                {COVERS.map((c) => (
                  <button key={c} className={`swatch ${c === (p.color ?? COVERS[0]) ? 'on' : ''}`} style={{ background: c }} aria-label="Цвет обложки" onClick={() => set({ color: c })} />
                ))}
              </div>
            </div>
            <label>
              <span className="field-label">Дедлайн</span>
              <input className="input" type="date" defaultValue={p.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} />
            </label>
          </div>
        </div>
      </div>

      <section className="card settings-section stack">
        <h3>Описание</h3>
        <InlineEdit className="input" multiline placeholder="Фандом, пэйринг, аннотация — что угодно" value={p.description ?? ''} onSave={(description) => set({ description })} />
      </section>

      <section className="card settings-section stack">
        <h3>Выложить и сохранить</h3>
        <span className="field-label">Глава для Фикбука — с курсивом и разделителями сцен</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select className="select" value={ficChapter} onChange={(e) => setFicChapter(e.target.value)}>
            {data.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => void copyFicbook()}>
            Скопировать
          </button>
        </div>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void exportWord()}>
          Вся книга в Word (.docx)
        </button>
      </section>

      <section className="card settings-section stack">
        <h3>Добавить текст</h3>
        <div className="small muted">Главы из файла встанут в конец книги.</div>
        <ImportPanel projectId={p.id} onDone={() => go({ view: 'board' })} />
      </section>

      <button
        className="btn ghost"
        style={{ color: 'var(--mk-hanging)' }}
        onClick={async () => {
          if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
          await remove('projects', p.id)
          go({ view: 'library' })
        }}
      >
        Удалить эту историю
      </button>
    </div>
  )
}
