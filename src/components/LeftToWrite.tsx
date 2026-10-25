import { createChapter } from '../db/repo'
import { markerPayoffChapter, markerStatus, sceneName, type ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { formatScenes } from '../lib/text'
import { Modal } from '../lib/ui'
import { once, undoable } from '../lib/undo'

/**
 * «Что осталось дописать»: one list of what the book still lacks, asked for by the author.
 * The ending if it is not decided, markers still waiting, chapters with scenes not written,
 * chapters planned but not made yet, scenes still without a place. Each line leads to it.
 */
export function LeftToWrite({ data, onClose }: { data: ProjectData; onClose: () => void }) {
  const p = data.project
  const open = (sceneId: string) => {
    onClose()
    go({ view: 'text', sceneId })
  }
  const board = (markers?: boolean) => {
    if (markers) sessionStorage.setItem('manuscript.lens', 'markers')
    onClose()
    go({ view: 'board' })
  }

  const unwritten = data.outline
    .map(({ chapter, scenes }) => ({ chapter, empty: scenes.filter((s) => !s.wordCount) }))
    .filter(({ chapter, empty }) => empty.length > 0 || !data.scenes.some((s) => s.chapterId === chapter.id))
  const waiting = data.markers.filter((m) => !m.resolved)
  const missing = p.targetChapters ? p.targetChapters - data.chapters.length : 0
  const noEnding = !p.ending?.trim()
  const nothing = !unwritten.length && !waiting.length && missing <= 0 && !noEnding && !data.pool.scenes.length

  return (
    <Modal onClose={onClose} label="Что осталось дописать">
      <h2 className="ltw-title">Что осталось дописать</h2>
      {nothing && <p className="muted">Всё на месте: главы написаны, маячки раскрыты, финал известен.</p>}
      <div className="ltw">
        {noEnding && (
          <section>
            <h3>Финал</h3>
            <button
              className="ltw-row"
              onClick={() => {
                onClose()
                document.querySelector('.essence')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              }}
            >
              Чем закончится история, пока не записано — «Замысел» на этой странице
            </button>
          </section>
        )}
        {unwritten.length > 0 && (
          <section>
            <h3>Главы без текста</h3>
            {unwritten.map(({ chapter, empty }) => (
              <div key={chapter.id} className="ltw-chapter">
                <span className="ltw-k">{chapter.title}</span>
                {empty.length ? (
                  empty.map((s) => (
                    <button key={s.id} className="ltw-row" onClick={() => open(s.id)}>
                      {sceneName(data, s)}
                      {s.goal && <span className="muted"> — {s.goal}</span>}
                    </button>
                  ))
                ) : (
                  <button className="ltw-row" onClick={() => board()}>
                    пока ни одной сцены
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        {missing > 0 && (
          <section>
            <h3>Главы, которых ещё нет</h3>
            <div className="ltw-row static">
              По плану {p.targetChapters}, заведено {data.chapters.length}.{' '}
              <button
                className="link"
                onClick={async () => {
                  // One run at a time: a double click would add the chapters twice (audit B-079).
                  const done = await once('missing-chapters', () =>
                    undoable('новые главы', async () => {
                      for (let i = 0; i < missing; i++) await createChapter(p.id, `Глава ${data.chapters.length + i + 1}`)
                      return true
                    }),
                  )
                  if (done) board()
                }}
              >
                Завести ещё {missing}
              </button>
            </div>
          </section>
        )}
        {waiting.length > 0 && (
          <section>
            <h3>Маячки ждут раскрытия</h3>
            {waiting.map((m) => {
              const ch = markerPayoffChapter(m, data)
              const late = markerStatus(m, data) === 'late'
              return (
                <button key={m.id} className="ltw-row" onClick={() => board(true)}>
                  {m.title || 'без названия'}
                  <span className="muted">
                    {' '}
                    — {ch ? `${late ? 'должен был раскрыться в' : 'раскроется в'} «${data.chapterById.get(ch)?.title}»` : 'где раскроется, пока не выбрано'}
                  </span>
                </button>
              )
            })}
          </section>
        )}
        {data.pool.scenes.length > 0 && (
          <section>
            <h3>Сцены без места</h3>
            <button className="ltw-row" onClick={() => board()}>
              {formatScenes(data.pool.scenes.length)} ждут своей главы
            </button>
          </section>
        )}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  )
}
