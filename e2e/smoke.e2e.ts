import { expect, test } from '@playwright/test'

test('a new story opens a page you can type into, with typography', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('- Привет... "Тест" -- проверка')
  await expect(editor.locator('p').first()).toHaveText('— Привет… «Тест» — проверка')
})
