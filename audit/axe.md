# Axe: доступность по экранам

Собрано `e2e/a11y.e2e.ts` (axe-core через @axe-core/playwright, правила по умолчанию, включая best-practice) на сборке продакшена. Проекты: desktop (Chrome 1280), phone (Pixel 7, Chromium), iphone (iPhone 14, WebKit — не настоящий Safari). Сцена-образец: импорт маленькой книги из двух частей. Дата прогона: 2026-10-25.

Правило тестов: «нет critical-нарушений». Где они есть — тест `test.fail()` с пометкой audit (список в `KNOWN_CRITICAL`), так что набор зелёный, а доказательства остаются. Когда экран починят, Playwright сообщит о неожиданном прохождении.

## Итоги по серьёзности

Считаются правила-нарушения (первое число) и узлы DOM (в скобках), суммарно по всем отсканированным экранам.

| Проект | critical | serious | moderate | minor | экранов с critical |
|---|---|---|---|---|---|
| desktop | 8 (12) | 20 (137) | 18 (27) | 1 (1) | 8 из 14 |
| phone | 4 (4) | 20 (121) | 18 (27) | 1 (1) | 4 из 14 |
| iphone | 4 (4) | 20 (121) | 18 (27) | 1 (1) | 4 из 14 |

## Худшие правила (по серьёзности, затем по числу узлов во всех экранах и проектах)

1. **label** (critical) — Form elements must have labels. Узлов всего: 20; экранов×проектов: 16. Примеры: `input[value="Часть 1"]`, `input[value="Часть 2"]`
2. **color-contrast** (serious) — Elements must meet minimum color contrast ratio thresholds. Узлов всего: 355; экранов×проектов: 39. Примеры: `.tagline`, `p`
3. **label-content-name-mismatch** (serious) — Elements must have their visible text as part of their accessible name. Узлов всего: 15; экранов×проектов: 12. Примеры: `.book`, `button[aria-label="Меньше"]`
4. **aria-prohibited-attr** (serious) — Elements must only use permitted ARIA attributes. Узлов всего: 6; экранов×проектов: 6. Примеры: `.margin-notes`
5. **label-title-only** (serious) — Form elements should have a visible label. Узлов всего: 3; экранов×проектов: 3. Примеры: `select`

## Все правила (сводка)

| Правило | Серьёзность | Описание | Экран×проект | Узлов |
|---|---|---|---|---|
| label | critical | Form elements must have labels | 16 | 20 |
| color-contrast | serious | Elements must meet minimum color contrast ratio thresholds | 39 | 355 |
| label-content-name-mismatch | serious | Elements must have their visible text as part of their accessible name | 12 | 15 |
| aria-prohibited-attr | serious | Elements must only use permitted ARIA attributes | 6 | 6 |
| label-title-only | serious | Form elements should have a visible label | 3 | 3 |
| region | moderate | All page content should be contained by landmarks | 9 | 36 |
| page-has-heading-one | moderate | Page should contain a level-one heading | 21 | 21 |
| landmark-one-main | moderate | Document should have one main landmark | 9 | 9 |
| landmark-no-duplicate-banner | moderate | Document should not have more than one banner landmark | 6 | 6 |
| landmark-unique | moderate | Landmarks should have a unique role or role/label/title (i.e. accessible name) combination | 6 | 6 |
| heading-order | moderate | Heading levels should only increase by one | 3 | 3 |
| aria-allowed-role | minor | ARIA role should be appropriate for the element | 3 | 3 |

## По экранам

Каждая строка: правило, серьёзность, число узлов, первые два селектора. Внутри экрана отсортировано по серьёзности.

### welcome

**desktop**

- `color-contrast` · serious · 4 уз. · Elements must meet minimum color contrast ratio thresholds — `.tagline`, `p`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.brand`, `p`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `p`, `.welcome-more > label`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.logo`, `p`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `p`, `.welcome-more > label`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.logo`, `p`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### text view

**desktop**

- `color-contrast` · serious · 5 уз. · Elements must meet minimum color contrast ratio thresholds — `.hide-sm`, `.crumb-scene`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumbs`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `.crumb-scene`, `.aa`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumb-scene`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `.crumb-scene`, `.aa`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumb-scene`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### Входящие

**desktop**

- `color-contrast` · serious · 1 уз. · Elements must meet minimum color contrast ratio thresholds — `.small`

**phone**

- `color-contrast` · serious · 1 уз. · Elements must meet minimum color contrast ratio thresholds — `.small`

**iphone**

- `color-contrast` · serious · 1 уз. · Elements must meet minimum color contrast ratio thresholds — `.small`

### board

**desktop**

- `label` · critical · 2 уз. · Form elements must have labels — `input[value="Часть 1"]`, `input[value="Часть 2"]`
- `color-contrast` · serious · 14 уз. · Elements must meet minimum color contrast ratio thresholds — `.lens-add`, `.plan-lock`

**phone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.muted`, `.lens-add`

**iphone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.muted`, `.lens-add`

### Матчасть

**desktop**

- `color-contrast` · serious · 2 уз. · Elements must meet minimum color contrast ratio thresholds — `select`, `.where-found`
- `label-title-only` · serious · 1 уз. · Form elements should have a visible label — `select`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `color-contrast` · serious · 2 уз. · Elements must meet minimum color contrast ratio thresholds — `select`, `.where-found`
- `label-title-only` · serious · 1 уз. · Form elements should have a visible label — `select`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `color-contrast` · serious · 2 уз. · Elements must meet minimum color contrast ratio thresholds — `select`, `.where-found`
- `label-title-only` · serious · 1 уз. · Form elements should have a visible label — `select`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### Герои

**desktop**

- `label` · critical · 1 уз. · Form elements must have labels — `.person-name`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `label` · critical · 1 уз. · Form elements must have labels — `.person-name`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `label` · critical · 1 уз. · Form elements must have labels — `.person-name`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### Об истории (книга)

**desktop**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 13 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 13 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 13 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### Все истории (библиотека)

**desktop**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `.tagline`, `.lib-back`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`

**phone**

- `color-contrast` · serious · 2 уз. · Elements must meet minimum color contrast ratio thresholds — `.lib-back`, `.story-meta`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`

**iphone**

- `color-contrast` · serious · 2 уз. · Elements must meet minimum color contrast ratio thresholds — `.lib-back`, `.story-meta`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`

### Об истории — «Файлы и прочее» открыто

**desktop**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 19 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 19 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `label` · critical · 1 уз. · Form elements must have labels — `.book-title`
- `color-contrast` · serious · 19 уз. · Elements must meet minimum color contrast ratio thresholds — `.eyebrow`, `div:nth-child(4) > .field-label`
- `label-content-name-mismatch` · serious · 1 уз. · Elements must have their visible text as part of their accessible name — `.book`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### Настройки

**desktop**

- `label` · critical · 1 уз. · Form elements must have labels — `input[min="13"]`
- `color-contrast` · serious · 15 уз. · Elements must meet minimum color contrast ratio thresholds — `.tagline`, `.lib-back`
- `label-content-name-mismatch` · serious · 2 уз. · Elements must have their visible text as part of their accessible name — `button[aria-label="Меньше"]`, `button[aria-label="Больше"]`
- `heading-order` · moderate · 1 уз. · Heading levels should only increase by one — `section:nth-child(2) > h3`

**phone**

- `label` · critical · 1 уз. · Form elements must have labels — `input[min="13"]`
- `color-contrast` · serious · 13 уз. · Elements must meet minimum color contrast ratio thresholds — `.lib-back`, `.lib-head > .muted`
- `label-content-name-mismatch` · serious · 2 уз. · Elements must have their visible text as part of their accessible name — `button[aria-label="Меньше"]`, `button[aria-label="Больше"]`
- `heading-order` · moderate · 1 уз. · Heading levels should only increase by one — `section:nth-child(2) > h3`

**iphone**

- `label` · critical · 1 уз. · Form elements must have labels — `input[min="13"]`
- `color-contrast` · serious · 13 уз. · Elements must meet minimum color contrast ratio thresholds — `.lib-back`, `.lib-head > .muted`
- `label-content-name-mismatch` · serious · 2 уз. · Elements must have their visible text as part of their accessible name — `button[aria-label="Меньше"]`, `button[aria-label="Больше"]`
- `heading-order` · moderate · 1 уз. · Heading levels should only increase by one — `section:nth-child(2) > h3`

### быстрая запись (Ctrl+J)

**desktop**

- `label` · critical · 2 уз. · Form elements must have labels — `input[value="Часть 1"]`, `input[value="Часть 2"]`
- `color-contrast` · serious · 15 уз. · Elements must meet minimum color contrast ratio thresholds — `.lens-add`, `.plan-lock`

**phone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.story-home-head > .muted.small`, `.lens-add`

**iphone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.story-home-head > .muted.small`, `.lens-add`

### поиск по истории (Ctrl+Shift+F)

**desktop**

- `label` · critical · 2 уз. · Form elements must have labels — `input[value="Часть 1"]`, `input[value="Часть 2"]`
- `color-contrast` · serious · 14 уз. · Elements must meet minimum color contrast ratio thresholds — `.lens-add`, `.plan-lock`

**phone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.muted`, `.lens-add`

**iphone**

- `color-contrast` · serious · 12 уз. · Elements must meet minimum color contrast ratio thresholds — `.muted`, `.lens-add`

### поиск в сцене (Ctrl+F)

**desktop**

- `color-contrast` · serious · 5 уз. · Elements must meet minimum color contrast ratio thresholds — `.hide-sm`, `.crumb-scene`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumbs`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**phone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `.crumb-scene`, `.aa`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumb-scene`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

**iphone**

- `color-contrast` · serious · 3 уз. · Elements must meet minimum color contrast ratio thresholds — `.crumb-scene`, `.aa`
- `aria-prohibited-attr` · serious · 1 уз. · Elements must only use permitted ARIA attributes — `.margin-notes`
- `region` · moderate · 4 уз. · All page content should be contained by landmarks — `.crumb-scene`, `.editor-wrap > div:nth-child(2)`
- `landmark-no-duplicate-banner` · moderate · 1 уз. · Document should not have more than one banner landmark — `.app-header`
- `landmark-one-main` · moderate · 1 уз. · Document should have one main landmark — `html`
- `landmark-unique` · moderate · 1 уз. · Landmarks should have a unique role or role/label/title (i.e. accessible name) combination — `.app-header`
- `page-has-heading-one` · moderate · 1 уз. · Page should contain a level-one heading — `html`

### карточка сцены на доске

**desktop**

- `label` · critical · 2 уз. · Form elements must have labels — `input[value="Часть 1"]`, `input[value="Часть 2"]`
- `color-contrast` · serious · 19 уз. · Elements must meet minimum color contrast ratio thresholds — `.lens-add`, `.plan-lock`
- `aria-allowed-role` · minor · 1 уз. · ARIA role should be appropriate for the element — `aside`

**phone**

- `color-contrast` · serious · 18 уз. · Elements must meet minimum color contrast ratio thresholds — `.story-home-head > .muted.small`, `.lens-add`
- `aria-allowed-role` · minor · 1 уз. · ARIA role should be appropriate for the element — `aside`

**iphone**

- `color-contrast` · serious · 18 уз. · Elements must meet minimum color contrast ratio thresholds — `.story-home-head > .muted.small`, `.lens-add`
- `aria-allowed-role` · minor · 1 уз. · ARIA role should be appropriate for the element — `aside`

## Критические нарушения: что именно

Все critical — одно правило `label` («у поля нет имени»):

| Экран | Поле | Проекты |
|---|---|---|
| Доска (колонки) | `input[value="Часть N"]` — название главы (InlineEdit), по одному на главу | desktop (на телефоне доска — список кнопок, там нет) |
| Герои | `.person-name` — имя героя | desktop, phone, iphone |
| Об истории | `.book-title` — название книги (InlineEdit) | desktop, phone, iphone |
| Настройки | `input[min="13"]` — числовое поле (min=13) | desktop, phone, iphone |
| Быстрая запись, Поиск по истории, Карточка сцены (desktop) | те же `input[value="Часть N"]` с доски за окном | только desktop: axe сканирует и доску под диалогом (за диалогом нет `inert`/`aria-hidden`) |

Побочное наблюдение: Modal (`src/lib/ui.tsx`) — `role="dialog"` без `aria-modal`, фон не прячется от скринридера, поэтому нарушения фона попадают в скан окна.

## Клавиатура

Фокус на первом экране (welcome), 8 нажатий Tab, одинаково в desktop, phone и iphone:

1. `button` «Начать историю»
2. `button` «Уже пишу на другом устройстве»
3. фокус уходит из страницы (адресная строка браузера), затем круг повторяется.

- **«Импортировать .docx / .txt» недостижим с клавиатуры** — `<label class="btn">` вокруг `<input type="file" hidden>`. Сам label не фокусируется, input скрыт (`display:none`). То же для «Вернуть из копии» на welcome и «Импорт .docx / .txt» в библиотеке (за 25 Tab не достигается). Три теста — `test.fail()` с пометкой `// audit: file inputs unreachable by keyboard`, во всех трёх проектах. Без мыши (и без пальца) невозможно ни импортировать книгу, ни вернуть копию. Потеря у людей, пользующихся клавиатурой или экранным диктором.
- **B-017: карточка сцены на доске.** desktop: карточка получает фокус (17-е нажатие Tab, `div[role=button]` от dnd-kit), но Enter не открывает сцену: он поднимает карточку для перетаскивания, живая область сообщает «Draggable item … was moved over droppable area …» (англоязычный служебный текст dnd-kit). Открыть сцену с клавиатуры нельзя. Тест `test.fail()` (только desktop). phone и iphone: список — настоящие `<button>`, фокус на 15-м/14-м Tab, Enter открывает карточку сцены — тест проходит.
- Анонс перетаскивания по умолчанию английский (dnd-kit `accessibility`), для русскоязычного интерфейса это ещё одна дыра.

## Заметки по методу

- iphone — WebKit в Playwright, не настоящий Safari и не VoiceOver. Результаты axe там совпали с Chromium на телефоне поштучно.
- Контраст (`color-contrast`) — самое массовое: 355 узлов по всем экранам. Цвета берутся из токенов, поэтому правка токена `--muted`/`--faint` (проверить, какой из них вызывает) чинит большую часть сразу. Проверялась только светлая тема.
- Не проверялись тёмная тема и «бумага».
