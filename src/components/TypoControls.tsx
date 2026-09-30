import { useState } from 'react'
import { applyTypo, DEFAULT_TYPO, loadTypo, type Typo } from '../lib/typography'
import { hotkey } from '../lib/session'

type Opt<K extends keyof Typo> = [Typo[K], string]

function Choice<K extends keyof Typo>({ label, k, t, set, options }: { label: string; k: K; t: Typo; set: (t: Typo) => void; options: Opt<K>[] }) {
  return (
    <div className="typo-row">
      <span className="typo-label">{label}</span>
      <div className="seg">
        {options.map(([v, name]) => (
          <button key={String(v)} aria-pressed={t[k] === v} onClick={() => set({ ...t, [k]: v })}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Font, size, width, spacing — changes apply live to the open text. */
export function TypoControls() {
  const [t, setT] = useState<Typo>(loadTypo)
  const set = (next: Typo) => {
    setT(next)
    applyTypo(next)
  }
  return (
    <div className="typo">
      <Choice
        label="Шрифт"
        k="font"
        t={t}
        set={set}
        options={[
          ['serif', 'С засечками'],
          ['sans', 'Без засечек'],
          ['mono', 'Машинка'],
        ]}
      />
      <div className="typo-row">
        <span className="typo-label">Размер</span>
        <div className="size">
          <button className="icon-btn" onClick={() => set({ ...t, size: Math.max(13, t.size - 1) })} aria-label="Меньше">
            A−
          </button>
          <input type="range" min={13} max={26} value={t.size} onChange={(e) => set({ ...t, size: Number(e.target.value) })} />
          <button className="icon-btn" onClick={() => set({ ...t, size: Math.min(26, t.size + 1) })} aria-label="Больше">
            A+
          </button>
          <span className="small muted">{t.size}</span>
        </div>
      </div>
      <div className="typo-cheat">
        <span className="field-label">Пишешь — и оформляется само</span>
        <div>
          <code>*слово*</code> → <em>курсив</em> · <code>**слово**</code> → <strong>жирный</strong>
        </div>
        <div>
          <code>---</code> → — · <code>-</code> и пробел в начале строки → «— » · <code>...</code> → … · <code>"</code> → « »
        </div>
        <div>
          <code>// заметка</code> и Enter → уходит на поля
        </div>
        <div className="muted">{hotkey('⌘/Ctrl + I — курсив, ⌘/Ctrl + B — жирный: можно нажать и печатать дальше')}</div>
      </div>
      <details className="typo-more">
        <summary>Больше настроек</summary>
        <div className="typo">
          <Choice
            label="Вид"
            k="calm"
            t={t}
            set={set}
            options={[
              ['on', 'Тихий'],
              ['off', 'С панелями'],
            ]}
          />
          <Choice
            label="Ширина"
            k="width"
            t={t}
            set={set}
            options={[
              ['narrow', 'Узко'],
              ['medium', 'Средне'],
              ['wide', 'Широко'],
            ]}
          />
          <Choice
            label="Межстрочный"
            k="leading"
            t={t}
            set={set}
            options={[
              ['tight', 'Плотно'],
              ['normal', 'Обычно'],
              ['loose', 'Свободно'],
            ]}
          />
          <Choice
            label="Абзацы"
            k="para"
            t={t}
            set={set}
            options={[
              ['gap', 'С отбивкой'],
              ['indent', 'Красная строка'],
            ]}
          />
          <Choice
            label="Абзац в фокусе"
            k="focusPara"
            t={t}
            set={set}
            options={[
              ['off', 'Нет'],
              ['on', 'Остальные бледнее'],
            ]}
          />
          <Choice
            label="Вход в сцену"
            k="resume"
            t={t}
            set={set}
            options={[
              ['on', 'Подхватить мысль'],
              ['off', 'Сразу текст'],
            ]}
          />
          <Choice
            label="Строка"
            k="typewriter"
            t={t}
            set={set}
            options={[
              ['off', 'Как обычно'],
              ['on', 'По центру экрана'],
            ]}
          />
          <Choice
            label="Орфография"
            k="spell"
            t={t}
            set={set}
            options={[
              ['edit', 'Только при правке'],
              ['always', 'Всегда'],
              ['never', 'Выкл'],
            ]}
          />
          <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => set(DEFAULT_TYPO)}>
            Сбросить
          </button>
        </div>
      </details>
    </div>
  )
}
