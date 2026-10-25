# Critique B: детектор + браузерные измерения (только факты)

Сборка: продакшен http://localhost:4174. Тема приложения по умолчанию `light` (ключ `manuscript.theme` в localStorage), `prefers-color-scheme` без сохранённой настройки игнорируется. Поэтому тёмную тему включал через localStorage, а не через `colorScheme`. Первый прогон с одним `colorScheme: dark` дал светлую тему и в расчёт не идёт.
Скрипты и скриншоты: `C:\Users\HONORA~1\AppData\Local\Temp\claude\C--Claude-----------\169e62f7-0b57-4280-a1bb-fc9c8469139d\scratchpad\critique-b\`

## 1. CLI: `impeccable detect --json src`
Каталог принят, код выхода 2. Сырой JSON: `detect-src.json`.
Находок 3, все одного правила `side-tab` (warning, категория slop): «Thick colored border on one side of a card». В tsx-файлах находок нет, все три в CSS.

| # | Файл:строка | Фрагмент | Селектор |
|---|---|---|---|
| 1 | src/styles/app.css:547 | `border-left: 3px solid var(--line-2)` | `.excerpt` (цитата-отрывок) |
| 2 | src/styles/app.css:1170 | `border-left: 4px solid var(--mk-color)` | `.marker-item` (базовое правило) |
| 3 | src/styles/app.css:1653 | `border-left: 4px solid var(--mk-color)` | `.marker-item` (переопределение: `border:0; border-radius: var(--r-lg)`) |

Вероятные ложные срабатывания:
- №1: цвет нейтральный (`--line-2`), это цитата-вставка, а не акцентная плашка.
- №2 и №3: цвет полосы задаётся переменной `--mk-color`, то есть это выбранный автором цвет маркера, полоса несёт данные. №2 и №3 описывают один компонент, второе правило перекрывает первое.

## 2. Оверлей `detect.js` в браузере
Сервер: `impeccable live-server --background`, порт 8400, токен в `.impeccable/live/server.json`. Команда не вернула управление за 120 с (ушла в фон), но сервер поднялся и отдавал `detect.js` (200, 2.9 МБ).
Preflight (смена `document.title` и добавление `<script>`) прошёл во всех четырёх видах, CSP-метатегов нет. `addScriptTag` с `http://localhost:8400/detect.js` сработал, оверлей отрисовался. Скриншоты с оверлеем, 1440×900: `overlay-welcome.png`, `overlay-text.png`, `overlay-board.png`, `overlay-settings.png`.
Контент: `input[type=file]` с `accept=".docx,.txt,..."` (первый из двух), txt с 2 частями и разделителем `***`. Импортировалось 2 главы / 484 слова. Виды открывал через hash: `#/text`, `#/board`, `#/settings`. Тема светлая.

Находок: welcome 3, text 3, board 10, settings 14. Все `low-contrast`, кроме одной `skipped-heading`.

**welcome (3)**
- `div.tagline` «тихое место для историй»: 3.3:1 (#8e8e95 на #fff)
- `p.muted` «Пиши с первой фразы…»: 3.3:1
- `label.link-plain` «Вернуть из копии»: 3.3:1

**text (3)**
- `span.hide-sm` «Часть 1 ›» (хлебные крошки): 3.0:1 на #f4f4f6
- `div.scene-head-chapter` «Часть 1»: 3.3:1
- `button.stats-chip` «121 слово»: #adadb2 на #f4f4f6, 2.0:1

**board (10)**
- `button.lens-add` «+ линия»: 3.0:1
- `div.column-meta` «Идеи сцен, пока без главы»: 3.3:1
- `input.quick-add`, placeholder «+ сцена из головы»: 3.3:1
- `span.column-count` «2 сцены · 0,8 стр.»: 2.9:1 на #f2f2f4
- `div.card-excerpt` ×4: 3.3:1
- `input.quick-add`, placeholder «+ сцена: кратко, что происходит» ×2: 2.9:1 на #f2f2f4 (один в свёрнутой главе, `folded`)

**settings (14)**
- `div.tagline`: 3.1:1
- `button.lib-back` «← Тихий город»: 3.1:1
- `div.muted` «Для всех историй…»: 3.0:1
- `span.small.muted` «Чернила» (подпись акцента): 3.3:1
- `div.typo-cheat.muted`: 3.3:1
- `p.small.muted` ×1: 3.3:1
- `span.cloud-logo.yandex` «Я»: белый на #fc3f1d, 3.6:1
- `span.small.muted` «Скоро»: #b6b6ba на #fff, 2.0:1
- `summary` «Настроить подключение к Яндекс Диску…»: 3.3:1
- `summary` «Свой сервер синхронизации…»: 3.3:1
- `div.small.muted` ×2: 3.3:1
- `div.small.muted.app-version` «Версия от 18 октября…»: 3.0:1
- `skipped-heading`: `<h1>` «Настройки» затем `<h3>` «Как выглядит» (нет h2)

Общий корень: один токен приглушённого текста #8e8e95 (3.0–3.3:1 на светлых фонах) и ещё более светлые #adadb2 / #b6b6ba.

Вероятные ложные срабатывания оверлея:
- `span.cloud-logo.yandex` «Я»: белая буква на фирменном красном Яндекса, это логотип, а не текст интерфейса.
- «Скоро» (2.0:1): похоже на намеренно приглушённую подпись неактивной строки.
- Плейсхолдеры оверлей проверяет теми же порогами, что и текст; WCAG требует 4.5:1 для плейсхолдера, если он несёт смысл.

## 3. Измерения (Playwright, продакшен-сборка)
Файлы: `measure-results-light-run1.json` (светлая тема, обе ширины), `measure-results-dark.json` (тёмная тема через localStorage), скриншоты `m-<вид>_<ширина>_light.png` и `md-<вид>_<ширина>_dark.png`.

| Показатель | Результат |
|---|---|
| Горизонтальный overflow | Нет ни в одном из 4 видов × 2 ширины × 2 темы (scrollWidth = innerWidth) |
| Контраст основного текста (текст сцены, .ProseMirror) | Светлая 19.7:1 (#0b0b0c на #fff). Тёмная 13.2:1 (#ece6da на #211f23), на мобильном 14.5:1 |
| Контраст h1 | Светлая 17.9:1; тёмная ок |
| Контраст muted-текста, светлая | #8e8e95: 3.25:1 на белом, 2.96:1 на фоне страницы #f4f4f6, 3.12:1 на #fafafb, 2.86:1 на #f0f0f2. Не проходит 4.5:1 |
| Контраст muted-текста, тёмная | #8a867e: 4.51:1 на карточке #211f23, 4.97:1 на фоне #171619. Проходит с минимальным запасом |
| Текстовые элементы ниже порога, светлая, 1440 | welcome 4 из 7, text 10 из 28, board 17 из 45, settings 19 из 99 |
| Текстовые элементы ниже порога, светлая, 390 | welcome 3 из 6, text 4 из 19, board 15 из 37, settings 17 из 97 |
| Текстовые элементы ниже порога, тёмная | 1440: welcome 0, text 2, board 3, settings 4. 390: 0 / 1 / 3 / 4 |
| Самые слабые пары, светлая | разделитель `span.slash` «/» #dedee3 на #fafafb 1.29:1 (декоративный); `button.stats-chip` 2.04:1; `button.lens-add` и `button.plan-lock` 2.96:1 |
| Самые слабые пары, тёмная | `span.slash` 1.45:1; `button.stats-chip` 3.08:1; `button.danger` #e5484d на #211f23 4.18:1; `span.tl-sub` 4.03:1; `span.continue-k` 4.38:1; settings: `.btn.sm` и `.btn.primary` 3.25:1, `span.cloud-logo` 3.58:1, `button.btn` 4.1:1 |
| Текст < 12px | 1440: text 1 (`span.navi-count` 11px), board 2 (`div.column-meta` «Идеи сцен…» 11px, `span.here` «ты здесь» 11px), welcome 0, settings 0. 390: text 5 (`span.tab-label` «Текст»/«Доска»/«Герои» 11px и др.), board 6, welcome 0, settings 0 |
| Цели касания < 44×44, 390 | welcome 3 из 3, text 9 из 15, board 9 из 20, settings 52 из 55 |
| Цели касания < 44×44, 1440 | welcome 3 из 3, text 21 из 22, board 29 из 38, settings 49 из 55 (минимум 28×28) |
| prefers-reduced-motion | Ни одного правила в загруженном CSS (1 таблица стилей, 0 cross-origin; grep по `dist/assets/*.css` тоже 0). В CSS 5 `@keyframes`, 6 правил с animation-name, 37 правил с transition |
| Тёмная тема | Включается только настройкой (localStorage). При `prefers-color-scheme: dark` и пустой памяти приложение светлое |

Цели касания на 390 (светлая тема, самые малые):
- welcome: `label.link-plain` «Вернуть из копии» 107×20; `button.link-plain` «Уже пишу на другом устройстве» 197×20; `button.btn.primary` «Начать историю» 146×36.
- text: `button.icon-btn` «Скрыть» 28×28; `button.tool` ×4 («Показать главы», «План сцены», «Ещё», «Aa») 37–39×34; `button.project-name` 105×23; `button.resume-go` 103×32; `button.logo` 116×33; `input.bare.scene-head-title` 354×33.
- board: `button.btn.sm` «Не надо» 74×30; `button.project-name` 105×23; `button.lens-add` 76×32; `button.btn.sm` «Зафиксировать» 122×30; `button.logo` 116×33; `button.plan-lock` 168×32; `input.quick-add.small` 342×32; `button.btn.ghost` «+ Глава» 358×36; `button.tl-head` 356×41.
- settings (первые 20 из 52): `button.accent-swatch` ×7 (Чернила, Лес, Море, Слива, Терракота, Янтарь, Роза) 28×28; `button.icon-btn` «Меньше»/«Больше» 30×32; кнопки сегментов 44–67×28 (подписи не считались); `button.link.small` 70×23; ссылка `a` 98×18.

Фокус (Tab ×10, для каждого элемента сравнивались computed outline / box-shadow / border / background в состоянии focus и после blur):
- Индикатор есть у кнопок и иконок: это браузерный `outline: auto 1px` цвета rgb(16,16,16) (собственного `:focus-visible` в computed нет). Изменение стиля при фокусе зафиксировано: welcome 7 из 10, text 9 из 10, board 8 из 10, settings 10 из 10 (на 390 text и board по 10 из 10). Нажатия без элемента (`none`) значат, что фокус ушёл за пределы страницы, это не дефект.
- Индикатора нет: board (1440, обе темы) `input.bare` (пустое, название главы) и `textarea.bare` «+ о чём глава»: `outline: none`, box-shadow none, рамка и фон не меняются. `input.quick-add` получает лёгкий box-shadow.
- Тёмная тема: те же два поля на board без индикатора, остальные с индикатором. Контраст самого кольца (rgb 16,16,16 на фоне #171619) отдельно не измерял.

## 4. Пропущено / оговорки
- Оверлей прогонял только в светлой теме и только на 1440×900 (как заказано). Данные по тёмной теме получены моими измерениями, а не детектором.
- Скриншоты `overlay-*.png` сняты первым прогоном (в нём получены счётчики 3 / 3 / 10 / 14). Второй прогон только расшифровывал элементы, находки те же.
- Вид «board» на 390 показывает другую раскладку (таймлайн `tl-head`), а не колонки, поэтому счётчики 390 и 1440 несравнимы.
- Подписи многих кнопок на settings в списке пустые (скрипт не вычитал текст/aria-label), идентифицировать их можно по размеру и классу.
- В тёмной теме `button.btn.primary` на settings: computed color #171619 на #ece6da даёт 3.25:1 вместо ожидаемых ~13:1. Вероятно, состояние disabled с opacity; отдельно не проверял.
- Контраст считан по computed color / background-color с alpha и opacity самого элемента; opacity предков, градиенты и фоновые картинки не учитывались.
- Остановка: `live-server stop --keep-inject` выполнена («Stopped live server on port 8400»), `detect.js` больше не отдаётся. `index.html` не изменялся (в `git status` нет M-файлов). Сервер создал каталог `.impeccable/`.
- Посторонние untracked-объекты в корне проекта, созданные не мной: пустой файл `board` (0 байт), `e2e/volume.e2e.ts`.
