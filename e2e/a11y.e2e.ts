import AxeBuilder from '@axe-core/playwright'
import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { startStory } from './helpers'
import { asFile, smallBook } from './volume-helpers'

/**
 * Accessibility evidence: axe on every main screen (desktop and phone), plus keyboard-only checks.
 * Every screen's full list of violations goes to a JSONL file (AXE_OUT) that audit/axe.md is built from.
 * Rule: "no critical violations" — where there are some the test is test.fail(), so the suite stays green
 * and the evidence stays visible; the day a screen is fixed, Playwright reports the unexpected pass.
 */

const AXE_OUT = process.env.AXE_OUT ?? join(tmpdir(), 'manuscript-axe.jsonl')
/** The hidden file input behind the «Импортировать» button (the button itself is what a person reaches). */
const WELCOME_IMPORT = 'input[type="file"][accept*="docx"]'

// ---------------------------------------------------------------- helpers

/** Text that may sit in plain markup or in an editable field (names are inputs here). */
const seen = (page: Page, text: string) =>
  page
    .getByText(text)
    .or(page.locator(`input[value*="${text}"]`))
    .or(page.locator('textarea').filter({ hasText: text }))
    .first()

/** A story with content: imported from a small two-part book (3 scenes each, one author's note). */
async function seedStory(page: Page, { extras }: { extras?: boolean } = {}) {
  const book = smallBook()
  await page.goto('/')
  await page.locator(WELCOME_IMPORT).setInputFiles(asFile('small.txt', book.text))
  await expect(page.locator('.board, .timeline')).toBeVisible({ timeout: 30_000 })
  if (extras) {
    await page.goto('/#/characters')
    await page.getByPlaceholder('+ Новый герой').fill('Ирина')
    await page.keyboard.press('Enter')
    await expect(seen(page, 'Ирина')).toBeVisible()
    await page.goto('/#/lore')
    await page.getByPlaceholder(/^\+ запись/).fill('Невский дом')
    await page.keyboard.press('Enter')
    await expect(seen(page, 'Невский дом')).toBeVisible()
    await page.goto('/#/board')
    await page.keyboard.press('Control+j')
    await page.getByRole('dialog', { name: 'Быстрая запись' }).locator('textarea').fill('Проверить, откуда у Глеба ключ')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Быстрая запись' })).toHaveCount(0)
  }
  return book
}

interface Found {
  id: string
  impact: string | null | undefined
  help: string
  nodes: number
  targets: string[]
}

async function scan(page: Page, project: string, screen: string): Promise<Found[]> {
  await page.waitForTimeout(500) // let transitions settle
  const res = await new AxeBuilder({ page }).analyze()
  const found: Found[] = res.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 2).map((n) => (Array.isArray(n.target) ? n.target.join(' >> ') : String(n.target))),
  }))
  appendFileSync(AXE_OUT, JSON.stringify({ project, screen, url: page.url(), found }) + '\n')
  const summary = found.map((f) => `${f.impact}:${f.id}x${f.nodes}`).join(', ')
  console.log(`AXE [${project}] ${screen}: ${found.length} rules${summary ? ' - ' + summary : ''}`)
  return found
}

/** What a screen reader would roughly say for the focused element. */
const FOCUS_PROBE = () => {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return null
  const txt = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 70)
  const labelledby = el.getAttribute('aria-labelledby')
  const wrapping = el.closest('label')
  const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null
  const name =
    txt(el.getAttribute('aria-label')) ||
    (labelledby ? txt(document.getElementById(labelledby)?.textContent) : '') ||
    txt(forLabel?.textContent) ||
    txt(wrapping?.textContent) ||
    txt(el.getAttribute('title')) ||
    txt(el.getAttribute('placeholder')) ||
    txt(el.textContent)
  const role = el.getAttribute('role') || (el as HTMLInputElement).type || ''
  return `${el.tagName.toLowerCase()}${role ? `[${role}]` : ''} "${name}"`
}

async function tabOrder(page: Page, presses: number): Promise<string[]> {
  const seen: string[] = []
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab')
    const f = await page.evaluate(FOCUS_PROBE)
    seen.push(f ?? '(focus left the page content)')
  }
  return seen
}

/** What must be zero: every critical violation, and the serious ones fixed in the audit (names, labels, contrast). */
const FIXED_RULES = ['label-content-name-mismatch', 'aria-prohibited-attr', 'label-title-only', 'aria-allowed-role', 'color-contrast']
const criticals = (found: Found[]) => found.filter((f) => f.impact === 'critical' || FIXED_RULES.includes(f.id))

// ---------------------------------------------------------------- axe on every main screen

// Screens where the scan found critical violations would be listed here and run as test.fail().
// After the labelling pass (audit P1-5) the list is empty: every screen below must have no critical violation.
const KNOWN_CRITICAL: Record<string, string[]> = { desktop: [], phone: [], iphone: [] }

type Screen = { name: string; extras?: boolean; open: (page: Page) => Promise<void> }
const SCREENS: Screen[] = [
  {
    name: 'text view',
    open: async (page) => {
      await page.goto('/#/text')
      await expect(page.locator('.ProseMirror')).toBeVisible()
    },
  },
  {
    name: 'board',
    open: async (page) => {
      await page.goto('/#/board')
      await expect(page.locator('.board, .timeline')).toBeVisible()
    },
  },
  {
    name: 'Герои',
    extras: true,
    open: async (page) => {
      await page.goto('/#/characters')
      await expect(seen(page, 'Ирина')).toBeVisible()
    },
  },
  {
    name: 'Матчасть',
    extras: true,
    open: async (page) => {
      await page.goto('/#/lore')
      await expect(seen(page, 'Невский дом')).toBeVisible()
    },
  },
  {
    name: 'Входящие',
    extras: true,
    open: async (page) => {
      await page.goto('/#/inbox')
      await expect(page.getByRole('heading', { name: 'Входящие' })).toBeVisible()
      await expect(seen(page, 'Проверить, откуда у Глеба ключ')).toBeVisible()
    },
  },
  {
    name: 'Об истории (книга)',
    open: async (page) => {
      await page.goto('/#/book')
      await expect(page.getByText('Об истории', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'Об истории — «Файлы и прочее» открыто',
    open: async (page) => {
      await page.goto('/#/book')
      await page.locator('summary', { hasText: 'Файлы и прочее' }).click()
      await expect(page.getByRole('button', { name: 'Вся история в Word (.docx)' })).toBeVisible()
    },
  },
  {
    name: 'Настройки',
    open: async (page) => {
      await page.goto('/#/settings')
      await expect(page.getByRole('heading', { name: 'Настройки' }).first()).toBeVisible()
    },
  },
  {
    name: 'Все истории (библиотека)',
    open: async (page) => {
      await page.goto('/#/library')
      await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()
    },
  },
  {
    name: 'быстрая запись (Ctrl+J)',
    open: async (page) => {
      await page.goto('/#/board')
      await expect(page.locator('.board, .timeline')).toBeVisible()
      await page.keyboard.press('Control+j')
      await expect(page.getByRole('dialog', { name: 'Быстрая запись' })).toBeVisible()
    },
  },
  {
    name: 'поиск по истории (Ctrl+Shift+F)',
    open: async (page) => {
      await page.goto('/#/board')
      await expect(page.locator('.board, .timeline')).toBeVisible()
      await page.keyboard.press('Control+Shift+f')
      await expect(page.getByRole('dialog', { name: 'Поиск по истории' })).toBeVisible()
    },
  },
  {
    name: 'поиск в сцене (Ctrl+F)',
    open: async (page) => {
      await page.goto('/#/text')
      const editor = page.locator('.ProseMirror')
      await expect(editor).toBeVisible()
      await editor.click()
      await page.keyboard.press('Control+f')
      await expect(page.getByLabel('Найти в сцене')).toBeVisible()
    },
  },
  {
    name: 'карточка сцены на доске',
    open: async (page) => {
      await page.goto('/#/board')
      await page.locator('article.card-scene, .tl-scene').first().click()
      await expect(page.getByRole('dialog', { name: 'Сцена' })).toBeVisible()
    },
  },
]

test('axe: welcome screen', async ({ page }, testInfo) => {
  const project = testInfo.project.name
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
  const found = await scan(page, project, 'welcome')
  if ((KNOWN_CRITICAL[project] ?? []).includes('welcome')) test.fail() // audit: see audit/axe.md
  expect(criticals(found), 'critical or fixed-rule axe violations on welcome').toEqual([])
})

for (const screen of SCREENS) {
  test(`axe: ${screen.name}`, async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await seedStory(page, { extras: screen.extras })
    await screen.open(page)
    const found = await scan(page, project, screen.name)
    if ((KNOWN_CRITICAL[project] ?? []).includes(screen.name)) test.fail() // audit: see audit/axe.md
    expect(criticals(found), `critical or fixed-rule axe violations on ${screen.name}`).toEqual([])
  })
}

// ---------------------------------------------------------------- keyboard only

test.describe('keyboard only', () => {
  test('welcome: tab order, and what is reachable', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
    const order = await tabOrder(page, 8)
    console.log(`KEYS [${testInfo.project.name}] welcome focus order:\n  ` + order.join('\n  '))
    appendFileSync(AXE_OUT, JSON.stringify({ project: testInfo.project.name, screen: 'KEYBOARD welcome focus order', order }) + '\n')
    // The page must offer the two main buttons at all.
    expect(order.some((o) => o.includes('Начать историю'))).toBe(true)
  })

  // Each file button is a real <button> in the Tab order, and Enter / Space open the file dialog.
  for (const [name, label] of [
    ['«Импортировать .docx / .txt»', 'Импортировать'],
    ['«Вернуть из копии»', 'Вернуть из копии'],
  ] as const) {
    test(`welcome: ${name} can be reached with Tab and opened with Enter and Space`, async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
      const order = await tabOrder(page, 10)
      expect(order.some((o) => o.includes(label))).toBe(true)
      for (const key of ['Enter', 'Space']) {
        await page.getByRole('button', { name: label }).focus()
        const chooser = page.waitForEvent('filechooser', { timeout: 5_000 })
        await page.keyboard.press(key)
        await chooser
      }
    })
  }

  test('library: «Импорт .docx / .txt» can be reached with Tab and opened with Enter', async ({ page }) => {
    await seedStory(page)
    await page.goto('/#/library')
    await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()
    const order = await tabOrder(page, 25)
    expect(order.some((o) => o.includes('Импорт .docx'))).toBe(true)
    await page.getByRole('button', { name: 'Импорт .docx' }).focus()
    const chooser = page.waitForEvent('filechooser', { timeout: 5_000 })
    await page.keyboard.press('Enter')
    await chooser
  })

  test('board: a scene card is reachable with Tab, and Enter opens it (B-017 fixed)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    // B-017 (fixed): on the desktop board a card is a dnd-kit draggable; Enter opens the scene, Space starts a keyboard drag.
    await seedStory(page)
    await page.goto('/#/board')
    await expect(page.locator('.board, .timeline')).toBeVisible()
    await page.locator('body').click({ position: { x: 5, y: 5 } })

    const cardSel = project === 'desktop' ? 'article.card-scene' : '.tl-scene'
    let presses = 0
    let reached = ''
    for (; presses < 150; presses++) {
      await page.keyboard.press('Tab')
      const on = await page.evaluate((sel) => {
        const el = document.activeElement
        return !!el && (el.matches(sel) || !!el.querySelector(sel) || !!el.closest(sel))
      }, cardSel)
      if (on) {
        reached = (await page.evaluate(FOCUS_PROBE)) ?? ''
        break
      }
    }
    console.log(`KEYS [${project}] board: first scene card focused after ${presses + 1} Tab presses: ${reached || 'NOT REACHED in 150'}`)
    expect(reached, 'a scene card never received focus').not.toBe('')

    await page.keyboard.press('Enter')
    const openedByEnter = await page.getByRole('dialog', { name: 'Сцена' }).isVisible().catch(() => false)
    const dragAnnounce = await page.locator('[aria-live]').allTextContents()
    console.log(`KEYS [${project}] board: Enter opened the scene sheet: ${openedByEnter}; live region: ${JSON.stringify(dragAnnounce.map((t) => t.trim()).filter(Boolean))}`)
    appendFileSync(AXE_OUT, JSON.stringify({ project, screen: 'KEYBOARD board card', tabsToCard: presses + 1, focused: reached, enterOpensScene: openedByEnter }) + '\n')
    expect(openedByEnter, 'Enter on a focused scene card should open the scene').toBe(true)
  })
})

// ---------------------------------------------------------------- the same contrast check in the other two themes

for (const theme of ['dark', 'paper'] as const) {
  test(`axe color-contrast in the «${theme}» theme`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('manuscript.theme', t)
        localStorage.setItem('manuscript.theme.chosen', '1')
      } catch {
        /* ignore */
      }
    }, theme)
    await seedStory(page, { extras: true })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const bad: string[] = []
    for (const hash of ['#/text', '#/board', '#/characters', '#/lore', '#/inbox', '#/book', '#/settings', '#/library']) {
      await page.goto('/' + hash)
      await page.waitForTimeout(600)
      const res = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      for (const v of res.violations) for (const n of v.nodes) bad.push(`${hash}: ${n.target.join(' >> ')} — ${n.any[0]?.message ?? ''}`)
    }
    appendFileSync(AXE_OUT, JSON.stringify({ project: testInfo.project.name, screen: `contrast in theme ${theme}`, bad }) + '\n')
    expect(bad, `low-contrast text in the «${theme}» theme`).toEqual([])
  })
}

// ---------------------------------------------------------------- dialogs

test.describe('dialogs', () => {
  test('quick capture is a real modal dialog: inert page behind, focus inside, Escape closes, focus returns', async ({ page }) => {
    await seedStory(page)
    await page.goto('/#/board')
    await expect(page.locator('.board, .timeline')).toBeVisible()
    await page.keyboard.press('Control+j')
    const dialog = page.getByRole('dialog', { name: 'Быстрая запись' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(page.locator('#root')).toHaveAttribute('inert', '')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  })

  test('scene card on the board is a modal dialog with focus inside; the focus returns to the card', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'cards are keyboard-focusable on the desktop board')
    await seedStory(page)
    await page.goto('/#/board')
    const card = page.locator('article.card-scene').first()
    await expect(card).toBeVisible()
    const wrapper = card.locator('xpath=..')
    await wrapper.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Сцена' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(page.locator('#root')).toHaveAttribute('inert', '')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    // Tab never leaves the dialog.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    expect(await wrapper.evaluate((el) => el === document.activeElement)).toBe(true)
  })
})

// ---------------------------------------------------------------- focus ring

test('focus ring: buttons and the inline fields without a frame show a visible outline on keyboard focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the board columns are a desktop layout')
  await seedStory(page)
  await page.goto('/#/board')
  await expect(page.locator('.board')).toBeVisible()
  // The chapter title and the «+ о чём глава» field had `outline: none` before the audit.
  for (const sel of ['input.column-title', 'textarea.column-goal', '.add-column', '[aria-roledescription="sortable"]']) {
    const target = page.locator(sel).first()
    await target.focus()
    // A key press first, so the browser treats the focus as keyboard focus (:focus-visible).
    await page.keyboard.press('Shift+Tab')
    await target.focus()
    const r = await target.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { focused: el === document.activeElement, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
    })
    expect(r.focused, `${sel} regained focus`).toBe(true)
    expect(r.style, `outline of ${sel} on keyboard focus`).not.toBe('none')
    expect(r.width, `outline width of ${sel}`).toBeGreaterThanOrEqual(2)
  }
})

// ---------------------------------------------------------------- touch targets

test('touch: the text toolbar and the selection bubble reach 44×44 px of hit area', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'touch screens only')
  await seedStory(page)
  await page.goto('/#/text')
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  /** How far, in each direction from the centre, a point still hits the element or its pseudo-element (capped at 30 px). */
  const hitSize = (sel: string) =>
    page.locator(sel).evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          const hits = (x: number, y: number) => {
            const t = document.elementFromPoint(x, y)
            return !!t && (t === el || el.contains(t))
          }
          const probe = (dx: number, dy: number) => {
            let n = 0
            while (n < 30 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++
            return n
          }
          return { name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20), w: probe(-1, 0) + probe(1, 0) + 1, h: probe(0, -1) + probe(0, 1) + 1 }
        }),
    )
  const tools = await hitSize('.write-top .tool')
  expect(tools.length).toBeGreaterThan(0)
  for (const t of tools) {
    expect(t.h, `toolbar «${t.name}» height`).toBeGreaterThanOrEqual(44)
    expect(t.w, `toolbar «${t.name}» width`).toBeGreaterThanOrEqual(44)
  }
  // Select a line: the bubble appears.
  await editor.click()
  await page.keyboard.type('Слово для выделения')
  await page.keyboard.press('Shift+Home')
  await expect(page.locator('.bubble button').first()).toBeVisible()
  const inBubble = await hitSize('.bubble button')
  expect(inBubble.length).toBeGreaterThan(0)
  for (const t of inBubble) {
    expect(t.h, `bubble «${t.name}» height`).toBeGreaterThanOrEqual(44)
    expect(t.w, `bubble «${t.name}» width`).toBeGreaterThanOrEqual(44)
  }
})

// ---------------------------------------------------------------- keyboard drag on the board

test('board: Space lifts a card, the live region speaks Russian, Escape puts it back (desktop)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'cards are draggable columns on the desktop board')
  await seedStory(page)
  await page.goto('/#/board')
  const wrapper = page.locator('article.card-scene').first().locator('xpath=..')
  await expect(wrapper).toBeVisible()
  await wrapper.focus()
  await page.keyboard.press('Space')
  const live = page.locator('[aria-live]')
  await expect.poll(async () => (await live.allTextContents()).join(' ')).toContain('Поднята')
  // Not the library's English default text.
  expect((await live.allTextContents()).join(' ')).not.toMatch(/Picked up|Draggable item/)
  expect(await page.getByRole('dialog', { name: 'Сцена' }).count()).toBe(0)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await live.allTextContents()).join(' ')).toContain('Перенос отменён')
  // The instructions are Russian too.
  const hint = await wrapper.getAttribute('aria-describedby')
  expect(await page.locator(`#${hint}`).textContent()).toContain('Enter открывает сцену')
})

test('focus ring: the text itself stays quiet — no frame around the editor while writing', async ({ page }) => {
  const editor = await startStory(page)
  await editor.click()
  await page.keyboard.type('Тихо')
  const outline = await editor.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
  })
  expect(outline.style === 'none' || outline.width === 0).toBe(true)
})
