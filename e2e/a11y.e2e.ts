import AxeBuilder from '@axe-core/playwright'
import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { asFile, smallBook } from './volume-helpers'

/**
 * Accessibility evidence: axe on every main screen (desktop and phone), plus keyboard-only checks.
 * Every screen's full list of violations goes to a JSONL file (AXE_OUT) that audit/axe.md is built from.
 * Rule: "no critical violations" — where there are some the test is test.fail(), so the suite stays green
 * and the evidence stays visible; the day a screen is fixed, Playwright reports the unexpected pass.
 */

const AXE_OUT = process.env.AXE_OUT ?? join(tmpdir(), 'manuscript-axe.jsonl')
const WELCOME_IMPORT = 'label:has-text("Импортировать .docx / .txt") input[type="file"]'

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

const criticals = (found: Found[]) => found.filter((f) => f.impact === 'critical')

// ---------------------------------------------------------------- axe on every main screen

// Screens where the scan found critical violations are listed here and run as test.fail().
// audit: filled from the first full run, see audit/axe.md.
const KNOWN_CRITICAL: Record<string, string[]> = {
  // axe "label" (critical): an <input> with no accessible name — chapter titles on the board (InlineEdit), hero names, settings fields.
  // The two dialogs below are flagged only because axe also scans the board that stays behind them.
  desktop: [
    'board',
    'Герои',
    'Об истории (книга)',
    'Об истории — «Файлы и прочее» открыто',
    'Настройки',
    'быстрая запись (Ctrl+J)',
    'поиск по истории (Ctrl+Shift+F)',
    'карточка сцены на доске',
  ],
  phone: ['Герои', 'Об истории (книга)', 'Об истории — «Файлы и прочее» открыто', 'Настройки'],
  // WebKit (iPhone 14) gives the same axe result as Chromium on the phone layout.
  iphone: ['Герои', 'Об истории (книга)', 'Об истории — «Файлы и прочее» открыто', 'Настройки'],
}

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
  expect(criticals(found), 'critical axe violations on welcome').toEqual([])
})

for (const screen of SCREENS) {
  test(`axe: ${screen.name}`, async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await seedStory(page, { extras: screen.extras })
    await screen.open(page)
    const found = await scan(page, project, screen.name)
    if ((KNOWN_CRITICAL[project] ?? []).includes(screen.name)) test.fail() // audit: see audit/axe.md
    expect(criticals(found), `critical axe violations on ${screen.name}`).toEqual([])
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

  test('welcome: «Импортировать .docx / .txt» can be reached with Tab', async ({ page }) => {
    // audit: file inputs unreachable by keyboard — the <label> is not focusable and the input is `hidden`
    test.fail()
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
    const order = await tabOrder(page, 10)
    expect(order.some((o) => o.includes('Импортировать'))).toBe(true)
  })

  test('welcome: «Вернуть из копии» can be reached with Tab', async ({ page }) => {
    // audit: file inputs unreachable by keyboard — same cause as the import button
    test.fail()
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
    const order = await tabOrder(page, 10)
    expect(order.some((o) => o.includes('Вернуть из копии'))).toBe(true)
  })

  test('library: «Импорт .docx / .txt» can be reached with Tab', async ({ page }) => {
    // audit: file inputs unreachable by keyboard — the same pattern in the library header
    test.fail()
    await seedStory(page)
    await page.goto('/#/library')
    await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()
    const order = await tabOrder(page, 25)
    expect(order.some((o) => o.includes('Импорт .docx'))).toBe(true)
  })

  test('board: a scene card is reachable with Tab, and Enter opens it (B-017)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    // audit B-017: on the desktop board a card is a dnd-kit draggable; Enter/Space start a keyboard drag instead of opening the scene.
    if (project === 'desktop') test.fail()
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
