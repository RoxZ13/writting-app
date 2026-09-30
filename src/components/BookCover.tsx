import type { Project } from '../db/db'
import { stageLabel } from '../lib/stories'
import { formatWords } from '../lib/text'
import { coverFromClipboard, coverFromUrl, imageToCover, setCover, useCover } from '../lib/cover'
import { toast } from '../lib/ui'

/** A book on the shelf: spine, stage tag, title, genre. */
export function BookCover({ project, words, onClick }: { project: Project; words?: number; onClick?: () => void }) {
  const color = project.color ?? '#0b0b0c'
  const cover = useCover(project.id)
  return (
    <button
      className={`book ${cover ? 'has-image' : ''}`}
      style={{ '--cover': color } as React.CSSProperties}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
      aria-label={project.title}
    >
      {/* The author's own cover already carries the title; only the stage and length go on top of it. */}
      {cover && <img className="book-image" src={cover} alt="" loading="lazy" />}
      <span className="book-spine" />
      <span className="book-face">
        <span className="book-stage">{stageLabel(project.stage)}</span>
        {!cover && <span className="book-name">{project.title}</span>}
        {!cover && project.genre && <span className="book-genre-tag">{project.genre}</span>}
        {words !== undefined && <span className="book-words">{formatWords(words)}</span>}
      </span>
    </button>
  )
}

/** Ways to put a picture on a book: a file, a copied image, or a link. */
export function CoverPicker({ projectId }: { projectId: string }) {
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
