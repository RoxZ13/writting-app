import { expect, test, type Locator, type Page } from '@playwright/test'
import { aliveRows, startStory } from './helpers'

const openTab = (page: Page, name: 'Доска' | 'Герои') => page.locator('.tabs-mobile > button', { hasText: name }).click()

test.describe('mobile actions stay reachable', () => {
  test.beforeEach(async ({ isMobile }) => test.skip(!isMobile, 'phone layout'))

  test('a hero is added with a visible button, not only the keyboard Enter key', async ({ page }) => {
    await startStory(page)
    await openTab(page, 'Герои')
    await page.getByPlaceholder('Имя нового героя').fill('Арина')
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await expect(page.locator('.hero-row').filter({ hasText: 'Арина' })).toBeVisible()
    await expect(page.getByPlaceholder('Имя нового героя')).toBeFocused()
    await expect.poll(async () => (await aliveRows<any>(page, 'characters')).map((c) => c.name)).toContain('Арина')
  })

  test('holding a scene opens actions without a visible ellipsis, and duplication is undoable', async ({ page }) => {
    await startStory(page)
    await openTab(page, 'Доска')
    const add = page.getByPlaceholder('+ сцена: кратко, что происходит').first()
    await add.fill('Поворот сюжета')
    await add.press('Enter')
    const row = page.locator('.tl-scene').filter({ hasText: 'Поворот сюжета' })
    await expect(row).not.toContainText('⋯')
    await row.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 180, clientY: 300 })
    await page.waitForTimeout(480)
    await row.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 180, clientY: 300 })
    const actions = page.getByRole('dialog', { name: 'Действия со сценой «Поворот сюжета»' })
    await expect(actions).toBeVisible()
    await expect(page.locator('.modal-back')).toHaveCount(0)
    const rowBox = await row.boundingBox()
    const actionBox = await actions.boundingBox()
    expect(actionBox!.y).toBeGreaterThanOrEqual(rowBox!.y)
    await actions.getByRole('button', { name: /Дублировать/ }).click()
    await expect.poll(async () => (await aliveRows<any>(page, 'scenes')).filter((scene) => scene.title.startsWith('Поворот сюжета')).length).toBe(2)
    await page.getByRole('button', { name: 'Отменить' }).click()
    await expect.poll(async () => (await aliveRows<any>(page, 'scenes')).filter((scene) => scene.title.startsWith('Поворот сюжета')).length).toBe(1)
  })

  test('heroes are a compact list and only the selected hero exposes editable details', async ({ page }) => {
    await startStory(page)
    await openTab(page, 'Герои')
    for (const name of ['Арина', 'Макс', 'Наставник']) {
      await page.getByPlaceholder('Имя нового героя').fill(name)
      await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    }
    await expect(page.locator('.hero-row')).toHaveCount(3)
    await expect(page.getByRole('textbox', { name: 'Имя героя' })).toHaveCount(0)
    await page.locator('.hero-row').filter({ hasText: 'Арина' }).click()
    await expect(page.getByRole('textbox', { name: 'Имя героя' })).toHaveValue('Арина')
    await expect(page.getByRole('textbox', { name: 'Имя героя' })).toHaveCount(1)
  })

  test('a scene can be deleted directly from its phone sheet', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept())
    await startStory(page)
    await openTab(page, 'Доска')
    const add = page.getByPlaceholder('+ сцена: кратко, что происходит').first()
    await add.fill('Лишняя сцена')
    await add.press('Enter')
    await page.locator('.tl-scene').filter({ hasText: 'Лишняя сцена' }).click()
    const sheet = page.getByRole('dialog', { name: 'Сцена' })
    await sheet.getByRole('button', { name: 'Удалить сцену', exact: true }).click()
    await expect(sheet).toBeHidden()
    await expect.poll(async () => (await aliveRows<any>(page, 'scenes')).some((s) => s.title === 'Лишняя сцена')).toBe(false)
  })

  test('a chapter has a touch menu and can be deleted', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept())
    await startStory(page)
    await openTab(page, 'Доска')
    await page.getByRole('button', { name: '+ Глава', exact: true }).click()
    const chapter = page.locator('.tl-chapter').filter({ hasText: 'Глава 2' }).locator('.tl-head')
    await expect(chapter).not.toContainText('⋯')
    await chapter.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 180, clientY: 300 })
    await page.waitForTimeout(480)
    await chapter.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 180, clientY: 300 })
    const dialog = page.getByRole('dialog', { name: 'Действия с главой «Глава 2»' })
    await expect(page.locator('.modal-back')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Удалить главу' }).click()
    await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await aliveRows<any>(page, 'chapters')).filter((c) => !c.pool).length).toBe(1)
  })

  test('leaving a half-written scene does not create an accidental duplicate', async ({ page }) => {
    await startStory(page)
    await openTab(page, 'Доска')
    const before = (await aliveRows<any>(page, 'scenes')).length
    const add = page.getByPlaceholder('+ сцена: кратко, что происходит').first()
    await add.fill('Черновик, который пока не добавляем')
    await page.getByRole('button', { name: 'Герои', exact: true }).click()
    await expect.poll(async () => (await aliveRows<any>(page, 'scenes')).length).toBe(before)
  })

  test('book parameters no longer occupy a bottom navigation slot', async ({ page }) => {
    await startStory(page)
    await expect(page.locator('.tabs').getByText('История', { exact: true })).toHaveCount(0)
    await page.locator('.project-name').click()
    await expect(page.getByText('Параметры книги', { exact: true })).toBeVisible()
    await page.locator('.tabs-mobile > button').filter({ hasText: 'Входящие' }).click()
    await expect(page.getByRole('heading', { name: 'Входящие' })).toBeVisible()
  })

  test('the scene list opens only on request as a bottom sheet and controls do not overlap', async ({ page }) => {
    // Narrower than current iPhones: if it fits here, ordinary phones have room too.
    const viewport = { width: 320, height: 700 }
    await page.setViewportSize(viewport)
    await startStory(page)
    const sheet = page.locator('.write-side')
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Сцены', { exact: true })).toBeVisible()
    await page.getByTitle('Показать сцены').click()
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThan(150)
    expect(Math.abs(box!.y + box!.height - viewport.height)).toBeLessThanOrEqual(2)
    await expect(sheet.getByRole('navigation', { name: 'Главы и сцены' })).toBeVisible()

    await assertNoOverlap(page.locator('.write-top').getByRole('button'))
    await assertNoOverlap(page.locator('.tabs > button'))
  })
})

async function assertNoOverlap(locator: Locator) {
  const boxes = (await locator.evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const r = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      .map((node) => {
        const r = node.getBoundingClientRect()
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, text: node.getAttribute('aria-label') || node.textContent || '' }
      }),
  )) as { x: number; y: number; right: number; bottom: number; text: string }[]
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlaps = a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1
      expect(overlaps, `«${a.text.trim()}» overlaps «${b.text.trim()}»`).toBe(false)
    }
  }
}
