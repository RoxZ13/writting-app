import { expect, test } from '@playwright/test'
import { startStory } from './helpers'

test('storage diagnostics explain the active local database without exposing text', async ({ page }) => {
  await startStory(page)
  await page.goto('/#/settings')

  await page.getByText('Хранение и диагностика').click()
  await expect(page.getByText('Истории / сцены / версии')).toBeVisible()
  await expect(page.getByText('1 / 1 / 0')).toBeVisible()
  await expect(page.getByText('Ждёт облако')).toBeVisible()
  await expect(page.getByText(/http:\/\/localhost:\d+ · manuscript/)).toBeVisible()
  await expect(page.getByText('Отчёт содержит только технические параметры')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать отчёт' }).click()
  await expect((await download).suggestedFilename()).toMatch(/^manuscript-diagnostics-\d{4}-\d{2}-\d{2}\.json$/)
})
