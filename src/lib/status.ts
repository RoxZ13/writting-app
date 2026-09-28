import type { NoteKind, SceneStatus } from '../db/db'
import type { MarkerState } from '../db/repo'

export const STATUSES: { id: SceneStatus; label: string; color: string }[] = [
  { id: 'idea', label: 'Идея', color: 'var(--st-idea)' },
  { id: 'draft', label: 'Черновик', color: 'var(--st-draft)' },
  { id: 'written', label: 'Написана', color: 'var(--st-written)' },
  { id: 'logic', label: 'Нужна логика', color: 'var(--st-logic)' },
  { id: 'style', label: 'Нужна правка', color: 'var(--st-style)' },
  { id: 'done', label: 'Готова', color: 'var(--st-done)' },
]
export const statusOf = (id: SceneStatus) => STATUSES.find((s) => s.id === id) ?? STATUSES[0]

export const MARKER_STATES: Record<MarkerState | 'late', { label: string; color: string; hint: string }> = {
  hanging: { label: 'Без раскрытия', color: 'var(--mk-hanging)', hint: 'Заложен, но не решено, где раскроется' },
  waiting: { label: 'Ждёт раскрытия', color: 'var(--mk-waiting)', hint: 'Место раскрытия запланировано' },
  late: { label: 'Пропущен?', color: 'var(--mk-late)', hint: 'Раскрытие было запланировано раньше, чем ты сейчас пишешь, но не отмечено' },
  closed: { label: 'Раскрыт', color: 'var(--mk-closed)', hint: 'Маячок сработал' },
}

export const NOTE_KINDS: { id: NoteKind; label: string; icon: string }[] = [
  { id: 'idea', label: 'Мысль', icon: '◦' },
  { id: 'quote', label: 'Цитата', icon: '❝' },
  { id: 'dialogue', label: 'Диалог', icon: '—' },
  { id: 'question', label: 'Вопрос', icon: '?' },
  { id: 'note', label: 'Заметка', icon: '≡' },
]
export const noteKind = (id: NoteKind) => NOTE_KINDS.find((k) => k.id === id) ?? NOTE_KINDS[0]

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.round(h / 24)
  if (d === 1) return 'вчера'
  if (d < 7) return `${d} дн назад`
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
