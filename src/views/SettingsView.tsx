import { useEffect, useState } from 'react'
import { db, type Project } from '../db/db'
import {
  currentEmail,
  getCloudConfig,
  setCloudConfig,
  signIn,
  signOut,
  syncNow,
  type SyncStatus,
} from '../db/cloud'
import { createProject, patch, remove } from '../db/repo'
import { ImportPanel } from '../components/ImportPanel'
import { chapterToFicbook, download, exportDocx, type ExportChapter } from '../lib/exporter'
import type { ProjectData } from '../lib/hooks'
import { go } from '../lib/router'
import { applyTextSize, applyTheme, getTextSize, getTheme, type Theme } from '../lib/session'
import { timeAgo } from '../lib/status'
import { InlineEdit, toast } from '../lib/ui'

async function loadChapters(data: ProjectData, only?: string): Promise<ExportChapter[]> {
  const out: ExportChapter[] = []
  for (const { chapter, scenes } of data.outline) {
    if (only && chapter.id !== only) continue
    const texts = await db.texts.bulkGet(scenes.map((s) => s.id))
    out.push({ chapter, scenes: scenes.map((s, i) => ({ ...s, content: texts[i]?.content })) })
  }
  return out
}

export function SettingsView({
  data,
  projects,
  onSelectProject,
  sync,
}: {
  data: ProjectData
  projects: Project[]
  onSelectProject: (id: string) => void
  sync: SyncStatus
}) {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [size, setSize] = useState(getTextSize)
  const [ficChapter, setFicChapter] = useState(data.chapters[0]?.id ?? '')

  const exportWord = async () => {
    const blob = await exportDocx(data.project.title, await loadChapters(data))
    download(blob, `${data.project.title}.docx`)
  }
  const copyFicbook = async () => {
    const [ch] = await loadChapters(data, ficChapter)
    if (!ch) return
    const text = chapterToFicbook(ch)
    try {
      await navigator.clipboard.writeText(text)
      toast('Глава скопирована — вставь её в редактор Фикбука')
    } catch {
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${ch.chapter.title}.txt`)
    }
  }
  const backup = async () => {
    const dump: Record<string, unknown[]> = {}
    for (const t of ['projects', 'chapters', 'scenes', 'texts', 'markers', 'notes', 'snapshots'] as const) {
      dump[t] = await db.table(t).toArray()
    }
    download(new Blob([JSON.stringify(dump)], { type: 'application/json' }), `manuscript-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginBottom: 20 }}>Ещё</h1>

      <section className="card settings-section stack">
        <h3>Истории</h3>
        <label>
          <span className="field-label">Название текущей</span>
          <InlineEdit className="input" value={data.project.title} onSave={(title) => void patch<Project>('projects', data.project.id, { title })} />
        </label>
        {projects.length > 1 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="field-label">Переключиться</span>
            {projects
              .filter((p) => p.id !== data.project.id)
              .map((p) => (
                <button key={p.id} className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => onSelectProject(p.id)}>
                  {p.title}
                </button>
              ))}
          </div>
        )}
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              const title = prompt('Название новой истории')
              if (title?.trim()) onSelectProject((await createProject(title.trim())).id)
            }}
          >
            + Новая история
          </button>
          <span className="spacer" />
          <button
            className="btn ghost sm"
            style={{ color: 'var(--accent)' }}
            onClick={() => {
              if (prompt(`Чтобы удалить «${data.project.title}», напиши её название:`) === data.project.title) {
                void remove('projects', data.project.id)
              }
            }}
          >
            Удалить историю
          </button>
        </div>
      </section>

      <section className="card settings-section stack">
        <h3>Импорт текста</h3>
        <div className="small muted">Главы добавятся в конец плана текущей истории.</div>
        <ImportPanel projectId={data.project.id} onDone={() => go({ view: 'plan' })} />
      </section>

      <section className="card settings-section stack">
        <h3>Экспорт</h3>
        <div className="row">
          <button className="btn" onClick={() => void exportWord()}>
            Скачать всё в Word (.docx)
          </button>
        </div>
        <div className="hr" />
        <span className="field-label">Для Фикбука — по одной главе, с курсивом и разделителями сцен</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select className="select" value={ficChapter} onChange={(e) => setFicChapter(e.target.value)}>
            {data.chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.title}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void copyFicbook()}>
            Скопировать
          </button>
        </div>
        <div className="hr" />
        <div className="row">
          <button className="btn ghost sm" onClick={() => void backup()}>
            Резервная копия всех данных (.json)
          </button>
        </div>
      </section>

      <SyncSection sync={sync} />

      <section className="card settings-section stack">
        <h3>Внешний вид</h3>
        <div className="row">
          <span className="field-label" style={{ margin: 0, minWidth: 90 }}>
            Тема
          </span>
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
        <div className="row">
          <span className="field-label" style={{ margin: 0, minWidth: 90 }}>
            Размер текста
          </span>
          <input
            type="range"
            min={16}
            max={26}
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value))
              applyTextSize(Number(e.target.value))
            }}
          />
          <span className="small muted">{size}px</span>
        </div>
      </section>

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
        <div className="small muted">
          После установки Manuscript работает без интернета. Горячая клавиша быстрой записи — Ctrl/⌘ + J.
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
      <h3>Синхронизация между устройствами</h3>
      <div className="row small">
        <span className="sync-dot" data-state={sync.state} />
        {statusText}
      </div>

      {!cfg ? (
        <>
          <div className="small muted">
            Нужен бесплатный проект Supabase (облачная база). Инструкция — в README репозитория, это 5 минут. Затем
            вставь сюда его адрес и публичный ключ.
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
        </>
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
            <button className="btn primary" disabled={busy || !email || !password} onClick={() => void run(() => signIn(email, password, false))}>
              Войти
            </button>
            <button className="btn" disabled={busy || !email || password.length < 6} onClick={() => void run(() => signIn(email, password, true))}>
              Создать аккаунт
            </button>
          </div>
          <div className="small muted">
            На первом устройстве — «Создать аккаунт». На остальных — «Войти» с той же почтой и паролем.
          </div>
        </>
      )}
      {error && <div className="small" style={{ color: 'var(--accent)' }}>{error}</div>}
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
