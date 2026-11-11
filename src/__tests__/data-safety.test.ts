import { describe, expect, it } from 'vitest'
import { dataSafetyStatus } from '../lib/data-safety'

describe('global data safety status', () => {
  it('shows unsent Yandex changes instead of claiming the cloud is current', () => {
    const status = dataSafetyStatus({ yandex: true, supabase: true, file: { state: 'pending', since: 1 }, cloud: { state: 'ok', at: 2 } })
    expect(status).toMatchObject({ provider: 'yandex', state: 'pending', label: 'Ждёт облако' })
  })

  it('makes a Yandex error visible while confirming the local save', () => {
    const status = dataSafetyStatus({ yandex: true, supabase: false, file: { state: 'error', message: 'нет доступа' }, cloud: { state: 'off' } })
    expect(status.title).toContain('Сохранено на устройстве')
    expect(status.title).toContain('нет доступа')
  })

  it('does not hide an archived metadata conflict behind a green cloud status', () => {
    const status = dataSafetyStatus({ yandex: true, supabase: false, file: { state: 'ok', at: 1, conflicts: 2 }, cloud: { state: 'off' } })
    expect(status).toMatchObject({ state: 'conflict', label: 'Есть конфликт' })
    expect(status.title).toContain('2 конфликтующих правок')
  })

  it('distinguishes a local-only and a preview database', () => {
    const local = dataSafetyStatus({ yandex: false, supabase: false, file: { state: 'off' }, cloud: { state: 'off' } })
    const preview = dataSafetyStatus({ yandex: false, supabase: false, file: { state: 'off' }, cloud: { state: 'off' }, preview: true })
    expect(local.label).toBe('Только на устройстве')
    expect(preview.label).toBe('Тестовая база')
  })
})
