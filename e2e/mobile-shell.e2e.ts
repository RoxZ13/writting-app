import { expect, test } from '@playwright/test'
import { startStory } from './helpers'

test('the mobile shell behaves like an app surface', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone shell only')
  await page.goto('/')

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('maximum-scale=1')
  expect(viewport).toContain('user-scalable=no')

  await startStory(page)
  const tabs = page.locator('.tabs-mobile')
  await expect(tabs).toBeVisible()
  await expect(tabs.getByText('Текст', { exact: true })).toBeVisible()
  await expect(tabs.getByText('Доска', { exact: true })).toBeVisible()
  await expect(tabs.getByText('Герои', { exact: true })).toBeVisible()
  await expect(tabs.getByText('Заметки', { exact: true })).toBeVisible()

  await page.evaluate(() => { document.documentElement.dataset.keyboard = 'open' })
  await expect(tabs).toBeHidden()
  await page.evaluate(() => { document.documentElement.dataset.keyboard = 'closed' })
  await expect(tabs).toBeVisible()
})

test('chapter progress keeps plan controls in a separate sheet on phones', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone hierarchy only')
  await startStory(page)
  await page.locator('.chapter-progress-trigger').click()

  const progress = page.getByRole('dialog', { name: /Прогресс главы/ })
  await expect(progress).toBeVisible()
  await expect(progress.locator('.chapter-goal-settings')).toHaveCount(0)
  await expect(progress.locator('.chapter-progress-book')).not.toHaveAttribute('open', '')

  await progress.getByRole('button', { name: 'Цели' }).click()
  const goals = page.getByRole('dialog', { name: 'Цели книги и главы' })
  await expect(goals).toBeVisible()
  await expect(goals.getByText('Книга', { exact: true })).toBeVisible()
  await expect(goals.getByText('Общий диапазон главы', { exact: true })).toBeVisible()
})

test('the phone board starts with the next writing action, not repeated headings', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone hierarchy only')
  await startStory(page)
  await page.locator('.tabs-mobile > button').filter({ hasText: 'Доска' }).click()

  const resume = page.locator('.continue-card')
  const structure = page.locator('.timeline')
  await expect(resume).toBeVisible()
  await expect(structure).toBeVisible()
  const resumeBox = await resume.boundingBox()
  const structureBox = await structure.boundingBox()
  expect(resumeBox).not.toBeNull()
  expect(structureBox).not.toBeNull()
  expect(resumeBox!.y).toBeLessThan(structureBox!.y)
  await expect(page.getByRole('heading', { name: 'Доска' })).toHaveClass(/sr-only/)
})

test('a chapter with one text opens the editor in one tap', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone navigation only')
  await startStory(page)
  await page.locator('.tabs-mobile > button').filter({ hasText: 'Доска' }).click()
  const add = page.getByPlaceholder('Новая сцена').first()
  await add.fill('Цельная глава')
  await add.press('Enter')

  await expect(page.locator('.tl-scene').filter({ hasText: 'Цельная глава' })).toHaveCount(0)
  const chapter = page.locator('.tl-chapter').filter({ hasText: 'Глава 1' }).locator('.tl-head')
  await expect(chapter.locator('.tl-caret')).toHaveText('→')
  await chapter.click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/#\/text\//)
})
