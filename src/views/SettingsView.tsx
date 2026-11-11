import { useEffect, useState } from 'react'
import {
  currentEmail,
  getCloudConfig,
  setCloudConfig,
  signIn,
  signOut,
  syncNow,
  type SyncStatus,
} from '../db/cloud'
import { backupSummary, downloadBackup, readBackupFile, restoreBackup } from '../lib/backup'
import { FilePick, toast } from '../lib/ui'
import { ACCENTS, applyAccent, applyTheme, getAccent, getBoardLayout, getTheme, setBoardLayout, type Accent, type BoardLayout, type Theme } from '../lib/session'
import { TypoControls } from '../components/TypoControls'
import { CloudDisks } from '../components/CloudDisks'
import { timeAgo } from '../lib/status'
import { remoteSyncAllowed } from '../lib/environment'
import { getYandexToken } from '../lib/yandex'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SyncConflict } from '../db/db'
import { conflictChanges, dismissConflict, restoreConflict } from '../lib/conflicts'

/** Settings of the app itself (not of a book): look, devices, installing, backup. */
export function SettingsView({ sync }: { sync: SyncStatus }) {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [board, setBoard] = useState<BoardLayout>(getBoardLayout)
  const [accent, setAccent] = useState<Accent>(getAccent)
  const conflicts = useLiveQuery(
    () => db.conflicts.filter((conflict) => !conflict.deleted).toArray().then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt)),
    [],
  ) ?? []
  const restore = async (file: File) => {
    try {
      const dump = await readBackupFile(file)
      const summary = backupSummary(dump)
      if (!confirm(`В копии: историй — ${summary.projects}, записей — ${summary.records}. Вернуть её? Добавится всё, чего нет на этом устройстве, и обновится то, что в копии новее. Ничего не удаляется.`)) return
      const { added, updated } = await restoreBackup(dump)
      toast(added + updated ? `Готово: добавлено ${added}, обновлено ${updated}` : 'На устройстве уже всё есть — ничего не поменялось')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось прочитать файл')
    }
  }

  return (
    <div className="lib-page">
      <div className="lib-head">
        <h1>Настройки</h1>
        <div className="muted">Для всех историй на этом устройстве</div>
      </div>

      <section className="card settings-section stack">
        <h3>Как выглядит</h3>
        <div className="typo-row">
          <span className="typo-label">Тема</span>
          <div className="seg">
            {(
              [
                ['auto', 'Как в системе'],
                ['light', 'Светлая'],
                ['dark', 'Тёмная'],
                ['paper', 'Бумага'],
              ] as [Theme, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                aria-pressed={theme === t}
                onClick={() => {
                  setTheme(t)
                  applyTheme(t)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="typo-row">
          <span className="typo-label">Акцент</span>
          <div className="accents" role="radiogroup" aria-label="Цвет акцента">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={accent === a.id}
                className="accent-swatch"
                title={a.name}
                aria-label={a.name}
                style={{ background: a.swatch }}
                onClick={() => {
                  setAccent(a.id)
                  applyAccent(a.id)
                }}
              />
            ))}
            <span className="small muted">{ACCENTS.find((a) => a.id === accent)?.name}</span>
          </div>
        </div>
        <TypoControls />
      </section>

      <section className="card settings-section stack">
        <h3>Как планировать</h3>
        <div className="typo-row">
          <span className="typo-label">Доска</span>
          <div className="seg">
            {(
              [
                ['columns', 'Главы колонками'],
                ['line', 'Сюжетные линии'],
              ] as [BoardLayout, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                aria-pressed={board === v}
                onClick={() => {
                  setBoard(v)
                  setBoardLayout(v)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {remoteSyncAllowed() ? (
        <>
          <CloudDisks />
          {/* The old Supabase sync: shown only where it was set up, so it does not stand next to the Disk as a second «Устройства». */}
          {!getYandexToken() && getCloudConfig() && <SyncSection sync={sync} />}
        </>
      ) : (
        <section className="card settings-section stack">
          <h3>Тестовая версия</h3>
          <div className="small muted">
            Облачная синхронизация здесь отключена. Эта версия работает только со своей тестовой базой и не может читать или менять основные книги.
          </div>
        </section>
      )}

      {conflicts.length > 0 && <ConflictSection conflicts={conflicts} />}

      <section className="card settings-section stack">
        <h3>Установить как приложение</h3>
        <div className="small">
          <p style={{ marginTop: 0 }}>
            <strong>iPhone / iPad:</strong> открой в Safari → «Поделиться» → «На экран „Домой“».
          </p>
          <p>
            <strong>Mac:</strong> Safari → Файл → «Добавить в Dock». Или Chrome → значок установки в адресной строке.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Windows:</strong> Chrome или Edge → значок установки в адресной строке.
          </p>
        </div>
        <div className="small muted">После установки Manuscript работает без интернета.</div>
      </section>

      <section className="card settings-section stack">
        <h3>Резервная копия</h3>
        <div className="small muted">
          Все истории, заметки и версии одним файлом — на всякий случай. Раз в неделю приложение само напомнит. Храни файл где-нибудь ещё: в «Файлах», на
          Яндекс Диске, в почте.
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => void downloadBackup()}>
            Скачать копию
          </button>
          <FilePick className="btn" accept=".json,application/json" onFile={(f) => void restore(f)}>
            Вернуть из копии…
          </FilePick>
        </div>
      </section>
      <div className="small muted app-version">
        {__PREVIEW__ ? 'Тестовая версия · облако отключено · ' : ''}
        Версия от {new Date(__BUILD__).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

const TABLE_NAMES: Record<string, string> = {
  projects: 'История',
  chapters: 'Глава',
  scenes: 'Сцена',
  markers: 'Маячок',
  notes: 'Заметка',
  lines: 'Сюжетная линия',
  characters: 'Персонаж',
}

const FIELD_NAMES: Record<string, string> = {
  title: 'Название',
  name: 'Имя',
  text: 'Текст',
  description: 'Описание',
  goal: 'Цель',
  order: 'Порядок',
  chapterId: 'Глава',
  status: 'Статус',
  beats: 'План сцены',
  note: 'Пояснение',
  resolved: 'Состояние',
  archived: 'Архив',
  about: 'О персонаже',
  aliases: 'Другие имена',
  deleted: 'Удаление',
}

function rowName(conflict: SyncConflict) {
  const rows = [conflict.winning, conflict.losing] as unknown as Array<Record<string, unknown>>
  for (const row of rows) {
    for (const field of ['title', 'name', 'text']) {
      if (typeof row[field] === 'string' && row[field]) return String(row[field]).slice(0, 80)
    }
  }
  return conflict.recordId.slice(0, 8)
}

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'не задано'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value)
    return text.length > 120 ? `${text.slice(0, 117)}…` : text
  }
  if (Array.isArray(value)) return value.length ? `${value.length} ${value.length === 1 ? 'элемент' : 'элемента'}` : 'пусто'
  return 'изменено'
}

function ConflictSection({ conflicts }: { conflicts: SyncConflict[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (conflict: SyncConflict, restore: boolean) => {
    const question = restore
      ? 'Вернуть сохранённый вариант? Заменятся только поля, которые конфликтовали; более поздние правки остальных полей останутся.'
      : 'Оставить текущий вариант и убрать этот конфликт из списка? Архив останется в резервных копиях.'
    if (!confirm(question)) return
    setBusy(conflict.id)
    try {
      if (restore) await restoreConflict(conflict)
      else await dismissConflict(conflict)
      toast(restore ? 'Сохранённый вариант возвращён' : 'Текущий вариант оставлен')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не получилось обработать конфликт')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card settings-section stack conflict-section">
      <h3>Сохранены конфликтующие правки</h3>
      <div className="small muted">
        На разных устройствах одновременно меняли одну запись. Manuscript выбрал текущий вариант, но сохранил второй. Проверьте {conflicts.length === 1 ? 'его' : `все ${conflicts.length}`}.
      </div>
      <div className="conflict-list">
        {conflicts.map((conflict) => {
          const changes = conflictChanges(conflict)
          return (
            <details className="conflict-item" key={conflict.id}>
              <summary>
                <span>
                  <strong>{TABLE_NAMES[conflict.table] ?? 'Запись'}:</strong> {rowName(conflict)}
                </span>
                <span className="small muted">{new Date(conflict.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </summary>
              <div className="conflict-fields small">
                {changes.length ? changes.map((change) => (
                  <div className="conflict-field" key={change.field}>
                    <strong>{FIELD_NAMES[change.field] ?? change.field}</strong>
                    <div><span className="muted">Выбрано Manuscript:</span> {valueText(change.winning)}</div>
                    <div><span className="muted">Сохранено отдельно:</span> {valueText(change.losing)}</div>
                  </div>
                )) : <div className="muted">Различия относятся только к служебной версии записи.</div>}
              </div>
              <div className="row conflict-actions">
                <button className="btn sm primary" disabled={busy === conflict.id || !changes.length} onClick={() => void act(conflict, true)}>
                  Вернуть сохранённый вариант
                </button>
                <button className="btn sm ghost" disabled={busy === conflict.id} onClick={() => void act(conflict, false)}>
                  Оставить текущий
                </button>
              </div>
            </details>
          )
        })}
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void downloadBackup()}>
        Скачать копию со всеми версиями
      </button>
    </section>
  )
}

export function SyncSection({ sync }: { sync: SyncStatus }) {
  const cfg = getCloudConfig()
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.anonKey ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [me, setMe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void currentEmail().then(setMe)
  }, [sync.state])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    sync.state === 'ok'
      ? `Синхронизировано ${timeAgo(sync.at)}`
      : sync.state === 'syncing'
        ? 'Синхронизация…'
        : sync.state === 'offline'
          ? 'Нет интернета. Всё сохраняется на устройстве и отправится само, когда сеть появится.'
          : sync.state === 'error'
            ? `Ошибка: ${sync.message}`
            : sync.state === 'signed-out'
              ? 'Не выполнен вход'
              : 'Выключена — всё хранится только на этом устройстве'

  return (
    <section className="card settings-section stack">
      <h3>Устройства</h3>
      <div className="row small">
        <span className="sync-dot" data-state={sync.state} />
        {statusText}
      </div>

      {!cfg ? (
        <details className="pp-more">
          <summary>Свой сервер синхронизации (для опытных)</summary>
          <div className="small muted" style={{ margin: '8px 0' }}>
            Адрес и публичный ключ проекта Supabase. Инструкция — в README.
          </div>
          <input className="input" placeholder="Project URL (https://….supabase.co)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input" placeholder="anon public key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            className="btn primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={!url.trim() || !key.trim()}
            onClick={() => {
              setCloudConfig({ url: url.trim(), anonKey: key.trim() })
              void syncNow()
              location.reload()
            }}
          >
            Подключить
          </button>
        </details>
      ) : me ? (
        <div className="row">
          <span>
            Вход выполнен: <strong>{me}</strong>
          </span>
          <span className="spacer" />
          <button className="btn sm" disabled={busy} onClick={() => void syncNow()}>
            Синхронизировать сейчас
          </button>
          <button className="btn sm ghost" onClick={() => void run(signOut).then(() => setMe(null))}>
            Выйти
          </button>
        </div>
      ) : (
        <>
          <input className="input" type="email" autoComplete="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="row">
            <button className="btn primary" disabled={busy || !email || !password} onClick={() => void run(async () => void (await signIn(email, password, false)))}>
              Войти
            </button>
            <button className="btn" disabled={busy || !email || password.length < 6} onClick={() =>
                void run(async () => {
                  if ((await signIn(email, password, true)) === 'confirm') setInfo('Готово! Открой письмо от Manuscript и нажми ссылку, потом вернись сюда и нажми «Войти».')
                })
              }>
              Создать аккаунт
            </button>
          </div>
          <div className="small muted">
            На первом устройстве — «Создать аккаунт». На остальных — «Войти» с той же почтой и паролем.
          </div>
        </>
      )}
      {info && <div className="small next-step">{info}</div>}
      {error && <div className="small" style={{ color: 'var(--danger-ink)' }}>{error}</div>}
      {cfg && (
        <button
          className="btn ghost sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            if (confirm('Отключить облако на этом устройстве? Данные на устройстве останутся.')) {
              setCloudConfig(null)
              location.reload()
            }
          }}
        >
          Отключить облако
        </button>
      )}
    </section>
  )
}
