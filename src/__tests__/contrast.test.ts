import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contrast of the text tokens against the backgrounds they sit on, in each theme.
 * Reads the tokens straight from app.css, so a colour changed there is checked here.
 */
const css = `\n${readFileSync(join(__dirname, '../styles/app.css'), 'utf8')}`

/** The declarations of the first rule whose selector line is exactly `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`no rule ${selector}`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]))
}

const channel = (h: string, i: number) => {
  const v = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (h: string) => 0.2126 * channel(h, 0) + 0.7152 * channel(h, 1) + 0.0722 * channel(h, 2)
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const THEMES: Record<string, Record<string, string>> = {
  'светлая': tokens(':root'),
  'тёмная': tokens(":root[data-theme='dark']"),
  'бумага': tokens(":root[data-theme='paper']"),
}
/** Where text actually lands: the page, the side panel, the sheet of paper, cards, filled chips and hover tints. */
const BACKGROUNDS = ['--bg', '--side', '--paper', '--surface', '--fill', '--accent-soft']
const TEXT = ['--ink', '--ink-2', '--ink-3']

describe('text contrast, WCAG AA 4.5:1', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it(`${name}: ink, ink-2 and ink-3 on every background`, () => {
      const rows: string[] = []
      for (const fg of TEXT) {
        for (const bg of BACKGROUNDS) {
          const ratio = contrast(t[fg], t[bg])
          rows.push(`${fg} ${t[fg]} on ${bg} ${t[bg]}: ${ratio.toFixed(2)}`)
          expect(ratio, `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      console.log(`CONTRAST [${name}]\n  ` + rows.join('\n  '))
    })
  }

  it('the dark theme in the system-preference block carries the same tokens', () => {
    const media = css.indexOf('@media (prefers-color-scheme: dark)')
    const body = css.slice(media, css.indexOf('\n}\n', media))
    for (const k of [...TEXT, ...BACKGROUNDS]) expect(body).toContain(`${k}: ${THEMES['тёмная'][k]};`)
  })

  it('the decorative grey --ink-4 stays lighter than the readable --ink-3', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      const page = t['--bg']
      expect(contrast(t['--ink-4'], page), name).toBeLessThan(contrast(t['--ink-3'], page))
    }
  })
})
