import type { Chapter, Project } from '../db/db'
import { patch } from '../db/repo'
import type { ProjectData } from '../lib/hooks'
import { dayKey, pace, totalWords } from '../lib/pace'

const DAY = 86400000
const date = (d: Date | string) =>
  (typeof d === 'string' ? new Date(d + 'T12:00:00') : d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const num = (n: number) => n.toLocaleString('ru-RU')

function NumberField({ value, placeholder, onSave }: { value?: number; placeholder: string; onSave: (v?: number) => void }) {
  return (
    <input
      className="input num-input"
      inputMode="numeric"
      placeholder={placeholder}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const v = parseInt(e.target.value.replace(/\D/g, ''), 10)
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
            <span className="field-label">Сколько слов в книге будет</span>
            <NumberField value={p.targetWords} placeholder="необязательно" onSave={(targetWords) => set({ targetWords })} />
          </label>
        </div>
      </div>
    </details>
  )
}

function forecastText(p: Project, pc: ReturnType<typeof pace>): string {
  if (!p.targetWords) return 'Укажи, сколько слов будет в книге, — и здесь появится прогноз, когда допишешь.'
  if (pc.remaining === 0) return 'По объёму книга уже написана. Дальше — правка.'
  const rest = `Осталось ~${num(pc.remaining!)} слов.`
  if (!pc.perDay) return `${rest} Как только появятся записанные дни, здесь будет прогноз.`
  let s = `${rest} В таком темпе допишешь к ${date(pc.finish!)}.`
  if (p.deadline && pc.needPerDay) {
    s += pc.needPerDay <= pc.perDay ? ` К дедлайну (${date(p.deadline)}) успеваешь.` : ` К дедлайну (${date(p.deadline)}) нужно ~${num(pc.needPerDay)} в день.`
  }
  return s
}

/** The work's page on Ficbook: typed by the author, or the link in the imported header. */
export function ficbookLink(p: Project): string | undefined {
  return p.ficbookUrl || p.description?.match(/https?:\/\/ficbook\.net\/readfic\/[\w-]+/)?.[0]
}

/** Where the book stands on Ficbook: what is up, what is next and how ready it is. */
export function PublishSection({ data, onCopy }: { data: ProjectData; onCopy: (chapterId: string) => void }) {
  const p = data.project
  const setCh = (c: Chapter, changes: Partial<Chapter>) => void patch<Chapter>('chapters', c.id, changes)
  const rows = data.outline.map(({ chapter, scenes }) => ({
    chapter,
    ready: scenes.length ? Math.round((scenes.filter((s) => s.status === 'done').length / scenes.length) * 100) : 0,
    written: scenes.length > 0 && scenes.every((s) => s.wordCount > 0),
  }))
  const lastUp = [...rows].reverse().find((r) => r.chapter.publishedAt)
  const next = rows.find((r) => !r.chapter.publishedAt)
  const due =
    next && lastUp?.chapter.publishedAt && p.publishEvery
      ? new Date(new Date(lastUp.chapter.publishedAt + 'T12:00:00').getTime() + p.publishEvery * DAY)
      : undefined
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / DAY) : undefined
  const link = ficbookLink(p)

  return (
    <section className="card settings-section stack">
      <h3>Выкладка на Фикбук</h3>
      {next ? (
        <div className="publish-next">
          <div>
            <span className="muted">Следующая:</span> <strong>{next.chapter.title}</strong> · {next.written ? `готова на ${next.ready}%` : 'ещё пишется'}
            {due && (
              <span className={daysLeft! < 0 ? 'late' : ''}>
                {' '}
                · по плану {daysLeft! > 0 ? `через ${daysLeft} дн. (${date(due)})` : daysLeft === 0 ? 'сегодня' : `была ${date(due)}`}
              </span>
            )}
          </div>
          <div className="row">
            <button className="btn primary sm" onClick={() => onCopy(next.chapter.id)}>
              Скопировать для Фикбука
            </button>
            {link && (
              <a className="btn sm" href={link} target="_blank" rel="noreferrer">
                Открыть на Фикбуке ↗
              </a>
            )}
            <button className="btn sm" onClick={() => setCh(next.chapter, { publishedAt: dayKey() })}>
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
          <label className="row" style={{ gap: 10 }}>
            <span className="small">Новая глава каждые</span>
            <NumberField value={p.publishEvery} placeholder="7" onSave={(publishEvery) => void patch<Project>('projects', p.id, { publishEvery })} />
            <span className="small">дн.</span>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">Работа на Фикбуке</span>
            <input
              className="input"
              placeholder="https://ficbook.net/readfic/…"
              defaultValue={p.ficbookUrl ?? link ?? ''}
              onBlur={(e) => void patch<Project>('projects', p.id, { ficbookUrl: e.target.value.trim() || undefined })}
            />
          </label>
        </div>
        <div className="publish-list">
          {rows.map(({ chapter, ready, written }) => (
            <div key={chapter.id} className="publish-row">
              <span className="publish-title">{chapter.title}</span>
              <span className="small muted">{written ? `${ready}%` : 'пишется'}</span>
              <input
                className="input sm"
                type="date"
                title="Когда выложена"
                defaultValue={chapter.publishedAt ?? ''}
                onChange={(e) => setCh(chapter, { publishedAt: e.target.value || undefined })}
              />
              <button className="icon-btn" title="Скопировать для Фикбука" onClick={() => onCopy(chapter.id)}>
                ⧉
              </button>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
