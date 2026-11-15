import { expect, test, type Page } from '@playwright/test'
import { startStory, typeInEditor, waitSaveTick } from './helpers'

const SHOTS = process.env.PROGRESS_SHOTS

async function setChapterLimitHere(page: Page, max: number) {
  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toContainText('Задать цель главы')
  await trigger.click()
  const panel = page.getByRole('dialog', { name: /Прогресс главы/ })
  const input = panel.getByLabel('Цель главы')
  await input.fill(String(max))
  await input.blur()
  await expect(panel).toContainText(`из ${max.toLocaleString('ru-RU')} знаков`)
  await panel.getByRole('button', { name: 'Закрыть' }).click()
}

test('chapter goal stays visible and opens scene progress', async ({ page }, info) => {
  await startStory(page)
  await typeInEditor(page, 'Слово '.repeat(20))
  await waitSaveTick(page)
  await setChapterLimitHere(page, 1_000)

  const trigger = page.locator('.chapter-progress-trigger')
  await expect(trigger).toBeVisible()
  await expect(trigger).toContainText(/\d+ из 1[\s ]?000 знаков/)
  await expect(trigger).toContainText(/\d+%/)
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
  await setChapterLimitHere(page, 5_000)
  await page.locator('.tabs-mobile:visible > button, .tabs-desktop:visible > button').filter({ hasText: 'Доска' }).click()
  await expect(page.locator('.board, .timeline')).toBeVisible()
  const progress = page.locator('.board-chapter-progress').first()
  await expect(progress).toBeVisible()
  await expect(progress).toContainText('/ 5 000 зн.')
  await expect(progress).toContainText('0 сцен готово')
})
