import { expect, test } from '@playwright/test'
import { aliveRows, firstSceneId, startStory, waitTextInDb } from './helpers'

test('a saved sync version can be compared and restored from the cloud notice', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  const editor = await startStory(page)
  await editor.fill('Текст, который был в редакторе.')
  await waitTextInDb(page, 'Текст, который был в редакторе.')
  const sceneId = await firstSceneId(page)
  const [{ projectId }] = await aliveRows<any>(page, 'scenes')
  await page.evaluate(async ({ sceneId, projectId }) => {
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('manuscript')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('snapshots', 'readwrite')
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
        transaction.objectStore('snapshots').put({
          id: 'sample-alternate', sceneId, projectId, createdAt: now, updatedAt: now, wordCount: 4,
          reason: 'Версия с другого устройства (конфликт синхронизации)',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст с другого устройства.' }] }] },
        })
      }
    })
  }, { sceneId, projectId })
  await page.reload()
  await page.getByRole('button', { name: /^Разобрать версии/ }).click()
  await expect(page).toHaveURL(/#\/settings\/versions$/)
  const review = page.getByRole('region', { name: 'Разобрать версии' })
  await review.locator('summary').click()
  await expect(review).toContainText('Текст, который был в редакторе.')
  await expect(review).toContainText('Текст с другого устройства.')
  await review.getByRole('button', { name: 'Вернуть сохранённый текст' }).click()
  await expect(review).toContainText('Нет версий, которые ждут проверки.')
  await waitTextInDb(page, 'Текст с другого устройства.')
  const versions = await aliveRows<any>(page, 'snapshots')
  expect(versions).toHaveLength(2)
  expect(versions.find((version) => version.reason === 'Перед восстановлением версии')).toBeDefined()
  expect(versions.find((version) => version.id === 'sample-alternate')?.syncReviewed).toBe(true)
})
