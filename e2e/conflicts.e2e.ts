import { expect, test, type Page } from '@playwright/test'
import { aliveRows, dbAll, startStory } from './helpers'

async function seedConflict(page: Page, chapterGoal: boolean) {
  await startStory(page)
  return page.evaluate((chapterGoal) => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('manuscript')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(['projects', 'conflicts'], 'readwrite')
      const projects = tx.objectStore('projects')
      const id = chapterGoal ? 'chapter-goal-conflict' : 'title-conflict'
      tx.oncomplete = () => { db.close(); resolve(id) }
      tx.onerror = () => { db.close(); reject(tx.error) }
      const read = projects.getAll()
      read.onsuccess = () => {
        const project = read.result.find((row) => !row.deleted)
        const latest = chapterGoal ? { ...project, chapterMax: 19_000 } : { ...project, title: 'Актуальное название' }
        projects.put(latest)
        const now = Date.now()
        tx.objectStore('conflicts').put({
          id, table: 'projects', recordId: project.id, projectId: project.id, createdAt: now, updatedAt: now,
          reason: 'Одновременная правка на разных устройствах',
          losing: chapterGoal ? { ...project, chapterMax: 15_000 } : { ...project, title: 'Название с телефона', lastSceneId: 'previous-scene', progress: { '2026-01-01': 123 } },
          winning: chapterGoal ? { ...project, chapterMax: 24_000 } : { ...project, title: 'Название во время синхронизации', lastSceneId: 'working-scene' },
        })
      }
    }
  }), chapterGoal)
}

test('a metadata comparison shows the actual current title and applies the archived title', async ({ page }) => {
  const conflictId = await seedConflict(page, false)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Настройки и другие правки' })).toBeVisible()
  await page.getByText('Сравнить правки', { exact: true }).click()
  const comparison = page.locator('.sync-setting-values')
  await expect(comparison.getByText('Актуальное название', { exact: true })).toBeVisible()
  await expect(comparison.getByText('Название с телефона', { exact: true })).toBeVisible()
  await expect(page.getByText('Название во время синхронизации')).toHaveCount(0)
  await expect(page.getByText('lastSceneId', { exact: true })).toHaveCount(0)
  await expect(page.getByText('progress', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Применить сохранённые значения' }).click()
  await expect(page.getByText('Сохранённые значения применены')).toBeVisible()
  await expect.poll(async () => (await aliveRows<any>(page, 'projects'))[0]?.title).toBe('Название с телефона')
  expect((await dbAll<any>(page, 'conflicts')).find((row) => row.id === conflictId)?.deleted).toBe(true)
})

for (const choice of ['apply', 'keep'] as const) {
  test(`a chapter maximum comparison lets the author ${choice} the shown value`, async ({ page }) => {
    await seedConflict(page, true)
    await page.goto('/#/settings/versions')
    await page.getByText(/Сравнить правки · Общий верхний ориентир главы/).click()
    const comparison = page.locator('.sync-setting-values')
    await expect(comparison).toContainText(/Сейчас в книге\s*19\s000 знаков/)
    await expect(comparison).toContainText(/Сохранённое значение\s*15\s000 знаков/)
    await expect(page.getByText('chapterMax', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/24\s000 знаков/)).toHaveCount(0)
    await page.getByRole('button', { name: choice === 'apply' ? /Применить: 15\s000 знаков/ : /Оставить: 19\s000 знаков/ }).click()
    await expect(page.getByRole('heading', { name: 'Настройки и другие правки' })).toHaveCount(0)
    expect((await aliveRows<any>(page, 'projects'))[0].chapterMax).toBe(choice === 'apply' ? 15_000 : 19_000)
  })
}
