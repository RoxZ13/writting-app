import { expect, test } from '@playwright/test'

test('a new story opens a page you can type into, with typography', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  await page.getByRole('button', { name: 'Начать с фразы' }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('- Привет... "Тест" -- проверка')
  await expect(editor.locator('p').first()).toHaveText('— Привет… «Тест» — проверка')
})

test('a new author can start from scenes and sees the empty idea pool', async ({ page, isMobile }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  await expect(page.getByRole('button', { name: 'Начать с фразы' })).toBeVisible()
  await page.getByRole('button', { name: 'Набросать сцены' }).click()
  await expect(page.locator('.board, .timeline')).toBeVisible()
  if (isMobile) await expect(page.getByText('Идеи сцен', { exact: true })).toBeVisible()
})
