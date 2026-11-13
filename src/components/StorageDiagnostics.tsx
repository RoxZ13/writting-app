import { useEffect, useState } from 'react'
import type { SyncStatus } from '../db/cloud'
import { getCloudConfig } from '../db/cloud'
import { collectStorageDiagnostics, downloadDiagnostics, formatBytes, requestStoragePersistence, type StorageDiagnostics as Data } from '../lib/diagnostics'
import { getFileSyncState, onFileSyncState, type FileSyncState } from '../lib/filesync'
import { timeAgo } from '../lib/status'
import { toast } from '../lib/ui'
import { getYandexToken } from '../lib/yandex'

function cloudText(provider: 'yandex' | 'supabase' | 'none', file: FileSyncState, cloud: SyncStatus): string {
  const state = provider === 'yandex' ? file : provider === 'supabase' ? cloud : { state: 'off' as const }
  if (state.state === 'ok') return `синхронизировано ${timeAgo(state.at)}`
  if (state.state === 'pending') return 'есть изменения, ожидающие отправки'
  if (state.state === 'syncing') return 'синхронизация идёт'
  if (state.state === 'offline') return 'нет сети'
  if (state.state === 'error') return `ошибка: ${state.message}`
  if (state.state === 'signed-out') return 'нужно войти'
  return 'не подключено'
}

export function StorageDiagnostics({ sync }: { sync: SyncStatus }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileSync, setFileSync] = useState<FileSyncState>(getFileSyncState)
  const provider = getYandexToken() ? 'yandex' : getCloudConfig() ? 'supabase' : 'none'

  const refresh = async () => {
    setLoading(true)
    try {
      setData(await collectStorageDiagnostics())
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не получилось прочитать состояние хранилища')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    return onFileSyncState(setFileSync)
  }, [])

  const protect = async () => {
    const result = await requestStoragePersistence()
    if (result === true) toast('Браузер подтвердил защиту локальных данных')
    else if (result === false) toast('Браузер не дал постоянную защиту — сохраняйте ручные копии')
    else toast('Этот браузер не умеет запрашивать постоянное хранение')
    await refresh()
  }

  return (
    <details className="card settings-section diagnostics-section">
      <summary>
        <span>Хранение и диагностика</span>
        <span className="small muted">без текста книг</span>
      </summary>
      {data ? (
        <div className="stack diagnostics-body small">
          <div className="diagnostics-grid">
            <span className="muted">Локальное хранилище</span>
            <strong>{data.persistent === true ? 'защищено браузером' : data.persistent === false ? 'без постоянной защиты' : 'статус неизвестен'}</strong>
            <span className="muted">Занято на этом адресе</span>
            <strong>{formatBytes(data.usage)}{data.quota ? ` из ${formatBytes(data.quota)}` : ''}</strong>
            <span className="muted">Истории / сцены / версии</span>
            <strong>{data.counts.projects} / {data.counts.scenes} / {data.counts.snapshots}</strong>
            <span className="muted">Ждёт облако</span>
            <strong>{data.counts.pending}</strong>
            <span className="muted">Активные конфликты</span>
            <strong>{data.counts.conflicts}</strong>
            <span className="muted">Облако</span>
            <strong>{provider === 'yandex' ? 'Яндекс Диск · ' : provider === 'supabase' ? 'Supabase · ' : ''}{cloudText(provider, fileSync, sync)}</strong>
            <span className="muted">Адрес и база</span>
            <code>{data.origin} · {data.database}</code>
          </div>
          <div className="row diagnostics-actions">
            {data.persistent === false && <button className="btn sm" onClick={() => void protect()}>Защитить локальные данные</button>}
            <button className="btn sm" disabled={loading} onClick={() => void refresh()}>{loading ? 'Проверяю…' : 'Обновить'}</button>
            <button
              className="btn sm ghost"
              onClick={() => downloadDiagnostics(data, {
                build: __BUILD__,
                preview: __PREVIEW__,
                provider,
                cloud: provider === 'yandex' ? fileSync : sync,
                online: navigator.onLine,
                userAgent: navigator.userAgent,
              })}
            >
              Скачать отчёт
            </button>
          </div>
          <div className="muted">Отчёт содержит только технические параметры и количества записей — без названий, заметок и текста рукописи.</div>
        </div>
      ) : (
        <div className="small muted diagnostics-body">{loading ? 'Проверяю хранилище…' : 'Сведения пока недоступны'}</div>
      )}
    </details>
  )
}
