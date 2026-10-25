import { expect, test, type Page } from '@playwright/test'
import { aliveRows, dbAll, docText, firstSceneId, startStory, typeInEditor, waitSaveTick, waitTextInDb } from './helpers'

test.setTimeout(60_000)

const P1_HEAD = 'Он ждал '
const P1_ITALIC = 'долго'
const P1_TAIL = ' у моста.'
const P2 = 'Она не пришла вовсе.'
// The selection runs backwards from the end of the text: the second paragraph, the break, and «долго у моста.»
const PIECE_LEN = (P1_ITALIC + P1_TAIL).length + 1 + P2.length
const PIECE_TEXT = `${P1_ITALIC}${P1_TAIL}\n${P2}`

/** Two paragraphs, the first with an italic word, then select the end of the first and all of the second. */
async function writeAndSelect(page: Page) {
  await startStory(page)
  await typeInEditor(page, P1_HEAD)
  await page.keyboard.press('Control+i')
  await page.keyboard.type(P1_ITALIC)
  await page.keyboard.press('Control+i')
  await page.keyboard.type(P1_TAIL)
  await page.keyboard.press('Enter')
  await page.keyboard.type(P2)
  await waitSaveTick(page)
  await waitTextInDb(page, P2)
  for (let i = 0; i < PIECE_LEN; i++) await page.keyboard.press('Shift+ArrowLeft')
}

const stashButton = (page: Page) => page.getByRole('button', { name: 'В запас' })
const editorText = (page: Page) => page.locator('.ProseMirror').innerText()
const stashNotes = async (page: Page) => (await dbAll<any>(page, 'notes')).filter((n) => n.content)

async function sceneText(page: Page) {
  const id = await firstSceneId(page)
  const row = (await aliveRows<any>(page, 'texts')).find((t) => t.id === id)
  return docText(row?.content)
}

/** Stash the selection and wait until the text is gone from the editor and the note is written. */
async function stash(page: Page) {
  await expect(stashButton(page)).toBeVisible()
  await stashButton(page).click()
  await expect(page.locator('.toast')).toContainText('Убрано в запас')
  await expect.poll(async () => (await stashNotes(page)).length).toBe(1)
}

test.describe('«В запас»', () => {
  test('a. the piece leaves the text and becomes a note of the scene, with its italics', async ({ page }) => {
    await writeAndSelect(page)
    await stash(page)

    expect(await editorText(page)).not.toContain(P2)
    expect(await editorText(page)).not.toContain(P1_ITALIC)
    expect(await editorText(page)).toContain('Он ждал')
    // The text is saved without the piece.
    await expect.poll(async () => await sceneText(page)).not.toContain(P2)
    expect(await sceneText(page)).not.toContain(P1_ITALIC)

    const sceneId = await firstSceneId(page)
    const [note] = await stashNotes(page)
    expect(note.sceneId).toBe(sceneId)
    expect(note.kind).toBe('note')
    expect(note.archived).toBe(false)
    expect(note.deleted).toBeFalsy()
    expect(note.text).toBe(PIECE_TEXT)
    expect(JSON.stringify(note.content)).toContain('italic')
    expect(note.content.content).toHaveLength(2)
  })

  test('b. Ctrl+Z right after: the text is back exactly, the note is deleted, nothing doubles', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'a hardware keyboard shortcut')
    await writeAndSelect(page)
    const before = await editorText(page)
    await stash(page)
    await page.keyboard.press('Control+z')

    await expect.poll(() => editorText(page)).toBe(before)
    await expect.poll(async () => (await stashNotes(page))[0]?.deleted).toBe(true)
    expect((await stashNotes(page)).filter((n) => !n.deleted)).toHaveLength(0)
    await expect.poll(async () => await sceneText(page)).toContain(P2)
    // The italic mark came back with the text.
    await expect(page.locator('.ProseMirror em', { hasText: P1_ITALIC })).toHaveCount(1)
  })

  test('b2. Ctrl+Z after other typing is the ordinary undo: the note stays', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'a hardware keyboard shortcut')
    await writeAndSelect(page)
    await stash(page)
    await page.keyboard.type(' Потом.')
    await page.keyboard.press('Control+z')
    await expect.poll(() => editorText(page)).not.toContain('Потом')
    expect((await stashNotes(page)).filter((n) => !n.deleted)).toHaveLength(1)
    expect(await editorText(page)).not.toContain(P2)
  })

  test('b3. Ctrl+Z, then the toast «Отменить» too: the piece comes back once, not twice', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'a hardware keyboard shortcut')
    await writeAndSelect(page)
    const before = await editorText(page)
    await stash(page)
    await page.keyboard.press('Control+z')
    await expect.poll(() => editorText(page)).toBe(before)
    await page.locator('.toast-undo').click()
    await page.waitForTimeout(500)
    expect(await editorText(page)).toBe(before)
  })

  test('c. the toast «Отменить» does the same as Ctrl+Z', async ({ page }) => {
    await writeAndSelect(page)
    const before = await editorText(page)
    await stash(page)
    await page.locator('.toast-undo').click()

    await expect.poll(() => editorText(page)).toBe(before)
    await expect.poll(async () => (await stashNotes(page))[0]?.deleted).toBe(true)
    expect((await stashNotes(page)).filter((n) => !n.deleted)).toHaveLength(0)
    await expect.poll(async () => await sceneText(page)).toContain(P2)
    await expect(page.locator('.ProseMirror em', { hasText: P1_ITALIC })).toHaveCount(1)
  })

  test('d1. «Вернуть в текст» from the scene plan: inserted at the cursor, note archived', async ({ page }) => {
    await writeAndSelect(page)
    await stash(page)
    await page.getByTitle(/План сцены:/).click()
    const back = page.getByRole('button', { name: 'Вернуть в текст' })
    await expect(back).toBeVisible()
    await expect(page.locator('.pp-stash')).toContainText('Она не пришла вовсе.')
    await back.click()

    await expect.poll(() => editorText(page)).toContain(P2)
    await expect(page.locator('.ProseMirror em', { hasText: P1_ITALIC })).toHaveCount(1)
    await expect.poll(async () => (await stashNotes(page))[0]?.archived).toBe(true)
    expect((await stashNotes(page))[0].deleted).toBeFalsy()
    await expect(back).toHaveCount(0)
    await expect.poll(async () => await sceneText(page)).toContain(P2)
  })

  test('d2. «Вернуть в текст» from the inbox opens the scene first', async ({ page }) => {
    await writeAndSelect(page)
    await stash(page)
    await waitSaveTick(page)
    await page.evaluate(() => (location.hash = '#/inbox'))
    await expect(page.getByRole('heading', { name: 'Входящие' })).toBeVisible()
    await page.getByRole('button', { name: /Привязанные к сценам/ }).click()
    await expect(page.locator('.note-item')).toContainText('из сцены «')
    await page.getByRole('button', { name: 'Вернуть в текст' }).click()

    await page.waitForFunction(() => location.hash.startsWith('#/text/'))
    await expect.poll(() => editorText(page)).toContain(P2)
    await expect(page.locator('.ProseMirror em', { hasText: P1_ITALIC })).toHaveCount(1)
    await expect.poll(async () => (await stashNotes(page))[0]?.archived).toBe(true)
  })

  test('e. the selection menu is reachable with a touch selection too', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'touch devices only')
    await startStory(page)
    await typeInEditor(page, 'Он ждал долго у моста.')
    await waitSaveTick(page)
    // A double tap selects a word, as a long press does on the phone.
    const box = (await page.locator('.ProseMirror').boundingBox())!
    await page.touchscreen.tap(box.x + 8, box.y + 8)
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')
    await expect(stashButton(page)).toBeVisible()
    const b = (await stashButton(page).boundingBox())!
    const vw = page.viewportSize()!.width
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(vw)
    await stashButton(page).tap()
    await expect.poll(async () => (await stashNotes(page)).length).toBe(1)
    expect(await editorText(page)).not.toContain('Он ждал')
  })
})
