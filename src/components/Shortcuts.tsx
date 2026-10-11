import { Modal } from '../lib/ui'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = mac ? '⌘' : 'Ctrl'
const ALT = mac ? '⌥' : 'Alt'

const GROUPS: [string, [string, string][]][] = [
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
      ['Esc', 'Показать шапку в тихом виде'],
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
        {GROUPS.map(([title, rows]) => (
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
      </div>
    </Modal>
  )
}
