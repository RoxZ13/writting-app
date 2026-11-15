import { useState, type SyntheticEvent } from 'react'
import { db, type Project } from '../db/db'
import { patch, remove } from '../db/repo'
import { ImportPanel } from '../components/ImportPanel'
import { LeftToWrite } from '../components/LeftToWrite'
import { newEdition } from '../lib/edition'
import { BookCover, CoverPicker } from '../components/BookCover'
import { Essence } from '../components/Plot'
import { DateChip } from '../components/DateChip'
import { useCover } from '../lib/cover'
import { LengthNorm, NumberField, PaceSection, PublishingSetup, PublishSection } from '../components/BookSections'
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
  const planPeek = [p.deadline ? `до ${p.deadline}` : '', p.targetChapters ? `${p.targetChapters} глав` : '', p.targetChars ? `${p.targetChars.toLocaleString('ru-RU')} знаков` : ''].filter(Boolean).join(' · ')
  const descriptionPeek = (p.description ?? '').split('\n').find((line) => line.trim())?.trim()
  const [left, setLeft] = useState(false)
  const [paceSetup, setPaceSetup] = useState(false)
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches
  const [openSection, setOpenSection] = useState<'plan' | 'description' | 'publishing' | 'identity' | 'files' | null>(null)
  const fold = (id: NonNullable<typeof openSection>) => phone ? {
    open: openSection === id,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      const isOpen = event.currentTarget.open
      setOpenSection((current) => isOpen ? id : current === id ? null : current)
    },
  } : {}

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
      <h1 className="sr-only">Параметры книги «{p.title}»</h1>
      <div className="book-hero">
        <BookCover project={p} words={words} />
        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow">Параметры книги</span>
          <InlineEdit className="book-title" label="Название истории" value={p.title} onSave={(title) => title.trim() && set({ title })} />
          <InlineEdit className="book-genre" value={p.genre ?? ''} placeholder="Жанр — например, фэнтези, гет, макси" onSave={(genre) => set({ genre })} />
          {!early && <div className="book-hero-progress">{cp.written} из {cp.of} глав написано{cp.left > 0 ? ` · осталось ${cp.left}` : ''}</div>}
        </div>
      </div>

      <Essence project={p} embedded autoOpen={words === 0} />
      {left && <LeftToWrite data={data} onClose={() => setLeft(false)} />}

      {phone && openSection && <button className="book-section-backdrop" aria-label="Закрыть настройки книги" onClick={() => setOpenSection(null)} />}
      <section className="book-section-list card" aria-label="Настройки книги">
        <details className="settings-section book-fold book-mobile-section" {...fold('plan')}>
          <summary>
            <span>План</span>
            {planPeek && <span className="muted small book-fold-peek">{planPeek}</span>}
          </summary>
          <div className="book-mobile-fields">
            <label>
              <span className="field-label">Дедлайн</span>
              <DateChip value={p.deadline} empty="Поставить дату" onChange={(deadline) => set({ deadline })} />
            </label>
            <label>
              <span className="field-label">Количество глав</span>
              <NumberField value={p.targetChapters || undefined} placeholder="Не задано" onSave={(targetChapters) => set({ targetChapters })} />
            </label>
            <label>
              <span className="field-label">Плановый объём книги, знаков</span>
              <NumberField value={p.targetChars} placeholder="например, 400 000" onSave={(targetChars) => set({ targetChars })} />
            </label>
            <LengthNorm project={p} />
            {!p.dailyGoal && !p.targetWords && (paceSetup ? (
              <div className="book-pace-setup">
                <label>
                  <span className="field-label">Цель на день, слов</span>
                  <NumberField value={p.dailyGoal} placeholder="например, 500" onSave={(dailyGoal) => set({ dailyGoal })} />
                </label>
                <label>
                  <span className="field-label">Объём истории, слов</span>
                  <NumberField value={p.targetWords} placeholder="например, 80 000" onSave={(targetWords) => set({ targetWords })} />
                </label>
                <button className="link small muted" onClick={() => setPaceSetup(false)}>скрыть</button>
              </div>
            ) : (
              <button className="link small" onClick={() => setPaceSetup(true)}>+ темп и цель</button>
            ))}
            {!early && <button className="link small" onClick={() => setLeft(true)}>Что осталось дописать</button>}
          </div>
        </details>

        <details className="settings-section book-fold" {...fold('description')}>
          <summary>
            <span>Описание</span>
            {descriptionPeek && <span className="muted small book-fold-peek">{descriptionPeek}</span>}
          </summary>
          <InlineEdit className="input book-desc" multiline placeholder="Фандом, пэйринг, аннотация — что угодно" value={p.description ?? ''} onSave={(description) => set({ description })} />
        </details>

        <details className="settings-section book-fold" {...fold('publishing')}>
          <summary>
            <span>Публикация</span>
            <span className="muted small book-fold-peek">{platform.selected ? platform.name : 'не настроена'}</span>
          </summary>
          <div className="book-mobile-fields">
            <PublishingSetup project={p} />
          </div>
        </details>

        <details className="settings-section book-fold book-mobile-section" {...fold('identity')}>
          <summary><span>О книге</span></summary>
          <div className="book-mobile-fields">
            <div className="book-mobile-identity-fields">
              <label>
                <span className="field-label">Название</span>
                <InlineEdit className="input" label="Название истории" value={p.title} onSave={(title) => title.trim() && set({ title })} />
              </label>
              <label>
                <span className="field-label">Жанр</span>
                <InlineEdit className="input" value={p.genre ?? ''} placeholder="Например, фэнтези" onSave={(genre) => set({ genre })} />
              </label>
            </div>
            <label>
              <span className="field-label">Стадия</span>
              <select className="input" value={p.stage ?? 'writing'} onChange={(event) => set({ stage: event.target.value as Project['stage'] })}>
                {STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
              </select>
            </label>
            <BookCover project={p} words={words} />
            <CoverPicker projectId={p.id} />
            {!cover && <div className="covers">{COVERS.map((color) => (
              <button key={color} className={`swatch ${color === (p.color ?? COVERS[0]) ? 'on' : ''}`} style={{ background: color }} aria-label="Цвет обложки" onClick={() => set({ color })} />
            ))}</div>}
          </div>
        </details>

        <details className="settings-section book-fold" {...fold('files')}>
          <summary><span>Файлы и версии</span></summary>
          <div className="stack book-file-actions">
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void exportWord()}>
              Скачать Word-копию (.docx)
            </button>
            <div>
              <span className="field-label">Добавить текст</span>
              <ImportPanel projectId={p.id} onDone={(sceneId) => go(sceneId ? { view: 'text', sceneId } : { view: 'board' })} />
            </div>
            <div>
              <span className="field-label">Новая редакция</span>
              <div className="small muted">Пустой текст с прежним планом; эта редакция сохранится.</div>
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
            <details className="danger-zone">
              <summary className="small muted">Удаление</summary>
              <button
                className="btn ghost"
                style={{ color: 'var(--danger-ink)', alignSelf: 'flex-start', marginTop: 10 }}
                onClick={async () => {
                  if (!confirm(`Удалить историю «${p.title}» со всеми главами и заметками?`)) return
                  await remove('projects', p.id)
                  toast('История удалена', () => patch('projects', p.id, { deleted: false }))
                  go({ view: 'library' })
                }}
              >
                Удалить эту историю
              </button>
            </details>
          </div>
        </details>
      </section>

      {/* Platform-specific tools appear only after the author has chosen a destination. */}
      {platform.selected && <PublishSection data={data} onCopy={(id) => void copyChapter(id)} />}

      {(p.dailyGoal || p.targetWords) && <PaceSection data={data} />}
    </div>
  )
}

