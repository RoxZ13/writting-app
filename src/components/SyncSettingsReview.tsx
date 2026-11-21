import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Base, type SyncConflict } from '../db/db'
import { conflictChanges, dismissConflict, restoreConflict } from '../lib/conflicts'
import { formatChars } from '../lib/text'
import { toast } from '../lib/ui'

const TABLE_NAMES: Record<string, string> = {
  projects: 'Книга', chapters: 'Глава', scenes: 'Сцена', markers: 'Маячок', notes: 'Заметка', lines: 'Сюжетная линия', characters: 'Персонаж',
}

const FIELD_NAMES: Record<string, string> = {
  chapterMax: 'Общий верхний ориентир главы', chapterMin: 'Общий нижний ориентир главы',
  targetMax: 'Верхний ориентир этой главы', targetMin: 'Нижний ориентир этой главы',
  targetChars: 'Плановый объём книги', targetChapters: 'Глав в плане', showVolume: 'Показывать объём в редакторе',
  deadline: 'Дедлайн', platformMax: 'Ограничение площадки', nextStep: 'Следующий шаг',
  title: 'Название', name: 'Имя', text: 'Текст заметки', description: 'Описание', goal: 'Цель', order: 'Порядок',
  chapterId: 'Глава', status: 'Статус', beats: 'Пункты сцены', note: 'Пояснение', resolved: 'Состояние',
  archived: 'Архив', about: 'О персонаже', aliases: 'Другие имена', deleted: 'Удаление',
}

const CHAR_FIELDS = new Set(['chapterMax', 'chapterMin', 'targetMax', 'targetMin', 'targetChars'])
const fieldsOf = (row?: Base) => row as unknown as Record<string, unknown> | undefined

function nameOf(row?: Base) {
  const fields = fieldsOf(row)
  const name = fields?.title || fields?.name || fields?.text
  return typeof name === 'string' ? name.slice(0, 80) : ''
}

function valueText(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Не задано'
  if (typeof value === 'boolean') return value ? 'Включено' : 'Выключено'
  if (typeof value === 'number') return CHAR_FIELDS.has(field) ? formatChars(value) : value.toLocaleString('ru-RU')
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every((item) => ['string', 'number'].includes(typeof item))) return value.join('\n') || 'Пусто'
  return JSON.stringify(value, null, 2)
}

export function SyncSettingsReview({ conflicts }: { conflicts: SyncConflict[] }) {
  return (
    <section className="stack conflict-section">
      <h4>Настройки и другие правки</h4>
      <div className="conflict-list">
        {conflicts.map((conflict) => <SyncSetting key={conflict.id} conflict={conflict} />)}
      </div>
    </section>
  )
}

function SyncSetting({ conflict }: { conflict: SyncConflict }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = useLiveQuery(async () => {
    if (!open || !TABLE_NAMES[conflict.table]) return undefined
    return (await db.table<Base>(conflict.table).get(conflict.recordId)) ?? null
  }, [open, conflict.table, conflict.recordId])
  const changes = conflictChanges(conflict)
  const title = nameOf(current ?? undefined) || nameOf(conflict.winning) || nameOf(conflict.losing)
  const currentFields = fieldsOf(current ?? undefined)
  const alreadyApplied = !!current && changes.every(({ field, losing }) => JSON.stringify(currentFields?.[field]) === JSON.stringify(losing))
  const single = changes.length === 1 && CHAR_FIELDS.has(changes[0].field)
  const decide = async (apply: boolean) => {
    if (busy || current === undefined || (apply && !current)) return
    setBusy(true)
    try {
      if (apply && current) await restoreConflict(conflict, current)
      else await dismissConflict(conflict)
      toast(apply ? 'Сохранённые значения применены' : 'Настройки книги сохранены как сейчас')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не получилось применить правку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="conflict-item" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <div>
          <strong>{TABLE_NAMES[conflict.table] ?? 'Запись'}{title ? ` · ${title}` : ''}</strong>
          <div className="small muted">{open ? 'Свернуть правки' : 'Сравнить правки'}{single ? ` · ${FIELD_NAMES[changes[0].field]}` : ''}</div>
        </div>
        <time className="small muted" dateTime={new Date(conflict.createdAt).toISOString()}>
          {new Date(conflict.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </time>
      </summary>
      {open && (
        <div className="conflict-fields">
          {changes.map(({ field, losing }) => (
            <div className="conflict-field" key={field}>
              <strong>{FIELD_NAMES[field] ?? 'Другая настройка'}</strong>
              <div className="sync-setting-values">
                <div><span className="muted">Сейчас в книге</span><div>{current ? valueText(field, currentFields?.[field]) : current === null ? 'Запись недоступна' : 'Загружается…'}</div></div>
                <div><span className="muted">Сохранённое значение</span><div>{valueText(field, losing)}</div></div>
              </div>
            </div>
          ))}
          {alreadyApplied && <p className="small muted">Эти значения уже стоят в книге.</p>}
          <div className="row conflict-actions">
            {!alreadyApplied && <button type="button" className="btn sm primary" disabled={busy || !current} onClick={() => void decide(true)}>
              {single ? (changes[0].losing === undefined ? 'Убрать ориентир' : `Применить: ${valueText(changes[0].field, changes[0].losing)}`) : 'Применить сохранённые значения'}
            </button>}
            <button type="button" className="btn sm" disabled={busy || current === undefined} onClick={() => void decide(false)}>
              {alreadyApplied || current === null ? 'Закрыть сравнение' : single && currentFields?.[changes[0].field] != null ? `Оставить: ${valueText(changes[0].field, currentFields[changes[0].field])}` : 'Оставить как сейчас'}
            </button>
          </div>
        </div>
      )}
    </details>
  )
}
