import { expect, test } from '@playwright/test'
import { startStory, waitTextInDb } from './helpers'

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

test('the status-bar inset leaves room for the book title and the writer toolbar', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone shell only')
  const editor = await startStory(page)
  // The emulated window has no physical status bar; give it the inset of a notched phone.
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-top', '62px'))
  const header = page.locator('.app-header')
  const bookTitle = header.locator('.project-name-mobile summary')
  const toolbar = page.locator('.write-top')
  const meter = page.locator('.chapter-meter')
  await expect(header).toHaveCSS('height', '114px')

  const assertBarsFit = async () => {
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.app-header')!.getBoundingClientRect()
      const title = document.querySelector('.project-name-mobile summary')!.getBoundingClientRect()
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
  await page.reload()
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-top', '62px'))
  await expect(page.locator('.resume')).toBeVisible()
  await expect(meter.locator('.chapter-progress-track')).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 480))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await assertBarsFit()
  const toolbarBox = (await toolbar.boundingBox())!
  const meterBox = (await meter.boundingBox())!
  expect(meterBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 0.5)

  await page.evaluate(() => { document.documentElement.dataset.keyboard = 'open' })
  await expect(header).toHaveCSS('position', 'relative')
  await expect(toolbar).toHaveCSS('position', 'relative')
  await expect(meter).toHaveCSS('position', 'relative')
  await expect(page.locator('.resume')).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 0))
  await assertBarsFit()
  await editor.focus()
  await expect(meter).toBeHidden()
  await page.evaluate(() => { document.documentElement.dataset.keyboard = 'closed' })
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

test('chapter progress keeps plan controls in a separate sheet on phones', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone hierarchy only')
  await startStory(page)
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Первая фраза')
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

test('the chapter navigator does not add a scene level to a whole chapter', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phone navigator only')
  await startStory(page)
  await page.locator('.scene-nav-tool').click()

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
  await expect(page.getByRole('button', { name: 'О главе', exact: true })).toBeHidden()
  await page.getByText('Ещё инструменты', { exact: true }).click()
  await page.getByRole('button', { name: 'Шрифт и вид страницы' }).click()
  await expect(page.locator('.typo-pop').filter({ has: page.locator('.typo') })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть настройки текста' }).click()

  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByText('Ещё инструменты', { exact: true }).click()
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
  const settings = story.getByRole('button', { name: /Настроить «/ })
  await settings.click()
  const menu = story.locator('.story-menu')
  const box = (await menu.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await menu.getByLabel('Название').fill(title)
  await menu.getByLabel('Название').blur()
  await expect(page.locator('.lib-back')).toHaveText(`←${title}`)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)
  await settings.click()
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
  await page.locator('.tabs-mobile').getByRole('button', { name: 'Доска' }).click()
  const chapter = page.locator('.timeline .tl-head').filter({ hasText: 'Глава 1' })
  await chapter.press('Shift+F10')
  const actions = page.getByRole('dialog', { name: /Действия с главой/ })
  await expect(actions).toBeVisible()
  await actions.getByRole('button', { name: /Закрыть/ }).click()
  await chapter.press('Enter')
  await expect(editor).toBeVisible()
})
