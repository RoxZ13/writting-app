import { db, type Project } from '../db/db'
import { patch, remove } from '../db/repo'
import { ImportPanel } from '../components/ImportPanel'
import { BookCover } from '../components/BookCover'
import { DateChip } from '../components/DateChip'
import { coverFromClipboard, coverFromUrl, imageToCover, setCover, useCover } from '../lib/cover'
import { PaceSection, PublishSection } from '../components/BookSections'
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
  const words = data.scenes.reduce((n, s) => n + s.wordCount, 0)
  const cover = useCover(p.id)

  const exportWord = async () => download(await exportDocx(p.title, await loadChapters(data)), `${p.title}.docx`)
  const copyFicbook = async (chapterId: string) => {
    const [ch] = await loadChapters(data, chapterId)
    if (!ch) return
    const text = chapterToFicbook(ch)
    try {
      await navigator.clipboard.writeText(text)
      toast(`«${ch.chapter.title}» скопирована — вставь её в редактор Фикбука`)
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
              <CoverPicker projectId={p.id} />
              {!cover && (
                <div className="covers" style={{ marginTop: 8 }}>
                  {COVERS.map((c) => (
                    <button key={c} className={`swatch ${c === (p.color ?? COVERS[0]) ? 'on' : ''}`} style={{ background: c }} aria-label="Цвет обложки" onClick={() => set({ color: c })} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="field-label">Дедлайн</span>
              <DateChip value={p.deadline} empty="+ поставить дату" onChange={(deadline) => set({ deadline })} />
            </div>
          </div>
        </div>
      </div>

      <PublishSection data={data} onCopy={(id) => void copyFicbook(id)} />

      <PaceSection data={data} />

      <details className="card settings-section book-fold">
        <summary>
          <span>Описание</span>
          <span className="muted small book-fold-peek">{(p.description ?? '').split('\n').find((l) => l.trim()) ?? 'фандом, пэйринг, аннотация'}</span>
        </summary>
        <InlineEdit className="input book-desc" multiline placeholder="Фандом, пэйринг, аннотация — что угодно" value={p.description ?? ''} onSave={(description) => set({ description })} />
      </details>

      <details className="card settings-section book-fold">
        <summary>
          <span>Файлы и прочее</span>
          <span className="muted small">Word, добавить текст, удалить</span>
        </summary>
        <div className="stack" style={{ marginTop: 14 }}>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void exportWord()}>
            Вся книга в Word (.docx)
          </button>
          <div>
            <span className="field-label">Добавить текст</span>
            <div className="small muted">Главы из файла встанут в конец книги.</div>
            <ImportPanel projectId={p.id} onDone={() => go({ view: 'board' })} />
          </div>
          <button
            className="btn ghost"
            style={{ color: 'var(--mk-hanging)', alignSelf: 'flex-start' }}
            onClick={async () => {
              if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
              await remove('projects', p.id)
              go({ view: 'library' })
            }}
          >
            Удалить эту историю
          </button>
        </div>
      </details>
    </div>
  )
}

/** The author's own cover: from a file, a copied picture, or a link — the usual story with a Ficbook cover. */
function CoverPicker({ projectId }: { projectId: string }) {
  const cover = useCover(projectId)
  const run = async (fn: () => Promise<string>, done = 'Обложка на месте') => {
    try {
      await setCover(projectId, await fn())
      toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    }
  }
  return (
    <div className="cover-actions">
      <label className="btn sm">
        {cover ? 'Другая картинка' : 'Загрузить картинку'}
        <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void run(() => imageToCover(e.target.files![0]))} />
      </label>
      <button className="btn sm" onClick={() => void run(coverFromClipboard)} title="Скопируй обложку (на телефоне — долгое нажатие → «Скопировать») и нажми сюда">
        Вставить скопированную
      </button>
      <button
        className="btn sm"
        onClick={() => {
          const url = prompt('Ссылка на картинку обложки (на Фикбуке: правый клик по обложке → «Копировать адрес изображения»)')
          if (!url) return
          void (async () => {
            try {
              const { src, offline } = await coverFromUrl(url)
              await setCover(projectId, src)
              toast(offline ? 'Обложка на месте' : 'Обложка на месте. Сайт не дал её сохранить — без интернета она не покажется, лучше загрузить файлом')
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Не получилось')
            }
          })()
        }}
      >
        По ссылке
      </button>
      {cover && (
        <button className="btn sm ghost" onClick={() => void setCover(projectId, undefined)}>
          Убрать
        </button>
      )}
    </div>
  )
}
