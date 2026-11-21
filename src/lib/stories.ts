import { db } from '../db/db'
import { alive, createProject, discardIncompleteProject, patch, remove, save } from '../db/repo'
import type { Project } from '../db/db'
import { importBook } from '../components/ImportPanel'
import { parseBook, readFileAsBlocks, type ImportedBook } from './importer'

/** A story created without a name; the first phrase can name it later. */
export const UNTITLED = 'Без названия'

/** Create a story, optionally from a file (its header gives the title when none is typed). */
export async function createStory(opts: { title?: string; file?: File; book?: ImportedBook; color?: string; deadline?: string; genre?: string }) {
  const book = opts.book ?? (opts.file ? parseBook(await readFileAsBlocks(opts.file)) : undefined)
  const name = opts.title?.trim() || book?.title || opts.file?.name.replace(/\.[^.]+$/, '') || UNTITLED
  const project = await createProject(name)
  try {
    if (book) {
      // Replace the starter chapter with the imported text.
      for (const c of alive(await db.chapters.where('projectId').equals(project.id).toArray())) {
        for (const s of await db.scenes.where('chapterId').equals(c.id).toArray()) {
          await remove('scenes', s.id)
          await remove('texts', s.id)
        }
        await remove('chapters', c.id)
      }
      const result = await importBook(project.id, book)
      // Also clears the starter scene when a valid but empty import produced no scenes.
      await patch<Project>('projects', project.id, { lastSceneId: result.lastSceneId })
    }
    const fresh = (await db.projects.get(project.id))!
    // No colour asked for: a quiet one that the other books on the shelf do not use yet.
    const used = new Set(alive(await db.projects.toArray()).map((p) => p.color))
    const color = opts.color ?? COVERS.find((c) => !used.has(c)) ?? COVERS[Math.floor(Math.random() * COVERS.length)]
    await save('projects', { ...fresh, color, deadline: opts.deadline || undefined, genre: opts.genre?.trim() || undefined, stage: book ? 'writing' : 'idea' })
    return project.id
  } catch (error) {
    await discardIncompleteProject(project.id).catch(() => {})
    throw error
  }
}

/** "через 12 дн. · 15 окт" — calm wording, no alarms. */
export function deadlineText(date: string | undefined): { text: string; late: boolean } | null {
  if (!date) return null
  const d = new Date(date + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  const calendarDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const days = (calendarDay(d) - calendarDay(new Date())) / 86400000
  const when = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  if (days < 0) return { text: `${when} · прошло ${-days} дн.`, late: true }
  if (days === 0) return { text: `сегодня · ${when}`, late: false }
  if (days === 1) return { text: `завтра · ${when}`, late: false }
  return { text: `через ${days} дн. · ${when}`, late: false }
}

export const COVERS = ['#0b0b0c', '#3a3a3f', '#5b5b63', '#1f3a5f', '#3b82f6', '#7c5cd6', '#c2417a', '#e5484d', '#f08c1a', '#22b573', '#0ea5a4']

export const STAGES: { id: import('../db/db').StoryStage; label: string }[] = [
  { id: 'idea', label: 'Идея' },
  { id: 'writing', label: 'Черновик' },
  { id: 'editing', label: 'Редактура' },
  { id: 'publishing', label: 'Выкладка' },
  { id: 'done', label: 'Готово' },
]
export const stageLabel = (id?: string) => STAGES.find((s) => s.id === id)?.label ?? 'Черновик'
