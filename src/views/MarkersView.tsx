import { useState } from 'react'
import type { Marker } from '../db/db'
import { createMarker } from '../db/repo'
import { MarkerCard } from '../components/MarkerCard'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { MARKER_STATES } from '../lib/status'

type Filter = 'open' | 'hanging' | 'late' | 'waiting' | 'closed' | 'all'
const ORDER = { late: 0, hanging: 1, waiting: 2, closed: 3 } as const

export function MarkersView({ data }: { data: ProjectData }) {
  const [filter, setFilter] = useState<Filter>('open')
  const withStatus = data.markers
    .map((m) => ({ m, st: markerStatus(m, data) }))
    .sort((a, b) => ORDER[a.st] - ORDER[b.st] || (data.sceneIndex.get(a.m.setupSceneId ?? '') ?? 1e9) - (data.sceneIndex.get(b.m.setupSceneId ?? '') ?? 1e9))
  const shown = withStatus.filter(({ st }) =>
    filter === 'all' ? true : filter === 'open' ? st !== 'closed' : st === filter,
  )
  const count = (f: Filter) =>
    withStatus.filter(({ st }) => (f === 'all' ? true : f === 'open' ? st !== 'closed' : st === f)).length

  return (
    <div>
      <div className="toolbar">
        <h1 style={{ marginRight: 'auto' }}>Маячки</h1>
        <button className="btn accent" onClick={() => void createMarker(data.project.id, { title: 'Новый маячок' })}>
          + Маячок
        </button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Всё, что посеяно и должно выстрелить. Красные нити висят — у них нет места раскрытия. Оранжевые — раскрытие
        было запланировано раньше, чем ты сейчас пишешь, но не отмечено.
      </p>

      <div className="seg" style={{ marginBottom: 16 }}>
        {(
          [
            ['open', 'Открытые'],
            ['hanging', 'Висят'],
            ['late', 'Пропущены?'],
            ['waiting', 'Ждут'],
            ['closed', 'Раскрыты'],
            ['all', 'Все'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label} <span className="muted">{count(f)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty card">
          {data.markers.length === 0 ? (
            <>
              <h3>Маячков пока нет</h3>
              <p>
                В тексте выдели фразу и нажми «✦ Маячок». Или ✎ → «Маячок» в любой момент. Здесь они соберутся в нити по
                главам.
              </p>
            </>
          ) : (
            <p>В этом фильтре пусто. {filter === 'hanging' || filter === 'late' ? 'Ничего не потеряно 🌿' : ''}</p>
          )}
        </div>
      ) : (
        <>
          <Threads data={data} markers={shown.map((x) => x.m)} />
          <div className="marker-list">
            {shown.map(({ m }) => (
              <div key={m.id} id={`mk-${m.id}`}>
                <MarkerCard marker={m} data={data} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Markers as threads across chapters: ● planted, ◉ paid off, ? hanging. */
function Threads({ data, markers }: { data: ProjectData; markers: Marker[] }) {
  const cols = data.chapters.length
  if (!cols) return null
  const chOf = (sceneId?: string) => {
    const s = sceneId ? data.sceneById.get(sceneId) : undefined
    return s ? data.chapterIndex.get(s.chapterId) : undefined
  }
  const nowCh = chOf(data.project.lastSceneId)

  return (
    <>
      <div className="legend">
        {(['hanging', 'late', 'waiting', 'closed'] as const).map((k) => (
          <span key={k}>
            <i style={{ background: MARKER_STATES[k].color }} />
            {MARKER_STATES[k].label}
          </span>
        ))}
        {nowCh !== undefined && (
          <span>
            <i style={{ background: 'color-mix(in srgb, var(--focus) 30%, transparent)', borderRadius: 3 }} />
            ты сейчас здесь
          </span>
        )}
      </div>
      <div className="threads">
        <table>
          <thead>
            <tr>
              <th className="name">Маячок</th>
              {data.chapters.map((c, i) => (
                <th key={c.id} className={i === nowCh ? 'now' : ''} title={c.title}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const st = markerStatus(m, data)
              const color = MARKER_STATES[st].color
              const a = chOf(m.setupSceneId)
              const b = chOf(m.payoffSceneId)
              const start = a ?? b
              const end = st === 'hanging' ? cols - 1 : (b ?? a)
              const lo = start !== undefined && end !== undefined ? Math.min(start, end) : undefined
              const hi = start !== undefined && end !== undefined ? Math.max(start, end) : undefined
              return (
                <tr key={m.id} style={{ '--mk-color': color } as React.CSSProperties}>
                  <td
                    className="name"
                    title={m.title}
                    onClick={() => document.getElementById(`mk-${m.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    {m.title || 'Без названия'}
                  </td>
                  {data.chapters.map((c, i) => {
                    const inRange = lo !== undefined && hi !== undefined && i >= lo && i <= hi && lo !== hi
                    const fade = st === 'hanging'
                    return (
                      <td key={c.id} className={`cell ${i === nowCh ? 'now' : ''}`}>
                        {inRange && (
                          <div className={`seg-line ${i === lo ? 'start' : ''} ${i === hi ? 'end' : ''} ${fade ? 'fade' : ''}`} />
                        )}
                        {i === a && <div className="node" title="Посеян" />}
                        {i === b && i !== a && <div className={`node ${m.resolved ? 'pay' : ''}`} title="Раскрытие" />}
                        {i === b && i === a && m.resolved && <div className="node pay" title="Посеян и раскрыт здесь" />}
                        {st === 'hanging' && i === cols - 1 && i !== a && <div className="node q">?</div>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
