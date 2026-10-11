import type { Chapter, Project } from '../db/db'
import { patch } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { bank, dayKey, pace, totalWords } from '../lib/pace'
import { formatWords } from '../lib/text'
import { PLATFORMS, platformOf } from '../lib/platforms'
import { toast } from '../lib/ui'
import { chapterLength, hasNorm, lengthText, normText, PAGE, pageSize, sumChars } from '../lib/length'
import { useState } from 'react'

const DAY = 86400000
const date = (d: Date | string) =>
  (typeof d === 'string' ? new Date(d + 'T12:00:00') : d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const num = (n: number) => n.toLocaleString('ru-RU')

export function NumberField({ value, placeholder, onSave, decimal }: { value?: number; placeholder: string; onSave: (v?: number) => void; decimal?: boolean }) {
  return (
    <input
      className="input num-input"
      inputMode={decimal ? 'decimal' : 'numeric'}
      placeholder={placeholder}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const raw = e.target.value.replace(/\s/g, '')
        const v = decimal ? parseFloat(raw.replace(',', '.')) : parseInt(raw.replace(/\D/g, ''), 10)
        onSave(Number.isFinite(v) && v > 0 ? v : undefined)
      }}
    />
  )
}

/**
 * A calm forecast: how much gets written, and when the book is done at this pace. No streaks, no guilt:
 * folded into one line, and with no written days yet it shows no zeros at all.
 */
export function PaceSection({ data }: { data: ProjectData }) {
  const p = data.project
  const set = (changes: Partial<Project>) => void patch<Project>('projects', p.id, changes)
  const total = totalWords([...data.scenes, ...data.pool.scenes])
  const pc = pace(p, total)
  const written = pc.last14.some((d) => d.words > 0)
  const max = Math.max(1, ...pc.last14.map((d) => d.words), p.dailyGoal ?? 0)
  const summary = written
    ? `Темп · сегодня +${num(pc.today)}${p.dailyGoal ? ` из ${num(p.dailyGoal)}` : ''} · ${num(pc.perDay)} в день`
    : 'Темп и цели'
  return (
    <details className="card settings-section book-fold">
      <summary>
        <span>{summary}</span>
        <span className="muted small">{num(total)} сл.</span>
      </summary>
      <div className="stack" style={{ marginTop: 14 }}>
        {written ? (
          <>
            <div className="pace-bars" aria-label="Слова по дням за две недели">
              {pc.last14.map((d) => (
                <span key={d.key} title={`${date(d.key)}: ${num(d.words)} сл.`} className={d.key === dayKey() ? 'today' : ''}>
                  <i style={{ height: `${Math.round((d.words / max) * 100)}%` }} />
                </span>
              ))}
              {p.dailyGoal ? <b className="pace-goal" style={{ bottom: `${Math.round((p.dailyGoal / max) * 100)}%` }} /> : null}
            </div>
            <BankLine project={p} />
            <div className="pace-forecast">{forecastText(p, pc)}</div>
          </>
        ) : (
          <div className="muted small">Начнёшь писать — здесь появится, сколько слов в день выходит и когда допишешь. Цели ниже — по желанию.</div>
        )}
        <div className="row" style={{ gap: 20 }}>
          <label>
            <span className="field-label">Цель на день, слов</span>
            <NumberField value={p.dailyGoal} placeholder="необязательно" onSave={(dailyGoal) => set({ dailyGoal })} />
          </label>
          <label>
            <span className="field-label">Сколько слов будет в истории</span>
            <NumberField value={p.targetWords} placeholder="необязательно" onSave={(targetWords) => set({ targetWords })} />
          </label>
        </div>
      </div>
    </details>
  )
}

/** Only what is already done: words this month, weeks in a row. Nothing about days missed. */
function BankLine({ project }: { project: Project }) {
  const b = bank(project)
  const parts = [
    b.monthWords > 0 && `За ${b.monthName} — ${formatWords(b.monthWords)}`,
    b.weeks >= 2 && `возвращаешься к тексту ${b.weeks}-ю неделю`,
  ].filter(Boolean) as string[]
  if (!parts.length) return null
  const line = parts.join(' · ')
  return <div className="pace-bank">{line[0].toUpperCase() + line.slice(1)}</div>
}

function forecastText(p: Project, pc: ReturnType<typeof pace>): string {
  if (!p.targetWords) return 'Укажи, сколько слов будет в истории, — и здесь появится прогноз, когда допишешь.'
  if (pc.remaining === 0) return 'По объёму история уже написана. Дальше — правка.'
  const rest = `Осталось ~${num(pc.remaining!)} слов.`
  if (!pc.perDay) return `${rest} Как только появятся записанные дни, здесь будет прогноз.`
  let s = `${rest} В таком темпе допишешь к ${date(pc.finish!)}.`
  if (p.deadline && pc.needPerDay) {
    s += pc.needPerDay <= pc.perDay ? ` К дедлайну (${date(p.deadline)}) успеваешь.` : ` К дедлайну (${date(p.deadline)}) нужно ~${num(pc.needPerDay)} в день.`
  }
  return s
}

/** The work's page on its site: typed by the author, or (for Ficbook) the link in the imported header. */
export function ficbookLink(p: Project): string | undefined {
  if (p.ficbookUrl) return p.ficbookUrl
  if (platformOf(p).id !== 'ficbook') return undefined
  return p.description?.match(/https?:\/\/ficbook\.net\/readfic\/[\w-]+/)?.[0]
}

/**
 * How ready a chapter is, in words. A written chapter is never «0%»: statuses are optional,
 * so without them it is simply «написана»; with some scenes marked done it shows how much is proofread.
 */
function readiness({ ready, written }: { ready: number; written: boolean }) {
  if (!written) return 'ещё пишется'
  if (ready >= 100) return 'готова'
  return ready > 0 ? `вычитано ${ready}%` : 'написана'
}

/** Where the book stands on its site: what is up, what is next and how ready it is. */
export function PublishSection({ data, onCopy }: { data: ProjectData; onCopy: (chapterId: string) => void }) {
  const p = data.project
  const setCh = (c: Chapter, changes: Partial<Chapter>) => void patch<Chapter>('chapters', c.id, changes)
  const rows = data.outline.map(({ chapter, scenes }) => ({
    chapter,
    ready: scenes.length ? Math.round((scenes.filter((s) => s.status === 'done').length / scenes.length) * 100) : 0,
    written: scenes.length > 0 && scenes.every((s) => s.wordCount > 0),
    chars: sumChars(scenes),
  }))
  const lastUp = [...rows].reverse().find((r) => r.chapter.publishedAt)
  const next = rows.find((r) => !r.chapter.publishedAt)
  const due =
    next && lastUp?.chapter.publishedAt && p.publishEvery
      ? new Date(new Date(lastUp.chapter.publishedAt + 'T12:00:00').getTime() + p.publishEvery * DAY)
      : undefined
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / DAY) : undefined
  const link = ficbookLink(p)
  const site = platformOf(p)
  const copyLabel = site.for ? `Скопировать ${site.for}` : 'Скопировать главу'

  return (
    <section className="card settings-section stack">
      <h3>Выкладка {site.to}</h3>
      {next ? (
        <div className="publish-next">
          <div>
            <span className="muted">Следующая:</span> <strong>{next.chapter.title}</strong> · {readiness(next)}
            {due && (
              <span className={daysLeft! < 0 ? 'late' : ''}>
                {' '}
                · по плану {daysLeft! > 0 ? `через ${daysLeft} дн. (${date(due)})` : daysLeft === 0 ? 'сегодня' : `была ${date(due)}`}
              </span>
            )}
          </div>
          <div className="row">
            <button className="btn primary sm" onClick={() => onCopy(next.chapter.id)}>
              {copyLabel}
            </button>
            {link && (
              <a className="btn sm" href={link} target="_blank" rel="noreferrer">
                Открыть {site.at} ↗
              </a>
            )}
            <button
              className="btn sm"
              onClick={() => {
                // What readers have seen does not move by accident.
                setCh(next.chapter, { publishedAt: dayKey(), locked: true })
                toast('Отмечено. Глава зафиксирована на доске — открепить можно в ⋯ у главы')
              }}
            >
              ✓ Выложила сегодня
            </button>
          </div>
        </div>
      ) : (
        <div className="muted">Все главы выложены.</div>
      )}
      <details>
        <summary className="small">Все главы и план выкладки</summary>
        <div className="stack" style={{ gap: 12, marginTop: 10 }}>
          <div className="typo-row">
            <span className="typo-label">Площадка</span>
            <div className="seg">
              {PLATFORMS.map((x) => (
                <button key={x.id} aria-pressed={site.id === x.id} onClick={() => void patch<Project>('projects', p.id, { platform: x.id })}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
          <label className="row" style={{ gap: 10 }}>
            <span className="small">Новая глава каждые</span>
            <NumberField value={p.publishEvery} placeholder="7" onSave={(publishEvery) => void patch<Project>('projects', p.id, { publishEvery })} />
            <span className="small">дн.</span>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">Работа {site.at}</span>
            <input
              key={site.id}
              className="input"
              placeholder={site.url}
              defaultValue={p.ficbookUrl ?? link ?? ''}
              onBlur={(e) => void patch<Project>('projects', p.id, { ficbookUrl: e.target.value.trim() || undefined })}
            />
          </label>
        </div>
        <div className="publish-list">
          {rows.map(({ chapter, ready, written, chars }) => (
            <div key={chapter.id} className="publish-row">
              <span className="publish-title">{chapter.title}</span>
              {/* Length before going up: the site's rule is easier to keep when it is in sight. */}
              {chars > 0 && (
                <span className={`small len-tag ${chapterLength(p, chars).state}`} title={hasNorm(p) ? `норма ${normText(p)}` : undefined}>
                  {lengthText(p, chars)}
                </span>
              )}
              <span className="small muted">{readiness({ ready, written })}</span>
              <input
                className="input sm"
                type="date"
                title="Когда выложена"
                defaultValue={chapter.publishedAt ?? ''}
                onChange={(e) => setCh(chapter, { publishedAt: e.target.value || undefined })}
              />
              <button className="icon-btn" title={copyLabel} onClick={() => onCopy(chapter.id)}>
                ⧉
              </button>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}

/**
 * «Длина главы»: the site's rule or the author's own, from–to, in pages or characters.
 * While writing, a thin line at the top of the page fills up against it.
 */
export function LengthNorm({ project }: { project: Project }) {
  const p = project
  const [open, setOpen] = useState(false)
  const set = (changes: Partial<Project>) => void patch<Project>('projects', p.id, changes)
  const inPages = p.lengthUnit !== 'chars'
  const page = pageSize(p)
  // Fields show the author's unit; the norm is kept in characters.
  const shown = (chars?: number) => (chars ? (inPages ? Math.round((chars / page) * 10) / 10 : chars) : undefined)
  const toChars = (v?: number) => (v ? Math.round(inPages ? v * page : v) : undefined)
  if (!open)
    return (
      <div className="small muted" style={{ marginTop: 6 }}>
        {hasNorm(p) ? (
          <>
            глава: <strong className="norm-v">{normText(p)}</strong>{' '}
            <button className="link" onClick={() => setOpen(true)}>
              изменить
            </button>
          </>
        ) : (
          <button className="link" onClick={() => setOpen(true)}>
            + длина главы
          </button>
        )}
      </div>
    )
  return (
    <div className="length-norm">
      <div className="seg sm">
        <button aria-pressed={inPages} onClick={() => set({ lengthUnit: 'pages' })}>
          страницы
        </button>
        <button aria-pressed={!inPages} onClick={() => set({ lengthUnit: 'chars' })}>
          знаки
        </button>
      </div>
      <label className="row small" style={{ gap: 6 }}>
        от
        <NumberField key={`min${p.lengthUnit}`} value={shown(p.chapterMin)} decimal={inPages} placeholder="—" onSave={(v) => set({ chapterMin: toChars(v) })} />
        до
        <NumberField key={`max${p.lengthUnit}`} value={shown(p.chapterMax)} decimal={inPages} placeholder="—" onSave={(v) => set({ chapterMax: toChars(v) })} />
        {inPages ? 'стр.' : 'знаков'}
      </label>
      {inPages && (
        <label className="row small muted" style={{ gap: 6 }}>
          на странице
          <NumberField value={p.pageChars} placeholder={String(PAGE)} onSave={(pageChars) => set({ pageChars })} />
          знаков с пробелами
        </label>
      )}
      <div className="row small" style={{ gap: 12 }}>
        <button className="link" onClick={() => setOpen(false)}>
          готово
        </button>
        {hasNorm(p) && (
          <button className="link muted" onClick={() => set({ chapterMin: undefined, chapterMax: undefined })}>
            без нормы
          </button>
        )}
      </div>
    </div>
  )
}
