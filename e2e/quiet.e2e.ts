import { expect, test, type Page } from '@playwright/test'
import { aliveRows, allTexts, setChapterMaximum, startStory, waitSaveTick } from './helpers'

// Set QUIET_SHOTS to a folder to also save screenshots of the chapter meter in every theme.
const SHOTS = process.env.QUIET_SHOTS

const A = 'Первый абзац главы. '.repeat(5).trim()
const B = 'Второй абзац главы. '.repeat(5).trim()
const C = 'Третий абзац главы. '.repeat(8).trim()

/** A story whose first chapter has a norm of 300 characters and three paragraphs, ~360 characters: past the norm. */
async function overTheNorm(page: Page) {
  const editor = await startStory(page)
  await editor.click()
  await page.keyboard.type('Начало.')
  await waitSaveTick(page)
  await setChapterMaximum(page, 300)
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(A)
  await page.keyboard.press('Enter')
  await page.keyboard.type(B)
  await page.keyboard.press('Enter')
  await page.keyboard.type(C)
  await waitSaveTick(page)
}

test.describe('quiet chapter meter', () => {
  test('exceeding the chapter target keeps the text editable and explains the difference', async ({ page }) => {
    await overTheNorm(page)
    const meter = page.locator('.chapter-meter')
    await expect(meter).toHaveClass(/over/)
    await expect(page.locator('.ProseMirror')).toBeEditable()
    await meter.locator('.chapter-progress-trigger').click()
    const message = page.getByRole('dialog', { name: /Прогресс главы/ }).locator('.chapter-progress-message')
    await expect(message).toHaveText(/Сверх ориентира на \d+ знаков/)
  })

  test('«Новая глава с этого абзаца» lives in the «⋯» menu and splits the chapter without losing text', async ({ page }) => {
    await overTheNorm(page)
    const chaptersBefore = (await aliveRows<any>(page, 'chapters')).length
    // Cursor into the second paragraph.
    await page.locator('.ProseMirror p', { hasText: 'Второй абзац' }).click()
    await page.getByRole('button', { name: 'Ещё' }).click()
    const more = page.getByText('Ещё инструменты', { exact: true })
    if (await more.isVisible()) await more.click()
    const item = page.locator('.write-menu .menu-item', { hasText: 'Новая глава с этого абзаца' })
    await expect(item).toBeVisible()
    await item.click()

    await expect.poll(async () => (await aliveRows<any>(page, 'chapters')).length).toBe(chaptersBefore + 1)
    // The tail is copied first and the head trimmed after: wait until the trim has landed.
    await expect
      .poll(async () => (await allTexts(page)).map((t) => t.text).join(' ').split('Второй абзац').length - 1, { timeout: 10_000 })
      .toBe(5)
    await waitSaveTick(page)
    const texts = (await allTexts(page)).map((t) => t.text)
    const joined = texts.join(' ')
    // Everything is still there, each paragraph exactly once (each repeats its phrase 5, 5 and 8 times).
    for (const [phrase, times] of [['Первый абзац', 5], ['Второй абзац', 5], ['Третий абзац', 8]] as const) {
      expect(joined.split(phrase).length - 1, `«${phrase}» is kept, not doubled`).toBe(times)
    }
    const head = texts.find((t) => t.includes('Первый абзац'))!
    const tail = texts.find((t) => t.includes('Второй абзац'))!
    expect(head).not.toContain('Второй абзац')
    expect(tail).toContain('Третий абзац')
    expect(tail).not.toContain('Первый абзац')
  })

  test('on a phone the «⋯» menu sits at its button, fully on screen with its tools reachable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout')
    await overTheNorm(page)
    await page.reload()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await expect(page.locator('.resume')).toBeHidden()
    const button = page.getByRole('button', { name: 'Ещё' })
    await button.click()
    const menu = page.locator('.write-menu')
    await expect(menu).toBeVisible()
    await menu.getByText('Ещё инструменты', { exact: true }).click()
    // The scene's chapter is not locked: the split item is there.
    await expect(menu.locator('.menu-item', { hasText: 'Новая глава с этого абзаца' })).toBeVisible()

    const vp = page.viewportSize()!
    const b = (await button.boundingBox())!
    const m = (await menu.boundingBox())!
    expect(m.x).toBeGreaterThanOrEqual(0)
    expect(m.x + m.width).toBeLessThanOrEqual(vp.width)
    expect(m.y + m.height).toBeLessThanOrEqual(vp.height)
    // Anchored to the button: right under it and ending at its right edge.
    expect(m.y - (b.y + b.height)).toBeLessThan(24)
    expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(24)

    // Every item answers a tap after scrolling it into view inside the menu.
    const items = menu.locator('.menu-item:visible, .menu-modes button')
    const n = await items.count()
    expect(n).toBeGreaterThan(5)
    for (let i = 0; i < n; i++) {
      await items.nth(i).click({ trial: true, timeout: 3_000 })
    }
  })

  test('on the phone board the round «+» never covers the last scene', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout')
    await overTheNorm(page)
    await page.evaluate(() => (location.hash = '#/board'))
    await expect(page.locator('.timeline')).toBeVisible()
    await expect(page.locator('.tl-chapter').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const fab = (await page.locator('.fab').boundingBox())!
    const last = (await page.locator('.tl-chapter').last().boundingBox())!
    expect(last.y + last.height, 'the last row ends above the button').toBeLessThanOrEqual(fab.y)
  })
})

test('screenshots of the chapter over its norm', async ({ page }, info) => {
  test.skip(!SHOTS || info.project.name === 'iphone', 'only when QUIET_SHOTS is set')
  test.setTimeout(120_000)
  if (info.project.name === 'phone') await page.setViewportSize({ width: 375, height: 812 })
  else await page.setViewportSize({ width: 1280, height: 800 })
  await overTheNorm(page)
  for (const theme of ['light', 'dark', 'paper'] as const) {
    await page.evaluate((t) => {
      localStorage.setItem('manuscript.theme', t)
    }, theme)
    await page.reload()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    // Resting: the mouse moves, the bars come back.
    await page.evaluate(() => window.dispatchEvent(new Event('mousemove')))
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-resting.png` })
    // Typing: one letter at the end of the text.
    await page.locator('.ProseMirror p').last().click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' а')
    await expect(page.locator('.write')).toHaveClass(/typing/)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-typing.png` })
  }
  // The «⋯» menu over the resume bar.
  await page.evaluate(() => localStorage.setItem('manuscript.theme', 'light'))
  await page.reload()
  if (info.project.name === 'desktop') await expect(page.locator('.resume')).toBeVisible()
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-light-menu.png` })
})
