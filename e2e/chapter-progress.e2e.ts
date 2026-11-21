import { expect, test, type Page } from '@playwright/test'
import { openChapterProgress, openWorkspaceTab, setChapterMaximum, startStory, typeInEditor, waitSaveTick, waitTextInDb } from './helpers'

const SHOTS = process.env.PROGRESS_SHOTS

async function setChapterRangeHere(page: Page, min: number, max: number) {
  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toHaveCount(0)
  const panel = await openChapterProgress(page)
  await panel.getByRole('button', { name: 'Цели' }).click()
  const goals = page.getByRole('dialog', { name: 'Цели книги и главы' })
  const common = goals.locator('.goal-settings-group').filter({ hasText: 'Общий объём главы' })
  await common.getByLabel('Максимум, знаков').fill(String(max))
  await common.getByLabel('Максимум, знаков').blur()
  await common.getByText('Добавить минимум', { exact: true }).click()
  await common.getByLabel('Минимум, знаков').fill(String(min))
  await common.getByLabel('Минимум, знаков').blur()
  await expect(panel).toContainText(`До целевого диапазона осталось`)
  await goals.getByRole('button', { name: 'Закрыть цели' }).click()
  await panel.getByRole('button', { name: 'Закрыть' }).click()
}

test('a whole chapter has its own writing goal and completion status', async ({ page }, info) => {
  await startStory(page)
  await typeInEditor(page, 'Слово '.repeat(20))
  await waitSaveTick(page)
  await setChapterRangeHere(page, 600, 1_000)

  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toBeVisible()
  if (info.project.name === 'desktop') {
    await expect(trigger).toContainText(/\d+ зн\./)
    await expect(trigger).toContainText(/· 600–1[\s ]?000/)
  } else {
    await expect(trigger).toContainText(/\d+ · 600–1[\s ]?000/)
  }
  await expect(trigger.locator('.chapter-progress-percent')).toHaveCount(0)
  await trigger.click()

  const panel = page.getByRole('dialog', { name: /Прогресс главы/ })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('знаков написано')
  await expect(panel).toContainText('До целевого диапазона осталось')
  await expect(panel.locator('.chapter-progress-scene')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Отметить главу готовой' }).click()
  await expect(panel).toContainText('Глава отмечена готовой')

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

test('the board shows a whole chapter’s volume goal without extra navigation', async ({ page, isMobile }) => {
  await startStory(page)
  await typeInEditor(page, 'Первый черновик сцены.')
  await waitSaveTick(page)
  await setChapterRangeHere(page, 3_000, 5_000)
  await openWorkspaceTab(page, 'Доска')
  await expect(page.locator('.board, .timeline')).toBeVisible()
  const progress = page.locator('.board-chapter-progress').first()
  await expect(progress).toBeVisible()
  await expect(progress).toContainText(/цель 3\s000–5\s000/)
  if (isMobile) await expect(page.locator('.tl-chapter').filter({ hasText: 'Глава 1' }).locator('.tl-caret')).toHaveText('→')
})

test('selecting a publishing platform leaves the chapter volume optional', async ({ page }) => {
  const editor = await startStory(page)
  await editor.fill('Черновик без установленной цели.')
  await page.goto('/#/book')
  await page.locator('summary', { hasText: 'Публикация' }).click()
  await page.getByRole('group', { name: 'Площадка публикации' }).getByRole('button', { name: 'Фикбук', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Площадка публикации' }).getByRole('button', { name: 'Фикбук', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/text')
  await expect(editor).toBeVisible()
  await expect(page.locator('.chapter-meter')).toHaveCount(0)
})

test('a maximum alone fills by the written amount and clearing it removes the meter', async ({ page }) => {
  const editor = await startStory(page)
  await editor.fill('Короткий текст.')
  await waitTextInDb(page, 'Короткий текст.')
  await setChapterMaximum(page, 1500)
  const meter = page.locator('.chapter-progress-trigger')
  await expect(meter).toBeVisible()
  await expect(meter.locator('.chapter-target-band')).toHaveCount(0)
  expect(await meter.locator('.chapter-progress-fill').evaluate((element) => parseFloat((element as HTMLElement).style.width))).toBeCloseTo(1)
  await setChapterMaximum(page)
  await expect(meter).toHaveCount(0)
  await expect(editor).toHaveText('Короткий текст.')
})
