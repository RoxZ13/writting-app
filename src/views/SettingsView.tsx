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
import { downloadBackup, readBackupFile, restoreBackup } from '../lib/backup'
import { toast } from '../lib/ui'
import { applyTheme, getTheme, type Theme } from '../lib/session'
import { TypoControls } from '../components/TypoControls'
import { timeAgo } from '../lib/status'

/** Settings of the app itself (not of a book): look, devices, installing, backup. */
export function SettingsView({ sync }: { sync: SyncStatus }) {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const restore = async (file: File) => {
    try {
      const dump = await readBackupFile(file)
      if (!confirm('Вернуть из копии? Добавится всё, чего нет на этом устройстве, и обновится то, что в копии новее. Ничего не удаляется.')) return
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
        <TypoControls />
      </section>

      <SyncSection sync={sync} />

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
          <label className="btn">
            Вернуть из копии…
            <input type="file" hidden accept=".json,application/json" onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
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
      {error && <div className="small" style={{ color: 'var(--mk-hanging)' }}>{error}</div>}
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
