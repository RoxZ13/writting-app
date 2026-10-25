import { useState } from 'react'
import { db, type Project } from '../db/db'
import { patch, remove } from '../db/repo'
import { ImportPanel } from '../components/ImportPanel'
import { LeftToWrite } from '../components/LeftToWrite'
import { newEdition } from '../lib/edition'
import { BookCover, CoverPicker } from '../components/BookCover'
import { Essence } from '../components/Plot'
import { DateChip } from '../components/DateChip'
import { useCover } from '../lib/cover'
import { LengthNorm, NumberField, PaceSection, PublishSection } from '../components/BookSections'
import { chapterProgress } from '../lib/pace'
import { chapterToFicbook, chapterToRich, download, exportDocx, type ExportChapter } from '../lib/exporter'
import { platformOf } from '../lib/platforms'
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
  const cp = chapterProgress(p, data.chapters, data.scenes)
  const early = words < 1000 && !data.chapters.some((c) => c.publishedAt)
  const [left, setLeft] = useState(false)

  const exportWord = async () => download(await exportDocx(p.title, await loadChapters(data)), `${p.title}.docx`)
  const platform = platformOf(p)
  const copyChapter = async (chapterId: string) => {
    const [ch] = await loadChapters(data, chapterId)
    if (!ch) return
    const where = platform.id === 'other' ? 'в редактор сайта' : `в редактор ${platform.for.replace(/^для /, '')}`
    try {
      if (platform.copy === 'tags') {
        await navigator.clipboard.writeText(chapterToFicbook(ch))
      } else {
        const { html, text } = chapterToRich(ch)
        // Formatting travels as HTML; editors that only take plain text get the text.
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }),
          ])
        } else await navigator.clipboard.writeText(text)
      }
      toast(`«${ch.chapter.title}» скопирована — вставь её ${where}`)
    } catch {
      const text = platform.copy === 'tags' ? chapterToFicbook(ch) : chapterToRich(ch).text
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${ch.chapter.title}.txt`)
    }
  }

  return (
    <div className="book-page">
      <div className="book-hero">
        <BookCover project={p} words={words} />
        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">Об истории</span>
          <InlineEdit className="book-title" value={p.title} onSave={(title) => title.trim() && set({ title })} />
          <InlineEdit className="book-genre" value={p.genre ?? ''} placeholder="Жанр — например, фэнтези, гет, макси" onSave={(genre) => set({ genre })} />
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
            <div>
              <span className="field-label">Главы</span>
              {!early && (
                <div className="chapters-landmark">
                  <strong>
                    {cp.written} из {cp.of}
                  </strong>{' '}
                  написано{cp.unknown ? '' : cp.left > 0 ? ` · осталось ${cp.left}` : p.targetChapters ? ' · все' : ''}
                  {cp.daysPerChapter && <span className="muted"> · к дедлайну ≈ глава в {cp.daysPerChapter} дн.</span>}
                </div>
              )}
              {/* «Не знаю» is an answer too: the total shows as «?» and nothing counts down. */}
              <div className="row small muted" style={{ gap: 8, marginTop: 6 }}>
                {p.targetChapters === 0 ? (
                  <>
                    всего будет <strong className="chapters-unknown">?</strong>
                    <button className="link" onClick={() => set({ targetChapters: undefined })}>
                      указать число
                    </button>
                  </>
                ) : (
                  <>
                    <label className="row" style={{ gap: 8 }}>
                      всего будет
                      <NumberField key={p.targetChapters ?? 'none'} value={p.targetChapters} placeholder="сколько?" onSave={(targetChapters) => set({ targetChapters })} />
                    </label>
                    <button className="link" onClick={() => set({ targetChapters: 0 })}>
                      не знаю
                    </button>
                  </>
                )}
              </div>
              <LengthNorm project={p} />
              {!early && (
                <button className="link small ltw-open" onClick={() => setLeft(true)}>
                  Что осталось дописать
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Essence project={p} embedded />
      {left && <LeftToWrite data={data} onClose={() => setLeft(false)} />}

      {/* Publishing and pace mean something from the first thousand words; on an empty book they only reproach. */}
      {!early && <PublishSection data={data} onCopy={(id) => void copyChapter(id)} />}

      {!early && <PaceSection data={data} />}

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
            Вся история в Word (.docx)
          </button>
          <div>
            <span className="field-label">Добавить текст</span>
            <div className="small muted">Главы из файла встанут в конец истории.</div>
            <ImportPanel projectId={p.id} onDone={() => go({ view: 'board' })} />
          </div>
          <div>
            <span className="field-label">Переписать книгу заново</span>
            <div className="small muted">
              Новая история с тем же скелетом: главы, сцены с целями и пунктами, ветки, герои, матчасть, маячки — но пустые страницы. В каждой
              сцене сбоку будет её прежний текст. Эта редакция останется как есть.
            </div>
            <button
              className="btn"
              style={{ marginTop: 8 }}
              onClick={async () => {
                if (!confirm(`Начать новую редакцию «${p.title}»? Эта останется как есть.`)) return
                const { projectId, firstSceneId } = await newEdition(p.id)
                try {
                  localStorage.setItem('manuscript.mode', 'rewrite')
                } catch {
                  /* ignore */
                }
                window.dispatchEvent(new CustomEvent('manuscript:open', { detail: { id: projectId, sceneId: firstSceneId } }))
                toast('Новая редакция готова. Прежний текст сцены — сбоку, в колонке «Было»')
              }}
            >
              Новая редакция
            </button>
          </div>
          <button
            className="btn ghost"
            style={{ color: 'var(--mk-hanging)', alignSelf: 'flex-start' }}
            onClick={async () => {
              if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
              await remove('projects', p.id)
              toast('История удалена', () => patch('projects', p.id, { deleted: false }))
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

