import { useEffect, useState } from 'react'
import { getFileSyncState, onFileSyncState, stopFileSync, syncNow, type FileSyncState } from '../lib/filesync'
import { connectYandex, forgetYandex, getYandexClientId, getYandexToken, setYandexClientId, yandexRedirectUri } from '../lib/yandex'

const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000)
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`
}

/**
 * «Своё облако»: the stories kept in step through the author's own cloud disk. For now Яндекс Диск;
 * Dropbox and Google Drive go here the same way.
 */
export function CloudDisks() {
  const [state, setState] = useState<FileSyncState>(getFileSyncState)
  const [connected, setConnected] = useState(() => !!getYandexToken())
  const [clientId, setClientId] = useState(getYandexClientId() ?? '')
  const ready = !!getYandexClientId()

  useEffect(() => onFileSyncState(setState), [])

  const status =
    state.state === 'syncing'
      ? 'Синхронизация…'
      : state.state === 'ok'
        ? `Синхронизировано ${ago(state.at)}`
        : state.state === 'offline'
          ? 'Нет интернета — отправится само, когда сеть появится'
          : state.state === 'error'
            ? state.message
            : ''

  return (
    <section className="card settings-section stack">
      <h3>Своё облако</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Истории хранятся в твоём облаке — и одинаковые на компьютере и телефоне. Приложение видит только свою папку «Приложения/Manuscript».
      </p>

      <div className="cloud-row">
        <span className="cloud-logo yandex" aria-hidden="true">
          Я
        </span>
        <span className="cloud-name">
          <strong>Яндекс Диск</strong>
          {connected && (
            <span className={`small ${state.state === 'error' ? 'cloud-error' : 'muted'}`}>
              {status}
            </span>
          )}
        </span>
        {connected ? (
          <>
            <button className="btn sm" disabled={state.state === 'syncing'} onClick={() => void syncNow()}>
              Синхронизировать
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                if (!confirm('Отключить Яндекс Диск? На этом устройстве всё останется, на Диске — тоже.')) return
                stopFileSync()
                forgetYandex()
                setConnected(false)
              }}
            >
              Отключить
            </button>
          </>
        ) : (
          <button className="btn sm primary" disabled={!ready} onClick={() => connectYandex()}>
            Подключить
          </button>
        )}
      </div>

      <div className="cloud-row soon">
        <span className="cloud-logo" aria-hidden="true">
          D
        </span>
        <span className="cloud-name">
          <strong>Dropbox, Google Диск</strong>
          <span className="small muted">Скоро</span>
        </span>
      </div>
      <div className="cloud-row soon">
        <span className="cloud-logo" aria-hidden="true">
          i
        </span>
        <span className="cloud-name">
          <strong>iCloud</strong>
          <span className="small muted">Apple не пускает сторонние приложения в iCloud Drive. Копию можно сохранить в «Файлы» вручную — «Скачать копию» ниже.</span>
        </span>
      </div>

      {!ready && (
        <details className="pp-more">
          <summary>Настроить подключение к Яндекс Диску (один раз, для владельца приложения)</summary>
          <ol className="small cloud-steps">
            <li>
              Открой <a href="https://oauth.yandex.ru/client/new" target="_blank" rel="noreferrer">oauth.yandex.ru</a> → «Создать приложение».
            </li>
            <li>Платформа — «Веб-сервисы». Redirect URI: {yandexRedirectUri()} (и адрес сайта, когда он будет опубликован).</li>
            <li>Доступ к данным: «Яндекс.Диск REST API» → «Доступ к папке приложения на Диске».</li>
            <li>Скопируй ClientID и вставь сюда.</li>
          </ol>
          <div className="row">
            <input className="input" placeholder="ClientID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <button
              className="btn"
              disabled={!clientId.trim()}
              onClick={() => {
                setYandexClientId(clientId)
                location.reload()
              }}
            >
              Сохранить
            </button>
          </div>
        </details>
      )}
    </section>
  )
}

