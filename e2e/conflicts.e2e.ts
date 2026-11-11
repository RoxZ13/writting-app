import { expect, test } from '@playwright/test'
import { aliveRows, dbAll, startStory } from './helpers'

test('an archived metadata conflict can be reviewed and restored', async ({ page }) => {
  await startStory(page)
  const conflictId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('manuscript')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const database = open.result
          const read = database.transaction('projects', 'readonly').objectStore('projects').getAll()
          read.onerror = () => reject(read.error)
          read.onsuccess = () => {
            const project = read.result.find((row) => !row.deleted)
            const id = 'e2e-conflict-project-title'
            const now = Date.now()
            const conflict = {
              id,
              table: 'projects',
              recordId: project.id,
              projectId: project.id,
              losing: { ...project, title: 'Название с телефона' },
              winning: { ...project, title: 'Новая история' },
              reason: 'Одновременная правка на разных устройствах',
              createdAt: now,
              updatedAt: now,
            }
            const write = database.transaction('conflicts', 'readwrite').objectStore('conflicts').put(conflict)
            write.onerror = () => reject(write.error)
            write.onsuccess = () => {
              database.close()
              resolve(id)
            }
          }
        }
      }),
  )

  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Сохранены конфликтующие правки' })).toBeVisible()
  await page.getByText('История: Новая история').click()
  await expect(page.getByText('Название с телефона')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Вернуть сохранённый вариант' }).click()
  await expect(page.getByText('Сохранённый вариант возвращён')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сохранены конфликтующие правки' })).toHaveCount(0)

  await expect.poll(async () => (await aliveRows<any>(page, 'projects'))[0]?.title).toBe('Название с телефона')
  expect((await dbAll<any>(page, 'conflicts')).find((row) => row.id === conflictId)?.deleted).toBe(true)
})
