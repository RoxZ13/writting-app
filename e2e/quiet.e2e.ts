import { expect, test, type Page } from '@playwright/test'
import { aliveRows, allTexts, startStory, waitSaveTick } from './helpers'

// Set QUIET_SHOTS to a folder to also save screenshots of the chapter meter in every theme.
const SHOTS = process.env.QUIET_SHOTS

const A = 'Первый абзац главы. '.repeat(5).trim()
const B = 'Второй абзац главы. '.repeat(5).trim()
const C = 'Третий абзац главы. '.repeat(8).trim()

/** In «Об истории», with «+ длина главы» open: the unit «знаки» and the upper bound. */
async function setNorm(page: Page, max: number) {
  const unit = page.getByRole('button', { name: 'знаки', exact: true })
  await unit.click()
  await expect(unit).toHaveAttribute('aria-pressed', 'true')
  const maxField = page.locator('.length-norm .num-input').nth(1)
  await maxField.fill(String(max))
  await maxField.blur()
  await expect(page.locator('.length-norm .num-input').nth(1)).toHaveValue(String(max))
}

/** A story whose first chapter has a norm of 300 characters and three paragraphs, ~360 characters: past the norm. */
async function overTheNorm(page: Page) {
  const editor = await startStory(page)
  await editor.click()
  await page.keyboard.type('Начало.')
  await waitSaveTick(page)
  await page.evaluate(() => (location.hash = '#/book'))
  await page.getByRole('button', { name: '+ длина главы' }).click()
  await setNorm(page, 300)
  await page.evaluate(() => (location.hash = '#/text'))
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

const wide = (page: Page) => page.viewportSize()!.width > 760

test.describe('quiet chapter meter', () => {
  test('past the norm the text goes quiet: hidden while typing, hidden on a phone, never red, no buttons', async ({ page }) => {
    await overTheNorm(page)
    const meter = page.locator('.chapter-meter')
    await expect(meter).toHaveClass(/over/)
    await expect(meter.locator('button')).toHaveCount(0)

    // Typing: nothing but the bar.
    await expect(page.locator('.write')).toHaveClass(/typing/)
    await expect(page.locator('.cm-text')).toBeHidden()
    await expect(page.locator('.cm-track')).toBeVisible()

    // The bar over the norm is a warm token, not the alarm one.
    const colours = await page.evaluate(() => {
      const probe = document.createElement('i')
      probe.style.color = 'var(--mk-hanging)'
      document.body.append(probe)
      const alarm = getComputedStyle(probe).color
      probe.remove()
      return { alarm, fill: getComputedStyle(document.querySelector('.cm-fill')!).backgroundColor }
    })
    expect(colours.fill).not.toBe(colours.alarm)

    // Awake again: wide screens may show the words in neutral ink, phones never.
    await page.evaluate(() => window.dispatchEvent(new Event('mousemove')))
    await expect(page.locator('.write')).not.toHaveClass(/typing/)
    if (wide(page)) {
      const say = page.locator('.cm-say')
      await expect(say).toBeVisible()
      await expect(say).toContainText('длиннее нормы')
      const ink = await say.evaluate((el, alarm) => ({ colour: getComputedStyle(el).color, alarm }), colours.alarm)
      expect(ink.colour).not.toBe(ink.alarm)
    } else {
      await expect(page.locator('.cm-text')).toBeHidden()
    }
  })

  test('«Новая глава с этого абзаца» lives in the «⋯» menu and splits the chapter without losing text', async ({ page }) => {
    await overTheNorm(page)
    const chaptersBefore = (await aliveRows<any>(page, 'chapters')).length
    // Cursor into the second paragraph.
    await page.locator('.ProseMirror p', { hasText: 'Второй абзац' }).click()
    await page.getByRole('button', { name: 'Ещё' }).click()
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

  test('on a phone the «⋯» menu sits at its button, fully on screen and above the resume bar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout')
    await overTheNorm(page)
    await page.reload()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await expect(page.locator('.resume')).toBeVisible()
    const button = page.getByRole('button', { name: 'Ещё' })
    await button.click()
    const menu = page.locator('.write-menu')
    await expect(menu).toBeVisible()
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

    // Every item answers a tap at its centre: nothing (the resume bar, the tab bar) lies over it.
    const items = menu.locator('.menu-item, .menu-modes button')
    const n = await items.count()
    expect(n).toBeGreaterThan(5)
    for (let i = 0; i < n; i++) {
      const box = (await items.nth(i).boundingBox())!
      const covered = await page.evaluate(
        ({ x, y }) => {
          const hit = document.elementFromPoint(x, y)
          return !hit?.closest('.write-menu')
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
      expect(covered, `menu item ${i} is covered`).toBe(false)
    }
  })

  test('on the phone board the round «+» never covers the last scene', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout')
    await overTheNorm(page)
    await page.evaluate(() => (location.hash = '#/board'))
    await expect(page.locator('.timeline')).toBeVisible()
    await expect(page.locator('.tl-scene').first()).toBeVisible()
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
  await expect(page.locator('.resume')).toBeVisible()
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-light-menu.png` })
})
