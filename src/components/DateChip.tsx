import { useRef } from 'react'
import { deadlineText } from '../lib/stories'

/**
 * A date as calm Russian words («через 12 дн. · 15 окт.») instead of the browser's own field, which
 * shows «mm/dd/yyyy» on some systems. Tapping opens the system date picker.
 */
export function DateChip({ value, empty, onChange }: { value?: string; empty: string; onChange: (v: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const text = deadlineText(value)
  const open = () => {
    const el = ref.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }
  return (
    <span className="date-chip">
      <button className={`btn sm ${text?.late ? 'late' : ''}`} onClick={open}>
        {text ? `⏳ ${text.text}` : empty}
      </button>
      {value && (
        <button className="icon-btn" aria-label="Убрать дату" title="Убрать дату" onClick={() => onChange(undefined)}>
          ×
        </button>
      )}
      <input ref={ref} type="date" className="date-chip-input" tabIndex={-1} aria-hidden="true" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </span>
  )
}
