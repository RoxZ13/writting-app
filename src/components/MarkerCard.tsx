import { useState } from 'react'
import type { Marker } from '../db/db'
import { patch, remove } from '../db/repo'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { MARKER_STATES } from '../lib/status'
import { InlineEdit } from '../lib/ui'
import { PlacePicker } from './Refs'

/** A marker: title and state always visible; where it is planted / pays off opens on demand. */
export function MarkerCard({ marker, data, open: startOpen = false }: { marker: Marker; data: ProjectData; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const st = MARKER_STATES[markerStatus(marker, data)]
  const set = (changes: Partial<Marker>) => void patch<Marker>('markers', marker.id, changes)
  return (
    <div className="marker-item" style={{ '--mk-color': st.color } as React.CSSProperties}>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8 }}>
        <input
          type="checkbox"
          className="mk-check"
          title={marker.resolved ? 'Раскрыт' : 'Отметить раскрытым'}
          checked={marker.resolved}
          onChange={(e) => set({ resolved: e.target.checked })}
        />
        <InlineEdit className="t" multiline value={marker.title} placeholder="Что нельзя забыть?" onSave={(title) => set({ title })} />
        <button className="mk-state" title={st.hint} style={{ color: st.color }} onClick={() => setOpen(!open)}>
          {st.label} {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          <InlineEdit
            className="small"
            multiline
            value={marker.note}
            placeholder="Подробности: как именно раскрыть, что уже намекнуто…"
            onSave={(note) => set({ note })}
          />
          <label className="small muted">
            Посеян
            <PlacePicker data={data} marker={marker} side="setup" emptyLabel="— не указано —" onChange={set} />
          </label>
          <label className="small muted">
            Раскроется
            <PlacePicker data={data} marker={marker} side="payoff" emptyLabel="? пока не знаю — решу потом" onChange={set} />
          </label>
          <button
            className="btn ghost sm"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => confirm('Удалить маячок? Если он просто раскрыт — лучше отметь галочкой.') && void remove('markers', marker.id)}
          >
            Удалить маячок
          </button>
        </div>
      )}
    </div>
  )
}
