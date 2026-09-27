import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { chapterLabel, markerStatus, sceneLabel, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { MARKER_STATES, STATUSES, statusOf, timeAgo } from '../lib/status'
import { formatWords, lastParagraphs } from '../lib/text'
import { plural } from '../components/ImportPanel'

export function HomeView({ data }: { data: ProjectData }) {
  const scene =
    (data.project.lastSceneId && data.sceneById.get(data.project.lastSceneId)) ||
    data.scenes.find((s) => s.status !== 'done') ||
    data.scenes[0]
  const text = useLiveQuery(() => (scene ? db.texts.get(scene.id) : undefined), [scene?.id])

  const statuses = data.markers.map((m) => ({ m, st: markerStatus(m, data) }))
  const hanging = statuses.filter((x) => x.st === 'hanging')
  const late = statuses.filter((x) => x.st === 'late')
  const inbox = data.notes.filter((n) => !n.archived && !n.sceneId)
  const questions = data.notes.filter((n) => !n.archived && n.kind === 'question')
  const totalWords = data.scenes.reduce((n, s) => n + s.wordCount, 0)

  if (!scene) {
    return (
      <div className="empty">
        <h2>В истории пока нет сцен</h2>
        <p>Открой план и добавь первую.</p>
        <button className="btn primary" onClick={() => go({ view: 'plan' })}>
          Открыть план
        </button>
      </div>
    )
  }

  const st = statusOf(scene.status)
  const nextBeat = scene.beats.find((b) => !b.done)
  const toPayHere = data.markers.filter((m) => m.payoffSceneId === scene.id && !m.resolved)
  const idx = data.sceneIndex.get(scene.id) ?? 0
  const nextOpen = data.scenes.slice(idx + 1).find((s) => s.status !== 'done')

  return (
    <div className="home-grid">
      <section className="card continue">
        <div className="eyebrow">
          Ты остановилась здесь{text?.updatedAt ? ` · ${timeAgo(text.updatedAt)}` : ''}
        </div>
        <div className="where" style={{ marginTop: 10 }}>
          {chapterLabel(data, scene.chapterId)}
        </div>
        <h1>{scene.title}</h1>
        <div className="row" style={{ marginBottom: 16 }}>
          <span className="chip">
            <span className="dot" style={{ background: st.color }} />
            {st.label}
          </span>
          <span className="chip">{formatWords(scene.wordCount)}</span>
        </div>

        <div className="stack">
          {data.project.nextStep && (
            <div className="next-step">
              <div className="eyebrow" style={{ color: 'var(--focus)' }}>
                Записка себе
              </div>
              {data.project.nextStep}
            </div>
          )}

          <div className="goal-box">
            <div className="eyebrow">Зачем эта сцена</div>
            {scene.goal ? (
              <div style={{ marginTop: 4 }}>{scene.goal}</div>
            ) : (
              <div className="muted small" style={{ marginTop: 4 }}>
                Цель не записана. Одна фраза «что здесь должно измениться» спасает от кружения — добавь её в брифе
                сцены.
              </div>
            )}
            {scene.beats.length > 0 && (
              <ul className="beats-preview">
                {scene.beats.map((b) => (
                  <li key={b.id} className={b.done ? 'done' : ''}>
                    <span>{b.done ? '✓' : b === nextBeat ? '→' : '○'}</span>
                    <span style={b === nextBeat ? { fontWeight: 600 } : undefined}>{b.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {toPayHere.length > 0 && (
            <div className="goal-box" style={{ background: 'color-mix(in srgb, var(--mk-waiting) 9%, var(--surface))' }}>
              <div className="eyebrow">Здесь нужно раскрыть</div>
              {toPayHere.map((m) => (
                <div key={m.id} style={{ marginTop: 4 }}>
                  ✦ {m.title} <span className="small muted">(посеян: {sceneLabel(data, m.setupSceneId)})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {text && lastParagraphs(text.content, 3).length > 0 && (
          <div className="excerpt">
            {lastParagraphs(text.content, 3).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        <div className="row continue-actions" style={{ marginTop: 20 }}>
          <button className="btn primary big" onClick={() => go({ view: 'write', sceneId: scene.id })}>
            Продолжить
          </button>
          <button className="btn ghost" onClick={() => go({ view: 'plan' })}>
            Выбрать другую сцену
          </button>
        </div>
      </section>

      <aside className="stack">
        <section className="card" style={{ padding: 12 }}>
          <div className="eyebrow" style={{ padding: '4px 12px 6px' }}>
            Требует внимания
          </div>
          <div className="stat-list">
            <StatRow n={hanging.length} color={MARKER_STATES.hanging.color} label={`${plural(hanging.length, 'маячок висит', 'маячка висят', 'маячков висят')} без раскрытия`} to="markers" />
            {late.length > 0 && (
              <StatRow n={late.length} color={MARKER_STATES.late.color} label={`${plural(late.length, 'маячок, возможно, пропущен', 'маячка, возможно, пропущены', 'маячков, возможно, пропущены')}`} to="markers" />
            )}
            <StatRow n={inbox.length} label={`${plural(inbox.length, 'запись', 'записи', 'записей')} во входящих`} to="inbox" />
            <StatRow n={questions.length} label={plural(questions.length, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')} to="inbox" />
          </div>
        </section>

        {nextOpen && nextOpen.id !== scene.id && (
          <section className="card">
            <div className="eyebrow">Следующая незаконченная сцена</div>
            <div style={{ margin: '6px 0 10px', fontWeight: 600 }}>{sceneLabel(data, nextOpen.id)}</div>
            {nextOpen.goal && <div className="small muted" style={{ marginBottom: 10 }}>{nextOpen.goal}</div>}
            <button className="btn sm" onClick={() => go({ view: 'write', sceneId: nextOpen.id })}>
              Открыть
            </button>
          </section>
        )}

        <section className="card">
          <div className="eyebrow">История целиком</div>
          <div style={{ margin: '8px 0 12px' }}>
            {data.chapters.length} гл. · {data.scenes.length} сц. · {formatWords(totalWords)}
          </div>
          <StatusBar data={data} />
        </section>
      </aside>
    </div>
  )
}

function StatRow({ n, label, to, color }: { n: number; label: string; to: 'markers' | 'inbox'; color?: string }) {
  return (
    <button className="stat-row" onClick={() => go({ view: to })}>
      <span className="num" style={{ color: n ? color : 'var(--ink-3)' }}>
        {n}
      </span>
      <span className={n ? '' : 'muted'}>{label}</span>
    </button>
  )
}

function StatusBar({ data }: { data: ProjectData }) {
  const total = data.scenes.length || 1
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--line)' }}>
        {STATUSES.map((s) => {
          const n = data.scenes.filter((x) => x.status === s.id).length
          return n ? <div key={s.id} title={`${s.label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: s.color }} /> : null
        })}
      </div>
      <div className="row small muted" style={{ gap: 12 }}>
        {STATUSES.map((s) => {
          const n = data.scenes.filter((x) => x.status === s.id).length
          return n ? (
            <span key={s.id} className="row" style={{ gap: 5 }}>
              <span className="status-dot" style={{ background: s.color }} />
              {s.label} {n}
            </span>
          ) : null
        })}
      </div>
    </div>
  )
}
