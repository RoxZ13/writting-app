import type { Editor } from '@tiptap/react'

/** What the author is doing right now — read by quick capture so it can attach and return. */
export const session: {
  sceneId?: string
  editor?: Editor | null
  /** Text to select once the next scene opens (from book search). */
  find?: string
} = {}

export function returnFocus() {
  const ed = session.editor
  if (ed && !ed.isDestroyed) setTimeout(() => ed.commands.focus(), 30)
}

const PROJECT_KEY = 'manuscript.project'
export const getCurrentProjectId = () => {
  try {
    return localStorage.getItem(PROJECT_KEY) ?? undefined
  } catch {
    return undefined
  }
}
export const setCurrentProjectId = (id: string) => {
  try {
    localStorage.setItem(PROJECT_KEY, id)
  } catch {
    /* ignore */
  }
}

const THEME_KEY = 'manuscript.theme'
export type Theme = 'auto' | 'light' | 'dark' | 'paper'
export function getTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) || 'light'
  } catch {
    return 'light'
  }
}
export function applyTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
  if (t === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

/** Keyboard shortcut hints only make sense where there is a keyboard. */
export const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
export const hotkey = (hint: string) => (isTouch() ? '' : hint)

const ACCENT_KEY = 'manuscript.accent'
export type Accent = 'ink' | 'forest' | 'sea' | 'plum' | 'terracotta' | 'amber' | 'rose'
/** The author's own colour; ink (black / cream in the dark) unless chosen. Light-theme swatch for the picker. */
export const ACCENTS: { id: Accent; name: string; swatch: string }[] = [
  { id: 'ink', name: 'Чернила', swatch: '#0b0b0c' },
  { id: 'forest', name: 'Лес', swatch: '#2f5d46' },
  { id: 'sea', name: 'Море', swatch: '#1f5a8a' },
  { id: 'plum', name: 'Слива', swatch: '#6b3f7d' },
  { id: 'terracotta', name: 'Терракота', swatch: '#a24a2c' },
  { id: 'amber', name: 'Янтарь', swatch: '#8a6113' },
  { id: 'rose', name: 'Роза', swatch: '#a3385f' },
]
export function getAccent(): Accent {
  try {
    return (localStorage.getItem(ACCENT_KEY) as Accent) || 'ink'
  } catch {
    return 'ink'
  }
}
export function applyAccent(a: Accent) {
  try {
    localStorage.setItem(ACCENT_KEY, a)
  } catch {
    /* ignore */
  }
  if (a === 'ink') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = a
}
