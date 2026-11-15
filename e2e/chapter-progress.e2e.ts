import { expect, test, type Page } from '@playwright/test'
import { startStory, typeInEditor, waitSaveTick } from './helpers'

const SHOTS = process.env.PROGRESS_SHOTS

async function setChapterLimit(page: Page, max: number) {
  await page.evaluate(() => (location.hash = '#/book'))
  const plan = page.locator('.book-section-list > details').first()
  if (!(await plan.evaluate((element) => element.hasAttribute('open')))) await plan.locator('summary').click()
  await plan.getByRole('button', { name: /\+ длина главы|изменить/ }).click()
  const unit = page.getByRole('button', { name: 'знаки', exact: true })
  await unit.click()
  await expect(unit).toHaveAttribute('aria-pressed', 'true')
  const maxField = page.locator('.length-norm .num-input').nth(1)
  await maxField.fill(String(max))
  await maxField.blur()
  await expect(maxField).toHaveValue(String(max))
}

test('chapter goal stays visible and opens scene progress', async ({ page }, info) => {
  await startStory(page)
  await typeInEditor(page, 'Слово '.repeat(20))
  await waitSaveTick(page)
  await setChapterLimit(page, 1_000)
  await page.evaluate(() => (location.hash = '#/text'))

  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toBeVisible()
  await expect(trigger).toContainText(/\d+ \/ 1[\s ]?000 зн\./)
  await expect(trigger).toContainText('осталось')
  await trigger.click()

  const panel = page.getByRole('dialog', { name: /Прогресс главы/ })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('из 1 000 знаков')
  await expect(panel.locator('.chapter-progress-scene')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Отметить эту сцену готовой' }).click()
  await expect(panel).toContainText('1 готово')

  if (info.project.name !== 'desktop') {
    const box = await panel.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-chapter-progress.png` })
})

test('board gives every chapter a compact progress overview', async ({ page }) => {
  await startStory(page)
  await typeInEditor(page, 'Первый черновик сцены.')
  await waitSaveTick(page)
  await setChapterLimit(page, 5_000)
  await page.locator('.tabs-mobile:visible > button, .tabs-desktop:visible > button').filter({ hasText: 'Доска' }).click()
  await expect(page.locator('.board, .timeline')).toBeVisible()
  const progress = page.locator('.board-chapter-progress').first()
  await expect(progress).toBeVisible()
  await expect(progress).toContainText('/ 5 000 зн.')
  await expect(progress).toContainText('0 сцен готово')
})
