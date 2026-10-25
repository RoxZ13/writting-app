import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { aliveRows, allTexts, dbAll, docText, firstSceneId, startStory, typeInEditor, waitSaveTick, waitTextInDb, wordsIn } from './helpers'

test.setTimeout(45_000)

/**
 * A journey that exposes a real product bug stays in the suite as an expected failure (test.fail).
 * Run with E2E_SHOW_BUGS=1 to see the actual failure instead of the "expected to fail" pass.
 */
const knownBug = (note: string) => test.fail(!process.env.E2E_SHOW_BUGS, note)

/** Open a top-level tab (Текст / Доска / Герои) — they are plain buttons in the header on both layouts. */
const openTab = (page: Page, name: 'Текст' | 'Доска') => page.locator('.tabs > button', { hasText: name }).first().click()

const board = (page: Page) => openTab(page, 'Доска')

/** Add a scene with the one-line input of the first chapter on the board (desktop column / phone timeline). */
async function addSceneOnBoard(page: Page, title: string, nth = 0) {
  const input = page.getByPlaceholder('+ сцена: кратко, что происходит').nth(nth)
  await input.click()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(page.locator('.card-scene, .tl-scene').filter({ hasText: title })).toBeVisible()
}

// ---------------------------------------------------------------------------------------------
test.describe('1. text survives a reload', () => {
  test('typed paragraph is still there after reload', async ({ page }) => {
    const editor = await startStory(page)
    const phrase = 'Ветер стих, и в окнах напротив зажёгся свет'
    await typeInEditor(page, phrase)
    await waitSaveTick(page)
    await waitTextInDb(page, phrase)
    await page.reload()
    await expect(page.locator('.ProseMirror')).toContainText(phrase)
    expect(await editor.count()).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('2. close-tab guard', () => {
  test('beforeunload is cancelled while text is unsaved, and allowed once saved', async ({ page }) => {
    await startStory(page)
    const fire = () =>
      page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(e)
        return e.defaultPrevented
      })
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Не закрывай меня')
    // Straight after the last key — inside the 800 ms quiet window.
    expect(await fire(), 'unsaved text must ask before closing').toBe(true)
    await waitSaveTick(page)
    await waitTextInDb(page, 'Не закрывай меня')
    expect(await fire(), 'saved text must not block closing').toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('3. board basics', () => {
  test('add a scene, open its card, go to writing it', async ({ page }) => {
    await startStory(page)
    await board(page)
    await addSceneOnBoard(page, 'Погоня в тумане')
    const card = page.locator('.card-scene, .tl-scene').filter({ hasText: 'Погоня в тумане' })
    await card.click()
    const sheet = page.getByRole('dialog', { name: 'Сцена' })
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.sheet-title')).toBeVisible()
    await sheet.getByRole('button', { name: /Писать эту сцену/ }).click()
    await expect(page).toHaveURL(/#\/text\/.+/)
    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await typeInEditor(page, 'Туман стоял стеной')
    await waitSaveTick(page)
    // the text landed in THIS scene
    const scenes = await aliveRows<any>(page, 'scenes')
    const scene = scenes.find((s) => s.title === 'Погоня в тумане')
    expect(scene, 'the scene created on the board exists').toBeTruthy()
    const texts = await allTexts(page)
    expect(texts.find((t) => t.id === scene.id)?.text).toContain('Туман стоял стеной')
  })
})

// ---------------------------------------------------------------------------------------------
/** Story with two chapters: «А» and «Б» in chapter 1, chapter 2 empty. Desktop only (phone has no dragging). */
async function twoChapterBoard(page: Page) {
  await startStory(page)
  await board(page)
  await addSceneOnBoard(page, 'Сцена А')
  await addSceneOnBoard(page, 'Сцена Б')
  await page.getByRole('button', { name: '+ Глава' }).click()
  await expect(page.locator('.column:not(.pool)')).toHaveCount(2)
}

async function sceneChapters(page: Page) {
  const chapters = (await aliveRows<any>(page, 'chapters')).filter((c) => !c.pool).sort((a, b) => a.order - b.order)
  const scenes = await aliveRows<any>(page, 'scenes')
  const a = scenes.find((s) => s.title === 'Сцена А')
  const b = scenes.find((s) => s.title === 'Сцена Б')
  return { chapters, a, b }
}

async function dragCardToColumn(page: Page, cardText: string, columnIndex: number) {
  const card = page.locator('.card-scene').filter({ hasText: cardText })
  const target = page.locator('.column:not(.pool)').nth(columnIndex)
  await target.scrollIntoViewIfNeeded()
  const from = (await card.boundingBox())!
  const to = (await target.locator('.cards').boundingBox())!
  const sx = from.x + from.width / 2
  const sy = from.y + from.height / 2
  const tx = to.x + to.width / 2
  const ty = to.y + Math.min(to.height / 2, 60)
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 12, sy + 12, { steps: 4 })
  await page.mouse.move(tx, ty, { steps: 25 })
  await page.mouse.move(tx + 2, ty + 2, { steps: 3 })
  await page.mouse.up()
}

test.describe('4. drag a scene to another chapter', () => {
  test('card moves to chapter 2 and the order is stored', async ({ page, isMobile }) => {
    test.skip(isMobile, 'on the phone the board is a list: no dragging (a scene moves via «Где стоит» in its card, see 4b)')
    await twoChapterBoard(page)
    const before = await sceneChapters(page)
    expect(before.a.chapterId).toBe(before.chapters[0].id)
    await dragCardToColumn(page, 'Сцена А', 1)
    await expect
      .poll(async () => (await sceneChapters(page)).a.chapterId, { message: 'scene А is in chapter 2 after the drag' })
      .toBe(before.chapters[1].id)
    const after = await sceneChapters(page)
    expect(after.b.chapterId, 'scene Б stays in chapter 1').toBe(before.chapters[0].id)
    expect(after.a.order).toBe(0)
    // and on the screen
    await expect(page.locator('.column:not(.pool)').nth(1).locator('.card-scene').filter({ hasText: 'Сцена А' })).toBeVisible()
  })

  test('4b. phone: a scene is moved with «Где стоит» in its card', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'desktop moves by dragging, see above')
    await startStory(page)
    await board(page)
    await addSceneOnBoard(page, 'Сцена А')
    await page.getByRole('button', { name: '+ Глава' }).click()
    await page.locator('.tl-chapter.open .tl-scene').filter({ hasText: 'Сцена А' }).click()
    const sheet = page.getByRole('dialog', { name: 'Сцена' })
    const chapters = (await aliveRows<any>(page, 'chapters')).filter((c) => !c.pool).sort((a, b) => a.order - b.order)
    await sheet.getByLabel('Где стоит').selectOption(chapters[1].id)
    await expect
      .poll(async () => (await aliveRows<any>(page, 'scenes')).find((s) => s.title === 'Сцена А')?.chapterId)
      .toBe(chapters[1].id)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('5. board undo', () => {
  test('Ctrl+Z after a drag puts the scene back', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard shortcut')
    // audit M1: no undo on the board
    knownBug('audit M1: no undo on the board')
    await twoChapterBoard(page)
    const before = await sceneChapters(page)
    await dragCardToColumn(page, 'Сцена А', 1)
    await expect.poll(async () => (await sceneChapters(page)).a.chapterId).toBe(before.chapters[1].id)
    // focus on the page body, not in an input
    await page.locator('h1', { hasText: 'Доска' }).click()
    await page.keyboard.press('Control+z')
    await expect
      .poll(async () => (await sceneChapters(page)).a.chapterId, { timeout: 4000, message: 'scene А is back in chapter 1 after Ctrl+Z' })
      .toBe(before.chapters[0].id)
  })
})

// ---------------------------------------------------------------------------------------------
const notesAlive = (page: Page) => aliveRows<any>(page, 'notes')

async function openCapture(page: Page, isMobile: boolean) {
  if (isMobile) {
    // The phone has no keyboard shortcut: the round ⚡ button on every screen but the text.
    await board(page)
    await page.getByRole('button', { name: 'Быстрая запись' }).click()
  } else {
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+j')
  }
  const dlg = page.getByRole('dialog', { name: 'Быстрая запись' })
  await expect(dlg).toBeVisible()
  return dlg
}

test.describe('6. quick capture', () => {
  test('one thought saved with Ctrl+Enter (phone: «Сохранить») makes exactly one note', async ({ page, isMobile }) => {
    await startStory(page)
    const dlg = await openCapture(page, isMobile)
    await page.keyboard.type('Герой боится высоты')
    if (isMobile) await dlg.getByRole('button', { name: 'Сохранить' }).dblclick() // a nervous double tap
    else await page.keyboard.press('Control+Enter')
    await expect(dlg).toBeHidden()
    await expect.poll(async () => (await notesAlive(page)).length).toBe(1)
    await page.waitForTimeout(1200) // a late duplicate would show up by now
    const notes = await notesAlive(page)
    expect(notes).toHaveLength(1)
    expect(notes[0].text).toBe('Герой боится высоты')
  })

  test('6b. Enter pressed twice fast still makes one note', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Enter on a phone keyboard: the double tap on «Сохранить» is covered by journey 6')
    await startStory(page)
    const dlg = await openCapture(page, isMobile)
    await page.keyboard.type('Ключ спрятан в часах')
    // two real key presses back to back, no waiting for the first save
    await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Enter')])
    await expect(dlg).toBeHidden()
    await page.waitForTimeout(1200)
    expect(await notesAlive(page)).toHaveLength(1)

    // and the harshest case: two Enter keydowns in the same JS tick
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+j')
    await expect(dlg).toBeVisible()
    await page.keyboard.type('Второй раз то же самое')
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>('.capture-text')!
      for (let i = 0; i < 2; i++) ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    })
    await expect(dlg).toBeHidden()
    await page.waitForTimeout(1200)
    const notes = await notesAlive(page)
    expect(notes, 'exactly one more note, not two').toHaveLength(2)
    expect(notes.filter((n) => n.text === 'Второй раз то же самое')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------
async function openFind(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await page.getByRole('button', { name: /Найти и заменить/ }).click()
  } else {
    await page.keyboard.press('Control+h')
  }
}

test.describe('7. find and replace', () => {
  test('«Все» replaces every match, the toast undo brings the text back', async ({ page, isMobile }) => {
    await startStory(page)
    const original = 'Кот спит. кот ест. Кот идёт домой.'
    await typeInEditor(page, original)
    await waitSaveTick(page)
    await openFind(page, isMobile)
    const find = page.getByRole('textbox', { name: 'Найти в сцене' })
    await expect(find).toBeFocused()
    await page.keyboard.type('кот')
    await expect(page.locator('.find-count')).toHaveText('1 из 3')
    await page.getByRole('textbox', { name: 'Заменить на' }).click()
    await page.keyboard.type('пёс')
    await page.getByRole('button', { name: 'Все', exact: true }).click()
    const editor = page.locator('.ProseMirror')
    await expect(editor).toContainText('пёс спит. пёс ест. пёс идёт домой.')
    await expect(editor).not.toContainText(/кот/i)
    const toast = page.getByRole('status')
    await expect(toast).toContainText('Заменено: 3')
    await toast.getByRole('button', { name: 'Отменить' }).click()
    await expect(editor).toHaveText(original)
    // and the restored text is what ends up on disk
    await waitSaveTick(page)
    await expect.poll(async () => (await allTexts(page))[0]?.text).toBe(original)
  })
})

// ---------------------------------------------------------------------------------------------
/** Library: click the story name in the header («Все истории»). */
const toLibrary = async (page: Page) => {
  await page.locator('.project-name').click()
  await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()
}

async function newStoryFromLibrary(page: Page) {
  await page.getByRole('button', { name: '+ Новая история' }).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

async function deleteStoryInLibrary(page: Page, which: string) {
  const card = page.locator(`.story${which}`).first()
  await card.locator('summary[aria-label="Действия"]').click()
  await card.getByRole('button', { name: 'Удалить историю' }).click()
}

const aliveProjects = (page: Page) => aliveRows<any>(page, 'projects')

test.describe('8. delete a story, undo from the toast', () => {
  test('the story is back after «Отменить»', async ({ page }) => {
    page.on('dialog', (d) => void d.accept())
    await startStory(page)
    await typeInEditor(page, 'Первая история живёт')
    await waitSaveTick(page)
    await toLibrary(page)
    await newStoryFromLibrary(page)
    await toLibrary(page)
    await expect(page.locator('.story')).toHaveCount(2)
    await deleteStoryInLibrary(page, ':not(.current)')
    await expect(page.locator('.story')).toHaveCount(1)
    expect(await aliveProjects(page)).toHaveLength(1)
    await page.getByRole('status').getByRole('button', { name: 'Отменить' }).click()
    await expect(page.locator('.story')).toHaveCount(2)
    expect(await aliveProjects(page)).toHaveLength(2)
    expect((await allTexts(page)).some((t) => t.text.includes('Первая история живёт'))).toBe(true)
  })

  test('8b. deleting the ONLY story still offers «Отменить»', async ({ page }) => {
    // e2e finding F1 (fixed): the toast now outlives the switch to the welcome screen
    page.on('dialog', (d) => void d.accept())
    await startStory(page)
    await typeInEditor(page, 'Единственная история')
    await waitSaveTick(page)
    await toLibrary(page)
    await deleteStoryInLibrary(page, '')
    await page.waitForTimeout(1000) // the toast may flash for a moment before the app swaps to the welcome screen: it must still be there
    await expect(page.getByRole('button', { name: 'Отменить' }), 'undo is offered after deleting the last story').toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Отменить' }).click()
    await expect.poll(async () => (await aliveProjects(page)).length).toBe(1)
    expect((await allTexts(page)).some((t) => t.text.includes('Единственная история'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('9. backup round trip', () => {
  test('download a copy, delete the story, restore from the file', async ({ page }, testInfo) => {
    page.on('dialog', (d) => void d.accept())
    await startStory(page)
    const phrase = 'Эта фраза должна пережить удаление'
    await typeInEditor(page, phrase)
    await waitSaveTick(page)
    await waitTextInDb(page, phrase)
    await toLibrary(page)
    await newStoryFromLibrary(page)
    await toLibrary(page)
    await page.locator('.lib-nav').getByRole('button', { name: 'Настройки' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать копию' }).click()])
    const file = testInfo.outputPath('backup.json')
    await download.saveAs(file)
    const dump = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(dump.projects.filter((p: any) => !p.deleted)).toHaveLength(2)
    expect(dump.texts.some((t: any) => docText(t.content).includes(phrase))).toBe(true)

    await page.locator('.lib-nav').getByRole('button', { name: 'Истории' }).click()
    await deleteStoryInLibrary(page, ':not(.current)')
    await expect(page.locator('.story')).toHaveCount(1)
    expect(await aliveProjects(page)).toHaveLength(1)

    await page.locator('.lib-nav').getByRole('button', { name: 'Настройки' }).click()
    await page.locator('input[type=file][accept*="json"]').setInputFiles(file)
    await expect(page.getByRole('status')).toContainText(/Готово|добавлено/)
    await page.locator('.lib-nav').getByRole('button', { name: 'Истории' }).click()
    await expect(page.locator('.story')).toHaveCount(2)
    expect(await aliveProjects(page)).toHaveLength(2)
    expect((await allTexts(page)).some((t) => t.text.includes(phrase))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('10. offline', () => {
  test('the app opens without a network and typing is still saved', async ({ page, context }) => {
    await startStory(page)
    await typeInEditor(page, 'Написано в сети.')
    await waitSaveTick(page)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    // one reload online so the worker controls the page and the precache is complete
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true)
    await expect(page.locator('.ProseMirror')).toContainText('Написано в сети.')

    await context.setOffline(true)
    await page.reload()
    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible({ timeout: 15_000 })
    await expect(editor).toContainText('Написано в сети.')
    await typeInEditor(page, ' А это уже без интернета.', { end: true })
    await waitSaveTick(page)
    await waitTextInDb(page, 'А это уже без интернета.')
    await context.setOffline(false)
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('11. the same scene in two tabs', () => {
  test('live update A -> B, then both fragments typed at once survive somewhere', async ({ page, context }, testInfo) => {
    await startStory(page)
    const sceneId = await firstSceneId(page)
    const pageB = await context.newPage()
    await pageB.goto(`/#/text/${sceneId}`)
    await expect(pageB.locator('.ProseMirror')).toBeVisible()

    // A types, saves; B must show it without a reload.
    await typeInEditor(page, 'Альфа пришла первой.')
    await waitSaveTick(page)
    await expect(pageB.locator('.ProseMirror'), 'B shows what A typed (live update)').toContainText('Альфа пришла первой.', { timeout: 8000 })

    // Now both type without waiting for each other.
    await pageB.locator('.ProseMirror').click()
    await pageB.keyboard.press('Control+End')
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await Promise.all([page.keyboard.type(' ФРАГМЕНТ-ИЗ-А'), pageB.keyboard.type(' ФРАГМЕНТ-ИЗ-Б')])
    // WebKit slows timers in a background page, so each tab gets the front in turn to finish its pending save.
    await page.bringToFront()
    await waitSaveTick(page)
    await pageB.bringToFront()
    await waitSaveTick(pageB)
    await page.bringToFront()
    await page.waitForTimeout(2500) // let remote updates settle on both sides

    const texts = (await dbAll<any>(page, 'texts')).filter((t) => t.id === sceneId).map((t) => docText(t.content))
    const snaps = (await dbAll<any>(page, 'snapshots')).filter((s) => s.sceneId === sceneId).map((s) => ({ reason: s.reason, text: docText(s.content) }))
    const everything = [...texts, ...snaps.map((s) => s.text)].join('\n')
    const shownA = await page.locator('.ProseMirror').innerText()
    const shownB = await pageB.locator('.ProseMirror').innerText()
    const report = { texts, snaps, shownA, shownB }
    await testInfo.attach('two-tabs-result.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
    console.log('TWO TABS RESULT ' + JSON.stringify(report))
    expect(everything, 'fragment from A is in texts or snapshots').toContain('ФРАГМЕНТ-ИЗ-А')
    expect(everything, 'fragment from B is in texts or snapshots').toContain('ФРАГМЕНТ-ИЗ-Б')
    await pageB.close()
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('12. restoring a version updates the counters (B-109)', () => {
  test('after «Вернуть» the stored counters match the restored text', async ({ page }) => {
    // audit B-109: restoring a version rewrites the text but not the scene's wordCount / charCount / excerpt
    knownBug('audit B-109: version restore leaves scene counters stale')
    await startStory(page)
    const v1 = 'Альфа бета гамма дельта эпсилон'
    await typeInEditor(page, v1)
    await waitSaveTick(page)
    await waitTextInDb(page, v1)
    page.on('dialog', (d) => void d.accept())
    const openPlan = () => page.locator('.tool', { hasText: 'План' }).click()
    const closePlan = () => page.getByRole('button', { name: 'Скрыть план', exact: true }).click() // on a phone the plan covers the page
    const openVersions = () => page.locator('summary', { hasText: 'Ещё: линии, глава, версии' }).click()
    await openPlan()
    await openVersions()
    await page.getByRole('button', { name: 'Сохранить текущий текст как версию' }).click()
    await expect(page.locator('.snapshot')).toHaveCount(1)
    await closePlan()

    // a completely different, longer text
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Омега сигма тау ипсилон фи хи пси ро пи омикрон ню')
    await waitSaveTick(page)
    await expect.poll(async () => (await aliveRows<any>(page, 'scenes'))[0].wordCount).toBe(11)

    await openPlan()
    if (!(await page.locator('.snapshot').first().isVisible())) await openVersions()

    await page.locator('.snapshot').getByRole('button', { name: 'Вернуть' }).click()
    await expect(page.locator('.ProseMirror')).toHaveText(v1)
    await expect(page.locator('.stats-chip')).toContainText('5')
    await page.waitForTimeout(1500)
    const scenes = (await aliveRows<any>(page, 'scenes')).sort((a, b) => a.order - b.order)
    const scene = scenes[0]
    expect(await allTexts(page).then((t) => t[0].text)).toBe(v1)
    expect(scene.wordCount, 'scene.wordCount follows the restored text').toBe(wordsIn(v1))
    expect(scene.charCount, 'scene.charCount follows the restored text').toBe(v1.length)
    expect(scene.excerpt, 'card excerpt follows the restored text').toContain('Альфа')
  })
})
