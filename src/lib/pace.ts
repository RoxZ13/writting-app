import { db, type Project } from '../db/db'
import { patch } from '../db/repo'

const DAY = 86400000

/** Local calendar date, YYYY-MM-DD. */
export function dayKey(t = Date.now()): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Words are counted as they are saved and written to the project a couple of seconds later, in one go.
const pending = new Map<string, number>()
let timer: ReturnType<typeof setTimeout> | undefined

export function recordWords(projectId: string, added: number) {
  if (!(added > 0)) return
  pending.set(projectId, (pending.get(projectId) ?? 0) + added)
  clearTimeout(timer)
  timer = setTimeout(() => void flushWords(), 2000)
}

export async function flushWords() {
  clearTimeout(timer)
  const today = dayKey()
  for (const [projectId, n] of [...pending]) {
    pending.delete(projectId)
    const p = await db.projects.get(projectId)
    if (!p) continue
    const progress = { ...(p.progress ?? {}) }
    progress[today] = (progress[today] ?? 0) + n
    // Keep a year of history; the record stays small.
    const cutoff = dayKey(Date.now() - 366 * DAY)
    for (const k of Object.keys(progress)) if (k < cutoff) delete progress[k]
    await patch<Project>('projects', projectId, { progress })
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushWords())
  window.addEventListener('pagehide', () => void flushWords())
}

export function wordsOn(project: Project, key: string): number {
  return (project.progress?.[key] ?? 0) + (key === dayKey() ? pendingFor(project.id) : 0)
}
function pendingFor(projectId: string) {
  return pending.get(projectId) ?? 0
}

export interface Pace {
  today: number
  /** Words a day over the last two weeks (or since the first written day, if sooner). */
  perDay: number
  last14: { key: string; words: number }[]
  remaining?: number
  /** When the book is done at this pace. */
  finish?: Date
  /** Words a day needed to make the deadline. */
  needPerDay?: number
  daysToDeadline?: number
}

export function pace(project: Project, totalWords: number, now = Date.now()): Pace {
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const key = dayKey(now - (13 - i) * DAY)
    return { key, words: project.progress?.[key] ?? 0 }
  })
  if (last14.length) last14[13].words += pendingFor(project.id)
  const firstWritten = last14.findIndex((d) => d.words > 0)
  const span = firstWritten < 0 ? 14 : 14 - firstWritten
  const sum = last14.reduce((n, d) => n + d.words, 0)
  const perDay = Math.round(sum / span)
  const out: Pace = { today: last14[13].words, perDay, last14 }
  if (project.targetWords && project.targetWords > totalWords) {
    out.remaining = project.targetWords - totalWords
    if (perDay > 0) out.finish = new Date(now + Math.ceil(out.remaining / perDay) * DAY)
    if (project.deadline) {
      const end = new Date(project.deadline + 'T23:59:59').getTime()
      const days = Math.max(1, Math.ceil((end - now) / DAY))
      out.daysToDeadline = days
      out.needPerDay = Math.ceil(out.remaining / days)
    }
  } else if (project.targetWords) {
    out.remaining = 0
  }
  return out
}

export const totalWords = (scenes: { wordCount: number }[]) => scenes.reduce((n, s) => n + (s.wordCount || 0), 0)
