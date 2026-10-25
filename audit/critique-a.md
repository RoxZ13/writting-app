# Critique A: Манускрипт (Operate mode)

Method: Playwright against the production build. Most screens were shot on localhost:4174. The newest features were shot on the published https://roxz13.github.io/writting-app/ in fresh contexts (`pub-*`). Sizes: 1440×900 and 390×844 with touch, light and dark, plus iPhone 390×844 in WebKit. Test content was a generated Ficbook .txt: 3 parts, 9 scenes. Screenshots are in the scratch folder `critique-a/shots*/`. I read the source to explain what I saw.

## Design-specificity verdict

**Specific in words, generic in form.** The writing page is clearly made for a Russian fanfic author. It has Literata on a paper card and live typography (`- ` becomes «— », quotes become «ёлочки»). «Продолжить» brings back the last two sentences. It also has «В запас», «Маячок / Посеять» and «На сегодня всё?» (desk-light-07b, 20-finish, pub-desk-light-10). The chrome around it is interchangeable minimal SaaS: Manrope, grey pill tabs, black pill buttons, white rounded cards and a Latin "Manuscript." wordmark. The library, settings, book page and inbox could belong to any notes app (05-library, 05-settings-full, 05-inbox).

## Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Save tick and «ты здесь» are good. The overrun «+88 сл.» has no label and reads like today's count (pub-desk-light-07-ring-zoom). |
| 2 | Match with the real world | 3 | Author vocabulary throughout. Scene names are positional («Сцена 2»), so a scene changes its name when moved (shots3/41). |
| 3 | User control and freedom | 2 | Text Ctrl+Z and the «Отменить» toasts work. Ctrl+Z on the board does nothing (shots3/41→42). The «правка» mode carries over into a new story (desk-light-19). |
| 4 | Consistency and standards | 2 | Capture types (Мысль/Цитата/Диалог/Вопрос/**Маячок**) differ from Inbox (…/**Заметка**). Header nav is icon-only on desktop but labelled on the phone. |
| 5 | Error prevention | 3 | «Переписать» keeps the old text, and the plan-lock prompt protects order. |
| 6 | Recognition over recall | 2 | Modes are hidden in «⋯». Поиск/Входящие/История have no labels on desktop. Help is reachable only from the library sidebar. |
| 7 | Flexibility and efficiency | 3 | Rich shortcuts and a keyboard sensor for dragging. Ctrl+Alt+↑/↓ clashes with Windows graphics hotkeys. |
| 8 | Aesthetic, minimalist design | 3 | The writing page is excellent. The board, book page and inbox are dense. |
| 9 | Error recovery | 3 | Undo toasts throughout. The marker toast says it «будет гореть красным», which is alarm language. |
| 10 | Help and documentation | 1 | «Справка» teaches removed features: «накал ●●●», «станут узлами ◆», «столбики накал сцен» (desk-light-05-help, HelpView.tsx:6). |
| | **Total** | **25/40** | |

## Cognitive load (ADHD author)

Decision points with more than 4 visible options:
- **Board after import:** 6 nav items, «+ линия», «Зафиксировать план», a lock banner with 2 buttons, a «⋯» on each column, «+ сцена» on each column and the FAB. That is more than 15 controls, and the first message is a yes/no question (desk-light-02).
- **«⋯» menu in the text:** 3 modes, 5 actions and a footer, 9 in all (desk-light-09).
- **Selection bubble:** К, Ж, Маячок, Раскрытие, Заметка, В запас, 6 in all. It appears on every selection, including the find highlight (shots2/desk-light-13). On the phone it wraps, and «В запас» sits alone on a second row (pub-iphone-light-09).
- **Scene sheet:** 9 options (desk-light-04).
- **Quick capture:** 7 options. **Inbox:** 10 options.
- **Book page:** more than 30 options, including 5 stages, 3 cover buttons and 11 colours (desk-light-05-book-full).

Things that pull the author out of the text (principle 4):
- **Red chapter meter.** With any chapter norm set, a red rule plus «длиннее нормы на 92 сл. · ✂ новая глава с этого абзаца» sits above the page. It stays while typing, and on the iPhone it covers the toolbar (pub-iphone-light-08, pub-desk-light-10).
- **Resume bar over the text.** It also covers the bottom of the «⋯» menu on the phone, hiding «Закончить на сегодня» (shots2/phone-light-09).
- **Toasts in mid-text** (shots2/desk-light-23).

## Emotional journey

- **First run** is calm: one card, two clear choices (01-welcome). «Начать историю» drops the author straight onto a page that says «Любая фраза. Можно из середины.», which is lovely. But the decided «Об истории» screen is missing (shots2/desk-light-30).
- **First import** feels like paperwork. The board opens with «Эти главы уже написаны (3). Зафиксировать их?», and «Герои» is empty even though Лиза and Марк speak in every scene (05-characters).
- **First scene:** the page opens scrolled to where the author stopped. Text ghosts under the toolbar strip (desk-light-07).
- **Next day:** «Продолжить» with the last sentences is a good re-entry. «В прошлый раз» appears only if a note was written at «На сегодня всё?».
- **End of session:** a warm dialog, but it is buried in «⋯» and says «+2 слов», which is wrong grammar.

## Strengths

1. **The writing surface:** Literata at a ~65-character measure, Russian auto-typography, a quiet save tick, and on the phone the bottom nav disappears while typing (shots2/phone-light-31).
2. **Hidden by default, shown on choice:** the Маячки lens with a count badge dims the other cards and lists hanging markers (shots2/desk-light-24/25). The scene sheet asks only for tempo and «Ключевая».
3. **Reversibility:** «В запас» with Ctrl+Z, «Переписать» that keeps the old text, and «Отменить» on toasts.

## Priority issues

**[P1] The chapter meter shouts over the page.**
- *What:* with a norm set (for example the Фикбук preset), a red bar and red text with a «✂» action sit above the text and do not fade while typing. On the iPhone they overlap «Главы / Aa / ⋯» (pub-iphone-light-06/08). With «План» open on desktop they overlap the «План» button (pub-desk-light-12).
- *Why it matters:* it breaks principle 4 and the 2026-10-25 decision «только индикатор, без текста поверх страницы». It also repeats what the ring already says.
- *Fix:* when the ring is on, reduce the meter to a neutral hairline that hides while typing. Move «новая глава с этого абзаца» into «⋯». Use no red.
- *Command:* `quieter`

**[P1] Decided flows are missing.**
- *What:* no skippable «Об истории» screen with «Придумать сцены» / «Сразу писать». No Ctrl+Z on the board. No «Сделать главой» from selected columns, and chapter edges cannot be dragged.
- *Why it matters:* this is the core promise for authors who rebuild their chapters often.
- *Fix:* build these as specified in docs/decisions.md. Add a board undo stack bound to Ctrl+Z.
- *Command:* `onboard` + `harden`

**[P1] «Справка» contradicts the product.**
- *What:* it teaches «накал ●●●», automatic «◆» nodes and «✂ Новая глава отсюда», and says the main theme is light.
- *Why it matters:* a first-timer follows the help and cannot find these features.
- *Fix:* rewrite it against PRODUCT.md, and make help reachable from the writing view with Ctrl+/.
- *Command:* `clarify`

**[P2] Phone writing chrome collides.**
- *What:*
  - The «⋯» menu opens at the bottom left, away from its button, and sits under the resume bar.
  - The FAB covers scene rows (phone-light-02).
  - The plan sheet is 70% empty (shots2/phone-light-12).
  - The «Об истории» screen buries scenes below the fold behind a lock banner and the Continue card.
- *Fix:* anchor menus to their button, give one z-index scale to the resume bar, toasts and menus, and add list padding under the FAB.
- *Command:* `adapt`

**[P2] Accessibility baseline is missing.**
- *What:*
  - `--ink-3` #8e8e95 on #f4f4f6 is 2.96:1, and «Бумага» is 3.10:1. This token has 134 uses: meta text, counters, the tagline.
  - There are no `:focus-visible` styles, only the default 1px ring.
  - There is no `prefers-reduced-motion` handling (`pulse 1s infinite`, rise and slide animations).
  - Write-toolbar tools are 34px tall.
  - The theme defaults to «Светлая», so the OS dark setting is ignored.
- *Command:* `audit` → `harden`

## PRODUCT.md / decisions.md conformance

| Decision | Status | Evidence |
|---|---|---|
| Plot lines, not one per hero | Partly | «+ линия» creates plot lines, but «линии из героев» («Каждый главный герой — своя линия») is still offered (BoardView.tsx:194). Cards show no hero letter avatars. |
| Markers hidden, with a count badge | Implemented | shots2/desk-light-24/25. The badge is red, and the phone timeline always shows «✦ N». |
| Tempo is only «спокойная / напряжённая» | Implemented | SceneSheet. `Plot.tsx` HEAT is still in the code, and Help still describes накал. |
| No automatic ◆; «Ключевая» is manual | Implemented in the UI, Help is wrong | |
| New story opens a skippable «Об истории» | Not implemented | Goes straight to text (shots2/30). |
| Board view chosen in Settings | Implemented | «Как планировать → Доска». The phone ignores it. |
| Ctrl+Z on the board | Not implemented | shots3/41→42. |
| «Сделать главой», draggable chapter edges | Not implemented | Only «✂» exists. |
| Scene ring: off by default, in «Об истории» | Implemented | pub-*-07. Overrun «+N» has no label. |
| «В запас» in the selection menu, with Ctrl+Z | Implemented | Leaves an empty paragraph behind (pub-desk-light-10). |
| Welcome «Уже пишу на другом устройстве» opens Yandex Disk | Not on the published build | It shows «Устройства / Свой сервер синхронизации (для опытных)» (pub-desk-light-02). The bundle is from 2026-10-25T19:42Z, before d5eb33a. |
| Counter on phones with the ring on | Implemented | It floats over the text and under the resume bar (pub-iphone-light-06). |

## ui-ux-pro-max failures (categories 1–9)

1. **Accessibility:**
   - `color-contrast`: `--ink-3`, as above.
   - `focus-states`: no designed focus style.
   - `reduced-motion`: not handled.
   - `keyboard-nav`: the first Tab goes into board cards before the header (shots3 log).
2. **Touch:**
   - `touch-target-size`: `.tool` is 34px, the bubble buttons about 28px.
   - `fixed-element-offset`: the FAB covers rows.
3. **Performance:** not measured. Offline storage works.
4. **Style:**
   - `no-emoji-icons`: 🌿 in the Inbox empty state, and ✂ ✦ ◎ ✎ glyphs mixed with SVG icons.
   - `dark-mode-pairing`: the system theme is not the default.
   - `primary-action`: two «Зафиксировать» CTAs on the board.
5. **Layout:**
   - `line-length-control`: «Править» widens the measure to about 95 characters (desk-light-10).
   - `horizontal-scroll` / truncation: the last scene label is clipped in the lines view (desk-light-06).
   - `z-index-management`: the collisions listed under P2.
6. **Typography:**
   - `chip-collection-reflow`: «Машинка» wraps onto its own row in «Aa» (phone-light-08), the cover swatches leave an orphan, and «В запас» sits alone in the bubble.
   - WebKit loses the bold weight on headings: «Сцена 1» is regular on the iPhone (pub-iphone-light-06).
7. **Animation:** `reduced-motion`, and an infinite pulse on the sync dot.
8. **Forms:**
   - `input-labels`: Inbox and capture fields use placeholders only.
   - The ring checkbox did not toggle instantly under automation; it applied after re-render.
9. **Navigation:**
   - `nav-label-icon`: desktop aux tabs have icons only.
   - `navigation-consistency`: library, settings and help use a different shell.
   - «Герои» contains «Мир» and «Сюжетные линии», which mixes concepts.

## Persona red flags

**ADHD fanfic author mid-chapter on a phone**
- A red «длиннее нормы» stays on screen while typing.
- «Закончить на сегодня» is hidden under the resume bar.
- The selection bubble opens a 2-row, 6-action menu.
- The board makes the author scroll past a lock question and a Continue card to reach the scenes.

**Keyboard-first novelist on Windows**
- Ctrl+Alt+arrows can rotate the screen on Intel drivers.
- No Ctrl+Z on the board.
- The «⋯» menu shows Ctrl+F for «Найти и заменить», while the shortcuts list Ctrl+H.
- There is no visible custom focus ring.
- Help is only in the library sidebar.

**First-timer importing a Ficbook book**
- The first screen is a locking question.
- No heroes are extracted.
- Every part repeats «Сцена 1–3».
- Help explains features that no longer exist.
- The import opens on the board, not on the text.

## Minor observations

- The «Aa» panel says size «18» while the text CSS default is 20px; this needs a check.
- «Сегодня +2 слов»: wrong word form.
- The plan panel squeezes the page off-centre.
- The Settings sidebar background stops at 900px in a full-page view.
- The dark theme ("Сумерки") is warm and good, but the cream FAB and primary buttons are the brightest things on the screen (shots2/desk-dark-02).
- The «Подключить» button for Yandex Disk looks disabled (desk-light-05-settings-full).

## Provocative questions

1. If planning should be "derived, not asked", why is the first thing after importing a Ficbook book a yes/no question about locking chapters?
2. Once the scene ring exists, should the chapter meter appear on the writing page at all?
3. Should a scene be named by its first line instead of its position, so that moving it never renames it?
