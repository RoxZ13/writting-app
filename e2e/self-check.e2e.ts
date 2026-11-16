import { expect, test } from '@playwright/test'

test('self-check is explicit and does not resize the writing page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  await page.getByRole('button', { name: 'Писать главу' }).click()

  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Город молчал. Город ждал. Город не спал.')
  await page.waitForTimeout(300)

  const pageBoxBefore = await page.locator('.editor-wrap').boundingBox()
  expect(pageBoxBefore).not.toBeNull()

  await page.locator('.write-top').getByRole('button', { name: /Ещё/ }).click()
  const menu = page.locator('.write-menu')
  await expect(menu.getByRole('button', { name: 'Самопроверка' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Исправить типографику' })).toBeVisible()
  await menu.getByRole('button', { name: 'Самопроверка' }).click()

  if ((await page.viewportSize())!.width > 760) {
    await expect(page.getByText('самопроверка', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Подсказки' })).toHaveClass(/on/)
  } else {
    // The compact top bar deliberately hides mode labels; the selected state
    // remains clear in the menu and the checks are visible in the text.
    await page.locator('.write-top').getByRole('button', { name: /Ещё/ }).click()
    await expect(page.locator('.write-menu').getByRole('button', { name: 'Самопроверка' })).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(page.locator('.ProseMirror .eh-repeat').first()).toBeVisible()

  const pageBoxAfter = await page.locator('.editor-wrap').boundingBox()
  expect(pageBoxAfter).not.toBeNull()
  expect(Math.abs(pageBoxAfter!.x - pageBoxBefore!.x)).toBeLessThan(1)
  expect(Math.abs(pageBoxAfter!.width - pageBoxBefore!.width)).toBeLessThan(1)
})
