import { expect, test } from '@playwright/test'
import { aliveRows, firstSceneId, startStory, waitTextInDb } from './helpers'

test('a saved sync version can be compared and restored from the cloud notice', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  const editor = await startStory(page)
  await editor.fill('Текст, который был в редакторе.')
  await waitTextInDb(page, 'Текст, который был в редакторе.')
  const sceneId = await firstSceneId(page)
  const [scene] = await aliveRows<any>(page, 'scenes')
  await page.evaluate(async ({ sceneId, scene }) => {
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('manuscript')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction(['snapshots', 'conflicts'], 'readwrite')
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
        transaction.objectStore('conflicts').put({
          id: 'sample-derived', table: 'scenes', recordId: sceneId, projectId: scene.projectId,
          createdAt: now, updatedAt: now, reason: 'Одновременная правка',
          losing: { ...scene, charCount: 480 }, winning: { ...scene, charCount: 474 },
        })
        transaction.objectStore('conflicts').put({
          id: 'sample-project-activity', table: 'projects', recordId: scene.projectId, projectId: scene.projectId,
          createdAt: now, updatedAt: now, reason: 'Одновременная правка',
          losing: { id: scene.projectId, updatedAt: now, lastSceneId: 'a', progress: { '2026-01-01': 30 } },
          winning: { id: scene.projectId, updatedAt: now, lastSceneId: 'b', progress: { '2026-01-01': 40 } },
        })
        transaction.objectStore('snapshots').put({
          id: 'sample-alternate', sceneId, projectId: scene.projectId, createdAt: now, updatedAt: now, wordCount: 4,
          reason: 'Версия с другого устройства (конфликт синхронизации)',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст с другого устройства.' }] }] },
        })
      }
    })
  }, { sceneId, scene })
  await page.reload()
  await page.getByRole('button', { name: /^Разобрать версии/ }).click()
  await expect(page).toHaveURL(/#\/settings\/versions$/)
  const review = page.getByRole('region', { name: 'Разобрать версии' })
  await expect(review.getByText('Настройки и другие правки')).toHaveCount(0)
  await review.locator('summary').click()
  await expect(review).toContainText('Текст, который был в редакторе.')
  await expect(review).toContainText('Текст с другого устройства.')
  await review.getByRole('button', { name: 'Вернуть сохранённый текст' }).click()
  await expect(review).toContainText('Нет сохранённых версий для сравнения.')
  await waitTextInDb(page, 'Текст с другого устройства.')
  const versions = await aliveRows<any>(page, 'snapshots')
  expect(versions).toHaveLength(2)
  expect(versions.find((version) => version.reason === 'Перед восстановлением версии')).toBeDefined()
  expect(versions.find((version) => version.id === 'sample-alternate')?.syncReviewed).toBe(true)
})
