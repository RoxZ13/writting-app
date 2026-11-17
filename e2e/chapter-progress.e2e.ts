import { expect, test, type Page } from '@playwright/test'
import { startStory, typeInEditor, waitSaveTick } from './helpers'

const SHOTS = process.env.PROGRESS_SHOTS

async function setChapterRangeHere(page: Page, min: number, max: number) {
  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toContainText('задать диапазон')
  await trigger.click()
  const panel = page.getByRole('dialog', { name: /Прогресс главы/ })
  await panel.getByRole('button', { name: 'Цели' }).click()
  const goals = page.getByRole('dialog', { name: 'Цели книги и главы' })
  const common = goals.locator('.goal-settings-group').filter({ hasText: 'Общий диапазон главы' })
  await common.getByLabel('От').fill(String(min))
  await common.getByLabel('От').blur()
  await common.getByLabel('До').fill(String(max))
  await common.getByLabel('До').blur()
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
    await expect(trigger).toContainText(/цель 600–1[\s ]?000/)
  } else {
    await expect(trigger).toContainText(/\d+ из 600–1[\s ]?000/)
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
  await page.locator('.tabs-mobile:visible > button, .tabs-desktop:visible > button').filter({ hasText: 'Доска' }).click()
  await expect(page.locator('.board, .timeline')).toBeVisible()
  const progress = page.locator('.board-chapter-progress').first()
  await expect(progress).toBeVisible()
  await expect(progress).toContainText(/цель 3\s000–5\s000/)
  if (isMobile) await expect(page.locator('.tl-chapter').filter({ hasText: 'Глава 1' }).locator('.tl-caret')).toHaveText('→')
})
