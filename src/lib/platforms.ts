import type { Project } from '../db/db'

/** Where the book goes up. Changes the words on «Книга» and how a chapter is copied. */
export type PlatformId = 'ficbook' | 'authortoday' | 'litnet' | 'ao3' | 'other'
export type PlatformUnit = 'words' | 'chars' | 'html-chars' | 'ficbook-pages'
export type PlatformCopyMode = 'tags' | 'rich'

export interface PlatformRange {
  /** A platform may display words but enforce a limit against HTML characters. */
  unit: PlatformUnit
  min?: number
  max?: number
  /** A recommendation around one value, rather than a range. */
  target?: number
  note?: string
}

export interface PlatformMetadataRule {
  key: 'title' | 'summary' | 'notes' | 'tags' | 'fandom' | 'characters' | 'relationships' | string
  label: string
  required?: boolean
  max?: number
  unit?: 'chars' | 'items'
}

export interface PlatformSource {
  url: string
  /** Date of the source itself when known. */
  date?: string
  /** When Manuscript last checked the rule. */
  checkedAt: string
}

interface PlatformCommon {
  name: string
  /** «Выкладка на …» */
  to: string
  /** «Скопировать для …» */
  for: string
  /** «Открыть на …» */
  at: string
  url: string
  copy: PlatformCopyMode
  /** The unit authors normally see on this platform. */
  unit: PlatformUnit
  /** Advice, not a publishing blocker. */
  recommended?: PlatformRange
  /** A platform-enforced boundary. */
  hard?: PlatformRange
  metadata: PlatformMetadataRule[]
  sources: PlatformSource[]
}

export interface SelectedPlatform extends PlatformCommon {
  id: PlatformId
  selected: true
  custom?: boolean
}

export interface UnselectedPlatform extends PlatformCommon {
  id: 'unset'
  selected: false
}

export type Platform = SelectedPlatform | UnselectedPlatform

const CHECKED_AT = '2026-10-25'

export const PLATFORMS: SelectedPlatform[] = [
  {
    id: 'ficbook',
    selected: true,
    name: 'Фикбук',
    to: 'на Фикбук',
    for: 'для Фикбука',
    at: 'на Фикбуке',
    url: 'https://ficbook.net/readfic/…',
    copy: 'tags',
    unit: 'words',
    recommended: { unit: 'words', target: 2000, note: 'Рекомендация, не ограничение редактора.' },
    metadata: [],
    sources: [{ url: 'https://ficbook.net/knowledgebase/2/14', checkedAt: CHECKED_AT }],
  },
  {
    id: 'authortoday',
    selected: true,
    name: 'Author.Today',
    to: 'на Author.Today',
    for: 'для Author.Today',
    at: 'на Author.Today',
    url: 'https://author.today/work/…',
    copy: 'rich',
    unit: 'chars',
    recommended: { unit: 'chars', min: 15_000, max: 40_000 },
    hard: { unit: 'chars', max: 100_000, note: 'Для платных книг — обязательный максимум; в общих правилах указан как рекомендуемый.' },
    metadata: [],
    sources: [
      { url: 'https://help.author.today/knowledge_base/item/268602', date: '2023-07-30', checkedAt: CHECKED_AT },
      { url: 'https://author.today/pages/rules', checkedAt: CHECKED_AT },
    ],
  },
  {
    id: 'litnet',
    selected: true,
    name: 'Литнет',
    to: 'на Литнет',
    for: 'для Литнета',
    at: 'на Литнете',
    url: 'https://litnet.com/ru/book/…',
    copy: 'rich',
    unit: 'chars',
    metadata: [],
    sources: [],
  },
  {
    id: 'ao3',
    selected: true,
    name: 'AO3',
    to: 'на AO3',
    for: 'для AO3',
    at: 'на AO3',
    url: 'https://archiveofourown.org/works/…',
    copy: 'rich',
    unit: 'words',
    hard: { unit: 'html-chars', min: 10, max: 510_000, note: 'HTML-разметка входит в лимит.' },
    metadata: [
      { key: 'title', label: 'Название', max: 255, unit: 'chars' },
      { key: 'summary', label: 'Краткое описание', max: 1250, unit: 'chars' },
      { key: 'notes', label: 'Примечания', max: 5000, unit: 'chars' },
      { key: 'tags', label: 'Фандомы, персонажи, пэйринги и дополнительные теги', max: 75, unit: 'items' },
    ],
    sources: [
      { url: 'https://github.com/otwcode/otwarchive/blob/master/config/config.yml', date: '2026-09-10', checkedAt: CHECKED_AT },
      { url: 'https://archiveofourown.org/faq/posting-and-editing', date: '2025-07-31', checkedAt: CHECKED_AT },
    ],
  },
  {
    id: 'other',
    selected: true,
    custom: true,
    name: 'Другое',
    to: '',
    for: '',
    at: 'на сайте',
    url: 'https://…',
    copy: 'rich',
    unit: 'chars',
    metadata: [],
    sources: [],
  },
]

/**
 * A neutral state is deliberate: an author who has not chosen a site must not silently receive
 * Ficbook tags or Ficbook-specific wording. It is kept outside PLATFORMS, so it never appears as
 * another option in the picker.
 */
export const UNSELECTED_PLATFORM: UnselectedPlatform = {
  id: 'unset',
  selected: false,
  name: 'Площадка не выбрана',
  to: '',
  for: '',
  at: 'на сайте',
  url: 'https://…',
  copy: 'rich',
  unit: 'chars',
  metadata: [],
  sources: [],
}

export const platformOf = (
  p: Pick<Project, 'platform' | 'platformName' | 'platformUnit' | 'platformMax' | 'platformUrl'>,
): Platform => {
  const builtIn = PLATFORMS.find((platform) => platform.id === p.platform)
  if (!builtIn) return UNSELECTED_PLATFORM
  if (builtIn.id !== 'other') return builtIn
  const name = p.platformName?.trim() || builtIn.name
  return customPlatform({
    name,
    to: name === builtIn.name ? '' : `на ${name}`,
    for: name === builtIn.name ? '' : `для ${name}`,
    at: name === builtIn.name ? 'на сайте' : `на ${name}`,
    unit: p.platformUnit ?? builtIn.unit,
    url: p.platformUrl ?? builtIn.url,
    hard: p.platformMax ? { unit: p.platformUnit ?? builtIn.unit, max: p.platformMax } : undefined,
  })
}

/** A custom profile can use the same limit/copy pipeline without a Dexie schema migration. */
export interface CustomPlatformInput extends Partial<Omit<SelectedPlatform, 'id' | 'selected' | 'custom'>> {
  name: string
}

export function customPlatform(input: CustomPlatformInput): SelectedPlatform {
  return {
    id: 'other',
    selected: true,
    custom: true,
    name: input.name.trim() || 'Другая площадка',
    to: input.to ?? '',
    for: input.for ?? '',
    at: input.at ?? 'на сайте',
    url: input.url ?? 'https://…',
    copy: input.copy ?? 'rich',
    unit: input.unit ?? 'chars',
    recommended: input.recommended,
    hard: input.hard,
    metadata: input.metadata ?? [],
    sources: input.sources ?? [],
  }
}
