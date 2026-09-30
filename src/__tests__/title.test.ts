import { describe, expect, it } from 'vitest'
import { titleFromText } from '../components/TitlePage'

describe('working title from the first phrase', () => {
  it('takes up to six words, drops a dialogue dash and a final full stop', () => {
    expect(titleFromText('Он вернул ключи, не глядя.')).toBe('Он вернул ключи, не глядя')
    expect(titleFromText('— Ты правда думаешь, что так будет лучше? — спросила она.')).toBe('Ты правда думаешь, что так будет…')
    expect(titleFromText('Ну да.')).toBeUndefined()
  })
})
