import { go } from '../lib/router'
import { Modal } from '../lib/ui'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = mac ? '⌘' : 'Ctrl'
const ALT = mac ? '⌥' : 'Alt'

/** Every key the app knows, by group. The help page shows the same list. */
export const SHORTCUT_GROUPS: [string, [string, string][]][] = [
  [
    'Текст',
    [
      [`${MOD} + I`, 'Курсив'],
      [`${MOD} + B`, 'Жирный'],
      [`${MOD} + Z`, 'Отменить, в том числе автозамену'],
      [`${MOD} + F`, 'Найти в сцене'],
      [mac ? '⌘ + ⇧ + H' : 'Ctrl + H', 'Найти и заменить'],
    ],
  ],
  [
    'История',
    [
      [`${MOD} + ${ALT} + ↓`, 'Следующая сцена'],
      [`${MOD} + ${ALT} + ↑`, 'Предыдущая сцена'],
      [`${MOD} + ⇧ + F`, 'Поиск по всей истории'],
      [`${MOD} + M`, 'Маячок там, где курсор'],
      [`${MOD} + J`, 'Быстрая запись'],
      [`${MOD} + /`, 'Эти клавиши'],
      ['Esc', 'Показать шапку в тихом виде'],
    ],
  ],
  [
    'Доска',
    [
      [`${MOD} + Z`, 'Отменить последнее действие с главами, сценами и линиями'],
      [mac ? '⌘ + ⇧ + Z' : 'Ctrl + Shift + Z', 'Вернуть отменённое'],
    ],
  ],
  [
    'Пишешь — оформляется само',
    [
      ['- в начале абзаца', '— реплика'],
      ['слово - слово, --', 'длинное тире —'],
      ['"слово"', '«ёлочки», внутри „лапки“'],
      ['<< >>', '« »'],
      ['...', '…'],
      ['*слово*  **слово**', 'курсив, жирный'],
      ['// заметка и Enter', 'заметка уходит на поля'],
    ],
  ],
]

/** Every key the editor knows, on one screen (⌘/Ctrl + /). */
export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} label="Горячие клавиши">
      <div className="stack keys">
        <h2>Горячие клавиши</h2>
        {SHORTCUT_GROUPS.map(([title, rows]) => (
          <section key={title}>
            <div className="field-label">{title}</div>
            {rows.map(([k, what]) => (
              <div className="keys-row" key={k}>
                <kbd>{k}</kbd>
                <span>{what}</span>
              </div>
            ))}
          </section>
        ))}
        <button
          className="link"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            onClose()
            go({ view: 'help' })
          }}
        >
          Вся справка →
        </button>
      </div>
    </Modal>
  )
}
