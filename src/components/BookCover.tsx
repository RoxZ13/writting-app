import type { Project } from '../db/db'
import { stageLabel } from '../lib/stories'
import { formatWords } from '../lib/text'
import { useCover } from '../lib/cover'

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
