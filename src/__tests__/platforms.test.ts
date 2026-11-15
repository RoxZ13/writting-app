import { describe, expect, it } from 'vitest'
import { customPlatform, platformOf, PLATFORMS, UNSELECTED_PLATFORM } from '../lib/platforms'

describe('publishing platform model', () => {
  it('does not silently assign Ficbook before the author chooses a platform', () => {
    expect(platformOf({})).toBe(UNSELECTED_PLATFORM)
    expect(platformOf({}).selected).toBe(false)
    expect(platformOf({}).id).toBe('unset')
    expect(PLATFORMS.some((platform) => platform.id === ('unset' as never))).toBe(false)
  })

  it('keeps recommendations separate from hard limits', () => {
    const platform = platformOf({ platform: 'authortoday' })
    expect(platform.selected).toBe(true)
    expect(platform.recommended).toMatchObject({ unit: 'chars', min: 15_000, max: 40_000 })
    expect(platform.hard).toMatchObject({ unit: 'chars', max: 100_000 })
  })

  it('describes limits that use a different unit from the platform counter', () => {
    const platform = platformOf({ platform: 'ao3' })
    expect(platform.unit).toBe('words')
    expect(platform.hard).toMatchObject({ unit: 'html-chars', min: 10, max: 510_000 })
    expect(platform.metadata.find((rule) => rule.key === 'tags')).toMatchObject({ max: 75, unit: 'items' })
    expect(platform.sources.every((source) => /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt))).toBe(true)
  })

  it('builds a custom profile without adding a fake built-in platform', () => {
    const platform = customPlatform({
      name: 'Мой канал',
      unit: 'chars',
      hard: { unit: 'chars', max: 4096 },
      copy: 'rich',
    })
    expect(platform).toMatchObject({ id: 'other', selected: true, custom: true, name: 'Мой канал' })
    expect(platform.hard?.max).toBe(4096)
    expect(PLATFORMS.map((item) => item.name)).not.toContain('Мой канал')
  })
})
