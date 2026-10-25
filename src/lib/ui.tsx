import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

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
  // In the dialog layer, not in #root: «Отменить» must stay reachable while a dialog holds the page inert.
  return msg ? createPortal(
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
    </div>,
    modalRoot(),
  ) : null
}

/** Where dialogs live: outside #root, so the page behind can be made inert while one is open. */
export function modalRoot(): HTMLElement {
  let el = document.getElementById('modal-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'modal-root'
    document.body.appendChild(el)
  }
  return el
}

/** How many dialogs are open now; the page behind stays inert until the last one closes. */
let openDialogs = 0
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * What a modal dialog owes assistive tech and the keyboard: the page behind is inert, focus moves into the dialog
 * (unless something inside already took it), Tab stays inside, and on close focus goes back to where it was.
 */
export function useModal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openDialogs++
    document.getElementById('root')?.setAttribute('inert', '')
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null) || n === document.activeElement)
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || at === el)) (e.preventDefault(), last.focus())
      else if (!e.shiftKey && at === last) (e.preventDefault(), first.focus())
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      openDialogs = Math.max(0, openDialogs - 1)
      if (!openDialogs) document.getElementById('root')?.removeAttribute('inert')
      if (back?.isConnected) back.focus({ preventScroll: true })
    }
  }, [ref])
}

/** A dialog over the page: Escape or a click outside closes it. */
export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>,
    modalRoot(),
  )
}

/** Open file dialog behind a real button: reachable with Tab, Enter and Space, unlike a label around a hidden input. */
export function FilePick({
  accept,
  onFile,
  className,
  style,
  children,
  disabled,
}: {
  accept: string
  onFile: (file: File) => void
  className?: string
  style?: CSSProperties
  children: ReactNode
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={className} style={style} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = '' // the same file can be picked again
        }}
      />
    </>
  )
}

/** Text input that saves on blur / Enter instead of on every keystroke. */
export function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline,
  label,
}: {
  value: string
  onSave: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
  /** The name of the field for assistive tech; without it the placeholder serves. */
  label?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => v !== value && onSave(v)
  const common = {
    value: v,
    placeholder,
    'aria-label': label ?? placeholder,
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
