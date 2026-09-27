import type { Marker } from '../db/db'
import { patch, remove } from '../db/repo'
import { markerStatus, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { MARKER_STATES } from '../lib/status'
import { InlineEdit } from '../lib/ui'
import { ScenePicker } from './ScenePicker'

export function MarkerCard({ marker, data, compact }: { marker: Marker; data: ProjectData; compact?: boolean }) {
  const st = MARKER_STATES[markerStatus(marker, data)]
  const set = (changes: Partial<Marker>) => void patch<Marker>('markers', marker.id, changes)
  return (
    <div className="marker-item" style={{ '--mk-color': st.color } as React.CSSProperties}>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <InlineEdit className="t" multiline value={marker.title} placeholder="Что нельзя забыть?" onSave={(title) => set({ title })} />
        <span className="chip" title={st.hint} style={{ color: st.color }}>
          {st.label}
        </span>
      </div>
      {!compact && (
        <InlineEdit
          className="small"
          multiline
          value={marker.note}
          placeholder="Подробности: как именно раскрыть, что уже намекнуто…"
          onSave={(note) => set({ note })}
        />
      )}
      <label className="small muted">
        Посеян:
        <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
          <ScenePicker data={data} value={marker.setupSceneId} emptyLabel="— не указано —" onChange={(setupSceneId) => set({ setupSceneId })} />
          {marker.setupSceneId && (
            <button className="icon-btn" title="Открыть сцену" onClick={() => go({ view: 'write', sceneId: marker.setupSceneId! })}>
              →
            </button>
          )}
        </div>
      </label>
      <label className="small muted">
        Раскроется:
        <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
          <ScenePicker
            data={data}
            value={marker.payoffSceneId}
            emptyLabel="? пока не знаю"
            onChange={(payoffSceneId) => set({ payoffSceneId })}
          />
          {marker.payoffSceneId && (
            <button className="icon-btn" title="Открыть сцену" onClick={() => go({ view: 'write', sceneId: marker.payoffSceneId! })}>
              →
            </button>
          )}
        </div>
      </label>
      <div className="row">
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={marker.resolved} onChange={(e) => set({ resolved: e.target.checked })} />
          Раскрыт
        </label>
        <span className="spacer" />
        <button
          className="btn ghost sm"
          onClick={() => confirm('Удалить маячок? Если он просто раскрыт — лучше отметь «Раскрыт».') && void remove('markers', marker.id)}
        >
          Удалить
        </button>
      </div>
    </div>
  )
}
