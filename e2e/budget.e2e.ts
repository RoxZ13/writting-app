import { expect, test, type Page } from '@playwright/test'
import { startStory, typeInEditor, waitSaveTick } from './helpers'

// Set BUDGET_SHOTS to a folder to also save screenshots of the chip in every theme.
const SHOTS = process.env.BUDGET_SHOTS

const ring = (page: Page) => page.locator('.stats-chip .budget-ring')
const chip = (page: Page) => page.locator('.stats-chip')

async function openText(page: Page) {
  await page.evaluate(() => (location.hash = '#/text'))
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

/** In «Об истории», with «+ длина главы» open: the unit «знаки» and the upper bound. */
async function setNorm(page: Page, max: number) {
  const unit = page.getByRole('button', { name: 'знаки', exact: true })
  await unit.click()
  // The fields are rebuilt when the unit changes: wait for that, or the value lands in the old one.
  await expect(unit).toHaveAttribute('aria-pressed', 'true')
  const maxField = page.locator('.length-norm .num-input').nth(1)
  await maxField.fill(String(max))
  await maxField.blur()
  await expect(page.locator('.length-norm .num-input').nth(1)).toHaveValue(String(max))
}

async function setTheme(page: Page, theme: 'light' | 'dark' | 'paper') {
  await page.evaluate((t) => {
    localStorage.setItem('manuscript.theme', t)
    location.hash = '#/text'
  }, theme)
  await page.reload()
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

test.describe('scene budget ring', () => {
  test('off by default; with a small norm it goes calm → near → over', async ({ page, isMobile }) => {
    await startStory(page)
    await typeInEditor(page, 'Слово '.repeat(5))
    // Off until the author asks for it (on a touch screen the counter itself is hidden, then).
    if (!isMobile) await expect(chip(page)).toBeVisible()
    await expect(ring(page)).toHaveCount(0)

    // «Об истории»: a norm of 300 characters and the toggle.
    await page.evaluate(() => (location.hash = '#/book'))
    await page.getByRole('button', { name: '+ длина главы' }).click()
    await setNorm(page, 300)
    await expect(page.getByLabel('Кольцо объёма у счётчика сцены')).not.toBeChecked()
    await page.getByLabel('Кольцо объёма у счётчика сцены').click()
    await expect(page.getByLabel('Кольцо объёма у счётчика сцены')).toBeChecked()

    await openText(page)
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await expect(ring(page)).toBeVisible()
    await expect(ring(page)).toHaveAttribute('aria-hidden', 'true')
    await expect(chip(page)).not.toHaveClass(/budget-(near|over)/)
    await expect(chip(page)).toHaveAttribute('aria-label', /бюджет сцены \d+ %/)

    // Past 80 %: 5 + 36 words of 6 characters = 246 of 300.
    await page.keyboard.type('Слово '.repeat(36))
    await expect(chip(page)).toHaveClass(/budget-near/)
    await expect(chip(page)).not.toContainText('+')

    // Past 100 %: the overflow appears next to the count.
    await page.keyboard.type('Слово '.repeat(20))
    await expect(chip(page)).toHaveClass(/budget-over/)
    await expect(chip(page)).toContainText(/\+\d+ зн\./)
    await expect(chip(page)).toHaveAttribute('aria-label', /бюджет сцены 1\d\d %/)
    await waitSaveTick(page)

    // The click popover has the budget row.
    await chip(page).click()
    await expect(page.locator('.stats-pop')).toContainText(/бюджет: .* из 300 зн\./)

    // Turning it off removes the ring again.
    await page.keyboard.press('Escape')
    await page.evaluate(() => (location.hash = '#/book'))
    await page.getByRole('button', { name: 'изменить' }).click()
    await page.getByLabel('Кольцо объёма у счётчика сцены').click()
    await openText(page)
    await expect(ring(page)).toHaveCount(0)
    if (!isMobile) await expect(chip(page)).toBeVisible()
  })

  test('a platform preset fills the norm and the unit', async ({ page }) => {
    await startStory(page)
    await typeInEditor(page, 'Слово ')
    await page.evaluate(() => (location.hash = '#/book'))
    await page.getByRole('button', { name: '+ длина главы' }).click()
    await page.getByRole('button', { name: 'Author.Today · 15–40 тыс. знаков' }).click()
    const fields = page.locator('.length-norm .num-input')
    await expect(fields.nth(0)).toHaveValue('15000')
    await expect(fields.nth(1)).toHaveValue('40000')
    await page.getByRole('button', { name: 'Фикбук · около 2000 слов' }).click()
    await expect(page.getByRole('button', { name: 'слова', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(fields.nth(0)).toHaveValue('')
    await expect(fields.nth(1)).toHaveValue('2000')
  })

  test('chip stays the same size class on the phone and the ring is not clipped', async ({ page }) => {
    await startStory(page)
    await typeInEditor(page, 'Слово '.repeat(5))
    await page.evaluate(() => (location.hash = '#/book'))
    await page.getByRole('button', { name: '+ длина главы' }).click()
    await setNorm(page, 300)
    await page.getByLabel('Кольцо объёма у счётчика сцены').click()
    await openText(page)
    const box = await chip(page).boundingBox()
    const vp = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height)
    const r = await ring(page).boundingBox()
    expect(Math.round(r!.width)).toBe(14)
  })
})

async function shot(page: Page, project: string, state: string) {
  const dir = SHOTS!
  const theme = await page.evaluate(() => localStorage.getItem('manuscript.theme') ?? 'light')
  // Whole viewport, so the chip is seen where it really sits.
  // The page fades while typing; wake it, as a mouse move would.
  await page.evaluate(() => window.dispatchEvent(new Event('mousemove')))
  await expect(page.locator('.write')).not.toHaveClass(/typing/)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${project}-${theme}-${state}.png` })
  const el = page.locator('.text-stats')
  await el.screenshot({ path: `${dir}/${project}-${theme}-${state}-chip.png` })
}

test('screenshots in every theme', async ({ page }, info) => {
  test.skip(!SHOTS || info.project.name === 'iphone', 'only when BUDGET_SHOTS is set (WebKit adds nothing here)')
  test.setTimeout(90_000)
  // The narrowest phone the app is checked on.
  if (info.project.name === 'phone') await page.setViewportSize({ width: 375, height: 812 })
  await startStory(page)
  await typeInEditor(page, 'Слово '.repeat(5))
  await page.evaluate(() => (location.hash = '#/book'))
  await page.getByRole('button', { name: '+ длина главы' }).click()
  await setNorm(page, 300)
  await page.getByLabel('Кольцо объёма у счётчика сцены').click()
  await waitSaveTick(page).catch(() => {})
  for (const theme of ['light', 'dark', 'paper'] as const) {
    await setTheme(page, theme)
    await openText(page)
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await expect(ring(page)).toBeVisible()
    await shot(page, info.project.name, 'calm')
    await page.keyboard.type('Слово '.repeat(36))
    await expect(chip(page)).toHaveClass(/budget-near/)
    await shot(page, info.project.name, 'near')
    await page.keyboard.type('Слово '.repeat(20))
    await expect(chip(page)).toHaveClass(/budget-over/)
    await shot(page, info.project.name, 'over')
    // Back to the short text for the next theme.
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Слово '.repeat(5))
    await page.waitForTimeout(1200)
    await waitSaveTick(page)
  }
})
