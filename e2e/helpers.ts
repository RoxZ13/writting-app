import { expect, type Page } from '@playwright/test'

/** Raw rows of one IndexedDB table, read straight from the browser (no Dexie needed in the test). */
export async function dbAll<T = any>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    (table) =>
      new Promise<any[]>(async (resolve, reject) => {
        const names = ((await indexedDB.databases?.()) ?? []).map((d) => d.name ?? '')
        const name = names.find((n) => n === 'manuscript') ?? names.find((n) => n.includes('manuscript')) ?? 'manuscript'
        const open = indexedDB.open(name)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          try {
            const rq = db.transaction(table, 'readonly').objectStore(table).getAll()
            rq.onsuccess = () => {
              db.close()
              resolve(rq.result)
            }
            rq.onerror = () => {
              db.close()
              reject(rq.error)
            }
          } catch (e) {
            db.close()
            reject(e)
          }
        }
      }),
    table,
  )
}

export const aliveRows = async <T extends { deleted?: boolean }>(page: Page, table: string) =>
  (await dbAll<T>(page, table)).filter((r) => !r.deleted)

/** Plain text of a TipTap JSON document: paragraphs joined by a newline. */
export function docText(content: any): string {
  const walk = (n: any): string => {
    if (!n) return ''
    if (typeof n.text === 'string') return n.text
    const inner = (n.content ?? []).map(walk)
    return n.type === 'doc' ? inner.join('\n') : inner.join('')
  }
  return walk(content)
}

/** Open the app on an empty database, press «Начать историю», wait for the editor. Returns the editor locator. */
export async function startStory(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать историю' }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  // The editor appears as soon as the story exists, while «create» is still finishing and then calls go('#/text'):
  // wait for that, or a quick click on a tab gets overridden by it.
  await page.waitForFunction(() => location.hash.startsWith('#/text'))
  return editor
}

/** Click into the editor and type with the real keyboard. */
export async function typeInEditor(page: Page, text: string, opts: { end?: boolean } = {}) {
  const editor = page.locator('.ProseMirror')
  await editor.click()
  if (opts.end) await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

/** The "saved" tick next to the editor: no «Сохраняю…» any more. */
export async function waitSaveTick(page: Page) {
  await expect(page.locator('.save-state')).not.toHaveClass(/busy/, { timeout: 10_000 })
}

/** All scene texts currently in IndexedDB, joined (alive only). */
export async function allTexts(page: Page): Promise<{ id: string; text: string }[]> {
  const rows = await aliveRows<any>(page, 'texts')
  return rows.map((r) => ({ id: r.id, text: docText(r.content) }))
}

/** Poll IndexedDB until some scene text contains `needle`. */
export async function waitTextInDb(page: Page, needle: string, timeout = 10_000) {
  await expect
    .poll(async () => (await allTexts(page)).some((t) => t.text.includes(needle)), { timeout, message: `«${needle}» is in IndexedDB texts` })
    .toBe(true)
}

/** Id of the first alive scene of the (only) story. */
export async function firstSceneId(page: Page): Promise<string> {
  const scenes = (await aliveRows<any>(page, 'scenes')).sort((a, b) => a.order - b.order)
  return scenes[0].id
}

export const wordsIn = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length
