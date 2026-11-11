import type { SyncStatus } from '../db/cloud'
import type { FileSyncState } from './filesync'
import { timeAgo } from './status'

export type DataSafetyState = 'local' | 'pending' | 'syncing' | 'ok' | 'conflict' | 'offline' | 'error'

export interface DataSafetyStatus {
  state: DataSafetyState
  label: string
  title: string
  provider: 'local' | 'yandex' | 'supabase'
}

export function dataSafetyStatus(opts: {
  yandex: boolean
  supabase: boolean
  file: FileSyncState
  cloud: SyncStatus
  preview?: boolean
}): DataSafetyStatus {
  if (opts.yandex) {
    const file = opts.file
    if (file.state === 'pending') return { state: 'pending', label: 'Ждёт облако', title: 'Сохранено на устройстве · ждёт отправки на Яндекс Диск', provider: 'yandex' }
    if (file.state === 'syncing') return { state: 'syncing', label: 'В облако…', title: 'Сохранено на устройстве · отправляется на Яндекс Диск', provider: 'yandex' }
    if (file.state === 'ok' && file.conflicts)
      return {
        state: 'conflict',
        label: 'Есть конфликт',
        title: `Сохранено на устройстве и в облаке · ${file.conflicts} конфликтующих правок сохранено отдельно`,
        provider: 'yandex',
      }
    if (file.state === 'ok') return { state: 'ok', label: 'В облаке', title: `Сохранено на устройстве · Яндекс Диск синхронизирован ${timeAgo(file.at)}`, provider: 'yandex' }
    if (file.state === 'offline') return { state: 'offline', label: 'Без сети', title: 'Сохранено на устройстве · Яндекс Диск ждёт подключения к интернету', provider: 'yandex' }
    if (file.state === 'error') return { state: 'error', label: 'Ошибка облака', title: `Сохранено на устройстве · Яндекс Диск: ${file.message}`, provider: 'yandex' }
    return { state: 'pending', label: 'Облако не запущено', title: 'Сохранено на устройстве · синхронизация с Яндекс Диском не запущена', provider: 'yandex' }
  }

  if (opts.supabase) {
    const cloud = opts.cloud
    if (cloud.state === 'syncing') return { state: 'syncing', label: 'В облако…', title: 'Сохранено на устройстве · отправляется в облако', provider: 'supabase' }
    if (cloud.state === 'ok') return { state: 'ok', label: 'В облаке', title: `Сохранено на устройстве · облако синхронизировано ${timeAgo(cloud.at)}`, provider: 'supabase' }
    if (cloud.state === 'offline') return { state: 'offline', label: 'Без сети', title: 'Сохранено на устройстве · облако ждёт подключения к интернету', provider: 'supabase' }
    if (cloud.state === 'error') return { state: 'error', label: 'Ошибка облака', title: `Сохранено на устройстве · облако: ${cloud.message}`, provider: 'supabase' }
    return { state: 'pending', label: 'Ждёт облако', title: 'Сохранено на устройстве · вход в облако не выполнен', provider: 'supabase' }
  }

  return opts.preview
    ? { state: 'local', label: 'Тестовая база', title: 'Сохранено только в отдельной тестовой базе этого устройства', provider: 'local' }
    : { state: 'local', label: 'Только на устройстве', title: 'Сохранено на этом устройстве · облако не подключено', provider: 'local' }
}
