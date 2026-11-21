import { expect, test, type Page } from '@playwright/test'
import { startStory } from './helpers'

async function openLengthNorm(page: Page) {
  const plan = page.locator('.book-section-list > details').first()
  if (!(await plan.evaluate((element) => element.hasAttribute('open')))) await plan.locator('summary').click()
  await plan.getByRole('button', { name: /\+ длина главы|изменить/ }).click()
}

test('a platform preset fills the norm and the unit', async ({ page }) => {
  await startStory(page)
  await page.evaluate(() => (location.hash = '#/book'))
  await openLengthNorm(page)
  await page.getByRole('button', { name: 'Author.Today · 15–40 тыс. знаков' }).click()
  const fields = page.locator('.length-norm .num-input')
  await expect(fields.nth(0)).toHaveValue('15000')
  await expect(fields.nth(1)).toHaveValue('40000')
  await page.getByRole('button', { name: 'Фикбук · около 2000 слов' }).click()
  await expect(page.getByRole('button', { name: 'слова', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(fields.nth(0)).toHaveValue('')
  await expect(fields.nth(1)).toHaveValue('2000')
})
