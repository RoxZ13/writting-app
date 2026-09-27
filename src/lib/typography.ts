/** How the manuscript text looks. Per device: a phone and a big monitor want different settings. */
export interface Typo {
  font: 'serif' | 'sans' | 'mono'
  size: number
  width: 'narrow' | 'medium' | 'wide'
  leading: 'tight' | 'normal' | 'loose'
  para: 'gap' | 'indent'
}

export const DEFAULT_TYPO: Typo = { font: 'serif', size: 18, width: 'medium', leading: 'normal', para: 'gap' }

const KEY = 'manuscript.typo'
const WIDTH = { narrow: '560px', medium: '660px', wide: '800px' }
const LEADING = { tight: '1.5', normal: '1.7', loose: '1.95' }
const FONT = { serif: 'var(--serif)', sans: 'var(--sans)', mono: 'var(--mono)' }

export function loadTypo(): Typo {
  try {
    return { ...DEFAULT_TYPO, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_TYPO
  }
}

export function applyTypo(t: Typo) {
  const root = document.documentElement.style
  root.setProperty('--text-font', FONT[t.font])
  root.setProperty('--text-size', `${t.size}px`)
  root.setProperty('--measure', WIDTH[t.width])
  root.setProperty('--leading', LEADING[t.leading])
  document.documentElement.dataset.para = t.para
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
}
