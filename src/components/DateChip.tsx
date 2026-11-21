import { useId, useRef, useState } from 'react'
import { deadlineText } from '../lib/stories'
import { Icon } from './Icon'

const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
const dayLabel = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' })
const dateKey = (date: Date) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'),
].join('-')

function firstOfMonth(value?: string) {
  const date = value ? new Date(value + 'T12:00:00') : new Date()
  const valid = Number.isNaN(date.getTime()) ? new Date() : date
  return new Date(valid.getFullYear(), valid.getMonth(), 1, 12)
}

export function DateChip({ value, empty, onChange }: { value?: string; empty: string; onChange: (v: string | undefined) => void }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => firstOfMonth(value))
  const text = deadlineText(value)
  const today = dateKey(new Date())
  const offset = (month.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const move = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1, 12))
  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className="date-chip" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      event.stopPropagation()
      close()
    }}>
      <div className="date-chip-row">
        <button ref={trigger} type="button" className={`btn sm ${text?.late ? 'late' : ''}`} aria-expanded={open} aria-controls={id}
          onClick={() => { if (!open) setMonth(firstOfMonth(value)); setOpen(!open) }}>
          {text ? <><Icon name="clock" size={13} /> {text.text}</> : empty}
        </button>
        {value && <button type="button" className="icon-btn" aria-label="Убрать дату" onClick={() => { onChange(undefined); close() }}>
          <Icon name="close" size={15} />
        </button>}
      </div>
      {open && <section id={id} className="date-calendar" aria-label="Календарь">
        <div className="date-calendar-month">
          <button type="button" className="icon-btn date-prev" aria-label="Предыдущий месяц" onClick={() => move(-1)}><Icon name="right" size={17} /></button>
          <strong aria-live="polite">{monthLabel.format(month)}</strong>
          <button type="button" className="icon-btn" aria-label="Следующий месяц" onClick={() => move(1)}><Icon name="right" size={17} /></button>
        </div>
        <div className="date-calendar-grid">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day} aria-hidden="true">{day}</span>)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1
            const date = new Date(month.getFullYear(), month.getMonth(), day, 12)
            const key = dateKey(date)
            return <button key={key} type="button" aria-label={dayLabel.format(date)} aria-pressed={key === value} aria-current={key === today ? 'date' : undefined}
              data-date={key} style={day === 1 ? { gridColumnStart: offset + 1 } : undefined}
              onClick={() => { onChange(key); close() }}>{day}</button>
          })}
        </div>
      </section>}
    </div>
  )
}
