import { expect, test, type Page } from '@playwright/test'
import { aliveRows, openChapterProgress, openWorkspaceTab, setChapterMaximum, startStory, waitTextInDb } from './helpers'

async function setKeyboardViewport(page: Page, open: boolean, offsetTop = 0) {
  await page.evaluate(({ open, offsetTop }) => {
    const viewport = window.visualViewport!
    Object.defineProperties(viewport, {
      height: { configurable: true, value: window.innerHeight - (open ? 290 : 0) },
      offsetTop: { configurable: true, value: offsetTop },
    })
    viewport.dispatchEvent(new Event('resize'))
  }, { open, offsetTop })
}

test('the mobile shell behaves like an app surface', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone shell only')
  await page.goto('/')

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('maximum-scale=1')
  expect(viewport).toContain('user-scalable=no')

  await startStory(page)
  const tabs = page.locator('.tabs-mobile')
  await expect(tabs).toBeHidden()
  await openWorkspaceTab(page, 'Доска')
  await expect(tabs).toBeVisible()
  await expect(tabs.getByText('Заметки', { exact: true })).toBeVisible()
})

test('the status-bar inset leaves room for the book title and the writer toolbar', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone shell only')
  const editor = await startStory(page)
  // The emulated window has no physical status bar; give it the inset of a notched phone.
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-top', '62px'))
  const header = page.locator('.app-header')
  const bookTitle = header.locator('.project-home')
  const toolbar = page.locator('.write-top')
  const meter = page.locator('.volume-counter')
  await expect(header).toHaveCSS('height', '114px')

  const assertBarsFit = async () => {
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.app-header')!.getBoundingClientRect()
      const title = document.querySelector('.project-home')!.getBoundingClientRect()
      const toolbar = document.querySelector('.write-top')!.getBoundingClientRect()
      return { titleTop: title.top, titleBottom: title.bottom, headerBottom: header.bottom, toolbarTop: toolbar.top }
    })
    expect(geometry.titleTop).toBeGreaterThanOrEqual(62)
    expect(geometry.titleBottom).toBeLessThanOrEqual(geometry.headerBottom)
    expect(geometry.toolbarTop).toBeGreaterThanOrEqual(geometry.headerBottom)
  }
  await expect(bookTitle).toBeVisible()
  await assertBarsFit()

  await editor.fill('Проверка строки в редакторе. '.repeat(100))
  await waitTextInDb(page, 'Проверка строки в редакторе.')
  await expect(meter).toHaveCount(0)
  await setChapterMaximum(page, 4_000)
  await page.reload()
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-top', '62px'))
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeHidden()
  await expect(meter.locator('.volume-trigger')).toBeVisible()
  await expect(editor).toContainText('Проверка строки в редакторе.')
  await expect.poll(() => page.evaluate(() => {
    window.scrollTo({ top: 480, behavior: 'instant' })
    return window.scrollY
  })).toBeGreaterThan(100)
  await assertBarsFit()
  const counterBox = (await meter.boundingBox())!
  expect(counterBox.y + counterBox.height).toBeGreaterThan(page.viewportSize()!.height - 64)

  await setKeyboardViewport(page, true)
  await expect(header).toHaveCSS('position', 'relative')
  await expect(toolbar).toHaveCSS('position', 'relative')
  await expect(meter).toBeHidden()
  await expect(page.locator('.resume')).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 0))
  await assertBarsFit()
  await editor.focus()
  await expect(meter).toBeHidden()
  await setKeyboardViewport(page, false)
  await expect(meter).toBeVisible()
})

test('settings distinguishes the installed iOS build from the web version', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'iOS wrapper user agent')
  await page.addInitScript(() => {
    const userAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: `${userAgent} ManuscriptIOS/3` })
  })
  await startStory(page)
  await page.goto('/#/settings')
  await expect(page.locator('.app-version')).toContainText('Версия от')
  await expect(page.locator('.app-version')).toContainText('Сборка iOS 3')
})

test('writing mode keeps the text and Done, saves, then restores navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile writing mode')
  const editor = await startStory(page)
  await expect(editor).toHaveCSS('font-size', '16px')
  await setChapterMaximum(page, 10_000)
  const toolbar = page.locator('.write-top')
  await toolbar.getByRole('button', { name: 'Писать', exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(page.locator('.tabs-mobile')).toBeHidden()
  await expect(toolbar.getByRole('button', { name: 'Ещё' })).toBeHidden()
  await page.keyboard.insertText('Чистая страница для новой главы.')
  await expect(page.locator('.volume-counter')).toBeHidden()
  await toolbar.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.tabs-mobile')).toBeHidden()
  await expect(toolbar.getByRole('button', { name: 'Ещё' })).toBeVisible()
  await waitTextInDb(page, 'Чистая страница для новой главы.')
})

test('notes open with a short list and a separate composer', async ({ page }) => {
  await startStory(page)
  await page.goto('/#/inbox')
  await expect(page.getByRole('textbox', { name: 'Текст заметки' })).toHaveCount(0)
  await page.getByRole('button', { name: '+ Заметка' }).click()
  const text = page.getByRole('textbox', { name: 'Текст заметки' })
  await text.fill('Первая строка\nВторая строка')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.note-item')).toContainText('Вторая строка')
  await expect(text).toHaveCount(0)
  await page.locator('.note-item').getByRole('button', { name: 'Разобрать' }).click()
  await text.fill('Уточнённая мысль')
  await text.blur()
  await expect.poll(async () => (await aliveRows<any>(page, 'notes')).some((note) => note.text === 'Уточнённая мысль')).toBe(true)
})

test('changing the manuscript font keeps paragraph spacing fixed and the redundant title hidden', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone typography')
  const editor = await startStory(page)
  await editor.fill('Первый абзац.')
  const heading = page.locator('.scene-head-title')
  const paragraph = editor.locator('p').first()
  const metrics = () => page.evaluate(() => {
    const body = document.querySelector('.ProseMirror')!
    const line = body.querySelector('p')!
    return {
      leading: getComputedStyle(body).lineHeight,
      paragraphGap: getComputedStyle(line).marginBottom,
    }
  })
  const initial = await metrics()
  const font = await editor.evaluate((element) => getComputedStyle(element).fontFamily)
  const draftURL = page.url()
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'С засечками', exact: true }).click()
  await page.goto(draftURL)
  await expect(page.locator('.mobile-current-chapter')).toHaveText('Глава 1')
  await expect(heading).toBeHidden()
  await expect(paragraph).toHaveCSS('margin-bottom', initial.paragraphGap)
  await expect(editor).not.toHaveCSS('font-family', font)
  expect(await metrics()).toEqual(initial)
})

test('chapter progress keeps plan controls in a separate sheet on phones', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone hierarchy only')
  await startStory(page)
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Первая фраза')
  await expect(page.locator('.volume-trigger')).toHaveCount(0)
  const progress = await openChapterProgress(page)
  await expect(progress).toBeVisible()
  await expect(progress.getByText('Вся рукопись', { exact: true })).toBeVisible()
  await expect(progress.getByText('Авторские листы', { exact: true })).toBeVisible()

  await progress.getByRole('button', { name: 'Цели' }).click()
  const goals = page.getByRole('dialog', { name: 'Цели книги и главы' })
  await expect(goals).toBeVisible()
  await expect(goals.getByLabel('Объём, знаков')).toBeVisible()
  await goals.getByText('Общий ориентир главы', { exact: true }).click()
  await expect(goals.locator('details[open]').getByLabel('Максимум, знаков')).toBeVisible()
})

test('the phone board starts with the next writing action, not repeated headings', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone hierarchy only')
  await startStory(page)
  await openWorkspaceTab(page, 'Доска')

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
  await openWorkspaceTab(page, 'Доска')
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

test('the chapter navigator does not add a scene level to a whole chapter', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone navigator only')
  await startStory(page)
  await page.getByRole('button', { name: 'Главы', exact: true }).click()

  const navigator = page.locator('.write-side')
  await expect(navigator).toBeVisible()
  await expect(navigator.locator('.navi-head')).toBeHidden()
  await expect(navigator.locator('.navi-scenes')).toHaveCount(0)
  const chapter = navigator.locator('.navi-row').filter({ hasText: 'Глава 1' })
  await expect(chapter).not.toHaveAttribute('aria-expanded')
  await chapter.click()
  await expect(navigator).toBeHidden()
  await expect(page.locator('.ProseMirror')).toBeVisible()
})

test('rare page controls stay under More and the chapter panel speaks about the chapter', async ({ page }, info) => {
  await startStory(page)
  if (info.project.name === 'desktop') {
    await expect(page.locator('.plan-tool')).toBeVisible()
    await page.setViewportSize({ width: 580, height: 800 })
  }

  await expect(page.locator('.typo-font-anchor > .tool')).toBeHidden()
  await expect(page.locator('.plan-tool')).toBeHidden()
  await page.getByRole('button', { name: 'Ещё' }).click()
  await expect(page.getByRole('button', { name: 'Быстрая заметка' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Найти и заменить' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Экспорт Word' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Шрифт и вид страницы' })).toHaveCount(0)
  await expect(page.locator('.write-menu').getByRole('button', { name: 'Параметры книги' })).toHaveCount(0)
  await page.getByRole('button', { name: 'О главе', exact: true }).click()
  const chapterPanel = page.getByRole('region', { name: 'О главе' })
  await expect(chapterPanel).toBeVisible()
  await chapterPanel.getByRole('button', { name: 'зачем глава' }).click()
  await chapterPanel.getByRole('button', { name: 'кто в главе' }).click()
  await expect(chapterPanel.getByText('Зачем эта глава')).toBeVisible()
  await expect(chapterPanel.getByText('Кто в главе')).toBeVisible()
})

test('the phone library is a compact picker and opens a story from its title', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone library only')
  await startStory(page)
  await page.goto('/#/library')
  await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()

  const story = page.locator('.story').first()
  const book = story.locator('.book')
  const storyBox = await story.boundingBox()
  const bookBox = await book.boundingBox()
  expect(storyBox).not.toBeNull()
  expect(bookBox).not.toBeNull()
  expect(storyBox!.width).toBeGreaterThan(storyBox!.height * 2)
  expect(bookBox!.width).toBeLessThan(100)
  await expect(story.getByRole('button', { name: 'Продолжить' })).toBeHidden()

  await story.locator('.story-title').click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/#\/text/)
})

test('a fresh visit opens the library with the next step and readiness under its book', async ({ page }) => {
  const editor = await startStory(page)
  await editor.fill('Текст первой главы.')
  await waitTextInDb(page, 'Текст первой главы.')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Истории' })).toBeVisible()
  const story = page.locator('.story').first()
  await expect(story.locator('.story-progress')).toContainText('готово 0 из 1 · осталось 1')
  await story.locator('.story-title').press('Shift+F10')
  const menu = page.getByRole('dialog', { name: /^Настройки «/ })
  await menu.getByLabel('Название').fill('Недоля')
  await menu.getByLabel('Следующий шаг').fill('Перечитать первую главу')
  await menu.getByLabel('Следующий шаг').blur()
  const date = await page.evaluate(() => {
    const date = new Date()
    date.setDate(date.getDate() + 5)
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, '0')).join('-')
  })
  await menu.locator('input[type=date]').fill(date)
  await page.keyboard.press('Escape')
  await expect(story.locator('.story-due')).toContainText(/Финал · через 5 дн\./)
  await story.getByRole('button', { name: /Перечитать первую главу/ }).click()
  await expect(editor).toHaveText('Текст первой главы.')
  const progress = await openChapterProgress(page)
  await progress.getByRole('button', { name: 'Отметить главу готовой' }).click()
  await expect(progress.getByRole('button', { name: 'Вернуть главу в работу' })).toBeVisible()
  await page.goto('/')
  await expect(story.locator('.story-progress')).toContainText('готово 1 из 1')
  await expect(story.getByRole('button', { name: /Перечитать первую главу/ })).toBeVisible()
})

test('library actions and story controls fit at phone and desktop widths', async ({ page, isMobile }) => {
  const title = 'Очень длинное название новой редакции моей первой рукописи'
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Начать историю' })
  const welcomeImport = page.getByRole('button', { name: 'Импортировать .docx / .txt' })
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 700 })
    await expect(start).toBeVisible()
    await expect(welcomeImport).toBeVisible()
    const first = (await start.boundingBox())!
    const second = (await welcomeImport.boundingBox())!
    expect(first.x).toBeCloseTo(second.x)
    expect(first.width).toBeCloseTo(second.width)
    expect(first.y + first.height).toBeLessThan(second.y)
  }
  await startStory(page)
  await page.goto('/#/library')
  const create = page.getByRole('button', { name: /Новая история/ })
  const importStory = page.getByRole('button', { name: 'Импорт .docx / .txt' })
  const widths = isMobile ? [320, 390, 430, 844] : [1280, 768, 580]
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 800 })
    await expect(create).toBeVisible()
    const [button, upload, header] = await Promise.all([
      create.boundingBox(), importStory.boundingBox(), page.locator('.library-head').boundingBox(),
    ])
    expect(button!.y).toBeCloseTo(upload!.y)
    expect(button!.height).toBeGreaterThanOrEqual(44)
    expect(upload!.height).toBeGreaterThanOrEqual(44)
    expect(button!.x + button!.width).toBeLessThanOrEqual(upload!.x)
    expect(upload!.x + upload!.width).toBeLessThanOrEqual(header!.x + header!.width + 0.5)
  }

  if (isMobile) await page.setViewportSize({ width: 320, height: 700 })
  const story = page.locator('.story').first()
  await story.locator('.story-title').press('Shift+F10')
  const menu = page.getByRole('dialog', { name: /^Настройки «/ })
  const box = (await menu.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await menu.getByLabel('Название').fill(title)
  await menu.getByLabel('Название').blur()
  await expect(page.locator('.lib-back')).toHaveText(`←${title}`)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)

  await create.click()
  await expect(page.getByRole('button', { name: 'Писать главу' })).toBeVisible()
})

test('opening chapter actions from the keyboard does not swallow the next Enter', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard and narrow desktop window')
  await page.setViewportSize({ width: 580, height: 800 })
  const editor = await startStory(page)
  await editor.fill('Текст для проверки навигации.')
  await waitTextInDb(page, 'Текст для проверки навигации.')
  await openWorkspaceTab(page, 'Доска')
  const chapter = page.locator('.timeline .tl-head').filter({ hasText: 'Глава 1' })
  await chapter.press('Shift+F10')
  const actions = page.getByRole('dialog', { name: /Действия с главой/ })
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: /Закрыть/ }).click()
  await chapter.press('Enter')
  await expect(editor).toBeVisible()
})

test('touching text enters writing with three working format controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone writing gesture')
  const editor = await startStory(page)
  await editor.fill('Иван остался у моста.')
  await editor.blur()
  const toolbar = page.locator('.write-top')
  const paragraph = editor.locator('p').first()
  await paragraph.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 100 })
  await paragraph.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 180 })
  await paragraph.dispatchEvent('pointercancel', { pointerType: 'touch' })
  await expect(toolbar.getByRole('button', { name: 'Писать', exact: true })).toBeVisible()

  await paragraph.tap()
  await expect(toolbar.getByRole('button', { name: 'Готово' })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Ещё' })).toBeHidden()
  await page.keyboard.press('End')
  for (const [label, tag, word] of [
    ['Жирный', 'strong', 'Жирный'],
    ['Курсив', 'em', 'Курсив'],
    ['Подчеркнуть', 'u', 'Подчёркнутый'],
  ]) {
    const button = toolbar.getByRole('button', { name: label, exact: true })
    await button.tap()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.insertText(' ' + word)
    await expect(editor.locator(tag)).toContainText(word)
    await button.tap()
  }
  await toolbar.getByRole('button', { name: 'Готово' }).tap()
  await waitTextInDb(page, 'Подчёркнутый')
  await page.reload()
  await expect(editor.locator('u')).toHaveText('Подчёркнутый', { useInnerText: true })
})

test('selection saves a hero and a continuity detail tied to its source', async ({ page }) => {
  const editor = await startStory(page)
  const sentence = 'Иван носил синий кафтан.'
  await editor.fill(sentence)
  await waitTextInDb(page, sentence)
  const addFromText = async (phrase: string) => {
    await editor.evaluate((element, phrase) => {
      const textEditor = element as HTMLElement
      textEditor.focus()
      const node = element.querySelector('p')!.firstChild!
      const start = node.textContent!.indexOf(phrase)
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + phrase.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    }, phrase)
    await page.locator('.bubble').getByRole('button', { name: 'Добавить…' }).click()
    return page.getByRole('dialog', { name: 'Добавить из текста' })
  }
  const hero = await addFromText('Иван')
  await hero.getByRole('button', { name: 'Героя', exact: true }).click()
  await expect(hero.getByLabel('Имя героя')).toHaveValue('Иван')
  await hero.getByRole('button', { name: 'Сохранить' }).click()
  await expect(hero).toBeHidden()
  const [character] = await aliveRows<any>(page, 'characters')
  expect(character.name).toBe('Иван')
  expect((await aliveRows<any>(page, 'scenes'))[0].characterIds).toContain(character.id)

  const detail = await addFromText('синий кафтан')
  await detail.getByRole('button', { name: 'Деталь о герое' }).click()
  await detail.getByLabel('Чья это деталь').selectOption({ label: 'Иван' })
  await detail.getByRole('button', { name: 'Сохранить' }).click()
  await expect(detail).toBeHidden()
  const [note] = await aliveRows<any>(page, 'notes')
  expect(note).toMatchObject({ text: 'синий кафтан', characterIds: [character.id] })

  await openWorkspaceTab(page, 'Герои')
  await page.locator('.hero-row').getByText('Иван', { exact: true }).click()
  await page.getByText('Детали героя', { exact: true }).click()
  const fact = page.locator('.hero-detail-note').filter({ hasText: 'синий кафтан' })
  await expect(fact.getByRole('button')).toBeVisible()
  await page.getByText(/Встречается в 1 сцене/).click()
  await page.getByText('Абзацы с упоминанием', { exact: true }).click()
  await expect(page.locator('.wf-passages')).toContainText(sentence)
})

test('formatting stays within reach while scrolling a long draft with the keyboard open', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone keyboard layout')
  const editor = await startStory(page)
  await editor.fill('Длинный черновик. '.repeat(400))
  await editor.blur()
  const toolbar = page.locator('.write-top')
  await toolbar.getByRole('button', { name: 'Писать', exact: true }).click()
  await setKeyboardViewport(page, true, 24)
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  await expect(toolbar).toHaveCSS('position', 'sticky')
  await expect.poll(async () => (await toolbar.boundingBox())?.y).toBeCloseTo(24, 0)
  await expect(toolbar.getByRole('button', { name: 'Жирный' })).toBeInViewport()
  await expect(toolbar).toHaveCSS('transition-property', 'none')
  const duringScroll = await page.evaluate(() => {
    const viewport = window.visualViewport!
    for (const offset of [53, 6, 41, 9, 27]) {
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: offset })
      viewport.dispatchEvent(new Event('scroll'))
    }
    return document.querySelector('.write-top')!.getBoundingClientRect().top
  })
  expect(duringScroll).toBeCloseTo(24, 0)
  await expect.poll(async () => (await toolbar.boundingBox())?.y).toBeCloseTo(27, 0)
})

test('Word export offers the current chapter and the whole manuscript', async ({ page }) => {
  const editor = await startStory(page)
  await editor.fill('Этот абзац должен попасть в Word.')
  const menu = page.locator('.write-menu')
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await menu.getByRole('button', { name: 'Экспорт Word' }).click()
  const dialog = page.getByRole('dialog', { name: 'Экспорт Word' })
  const downloadButton = dialog.getByRole('button', { name: 'Скачать .docx' })
  const [chapterFile] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
  expect(chapterFile.suggestedFilename()).toBe('Глава 1.docx')
  await dialog.getByLabel('Что экспортировать').selectOption({ label: 'Вся книга' })
  const [bookFile] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
  expect(bookFile.suggestedFilename()).toBe('Без названия.docx')
  const { extractRawText } = await import('mammoth')
  const path = await bookFile.path()
  expect((await extractRawText({ path: path! })).value).toContain('Этот абзац должен попасть в Word.')
})

test('the installed iPhone shell hands Word export to its share flow', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'native iPhone presentation')
  await page.addInitScript(() => {
    const userAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: `${userAgent} ManuscriptIOS/3` })
  })
  const editor = await startStory(page)
  await editor.fill('Документ для отправки.')
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await page.getByRole('button', { name: 'Экспорт Word', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Экспорт Word' })
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Поделиться' }).click()])
  expect(file.suggestedFilename()).toBe('Глава 1.docx')
})
