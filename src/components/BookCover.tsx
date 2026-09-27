import type { Project } from '../db/db'
import { stageLabel } from '../lib/stories'
import { formatWords } from '../lib/text'

/** A book on the shelf: spine, stage tag, title, genre. */
export function BookCover({ project, words, onClick }: { project: Project; words?: number; onClick?: () => void }) {
  const color = project.color ?? '#0b0b0c'
  return (
    <button className="book" style={{ '--cover': color } as React.CSSProperties} onClick={onClick} tabIndex={onClick ? 0 : -1}>
      <span className="book-spine" />
      <span className="book-face">
        <span className="book-stage">{stageLabel(project.stage)}</span>
        <span className="book-name">{project.title}</span>
        {project.genre && <span className="book-genre-tag">{project.genre}</span>}
        {words !== undefined && <span className="book-words">{formatWords(words)}</span>}
      </span>
    </button>
  )
}
