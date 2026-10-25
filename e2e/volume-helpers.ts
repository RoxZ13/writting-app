import type { Page } from '@playwright/test'

/**
 * Synthetic Ficbook-style .txt export of a long Russian book, plus helpers to read IndexedDB back.
 * Deterministic (seeded), so a failing number can be reproduced exactly.
 */

const ZWSP = String.fromCharCode(0x200b)

// ---------------------------------------------------------------- random

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- word counting (same rule as src/lib/text.ts)

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}
/** What the app sees after parsing: tags gone, zero-width spaces gone. */
export const plainOf = (line: string) => line.replace(/<\/?[a-z]+[^>]*>/gi, '').split(ZWSP).join('')
export const wordsOfLine = (line: string) => countWords(plainOf(line))

// ---------------------------------------------------------------- prose

interface Hero {
  n: string
  f: boolean
}
const HEROES: Hero[] = [
  { n: 'Ирина', f: true },
  { n: 'Глеб', f: false },
  { n: 'Марта', f: true },
  { n: 'Артём', f: false },
  { n: 'Вера', f: true },
  { n: 'Константин', f: false },
  { n: 'Лидия', f: true },
  { n: 'Тимур', f: false },
]
const PLACES = [
  'у окна', 'на пороге', 'возле старой печки', 'посреди тёмной комнаты', 'у входа в подъезд', 'на набережной',
  'под мостом', 'в конце длинного коридора', 'за столом', 'на узкой лестнице', 'у калитки', 'в тени липы',
  'на краю платформы', 'в пустой читальне', 'возле лодочной станции', 'на самом верху башни', 'в углу кухни',
]
const WEATHER = [
  'за стеклом моросил мелкий дождь', 'ветер гнал по двору сухие листья', 'в воздухе пахло речной сыростью',
  'свет фонаря дрожал на мокром асфальте', 'где-то далеко гудел поезд', 'в доме напротив погасло последнее окно',
  'тучи висели так низко, что казалось, будто их можно задеть рукой', 'снег лежал нетронутым до самого горизонта',
  'туман поднимался от воды и стелился по самым ступеням', 'на кухне тихо тикали старые часы',
]
const THOUGHTS = [
  'всё это слишком похоже на сон, из которого не хочется выходить', 'каждое слово звучит громче, чем нужно',
  'нельзя обещать того, чего не можешь исполнить', 'время идёт совсем не так, как рассказывают',
  'правда обычно бывает проще, чем её ждёшь, и оттого страшнее', 'нельзя жить, всё время оглядываясь назад',
  'иногда молчание говорит больше любого письма', 'надежда бывает упрямее здравого смысла',
  'у каждого дома есть свой голос, и этот был печальным',
]
const OBJECTS = [
  'письмо без подписи', 'потёртый ключ на ржавой цепочке', 'старую фотографию с обломанным краем', 'чашку остывшего чая',
  'тетрадь в клеёнчатой обложке', 'связку сухих трав', 'карту, исчёрканную карандашом', 'часы с треснувшим стеклом',
  'пустой конверт', 'маленькую медную монету',
]
const MOODS = [
  'тихо', 'устало', 'почти шёпотом', 'с неожиданной нежностью', 'растерянно', 'резко', 'будто извиняясь',
  'сквозь зубы', 'с едва заметной улыбкой', 'не поднимая глаз',
]
const SPEECH = [
  'Ты меня слышишь?', 'Я не хотел, чтобы всё вышло именно так.', 'Подожди, не уходи пока.', 'Значит, ты знала с самого начала.',
  'Скажи мне правду, хотя бы один раз.', 'Это ничего не меняет, и ты это понимаешь.', 'Нам нужно идти, пока не стемнело.',
  'Не смотри на меня так.', 'Я думала, ты давно уехал.', 'Откуда у тебя этот ключ?', 'Завтра будет поздно.',
  'Давай сделаем вид, что ничего не было.', 'Ты правда в это веришь?', 'Мне страшно, если честно.',
  'Тогда почему ты молчал всё это время?', 'Дай мне минуту, потом расскажу всё.', 'Тише, нас могут услышать.',
  'Я вернусь к рассвету, обещаю.', 'Здесь никого нет, можешь не бояться.', 'Ты неисправим, знаешь ли.',
  'Это был не он.', 'Хорошо, я пойду с тобой.', 'Кто тебе сказал?', 'Забудь, это неважно.',
]
const REPLY = ['сказал', 'ответил', 'бросил', 'повторил', 'спросил', 'выдохнул']
const REPLY_F = ['сказала', 'ответила', 'бросила', 'повторила', 'спросила', 'выдохнула']
const ITAL = ['никогда', 'именно так', 'всё равно', 'не сейчас', 'почему', 'он знал', 'она знала', 'слишком поздно']

type Rng = () => number
const pick = <T>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)]
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const verb = (h: Hero, m: string, f: string) => (h.f ? f : m)

function sentence(r: Rng): string {
  const a = pick(r, HEROES)
  let b = pick(r, HEROES)
  if (b === a) b = HEROES[(HEROES.indexOf(a) + 1) % HEROES.length]
  switch (Math.floor(r() * 14)) {
    case 0: return `${a.n} ${verb(a, 'остановился', 'остановилась')} ${pick(r, PLACES)} и долго смотрел${a.f ? 'а' : ''} на ${pick(r, OBJECTS)}.`
    case 1: return `Было уже поздно, ${pick(r, WEATHER)}, а ${a.n} всё не решал${a.f ? 'ась' : 'ся'} сказать то, ради чего пришёл${a.f ? 'ла' : ''}.`
    case 2: return `${b.n} ${verb(b, 'заметил', 'заметила')}, что ${a.n} ${verb(a, 'отвернулся', 'отвернулась')}, и ${verb(b, 'понял', 'поняла')}: ${pick(r, THOUGHTS)}.`
    case 3: return `Позже ${a.n} часто вспоминал${a.f ? 'а' : ''} этот вечер: ${pick(r, WEATHER)}, и на столе лежало ${pick(r, OBJECTS)}, как будто ничего не случилось.`
    case 4: return `${cap(pick(r, WEATHER))}, и ${a.n} ${verb(a, 'вдруг почувствовал', 'вдруг почувствовала')}, что ${pick(r, THOUGHTS)}.`
    case 5: return `Никто из них не ${verb(a, 'произнёс', 'произнесла')} ни слова, пока ${b.n} ${verb(b, 'искал', 'искала')} ${pick(r, OBJECTS)} ${pick(r, PLACES)}.`
    case 6: return `${a.n} ${verb(a, 'взял', 'взяла')} ${pick(r, OBJECTS)}, повертел${a.f ? 'а' : ''} в пальцах и ${verb(a, 'положил', 'положила')} обратно, ${pick(r, MOODS)}.`
    case 7: return `Ему казалось, что ${pick(r, THOUGHTS)}, но ${b.n} ${verb(b, 'думал', 'думала')} иначе.`
    case 8: return `${cap(pick(r, PLACES))} было пусто, только ${pick(r, WEATHER)}.`
    case 9: return `${b.n} ${verb(b, 'шагнул', 'шагнула')} навстречу ${a.n}, ${verb(b, 'помедлил', 'помедлила')} и ${verb(b, 'заговорил', 'заговорила')} ${pick(r, MOODS)}.`
    case 10: return `Сколько прошло времени, ${a.n} не ${verb(a, 'смог', 'смогла')} бы сказать, но ${pick(r, WEATHER)}, и это успокаивало.`
    case 11: return `${cap(pick(r, THOUGHTS))}, думал${a.f ? 'а' : ''} ${a.n}, глядя ${pick(r, PLACES)}.`
    case 12: return `${a.n} ${verb(a, 'засмеялся', 'засмеялась')} ${pick(r, MOODS)}, и от этого смеха стало немного легче всем, кто был ${pick(r, PLACES)}.`
    default: return `В ту ночь ${a.n} ${verb(a, 'так и не уснул', 'так и не уснула')}: ${pick(r, WEATHER)}, а в голове крутилось одно и то же.`
  }
}

function dialogueLine(r: Rng): string {
  const a = pick(r, HEROES)
  const line = pick(r, SPEECH)
  if (r() < 0.45) return `— ${line}`
  const v = a.f ? pick(r, REPLY_F) : pick(r, REPLY)
  return `— ${line.replace(/\.$/, ',')} — ${v} ${a.n}${r() < 0.4 ? ` ${pick(r, MOODS)}` : ''}.`
}

function decorate(r: Rng, line: string): string {
  let out = line
  if (r() < 0.07) {
    const words = out.split(' ')
    if (words.length > 4) {
      const i = 1 + Math.floor(r() * (words.length - 3))
      words[i] = `<i>${words[i]}`
      words[i + 1] = `${words[i + 1]}</i>`
      out = words.join(' ')
    }
  } else if (r() < 0.025) out = out.replace(/^(— )?/, `$1<i>${pick(r, ITAL)}</i>, `)
  if (r() < 0.025) {
    // a zero-width space next to a space, in the middle of a paragraph
    const i = out.indexOf(' ', Math.floor(out.length / 2))
    if (i > 0) out = `${out.slice(0, i + 1)}${ZWSP}${out.slice(i + 1)}`
  }
  if (r() < 0.006) {
    // and one inside a word
    const i = out.indexOf(' ', Math.floor(out.length / 3))
    if (i > 3) out = `${out.slice(0, i - 2)}${ZWSP}${out.slice(i - 2)}`
  }
  return out
}

/** Paragraphs for one scene until at least `target` words are reached. */
function sceneParagraphs(r: Rng, target: number): string[] {
  const paras: string[] = []
  let words = 0
  while (words < target) {
    let line: string
    if (r() < 0.4) line = dialogueLine(r)
    else {
      const n = 2 + Math.floor(r() * 4)
      line = Array.from({ length: n }, () => sentence(r)).join(' ')
    }
    line = decorate(r, line)
    // a scene never opens with something that could read as a heading or an epigraph
    if (!paras.length && !/[.!?…]$/.test(plainOf(line)) && !line.startsWith('—')) line += '.'
    paras.push(line)
    words += wordsOfLine(line)
  }
  return paras
}

const EPIGRAPHS = [
  'Нино Катамадзе — Ты рядом', 'Linkin Park — Numb', 'ДДТ — Осенняя', 'Nautilus Pompilius — Утро Полины', 'Muse — Hysteria',
  'Земфира — Искала', 'Би-2 — Полковнику никто не пишет', 'Агата Кристи — Опиум для никого', 'Placebo — Without You',
  'Кино — Группа крови', 'Lumen — Гореть', 'Сплин — Выхода нет', 'Mgzavrebi — Саквапе', 'Rammstein — Du Hast',
  'Мельница — Дикие травы', 'Louna — Время X', 'Arctic Monkeys — Do I Wanna Know',
]

// ---------------------------------------------------------------- the book

export interface GenScene {
  epigraph?: string
  paras: string[]
  /** Words as the app counts them, epigraph included. */
  words: number
}
export interface GenPart {
  title: string
  scenes: GenScene[]
  /** Author's note lines (parts with a trailing «Комментарий к…» block). */
  comment?: string[]
}
export interface GenBook {
  title: string
  text: string
  parts: GenPart[]
  totalWords: number
  sceneCount: number
  /** Paragraphs per part, epigraph line included (what a Word round trip must keep). */
  parasPerPart: number[]
  commentCount: number
  /** A string that occurs only in author's notes. */
  commentMarker: string
}

export interface GenOptions {
  seed?: number
  parts?: number
  /** Scenes per part: a number, or a function of the part index. */
  scenesPerPart?: number | ((i: number) => number)
  wordsPerScene?: number
  /** Parts from this index (0-based) carry an author's note. */
  commentsFrom?: number
}

export const COMMENT_MARKER = 'Заметка автора'

export function generateBook(opts: GenOptions = {}): GenBook {
  const r = mulberry32(opts.seed ?? 20261018)
  const nParts = opts.parts ?? 17
  const per = opts.scenesPerPart ?? ((i: number) => (i % 2 === 0 && i < 16 ? 7 : 6))
  const wordsPerScene = opts.wordsPerScene ?? 1100
  const commentsFrom = opts.commentsFrom ?? 10
  const title = 'Тени над Невой'
  const lines: string[] = [
    title,
    '',
    'Автор: Тестовый Автор',
    'Направленность: Гет',
    'Рейтинг: PG-13',
    'Фэндом: Оригинальные произведения',
    'Описание: Длинная история о доме на набережной, письмах без подписи и людях, которые слишком долго молчали.',
    '',
  ]
  const parts: GenPart[] = []
  let total = 0
  let sceneCount = 0
  for (let p = 0; p < nParts; p++) {
    const partTitle = `Часть ${p + 1}`
    lines.push(`========== ${partTitle} ==========`, '')
    const nScenes = typeof per === 'number' ? per : per(p)
    const part: GenPart = { title: partTitle, scenes: [] }
    for (let s = 0; s < nScenes; s++) {
      const target = Math.max(20, Math.round(wordsPerScene * (0.85 + r() * 0.3)))
      const paras = sceneParagraphs(r, target)
      const epigraph = s === 0 ? EPIGRAPHS[p % EPIGRAPHS.length] : undefined
      const all = epigraph ? [epigraph, ...paras] : paras
      const words = all.reduce((n, l) => n + wordsOfLine(l), 0)
      part.scenes.push({ epigraph, paras, words })
      total += words
      sceneCount++
      for (const l of all) lines.push(l, '')
      if (s < nScenes - 1) lines.push('***', '')
    }
    if (p >= commentsFrom) {
      const n = 2 + Math.floor(r() * 3)
      part.comment = Array.from({ length: n }, (_, k) => `${COMMENT_MARKER} ${p + 1}.${k + 1}: ${sentence(r)}`)
      lines.push(`    Комментарий к ${partTitle}`, ...part.comment, '')
    }
    parts.push(part)
  }
  return {
    title,
    text: lines.join('\r\n'),
    parts,
    totalWords: total,
    sceneCount,
    parasPerPart: parts.map((pt) => pt.scenes.reduce((n, s) => n + s.paras.length + (s.epigraph ? 1 : 0), 0)),
    commentCount: parts.filter((pt) => pt.comment).length,
    commentMarker: COMMENT_MARKER,
  }
}

/** ~110 scenes of ~1100 words in 17 parts. */
export const realBook = (): GenBook => generateBook()

/** 300 short scenes in 17 parts (11 parts of 18, 6 of 17). */
export const manyScenesBook = (): GenBook =>
  generateBook({ seed: 7, scenesPerPart: (i) => (i < 11 ? 18 : 17), wordsPerScene: 60, commentsFrom: 99 })

/** Two parts, three scenes each: enough content for screens, small enough to be quick. */
export const smallBook = (): GenBook =>
  generateBook({ seed: 3, parts: 2, scenesPerPart: 3, wordsPerScene: 120, commentsFrom: 1 })

export const asFile = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') })

// ---------------------------------------------------------------- reading IndexedDB back

export interface ChapterDump {
  title: string
  scenes: number
  words: number
  paragraphs: number
}
export interface DbDump {
  /** Alive projects, newest first. */
  projects: { id: string; title: string; description?: string }[]
  /** Chapters of the given project (non-pool), in order. */
  chapters: ChapterDump[]
  scenes: number
  sceneWordSum: number
  textWordSum: number
  /** How many alive texts contain the marker anywhere in their JSON. */
  textsWithMarker: number
  notes: { text: string; sceneId?: string; kind: string }[]
  poolScenes: number
  epigraphScenes: number
  /** Scene ids in reading order (chapter order, then scene order). */
  sceneIds: string[]
}

/** Plain IndexedDB, so the check does not depend on the app's own code. */
export async function dumpDb(page: Page, projectId: string | null, marker: string): Promise<DbDump> {
  return page.evaluate(
    async ({ projectId, marker }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('manuscript')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const all = (store: string) =>
        new Promise<any[]>((res, rej) => {
          const r = db.transaction(store).objectStore(store).getAll()
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
      const alive = <T extends { deleted?: boolean }>(a: T[]) => a.filter((x) => !x.deleted)
      const projects = alive(await all('projects')).sort((a, b) => b.updatedAt - a.updatedAt)
      const pid = projectId ?? projects[0]?.id
      const chapters = alive(await all('chapters')).filter((c) => c.projectId === pid)
      const scenes = alive(await all('scenes')).filter((s) => s.projectId === pid)
      const texts = new Map(alive(await all('texts')).filter((t) => t.projectId === pid).map((t) => [t.id, t]))
      const notes = alive(await all('notes')).filter((n) => n.projectId === pid)
      const paraCount = (node: any): number => {
        if (!node) return 0
        if (node.type === 'paragraph' || node.type === 'heading')
          return (node.content ?? []).some((c: any) => (c.text ?? '').trim() || c.type === 'hardBreak') ? 1 : 0
        return (node.content ?? []).reduce((n: number, c: any) => n + paraCount(c), 0)
      }
      const real = chapters.filter((c) => !c.pool).sort((a, b) => a.order - b.order)
      const pool = chapters.filter((c) => c.pool)
      let textsWithMarker = 0
      for (const t of texts.values()) if (JSON.stringify(t.content).includes(marker)) textsWithMarker++
      db.close()
      return {
        projects: projects.map((p) => ({ id: p.id, title: p.title, description: p.description })),
        chapters: real.map((c) => {
          const own = scenes.filter((s) => s.chapterId === c.id)
          return {
            title: c.title,
            scenes: own.length,
            words: own.reduce((n, s) => n + (s.wordCount ?? 0), 0),
            paragraphs: own.reduce((n, s) => n + paraCount(texts.get(s.id)?.content), 0),
          }
        }),
        scenes: scenes.filter((s) => !pool.some((p) => p.id === s.chapterId)).length,
        sceneWordSum: scenes.reduce((n, s) => n + (s.wordCount ?? 0), 0),
        textWordSum: [...texts.values()].reduce((n, t) => n + (t.wordCount ?? 0), 0),
        textsWithMarker,
        notes: notes.map((n) => ({ text: n.text, sceneId: n.sceneId, kind: n.kind })),
        poolScenes: scenes.filter((s) => pool.some((p) => p.id === s.chapterId)).length,
        epigraphScenes: scenes.filter((s) => s.epigraph).length,
        sceneIds: real.flatMap((c) => scenes.filter((s) => s.chapterId === c.id).sort((a, b) => a.order - b.order).map((s) => s.id)),
      }
    },
    { projectId, marker },
  )
}

// ---------------------------------------------------------------- measuring

/** Long tasks and frame gaps, collected from page start (install before the first navigation). */
export const PROBE_SCRIPT = `
  window.__long = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]) })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  window.__frames = null;
  window.__startFrames = () => {
    window.__frames = []; let last = performance.now();
    const tick = (t) => { if (window.__frames === null) return; window.__frames.push(t - last); last = t; requestAnimationFrame(tick) };
    requestAnimationFrame(tick);
  };
  window.__stopFrames = () => { const f = window.__frames || []; window.__frames = null; return f };
`

export interface LongStats {
  count: number
  totalMs: number
  maxMs: number
}
export async function longTasksSince(page: Page, since: number): Promise<LongStats> {
  return page.evaluate((since) => {
    const l = ((window as any).__long as [number, number][]).filter(([s]) => s >= since)
    return { count: l.length, totalMs: Math.round(l.reduce((n, [, d]) => n + d, 0)), maxMs: Math.round(Math.max(0, ...l.map(([, d]) => d))) }
  }, since)
}
export const nowInPage = (page: Page) => page.evaluate(() => performance.now())
export async function heapMb(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const m = (performance as any).memory
    return m ? Math.round((m.usedJSHeapSize / 1048576) * 10) / 10 : null
  })
}
export function frameStats(f: number[]) {
  if (!f.length) return { frames: 0, maxMs: 0, p95Ms: 0, over50: 0 }
  const s = [...f].sort((a, b) => a - b)
  return {
    frames: f.length,
    maxMs: Math.round(s[s.length - 1]),
    p95Ms: Math.round(s[Math.floor(s.length * 0.95)]),
    over50: f.filter((x) => x > 50).length,
  }
}
