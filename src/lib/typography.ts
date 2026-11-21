/** How the manuscript text looks. Per device: a phone and a big monitor want different settings. */
export const PAGE_SCALES = [100, 115, 130, 150] as const

export interface Typo {
  /** «Лёгкий» — Onest: wide, open letters, easier on tired eyes. */
  font: 'serif' | 'sans' | 'easy' | 'mono'
  size: number
  pageScale: typeof PAGE_SCALES[number]
  width: 'narrow' | 'medium' | 'wide'
  leading: 'tight' | 'normal' | 'loose'
  para: 'gap' | 'indent'
  /** «По центру»: the line being written stays in the middle of the screen, like a typewriter. */
  typewriter: 'off' | 'on'
  /** «Тихий вид», as in Calmly Writer: header and toolbar only appear when the mouse goes to the top. */
  calm: 'off' | 'on'
  /** The paragraph being written stays bright, the rest fades. */
  focusPara: 'off' | 'on'
  /** The browser's spelling underlines: always, only in «Самопроверка», or never. */
  spell: 'always' | 'edit' | 'never'
}

export const DEFAULT_TYPO: Typo = { font: 'sans', size: 16, pageScale: 115, width: 'medium', leading: 'normal', para: 'gap', typewriter: 'off', calm: 'off', focusPara: 'off', spell: 'edit' }

const KEY = 'manuscript.typo'
const CALM_DEFAULT_KEY = 'manuscript.calmDefault2'
const WIDTH = { narrow: '560px', medium: '660px', wide: '800px' }
const LEADING = { tight: '1.5', normal: '1.7', loose: '1.95' }
/** The CSS font of each choice — also used to draw the choices themselves in Settings. */
export const FONT = { serif: 'var(--serif)', sans: 'var(--sans)', easy: "'Onest Variable', var(--sans)", mono: 'var(--mono)' }

export function loadTypo(): Typo {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // Once: the quiet view used to be on by default and made the page look unfinished — start with the bars visible.
    if (!localStorage.getItem(CALM_DEFAULT_KEY)) {
      delete saved.calm
      localStorage.setItem(CALM_DEFAULT_KEY, '1')
    }
    return { ...DEFAULT_TYPO, ...saved }
  } catch {
    return DEFAULT_TYPO
  }
}

export function applyTypo(t: Typo, { persist = true } = {}) {
  const root = document.documentElement.style
  root.setProperty('--text-font', FONT[t.font])
  root.setProperty('--text-size', `${t.size}px`)
  root.setProperty('--page-scale', String(t.pageScale / 100))
  root.setProperty('--measure', WIDTH[t.width])
  root.setProperty('--leading', LEADING[t.leading])
  document.documentElement.dataset.para = t.para
  document.documentElement.dataset.typewriter = t.typewriter
  document.documentElement.dataset.calm = t.calm
  document.documentElement.dataset.focuspara = t.focusPara
  document.documentElement.dataset.spell = t.spell
  window.dispatchEvent(new Event('manuscript:typo'))
  if (!persist) return
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
}
