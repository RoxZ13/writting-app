import { expect, test } from '@playwright/test'
test('the «⋯» menu closes on a tap outside it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  const ed = page.locator('.ProseMirror')
  await ed.click()
  await page.keyboard.type('Абзац один. Абзац один. Абзац один.')
  await page.waitForTimeout(1200)
  await page.locator('.write-top').getByRole('button', { name: /Ещё/ }).click()
  const menu = page.locator('.write-menu')
  await expect(menu).toBeVisible()
  const box = (await page.viewportSize())!
  await page.mouse.click(30, box.height * 0.75)
  await expect(menu).toBeHidden()
})
