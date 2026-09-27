import type { Editor } from '@tiptap/react'

/** What the author is doing right now — read by quick capture so it can attach and return. */
export const session: {
  sceneId?: string
  editor?: Editor | null
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

const SIZE_KEY = 'manuscript.textSize'
export function getTextSize(): number {
  try {
    return Number(localStorage.getItem(SIZE_KEY)) || 20
  } catch {
    return 20
  }
}
export function applyTextSize(px: number) {
  try {
    localStorage.setItem(SIZE_KEY, String(px))
  } catch {
    /* ignore */
  }
  document.documentElement.style.setProperty('--text-size', `${px}px`)
}

const FONT_KEY = 'manuscript.textFont'
export type TextFont = 'serif' | 'sans'
export function getTextFont(): TextFont {
  try {
    return localStorage.getItem(FONT_KEY) === 'sans' ? 'sans' : 'serif'
  } catch {
    return 'serif'
  }
}
export function applyTextFont(f: TextFont) {
  try {
    localStorage.setItem(FONT_KEY, f)
  } catch {
    /* ignore */
  }
  if (f === 'sans') document.documentElement.dataset.font = 'sans'
  else delete document.documentElement.dataset.font
}
