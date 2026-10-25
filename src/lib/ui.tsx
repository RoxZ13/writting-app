import { useEffect, useState, type ReactNode } from 'react'

type Undo = () => unknown
type Shown = { text: string; undo?: Undo; until: number }
let pushToast: ((msg: Shown) => void) | null = null
/** Kept outside the component: when the screen changes (the last story deleted → Welcome), the new Toaster shows it on. */
let current: Shown | null = null
/** A short note at the bottom. With `undo`, it stays a little longer and offers «Отменить». */
export const toast = (text: string, undo?: Undo) => {
  current = { text, undo, until: Date.now() + (undo ? 6000 : 2200) }
  pushToast?.(current)
}

export function Toaster() {
  const [msg, setMsg] = useState<Shown | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const show = (m: Shown) => {
      setMsg(m)
      clearTimeout(t)
      t = setTimeout(() => {
        setMsg(null)
        if (current === m) current = null
      }, Math.max(0, m.until - Date.now()))
    }
    pushToast = show
    if (current && current.until > Date.now()) show(current)
    return () => {
      clearTimeout(t)
      if (pushToast === show) pushToast = null
    }
  }, [])
  return msg ? (
    <div className={`toast ${msg.undo ? 'has-undo' : ''}`} role="status">
      {msg.text}
      {msg.undo && (
        <button
          className="toast-undo"
          onClick={() => {
            void msg.undo!()
            setMsg(null)
          }}
        >
          Отменить
        </button>
      )}
    </div>
  ) : null
}

export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

/** Text input that saves on blur / Enter instead of on every keystroke. */
export function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline,
}: {
  value: string
  onSave: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => v !== value && onSave(v)
  const common = {
    value: v,
    placeholder,
    className: `bare ${className ?? ''}`,
    onBlur: commit,
  }
  return multiline ? (
    <textarea
      {...common}
      rows={1}
      style={{ resize: 'none', fieldSizing: 'content' } as React.CSSProperties}
      onChange={(e) => setV(e.target.value)}
    />
  ) : (
    <input
      {...common}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
