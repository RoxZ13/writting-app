import type { Project } from '../db/db'

/** Where the book goes up. Changes the words on «Книга» and how a chapter is copied. */
export type PlatformId = 'ficbook' | 'authortoday' | 'litnet' | 'ao3' | 'other'

export interface Platform {
  id: PlatformId
  name: string
  /** «Выкладка на …» */
  to: string
  /** «Скопировать для …» */
  for: string
  /** «Открыть на …» */
  at: string
  url: string
  /**
   * Ficbook's editor takes <i>/<b> tags typed as text; the others take formatting pasted as rich text.
   */
  copy: 'tags' | 'rich'
}

export const PLATFORMS: Platform[] = [
  { id: 'ficbook', name: 'Фикбук', to: 'на Фикбук', for: 'для Фикбука', at: 'на Фикбуке', url: 'https://ficbook.net/readfic/…', copy: 'tags' },
  { id: 'authortoday', name: 'Author.Today', to: 'на Author.Today', for: 'для Author.Today', at: 'на Author.Today', url: 'https://author.today/work/…', copy: 'rich' },
  { id: 'litnet', name: 'Литнет', to: 'на Литнет', for: 'для Литнета', at: 'на Литнете', url: 'https://litnet.com/ru/book/…', copy: 'rich' },
  { id: 'ao3', name: 'AO3', to: 'на AO3', for: 'для AO3', at: 'на AO3', url: 'https://archiveofourown.org/works/…', copy: 'rich' },
  { id: 'other', name: 'Другое', to: '', for: '', at: 'на сайте', url: 'https://…', copy: 'rich' },
]

export const platformOf = (p: Project): Platform => PLATFORMS.find((x) => x.id === p.platform) ?? PLATFORMS[0]
