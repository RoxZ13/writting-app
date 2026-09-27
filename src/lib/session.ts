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
export type Theme = 'auto' | 'light' | 'dark'
export function getTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) || 'auto'
  } catch {
    return 'auto'
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
