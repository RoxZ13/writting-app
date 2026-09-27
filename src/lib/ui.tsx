import { useEffect, useState, type ReactNode } from 'react'

let pushToast: ((msg: string) => void) | null = null
export const toast = (msg: string) => pushToast?.(msg)

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    pushToast = (m) => {
      setMsg(m)
      clearTimeout(t)
      t = setTimeout(() => setMsg(null), 2200)
    }
    return () => {
      pushToast = null
    }
  }, [])
  return msg ? (
    <div className="toast" role="status">
      {msg}
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
