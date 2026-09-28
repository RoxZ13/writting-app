import { useEffect, useState } from 'react'
import type { ProjectData } from '../lib/hooks'
import { totalWords } from '../lib/pace'
import { getSprint, startSprint, stopSprint, useSprint } from '../lib/sprint'
import { Modal } from '../lib/ui'

/**
 * «Фокус»: a timed stretch of writing. A web page cannot silence other apps by itself, so it does what
 * the device allows — full screen, the screen kept on — and hands «Не беспокоить» to the system.
 */
const DND_KEY = 'manuscript.focus.dnd'
const ON_SHORTCUT = 'Manuscript Фокус'
const OFF_SHORTCUT = 'Manuscript Фокус выкл'
const shortcut = (name: string) => `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`

type Platform = 'apple' | 'windows' | 'other'
export function platform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return 'apple'
  if (/Windows/.test(ua)) return 'windows'
  return 'other'
}
const dndReady = () => {
  try {
    return localStorage.getItem(DND_KEY) === '1'
  } catch {
    return false
  }
}

let wakeLock: { release: () => Promise<void> } | null = null
async function holdScreen() {
  try {
    wakeLock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
  } catch {
    wakeLock = null
  }
}
function releaseScreen() {
  void wakeLock?.release().catch(() => undefined)
  wakeLock = null
}
const canFullscreen = () => !!document.documentElement.requestFullscreen && platform() !== 'apple'
function leaveFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

/** Stop the timer and give the device back: screen, full screen and, if it was switched on, notifications. */
export function endFocus(notifications = true) {
  const usedDnd = getSprint()?.dnd
  stopSprint()
  releaseScreen()
  leaveFullscreen()
  if (notifications && usedDnd) location.href = shortcut(OFF_SHORTCUT)
}

export function FocusStart({ data, onStarted, onClose }: { data: ProjectData; onStarted: () => void; onClose: () => void }) {
  const [minutes, setMinutes] = useState(15)
  const [full, setFull] = useState(canFullscreen())
  const [dnd, setDnd] = useState(dndReady() && platform() === 'apple')
  const [setup, setSetup] = useState(false)
  const p = platform()

  const start = () => {
    if (full && canFullscreen()) void document.documentElement.requestFullscreen().catch(() => undefined)
    void holdScreen()
    const withDnd = dnd && p === 'apple'
    startSprint(data.project.id, minutes, totalWords([...data.scenes, ...data.pool.scenes]), withDnd)
    if (withDnd) location.href = shortcut(ON_SHORTCUT)
    onStarted()
  }

  return (
    <Modal onClose={onClose} label="Фокус">
      <div className="stack">
        <h2>Фокус</h2>
        <p className="muted" style={{ margin: 0 }}>
          Только текст и таймер. Панели спрячутся, в конце — сколько написала.
        </p>
        <div className="seg">
          {[15, 25, 45].map((m) => (
            <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m} минут
            </button>
          ))}
        </div>
        {canFullscreen() && (
          <label className="check-row">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
            Во весь экран — вкладки и панель задач не отвлекают
          </label>
        )}
        {p === 'apple' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={dnd}
              onChange={(e) => {
                if (e.target.checked && !dndReady()) setSetup(true)
                setDnd(e.target.checked)
              }}
            />
            Включить «Не беспокоить» — уведомления из других приложений не придут
          </label>
        )}
        {p === 'windows' && (
          <div className="small muted">
            Уведомления на Windows: <strong>Win + N</strong> → «Не беспокоить». Во весь экран Windows и так приглушает большинство уведомлений.
          </div>
        )}
        {setup && <DndSetup onDone={() => setSetup(false)} />}
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={start}>
            Начать
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** One-time setup: two tiny Shortcuts the app can run to switch «Не беспокоить» on and off. */
function DndSetup({ onDone }: { onDone: () => void }) {
  return (
    <div className="dnd-setup card">
      <strong>Один раз настроить (2 минуты)</strong>
      <p className="small" style={{ margin: '6px 0' }}>
        Сайт не может сам выключить уведомления — это умеет только iPhone, iPad или Mac. Сделай две маленькие команды, и дальше всё будет одной галочкой.
      </p>
      <ol className="small">
        <li>
          Открой приложение <strong>«Команды»</strong> → «+» (новая команда).
        </li>
        <li>
          «Добавить действие» → найди <strong>«Настроить фокусирование»</strong> → выбери «Не беспокоить», «Включить», «До выключения».
        </li>
        <li>
          Назови команду точно так: <strong>{ON_SHORTCUT}</strong>.
        </li>
        <li>
          Сделай вторую так же, но «Выключить», и назови <strong>{OFF_SHORTCUT}</strong>.
        </li>
      </ol>
      <button
        className="btn sm primary"
        onClick={() => {
          try {
            localStorage.setItem(DND_KEY, '1')
          } catch {
            /* ignore */
          }
          onDone()
        }}
      >
        Готово, команды есть
      </button>
    </div>
  )
}

/** When the timer runs out: how much got written, one tap for another round, notifications back on. */
export function FocusDone({ data }: { data: ProjectData }) {
  const { sprint, left } = useSprint()
  const over = !!sprint && left === 0 && sprint.projectId === data.project.id
  useEffect(() => {
    if (over) {
      releaseScreen()
      leaveFullscreen()
    }
  }, [over])
  if (!over || !sprint) return null
  const now = totalWords([...data.scenes, ...data.pool.scenes])
  const written = Math.max(0, now - sprint.startWords)
  const dnd = !!sprint.dnd
  return (
    <Modal onClose={() => endFocus()} label="Фокус закончился">
      <div className="stack" style={{ textAlign: 'center' }}>
        <div className="sprint-big">+{written.toLocaleString('ru-RU')}</div>
        <div className="muted">{written ? `слов за ${sprint.minutes} минут. Отлично.` : `${sprint.minutes} минут прошли. Даже думать над сценой — работа.`}</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button
            className="btn ghost"
            onClick={() => endFocus()}
          >
            {dnd ? 'Хватит, вернуть уведомления' : 'Хватит'}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              void holdScreen()
              startSprint(data.project.id, sprint.minutes, now, sprint.dnd)
            }}
          >
            Ещё {sprint.minutes} минут
          </button>
        </div>
      </div>
    </Modal>
  )
}
