import { appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  asFile,
  dumpDb,
  frameStats,
  heapMb,
  longTasksSince,
  manyScenesBook,
  nowInPage,
  PROBE_SCRIPT,
  realBook,
  type DbDump,
  type GenBook,
} from './volume-helpers'

/**
 * Real-volume checks: a Ficbook-style export of ~110 scenes / ~124k words goes in through the welcome
 * screen, comes out as Word and goes back in; then a 300-scene book is timed (numbers only, no thresholds).
 * Evidence goes to audit/e2e-volume.md and audit/perf.md.
 */

// Chromium rounds performance.memory unless asked for exact numbers.
test.use({ launchOptions: { args: ['--enable-precise-memory-info'] } })

const log = (...a: unknown[]) => console.log('[volume]', ...a)
const PERF_OUT = process.env.PERF_OUT ?? join(tmpdir(), 'manuscript-perf.jsonl')
const perf = (rec: Record<string, unknown>) => {
  console.log('PERF ' + JSON.stringify(rec))
  appendFileSync(PERF_OUT, JSON.stringify(rec) + '\n')
}

const WELCOME_IMPORT = 'input[type="file"][accept*="docx"]'
const DESKTOP_COLUMNS = 'section.column:not(.pool)'

const within = (actual: number, expected: number, pct: number) => Math.abs(actual - expected) <= expected * pct

async function newDesktopContext(browser: import('@playwright/test').Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, locale: 'ru-RU', viewport: { width: 1280, height: 800 }, acceptDownloads: true })
}

// ============================================================================ a / b / c: one book, three checks

test.describe('a Ficbook export of ~110 scenes', () => {
  test.describe.configure({ mode: 'serial', timeout: 600_000 })

  const book: GenBook = realBook()
  let ctx: BrowserContext
  let page: Page
  let importedProject: string
  let firstDump: DbDump
  let docx: Buffer

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only')
    ctx = await newDesktopContext(browser, testInfo.project.use.baseURL)
    await ctx.addInitScript(() => {
      // Chapters are copied through the clipboard: capture what the app writes.
      ;(window as any).__clip = null
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (t: string) => ((window as any).__clip = t), write: async () => {}, readText: async () => (window as any).__clip },
      })
    })
    await ctx.addInitScript(() => {
      const w = window as any
      w.__boardAt = null
      const tick = () => {
        if (document.querySelectorAll('article.card-scene').length >= 110) w.__boardAt = performance.now()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    page = await ctx.newPage()
    log('generated:', book.parts.length, 'parts,', book.sceneCount, 'scenes,', book.totalWords, 'words,', book.commentCount, 'author notes,', Math.round(book.text.length / 1024), 'KB')
  })
  test.afterAll(async () => {
    // Closing writes the trace; a parallel run that cleans test-results/ must not fail this suite.
    await ctx?.close().catch(() => {})
  })

  test('a. welcome import: 17 parts become 17 chapters, notes stay out of the text', async () => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
    const t0 = Date.now()
    // NOTE: the welcome screen has no preview step — the file is imported at once (see audit/e2e-volume.md).
    await page.locator(WELCOME_IMPORT).setInputFiles(asFile('ficbook-export.txt', book.text))
    await expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(17, { timeout: 180_000 })
    const boardMs = Date.now() - t0
    log(`welcome import -> board with 17 columns: ${boardMs} ms`)
    perf({ test: 'welcome-import-120k', project: 'desktop', fileToBoardMs: boardMs, words: book.totalWords, scenes: book.sceneCount })

    // give the first-open maintenance (recount words/chars, tidy) time to finish before reading the DB
    await page.waitForTimeout(3000)
    const dump = await dumpDb(page, null, book.commentMarker)
    firstDump = dump
    importedProject = dump.projects[0].id
    expect(dump.projects).toHaveLength(1)
    expect(dump.projects[0].title).toBe(book.title)
    expect(dump.projects[0].description ?? '').toContain('Направленность: Гет')

    log('chapters:', dump.chapters.length, 'scenes:', dump.scenes, 'sum(scenes.wordCount):', dump.sceneWordSum, 'sum(texts.wordCount):', dump.textWordSum, 'generator:', book.totalWords)
    expect(dump.chapters).toHaveLength(17)
    expect(dump.scenes).toBe(book.sceneCount)
    expect(dump.chapters.map((c) => c.scenes)).toEqual(book.parts.map((p) => p.scenes.length))
    expect(dump.chapters.map((c) => c.title)).toEqual(book.parts.map((p) => p.title))
    expect(within(dump.sceneWordSum, book.totalWords, 0.01), `scene words ${dump.sceneWordSum} vs generator ${book.totalWords}`).toBe(true)
    expect(dump.textWordSum).toBe(dump.sceneWordSum)
    // every paragraph (epigraph line included) survived, none of the author's notes got in
    expect(dump.chapters.map((c) => c.paragraphs)).toEqual(book.parasPerPart)
    expect(dump.textsWithMarker, 'author notes leaked into a scene text').toBe(0)
    expect(dump.epigraphScenes).toBe(17)

    const notes = dump.notes.filter((n) => n.text.startsWith('Комментарий к части'))
    expect(notes).toHaveLength(book.commentCount)
    expect(notes).toHaveLength(7)
    expect(notes.every((n) => n.text.includes(book.commentMarker) && !!n.sceneId)).toBe(true)
    expect(dump.notes).toHaveLength(7)
  })

  test('a2. the same book through "Добавить текст": preview shows 17 parts, then confirm', async () => {
    await page.goto('/#/library')
    await page.getByRole('button', { name: '+ Новая история' }).click()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await page.goto('/#/book')
    await page.locator('summary', { hasText: 'Файлы и прочее' }).click()
    await page.locator('details:has(summary:has-text("Файлы и прочее")) input[type="file"]').setInputFiles(asFile('ficbook-export.txt', book.text))
    const preview = page.getByText(/В файле: 17 глав, 110 сцен/)
    await expect(preview).toBeVisible({ timeout: 60_000 })
    log('preview line:', await preview.textContent())
    const titles = await page.locator('.card.small, .card .small').filter({ hasText: /сц\.$/ }).allTextContents()
    expect(titles.filter((t) => /^Часть \d+ — \d+ сц\.$/.test(t.trim()))).toHaveLength(17)

    const t0 = Date.now()
    await page.getByRole('button', { name: 'Импортировать', exact: true }).click()
    // the new story already has its starter chapter, so 17 + 1
    await expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(18, { timeout: 180_000 })
    const ms = Date.now() - t0
    log(`confirm click -> board visible: ${ms} ms`)
    perf({ test: 'panel-confirm-120k', project: 'desktop', confirmToBoardMs: ms })

    await page.waitForTimeout(2000)
    const all = await dumpDb(page, null, book.commentMarker)
    expect(all.projects).toHaveLength(2)
    const parts = all.chapters.filter((c) => /^Часть \d+$/.test(c.title))
    expect(parts).toHaveLength(17)
    expect(within(parts.reduce((n, c) => n + c.words, 0), book.totalWords, 0.01)).toBe(true)
    expect(all.textsWithMarker).toBe(0)
    expect(all.notes.filter((n) => n.text.startsWith('Комментарий к части'))).toHaveLength(7)
  })

  test('b. export the whole book to Word, import that .docx as a new story: same paragraphs, same words', async () => {
    await page.goto('/#/library')
    // open the first (imported) story through the library, then its «История» page
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent('manuscript:open', { detail: { id } })), importedProject)
    await expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(17)
    await page.goto('/#/book')
    await page.locator('summary', { hasText: 'Файлы и прочее' }).click()
    const t0 = Date.now()
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('button', { name: 'Вся история в Word (.docx)' }).click()])
    const path = await download.path()
    docx = readFileSync(path)
    log(`docx export: ${download.suggestedFilename()}, ${Math.round(docx.length / 1024)} KB, ${Date.now() - t0} ms`)
    perf({ test: 'docx-export-120k', project: 'desktop', ms: Date.now() - t0, kb: Math.round(docx.length / 1024) })

    await page.goto('/#/library')
    const before = (await dumpDb(page, null, '')).projects.length
    const t1 = Date.now()
    await page.locator('input[type="file"][accept*="docx"]').setInputFiles({
      name: 'round-trip.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx,
    })
    await expect.poll(async () => (await dumpDb(page, null, '')).projects.length, { timeout: 180_000 }).toBe(before + 1)
    await page.waitForTimeout(3000)
    const back = await dumpDb(page, null, book.commentMarker)
    log(`docx import -> new story ready: ~${Date.now() - t1} ms`)
    perf({ test: 'docx-import-120k', project: 'desktop', ms: Date.now() - t1 })

    const diffs: string[] = []
    if (back.chapters.length !== firstDump.chapters.length) diffs.push(`chapters ${firstDump.chapters.length} -> ${back.chapters.length}`)
    firstDump.chapters.forEach((c, i) => {
      const b = back.chapters[i]
      if (!b) return void diffs.push(`${c.title}: missing after round trip`)
      if (b.title !== c.title) diffs.push(`chapter ${i + 1} title "${c.title}" -> "${b.title}"`)
      if (b.scenes !== c.scenes) diffs.push(`${c.title}: scenes ${c.scenes} -> ${b.scenes}`)
      if (b.paragraphs !== c.paragraphs) diffs.push(`${c.title}: paragraphs ${c.paragraphs} -> ${b.paragraphs}`)
      if (b.words !== c.words) diffs.push(`${c.title}: words ${c.words} -> ${b.words}`)
    })
    log('round trip: scenes', firstDump.scenes, '->', back.scenes, '| words', firstDump.sceneWordSum, '->', back.sceneWordSum, '| notes', firstDump.notes.length, '->', back.notes.length, '| epigraphs', firstDump.epigraphScenes, '->', back.epigraphScenes)
    log('round trip differences:', diffs.length ? '\n  ' + diffs.join('\n  ') : 'none')

    expect(back.chapters.map((c) => c.paragraphs), 'paragraphs per chapter').toEqual(firstDump.chapters.map((c) => c.paragraphs))
    expect(within(back.sceneWordSum, firstDump.sceneWordSum, 0.005), `words ${firstDump.sceneWordSum} -> ${back.sceneWordSum}`).toBe(true)
    expect(diffs).toEqual([])
  })

  test('c. Ficbook copy of a chapter with an author note does not contain the note', async () => {
    await page.goto('/#/library')
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent('manuscript:open', { detail: { id } })), importedProject)
    await expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(17)
    await page.goto('/#/book')
    await page.locator('summary', { hasText: 'Все главы и план выкладки' }).click()
    const copy = page.getByTitle('Скопировать для Фикбука')
    await expect(copy).toHaveCount(17)

    for (const idx of [0, 10, 16]) {
      await copy.nth(idx).click()
      await expect.poll(() => page.evaluate(() => (window as any).__clip)).not.toBeNull()
      const clip: string = await page.evaluate(() => (window as any).__clip)
      await page.evaluate(() => ((window as any).__clip = null))
      const part = book.parts[idx]
      const lines = clip.split('\n').filter((l) => l.trim())
      const prose = lines.filter((l) => !/^<center>/.test(l))
      const centers = lines.length - prose.length
      log(`ficbook copy of «${part.title}»: ${clip.length} chars, ${prose.length} paragraphs, ${centers} scene breaks`)
      expect(clip).not.toContain(book.commentMarker)
      expect(clip).not.toContain('Комментарий к')
      expect(centers).toBe(part.scenes.length - 1)
      expect(prose).toHaveLength(book.parasPerPart[idx])
    }
    // formatting travels: any part with italics keeps its tags
    expect(book.parts[0].scenes.some((s) => s.paras.some((p) => p.includes('<i>')))).toBe(true)
  })
  test('e. timings with the 110-scene / 124k-word book: board after reload, a long scene, back', async () => {
    await page.goto('/#/library')
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent('manuscript:open', { detail: { id } })), importedProject)
    await expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(17)
    await page.goto('/#/board')
    await page.reload()
    await page.waitForFunction(() => (window as any).__boardAt !== null, null, { timeout: 120_000 })
    const boardMs = Math.round(await page.evaluate(() => (window as any).__boardAt))
    const heap = await heapMb(page)
    const target = firstDump.sceneIds[55]
    const textMs = await page.evaluate(async (id) => {
      const t = performance.now()
      location.hash = `#/text/${id}`
      await new Promise<void>((done) => {
        const tick = () => ((document.querySelector('.ProseMirror')?.textContent ?? '').length > 2000 ? done() : requestAnimationFrame(tick))
        tick()
      })
      return Math.round(performance.now() - t)
    }, target)
    perf({ test: 'real-book-110', project: 'desktop', reloadToBoardMs: boardMs, textOpenMs: textMs, heapMb: heap, heapAfterTextMb: await heapMb(page) })
    log(`124k-word book: reload -> board ${boardMs} ms, long scene opens in ${textMs} ms`)
  })
})

// ============================================================================ d: performance with 300 scenes

const RATES: Record<string, number[]> = { desktop: [1], phone: [1, 4], iphone: [1] }

for (const rate of [1, 4]) {
  test(`perf: 300 scenes, cpu x${rate}`, async ({ browser, page, context }, testInfo) => {
    const project = testInfo.project.name
    test.skip(!(RATES[project] ?? []).includes(rate), `no x${rate} run on ${project}`)
    test.setTimeout(900_000)
    const book = manyScenesBook()
    const phone = project !== 'desktop'
    const label = `${project} x${rate}`
    const result: Record<string, unknown> = { test: 'perf-300', project, cpuRate: rate, scenes: book.sceneCount, words: book.totalWords }

    await context.addInitScript(PROBE_SCRIPT)
    // First paint of the board after a load: the moment the board's own elements reach their final count.
    await context.addInitScript(
      ({ phone, want }) => {
        const w = window as any
        w.__boardAt = null
        const tick = () => {
          const n = phone ? document.querySelectorAll('.tl-chapter').length : document.querySelectorAll('article.card-scene').length
          if (n >= want) w.__boardAt = performance.now()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { phone, want: phone ? 18 : 300 },
    )
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Начать историю' })).toBeVisible()
    if (rate > 1) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    }

    // ---- import through the welcome screen
    const heap0 = await heapMb(page)
    const t0 = Date.now()
    const l0 = await nowInPage(page)
    await page.locator(WELCOME_IMPORT).setInputFiles(asFile('many.txt', book.text))
    await (phone ? expect(page.locator('.tl-chapter')).toHaveCount(18, { timeout: 600_000 }) : expect(page.locator(DESKTOP_COLUMNS)).toHaveCount(17, { timeout: 600_000 }))
    result.importToBoardMs = Date.now() - t0
    result.importLongTasks = await longTasksSince(page, l0)
    result.heapAfterImportMb = await heapMb(page)
    result.heapBeforeMb = heap0
    await page.waitForTimeout(rate > 1 ? 8000 : 3000)

    const db = await dumpDb(page, null, '')
    expect(db.scenes).toBe(300)
    const ids = db.sceneIds

    // ---- reload: time until the board is fully drawn
    await page.reload()
    await page.waitForFunction(() => (window as any).__boardAt !== null, null, { timeout: 300_000 })
    result.reloadToBoardMs = Math.round(await page.evaluate(() => (window as any).__boardAt))
    result.reloadLongTasks = await longTasksSince(page, 0)
    result.heapAfterReloadMb = await heapMb(page)
    result.domNodes = await page.evaluate(() => document.getElementsByTagName('*').length)

    // ---- open a scene card (sheet)
    {
      const since = await nowInPage(page)
      const card = phone ? page.locator('.tl-scene').first() : page.locator('article.card-scene').nth(150)
      await card.scrollIntoViewIfNeeded()
      const t = Date.now()
      await card.click()
      await expect(page.locator('.sheet')).toBeVisible({ timeout: 60_000 })
      result.sheetOpenMs = Date.now() - t
      result.sheetLongTasks = await longTasksSince(page, since)
      await page.keyboard.press('Escape')
      await expect(page.locator('.sheet')).toHaveCount(0)
    }

    // ---- text view of a scene in the middle
    {
      const target = ids[150]
      const since = await nowInPage(page)
      const ms = await page.evaluate(async (id) => {
        const t = performance.now()
        location.hash = `#/text/${id}`
        await new Promise<void>((done) => {
          const tick = () => {
            const pm = document.querySelector('.ProseMirror')
            if (pm && (pm.textContent ?? '').length > 80) done()
            else requestAnimationFrame(tick)
          }
          tick()
        })
        return Math.round(performance.now() - t)
      }, target)
      result.textOpenMs = ms
      result.textLongTasks = await longTasksSince(page, since)
      result.heapAfterTextMb = await heapMb(page)

      // and back to the board
      const since2 = await nowInPage(page)
      result.textToBoardMs = await page.evaluate(
        async ({ phone, want }) => {
          const t = performance.now()
          location.hash = '#/board'
          await new Promise<void>((done) => {
            const tick = () => {
              const n = phone ? document.querySelectorAll('.tl-chapter').length : document.querySelectorAll('article.card-scene').length
              if (n >= want && !document.querySelector('.ProseMirror')) done()
              else requestAnimationFrame(tick)
            }
            tick()
          })
          return Math.round(performance.now() - t)
        },
        { phone, want: phone ? 18 : 300 },
      )
      result.boardBackLongTasks = await longTasksSince(page, since2)
    }

    if (!phone) {
      // ---- drag the first card of chapter 1 into chapter 2 (pointer, in steps)
      const cols = page.locator(DESKTOP_COLUMNS)
      const from = cols.nth(0).locator('.cards > div').first()
      const to = cols.nth(1).locator('.cards > div').nth(2)
      await from.scrollIntoViewIfNeeded()
      const a = (await from.boundingBox())!
      const b = (await to.boundingBox())!
      const countIn = (i: number) => cols.nth(i).locator('.cards > div').count()
      const [c0, c1] = [await countIn(0), await countIn(1)]
      await page.evaluate(() => (window as any).__startFrames())
      const since = await nowInPage(page)
      const t = Date.now()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 })
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 })
      const tMoved = Date.now()
      await page.mouse.up()
      await expect.poll(() => countIn(1), { timeout: 60_000, intervals: [20] }).toBe(c1 + 1)
      result.dragTotalMs = Date.now() - t
      result.dragMoveStepsMs = tMoved - t
      result.dragDropToDomMs = Date.now() - tMoved
      result.dragFrames = frameStats(await page.evaluate(() => (window as any).__stopFrames()))
      result.dragLongTasks = await longTasksSince(page, since)
      expect(await countIn(0)).toBe(c0 - 1)
    } else {
      // ---- phone: there is no dragging; unfold every chapter instead (the heaviest thing the list does)
      const since = await nowInPage(page)
      await page.evaluate(() => (window as any).__startFrames())
      result.unfoldAllMs = await page.evaluate(async () => {
        const t = performance.now()
        document.querySelectorAll<HTMLButtonElement>('.tl-chapter:not(.open) .tl-head').forEach((h) => h.click())
        await new Promise<void>((done) => {
          const tick = () => (document.querySelectorAll('.tl-scene').length >= 300 ? done() : requestAnimationFrame(tick))
          tick()
        })
        return Math.round(performance.now() - t)
      })
      result.unfoldFrames = frameStats(await page.evaluate(() => (window as any).__stopFrames()))
      result.unfoldLongTasks = await longTasksSince(page, since)
    }
    result.heapEndMb = await heapMb(page)
    result.domNodesEnd = await page.evaluate(() => document.getElementsByTagName('*').length)
    log(label, JSON.stringify(result))
    perf(result)
    void browser
  })
}
