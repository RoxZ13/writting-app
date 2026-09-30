import { useEffect, useRef, useState } from 'react'
import { PALETTE } from '../db/repo'

/**
 * A colour you can change where you see it: tap the dot (or the hero's letter) and pick one
 * of the palette. Used for heroes and story branches.
 */
export function ColorDot({
  color,
  label,
  onChange,
  children,
  className = 'color-dot',
}: {
  color: string
  label: string
  onChange: (color: string) => void
  children?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <span className="color-dot-wrap" ref={box}>
      <button
        type="button"
        className={className}
        style={{ background: color }}
        aria-label={`Цвет: ${label}. Поменять`}
        title="Поменять цвет"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        {children}
      </button>
      {open && (
        <span className="color-pop card" role="radiogroup" aria-label={`Цвет: ${label}`}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={`Цвет ${c}`}
              className="swatch"
              style={{ background: c }}
              onClick={(e) => {
                e.stopPropagation()
                onChange(c)
                setOpen(false)
              }}
            />
          ))}
        </span>
      )}
    </span>
  )
}
