# Inventory: shell, library, story pages, settings, import (src/App.tsx and neighbours)

Audit of C:\Claude\Манускрипт, read-only. Scope: src/App.tsx, main.tsx, lib/router.ts, lib/ui.tsx, views/{Library,Book,Characters,Lore,Inbox,Settings,Help,Welcome}View.tsx, components/{BookSections,BookCover,TitlePage,ImportPanel,CloudDisks,DateChip,Icon}.tsx, plus the code they call in lib/{importer,backup,yandex,filesync,stories,edition,exporter,cover,hooks,heroes}.ts and db/{repo,sync,cloud}.ts.
Not inventoried (outside the list): components/{Plot,LeftToWrite,HeroBranches,ColorDot,WhereFound,TypoControls,QuickCapture,SearchModal,Focus,SceneEditor,ScenePlan,...}, views/{BoardView,WriteView}.

How to read: "keyboard-accessible?" = reachable and operable with Tab/Enter; "н/п" = not an interactive control. "reversible/confirmed?" = confirm() present and/or undo present. Every "soft delete" below means `{deleted:true}` on one record; nothing is ever physically removed from IndexedDB, Supabase or the Yandex file.
Method: all assigned files were read in full; the importer behaviour for ZWSP / headings / dashes was verified by running the real importer.ts in a scratch copy (no source file was modified).

Totals: 201 rows; 98 non-OK. By type: OK 103, A11Y 22, MISMATCH 17, UNCLEAR 15, DATA-LOSS-RISK 15, NO-ERROR-HANDLING 13, BUG 8, RACE 7, DEAD 1.

## Inventory table

| id | screen/area | element | file:line | trigger | what the code actually does | what the label/UI promises | keyboard-accessible? | reversible/confirmed? | suspicion |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | Boot | applyTheme/applyAccent/applyTypo at start | main.tsx:16-18 | page load | Reads localStorage prefs and sets data-theme / data-accent / typography on <html>. | - | н/п | n/a | OK |
| S-002 | Boot | navigator.storage.persist() | main.tsx:19 | page load | Asks the browser for persistent storage; result and denial are ignored (.catch(() => {})). | Nothing visible | н/п | n/a | NO-ERROR-HANDLING |
| S-003 | Boot | Yandex OAuth redirect intake | main.tsx:22, lib/yandex.ts:71-87 | page load with #access_token=…&state=manuscript-yandex | Stores {token, expiresAt} in localStorage, rewrites hash to #/settings. An error= answer (user pressed deny) is also swallowed: hash is replaced and nothing is shown. | Settings opens "to show it worked" | н/п | n/a | BUG |
| S-004 | Boot | startFileSync at start | main.tsx:23 | page load | Starts Yandex sync only if getYandexToken() is non-null (token present and not expired). Expired token => silently no sync, Settings shows "Подключить" with no explanation. | "Своё облако" keeps stories in step | н/п | n/a | NO-ERROR-HANDLING |
| S-005 | Boot | Service worker update (onNeedRefresh) | main.tsx:28-32 | new SW waiting | Sets waiting=true; if the page is hidden calls updateSW(true) which skips waiting and reloads. | Update is taken "when the author steps away" | н/п | n/a | RACE |
| S-006 | Boot | SW hourly update check + visibilitychange | main.tsx:33-41 | setInterval 1h; document visibilitychange | reg.update() hourly and on every return to the tab; on hide with waiting update => updateSW(true). | - | н/п | n/a | OK |
| S-007 | Router | parseHash | lib/router.ts:14-19 | hashchange / initial load | Splits hash "#/view/id"; "write"/"text" => text view with sceneId; known views mapped; ANY unknown hash (including "#access_token=…" leftovers) falls to {view:"text"}. | - | н/п | n/a | OK |
| S-008 | Router | go(route) | lib/router.ts:24-28 | called from buttons | Sets location.hash (pushes a history entry per distinct hash); no-op if hash equal. No replace(), so every tab click adds a Back step. | Back button = previous screen | н/п | n/a | OK |
| S-009 | Router | useRoute hashchange listener | lib/router.ts:30-38 | hashchange | Re-parses hash into state. Back/forward work through hashchange. No unsaved-changes guard, no beforeunload anywhere in the app (only pagehide flush in SceneEditor/pace). | Back button works | н/п | n/a | OK |
| S-010 | Global UI | toast(msg, undo?) | lib/ui.tsx:6 | called by handlers | Single global slot: a new toast replaces the current one, including one that was offering «Отменить». | «Отменить» for 6 s | н/п | n/a | UNCLEAR |
| S-011 | Global UI | «Отменить» (toast undo) | lib/ui.tsx:25-33 | click | Runs undo() then hides toast. Only a few callers pass an undo; delete-story, delete-note, restore do not. | "Отменить" | да (button, but present only 6 s) | yes where offered | A11Y |
| S-012 | Global UI | Modal backdrop click | lib/ui.tsx:46 | onMouseDown on backdrop | Closes the modal if the mousedown target is the backdrop itself. | Click outside closes | нет (mouse only; Esc below) | n/a (content discarded) | OK |
| S-013 | Global UI | Modal Esc | lib/ui.tsx:40-44 | window keydown Escape | Closes the modal via onClose. | Esc closes | да | n/a | A11Y |
| S-014 | Global UI | InlineEdit input (single line) | lib/ui.tsx:85-89 | onChange / onBlur / Enter | Local state v; saves via onSave on blur or Enter (Enter => blur). Escape does not revert. useEffect(() => setV(value), [value]) overwrites what the user is typing when the record changes underneath (sync pull / Yandex merge). | Saves on blur/Enter | да | no undo | RACE |
| S-015 | Global UI | InlineEdit textarea (multiline) | lib/ui.tsx:77-83 | onChange / onBlur | Same as above but Enter inserts newline; saves only on blur. | Saves on blur | да | no undo | RACE |
| S-016 | App shell | window "manuscript:fresh" listener | App.tsx:40-44 | CustomEvent from TitlePage | Toggles the "reveal" class so a brand-new empty story keeps its header visible until the first key. | - | н/п | n/a | OK |
| S-017 | App shell | data-ready watchdog flag | App.tsx:47-49 | projects loaded | Sets data-ready=1 on #root so the 10 s boot watchdog in index.html does not show the error page. | - | н/п | n/a | OK |
| S-018 | App shell | startCloudSync + onSyncStatus | App.tsx:51-54 -> db/cloud.ts:129-141 | mount | Registers (once, never removed) Supabase listeners: onLocalChange => sync in 4 s, window online/offline, visibilitychange (hidden => sync now, visible => 300 ms), setInterval 60 s, and an initial syncNow(). With no cloud config it just sets status "off". | Calm: dot only on trouble | н/п | n/a | OK |
| S-019 | App shell | Fall back to most recent project | App.tsx:57-63 | projects/projectId change | If the remembered project id is gone/tombstoned, switches to projects[0] (most recently updated). | - | н/п | n/a | UNCLEAR |
| S-020 | App shell | tidyImportedScenes / recountWords / recountChars | App.tsx:66-74 -> db/repo.ts:397-446 | first open of each project on each device (meta flag per device) | Silent migration. For every scene WITHOUT `excerpt` it rewrites title (blank if text starts with the title words), epigraph, excerpt and bumps updatedAt; recountWords re-saves texts/scenes with get-then-put (no transaction). | Nothing (invisible) | н/п | not reversible | DATA-LOSS-RISK |
| S-021 | App shell | selectProject() | App.tsx:77-81 | called by Library/Welcome | setProjectId + localStorage + go(lastView) (text or board). | Story opens where it was left | н/п | n/a | OK |
| S-022 | App shell | window "manuscript:open" listener | App.tsx:83-92 | CustomEvent (new edition) | Switches project; goes to the scene or the board. | - | н/п | n/a | OK |
| S-023 | App shell | rememberView effect | App.tsx:93-95 | route change | Stores "text"/"board" per project in localStorage. | - | н/п | n/a | OK |
| S-024 | App shell | Ctrl/⌘+J | App.tsx:98-102 | window keydown | preventDefault + setCapture(true) => QuickCapture. | "Быстрая запись (Ctrl/⌘ + J)" | да | n/a | MISMATCH |
| S-025 | App shell | Ctrl/⌘+Shift+F | App.tsx:103-106 | window keydown | preventDefault + setSearching("") => SearchModal. | "Поиск по истории (⌘/Ctrl + Shift + F)" | да | n/a | MISMATCH |
| S-026 | App shell | Loading / Welcome gate | App.tsx:112-115 | render | "Открываю…" while queries load; Welcome if no projects or data is null. Settings/Library are unreachable while no story exists. | - | н/п | n/a | MISMATCH |
| S-027 | Sidebar (library shell) | «Истории» / «Настройки» / «Справка» buttons | App.tsx:146 | click | go({view}). | Switch section | да | n/a | OK |
| S-028 | Sidebar (library shell) | "← {title}" (lib-back) | App.tsx:152 | click | go(lastView(project)) back to text/board. | Back to story | да | n/a | OK |
| S-029 | Empty text view | «Открыть доску» | App.tsx:178 | click | go board. | Open board | да | n/a | OK |
| S-030 | Header | FAB «Быстрая запись» (bolt) | App.tsx:194 | click | setCapture(true); shown on every view except text. | Quick capture | да (aria-label) | n/a | OK |
| S-031 | Header | «Manuscript.» logo button (title "Все истории") | App.tsx:221 | click | go library. | All stories | да | n/a | OK |
| S-032 | Header | Project name button + caret (title "Все истории") | App.tsx:225 | click | go library (NOT a dropdown/switcher despite the caret). | Caret suggests a menu | да | n/a | MISMATCH |
| S-033 | Header | Sync dot (span, title only) | App.tsx:229 | hover (title) | Shown only for Supabase states offline/error. Not focusable, no text. Yandex-Disk errors and Supabase "signed-out" never show a dot. | Calm unless something needs attention | нет | n/a | A11Y |
| S-034 | Header | Tabs «Текст» / «Доска» / «Герои» | App.tsx:232-243 | click | go({view}); «Герои» is also highlighted on lore view. | Navigate | да | n/a | OK |
| S-035 | Header | «Поиск» (tab-aux, hide-on-phone) | App.tsx:244 | click | setSearching(""). Hidden on phone widths. | Search the story | да | n/a | UNCLEAR |
| S-036 | Header | «Входящие» (+ badge) | App.tsx:250 | click | go inbox; badge counts unassigned notes. | Inbox | да | n/a | OK |
| S-037 | Header | «История» (title "Об истории: обложка, дедлайн, экспорт") | App.tsx:257 | click | go book. | Story page | да | n/a | OK |
| S-038 | Backup nudge | BackupReminder (shown when sync.state !== "ok") | App.tsx:169, 269-297 | render | Shown in story views whenever Supabase status is not "ok" (including "off" for everyone without Supabase) and backupDue() >= 7 days. | Weekly nudge to keep a copy | н/п | n/a | MISMATCH |
| S-039 | Backup nudge | «Скачать копию» | App.tsx:277-285 | click | await downloadBackup() then hides the note. No try/catch. | Backup downloaded | да | n/a | NO-ERROR-HANDLING |
| S-040 | Backup nudge | «Позже» | App.tsx:286-294 | click | snoozeBackup(2): hides for 2 days. | Later | да | yes | OK |
| S-041 | Writing view | Тихий вид: mousemove reveal | App.tsx:325-330 | window mousemove (pointer:fine) | Reveals header when mouse in top 100 px or over header/toolbars; hides after 700 ms. | Header returns on mouse to top | нет (mouse); Esc below | n/a | OK |
| S-042 | Writing view | Тихий вид: Esc toggle | App.tsx:331-333 | window keydown Escape | Toggles reveal unless a .modal/.sheet/.typo-pop is open. | Esc brings header back | да | n/a | OK |
| S-043 | Writing view | First-hide hint toast | App.tsx:339-343 | timer 1.5 s | toast once, flag in localStorage. | Explains hidden header | н/п | n/a | OK |
| S-044 | Истории | «Импорт .docx / .txt» (file input) | views/LibraryView.tsx:56-59 | onChange of hidden file input | create(file): createStory({file}) parses the file, creates a NEW story, imports chapters/scenes, opens it on «Текст». busy only disables the other button. | Import a document as a story | нет (label + input hidden) | no undo (delete story is the only way out) | A11Y |
| S-045 | Истории | create() error path | views/LibraryView.tsx:27-35 | rejection of createStory | try/finally without catch: any parse/mammoth/DB error is an unhandled rejection; no toast; the half-made story (if any) stays. | Import works or says why not | н/п | n/a | NO-ERROR-HANDLING |
| S-046 | Истории | «+ Новая история» | views/LibraryView.tsx:60-62 | click | createStory({}) => project "Без названия" + «Глава 1» + «Первая сцена», opens on text. | New story | да | n/a | OK |
| S-047 | Истории | Cover button (book spine) | views/LibraryView.tsx:91 -> components/BookCover.tsx:12-18 | click | onOpen(p.id) -> selectProject. | Open story | да | n/a | OK |
| S-048 | Истории | Story title (<strong class="story-title">) | views/LibraryView.tsx:94 | click | onOpen; a <strong> with cursor:pointer, no role/tabindex. | Open story | нет | n/a | A11Y |
| S-049 | Истории | «Действия» (⋯ summary of <details class="menu">) | views/LibraryView.tsx:97-100 | click/Enter | Opens the story menu. No JS closes it (no outside-click, no close after an action). | Actions menu | да | n/a | UNCLEAR |
| S-050 | Истории | Menu field «Название» (input) | views/LibraryView.tsx:104-108 | onBlur | Patches project title if non-empty and changed. Enter does not commit (blur only). defaultValue: not refreshed by sync. | Rename | да | no undo | OK |
| S-051 | Истории | Menu «Дедлайн» (DateChip) | views/LibraryView.tsx:112 | DateChip onChange | patch deadline. | Set deadline | да | yes (× button) | OK |
| S-052 | Истории | Menu «Обложка» CoverPicker | views/LibraryView.tsx:116 | see CoverPicker rows | See components/BookCover.tsx rows. | - | частично | see rows | OK |
| S-053 | Истории | Menu cover colour swatches (aria-label «Цвет обложки») | views/LibraryView.tsx:120-126 | click | patch project.color; only shown when no cover image. | Pick colour | да | yes | A11Y |
| S-054 | Истории | «Удалить историю» (menu, class danger) | views/LibraryView.tsx:131-140 | click | confirm() -> remove("projects", id) = patch {deleted:true}; toast «История удалена» (no undo). Children are NOT touched. | «Удалить историю «…» со всеми главами и заметками?» | да | confirm yes; undo NO; restore from backup does NOT bring it back | DATA-LOSS-RISK |
| S-055 | Истории | «Продолжить» button | views/LibraryView.tsx:151 | click | onOpen. | Open story | да | n/a | OK |
| S-056 | Истории | Stats useLiveQuery | views/LibraryView.tsx:36-48 | live query | Loads ALL scenes/chapters of every story (including orphans of deleted stories) to compute per-story counts. | "N из M гл. · слов" | н/п | n/a | UNCLEAR |
| S-057 | Welcome | «Начать историю» | views/Welcome.tsx:33 | click | create(): createStory({}) then onCreated(id,"text"). | Start a story | да | n/a | NO-ERROR-HANDLING |
| S-058 | Welcome | «Импортировать .docx / .txt» (file) | views/Welcome.tsx:36-39 | onChange | create(file) — new story from the file, opens on the BOARD (differs from Library which opens text). | Import | нет (hidden input) | n/a | A11Y |
| S-059 | Welcome | «Вернуть из копии» (file, link-plain) | views/Welcome.tsx:43-61 | onChange (async) | readBackupFile -> restoreBackup (NO confirm) -> toast, go library. Errors toast the raw e.message. | Bring stories back from a backup | нет (hidden input) | additive but not undoable | DATA-LOSS-RISK |
| S-060 | Welcome | «Уже пишу на другом устройстве» | views/Welcome.tsx:62-64 | click | Toggles the SyncSection (Supabase email/password only). | Continue on another device | да | n/a | MISMATCH |
| S-061 | Справка | HelpView (static list) | views/HelpView.tsx:4-58 | none | No handlers. Text only. | How the app works | н/п | n/a | MISMATCH |
| S-062 | История | BookCover in hero (no onClick) | views/BookView.tsx:68 -> components/BookCover.tsx:12-18 | hover/click | A <button class="book"> with no onClick; .book:hover lifts the cover. | Looks clickable | нет (tabIndex -1) | n/a | DEAD |
| S-063 | История | Title (InlineEdit) | views/BookView.tsx:71 | blur/Enter | set({title}) if non-empty after trim (not trimmed when saved). | Rename | да | no undo | OK |
| S-064 | История | Genre (InlineEdit) | views/BookView.tsx:72 | blur/Enter | set({genre}). | Genre | да | no undo | OK |
| S-065 | История | Стадия seg (Идея/Черновик/Редактура/Выкладка/Готово) | views/BookView.tsx:77 | click | set({stage}). | Stage | да (aria-pressed) | yes | OK |
| S-066 | История | Обложка CoverPicker + swatches | views/BookView.tsx:86-92 | see CoverPicker rows | Same as library. | - | частично | see rows | A11Y |
| S-067 | История | Дедлайн DateChip | views/BookView.tsx:97 | change | set({deadline}). | Deadline | да | yes | OK |
| S-068 | История | «указать число» (link) | views/BookView.tsx:115 | click | set({targetChapters: undefined}). | - | да | yes | OK |
| S-069 | История | «всего будет» NumberField | views/BookView.tsx:123 -> components/BookSections.tsx:16-30 | onBlur | Parses digits; v>0 saved, else undefined. Saves on EVERY blur even when unchanged (bumps updatedAt). | Total chapters | да | yes | MISMATCH |
| S-070 | История | «не знаю» (link) | views/BookView.tsx:125 | click | set({targetChapters: 0}). | «?» | да | yes | OK |
| S-071 | История | LengthNorm: «+ длина главы»/«изменить» | components/BookSections.tsx:261,266 | click | Opens the norm editor. | - | да | n/a | OK |
| S-072 | История | LengthNorm: «страницы» / «знаки» | components/BookSections.tsx:275,278 | click | set({lengthUnit}). | Unit | да | yes | OK |
| S-073 | История | LengthNorm: «от» / «до» NumberFields | components/BookSections.tsx:284-286 | onBlur | set chapterMin/chapterMax in characters (pages * page size). | Norm | да | yes | OK |
| S-074 | История | LengthNorm: «на странице … знаков» | components/BookSections.tsx:292 | onBlur | set({pageChars}). | Page size | да | yes | OK |
| S-075 | История | LengthNorm: «готово» | components/BookSections.tsx:297 | click | Closes editor. | - | да | n/a | OK |
| S-076 | История | LengthNorm: «без нормы» | components/BookSections.tsx:301 | click | Clears chapterMin/Max with no confirm. | Remove norm | да | no undo (retype) | OK |
| S-077 | История | «Что осталось дописать» | views/BookView.tsx:133 | click | Opens LeftToWrite modal (separate component). | - | да | n/a | OK |
| S-078 | История | PublishSection: «Скопировать для …» (primary) | components/BookSections.tsx:161 -> views/BookView.tsx:42-63 | click | Loads chapter text and writes Ficbook-tag text or HTML+plain to the clipboard. If the clipboard call throws, silently DOWNLOADS «<title>.txt» with no toast. | «…скопирована — вставь её в редактор…» | да | n/a | MISMATCH |
| S-079 | История | PublishSection: «Открыть … ↗» (link) | components/BookSections.tsx:164-168 | click | target=_blank to the work URL (typed or parsed from the imported header). | Open the work on the site | да (anchor) | n/a | OK |
| S-080 | История | PublishSection: «✓ Выложила сегодня» | components/BookSections.tsx:169-176 | click | patch chapter {publishedAt: today, locked: true}; toast explains un-locking is on the board. | Mark published | да | partly: clearing the date does not unlock | MISMATCH |
| S-081 | История | PublishSection: «Площадка» seg | components/BookSections.tsx:191 | click | patch project.platform. | Platform | да | yes | OK |
| S-082 | История | PublishSection: «Новая глава каждые … дн.» | components/BookSections.tsx:199 | onBlur | patch publishEvery via NumberField. | Cadence | да | yes | OK |
| S-083 | История | PublishSection: «Работа …» URL input | components/BookSections.tsx:204-210 | onBlur | patch ficbookUrl (empty -> undefined). Writes on every blur. | Link to work | да | yes | OK |
| S-084 | История | PublishSection: per-chapter date input (title «Когда выложена») | components/BookSections.tsx:224-230 | onChange | patch chapter.publishedAt (clear allowed). defaultValue is uncontrolled. | Published date | да | yes | OK |
| S-085 | История | PublishSection: «⧉» per-chapter copy | components/BookSections.tsx:231 | click | onCopy(chapterId) as above. | Copy chapter | да | n/a | A11Y |
| S-086 | История | PaceSection: «Цель на день» / «Сколько слов будет» | components/BookSections.tsx:72,76 | onBlur | patch dailyGoal/targetWords. | Goals | да | yes | OK |
| S-087 | История | Essence (Plot.tsx, embedded) | views/BookView.tsx:142 | not in scope | Component outside the assigned file list. | - | - | - | UNCLEAR |
| S-088 | История | «Описание» details + InlineEdit (multiline) | views/BookView.tsx:150-156 | blur | set({description}). This field also receives the imported Ficbook header. | Fandom, pairing, annotation | да | no undo | OK |
| S-089 | История | «Вся история в Word (.docx)» | views/BookView.tsx:40,164 | click | exportDocx(title, loadChapters(data)) + download. No try/catch, no toast. Exports only chapters of the outline: the «Пока без места» pool and scene titles/epigraphs-as-headings are not written; only italic/bold/strike marks survive. | «Вся история в Word» | да | n/a | MISMATCH |
| S-090 | История | ImportPanel (embedded under «Добавить текст») | views/BookView.tsx:170 | see ImportPanel rows | Appends chapters at the end; then go board. | «Главы из файла встанут в конец истории» | частично | no undo; re-import duplicates everything | DATA-LOSS-RISK |
| S-091 | История | «Новая редакция» | views/BookView.tsx:178-194 | click | confirm -> newEdition(): copies skeleton into a new project (many separate saves), sets global localStorage manuscript.mode=rewrite, fires manuscript:open. | «Эта останется как есть» | да | old story untouched; new one removable | MISMATCH |
| S-092 | История | «Удалить эту историю» | views/BookView.tsx:196-206 | click | confirm -> remove("projects") -> go library. No toast, no undo. | «Удалить историю … со всеми главами и заметками?» | да | confirm yes; undo NO; same orphan behaviour as Library | DATA-LOSS-RISK |
| S-093 | Герои | WorldNav «Герои» / «Мир» | views/LoreView.tsx:16,19 | click | go characters / lore. | Switch | да (aria-pressed) | n/a | OK |
| S-094 | Герои | «Найти героев в сценах» | views/CharactersView.tsx:39 | click | Opens TagScenes modal. | - | да | n/a | OK |
| S-095 | Герои | «Добавить их» (heroes from description) | views/CharactersView.tsx:49-57 | click | Sequential findOrCreateCharacter for each suggested name; toast. No try/catch. | Add heroes found in the header | да | delete hero (confirm) removes them | OK |
| S-096 | Герои | «+ Новый герой» input | views/CharactersView.tsx:66-72 | onKeyDown Enter | findOrCreateCharacter (dedupes by name, ё-insensitive) then clears. No button, no label (placeholder only). If the hero exists nothing visibly happens. | Add hero | да | delete | A11Y |
| S-097 | Герои | Person: ColorDot (avatar letter) | views/CharactersView.tsx:143-152 | ColorDot onChange | patch hero colour and the hero's same-named line colour. | Change colour | зависит от ColorDot (не в списке) | yes | OK |
| S-098 | Герои | Person: name InlineEdit | views/CharactersView.tsx:155 | blur | set({name}) — NOT trimmed and empty allowed. | Rename | да | no undo | BUG |
| S-099 | Герои | Person: «Действия» (⋯ details) | views/CharactersView.tsx:156-190 | click | Menu: merge targets, own line, delete. Never auto-closes. | - | да | n/a | UNCLEAR |
| S-100 | Герои | Menu: «⇢ {other hero}» (merge) | views/CharactersView.tsx:165-174 | click | confirm -> mergeCharacters(from, into): rewrites characterIds in scenes + all notes, appends `about`, tombstones the source hero. | «Слить … Сцены, цитаты и заметки перейдут…» | да | confirm yes; undo NO | DATA-LOSS-RISK |
| S-101 | Герои | Menu: «Своя сюжетная линия» | views/CharactersView.tsx:177-184 | click | createLine(projectId, hero name); toast. | Own story line | да | delete line (confirm) | OK |
| S-102 | Герои | Menu: «Удалить героя» (danger) | views/CharactersView.tsx:186, 133-138 | click | confirm -> patches every scene (from render-time data) to drop the id -> tombstones hero. Notes/quotes are NOT patched. | «Сцены и цитаты останутся, с них снимется отметка» | да | confirm yes; undo NO | BUG |
| S-103 | Герои | Person: «Кто это, чего хочет…» (about InlineEdit) | views/CharactersView.tsx:192-198 | blur | set({about}). | Notes about hero | да | no undo | OK |
| S-104 | Герои | Person: «другие имена…» (aliases) | views/CharactersView.tsx:199 | blur | set({aliases}) trimmed. | Aliases | да | no undo | OK |
| S-105 | Герои | WhereFound «не то» (×) | views/CharactersView.tsx:200 | WhereFound onNotThis | Appends scene id to ignoreSceneIds (component not in scope). | Not this scene | зависит от WhereFound | no undo UI | OK |
| S-106 | Герои | «+ цитата или реплика» input | views/CharactersView.tsx:212-223 | Enter | createNote(kind quote, project) then patch characterIds. Two separate saves. | Add quote | да | NO way to delete or edit | BUG |
| S-107 | Герои | QuoteRow: «в тексте» link | views/CharactersView.tsx:236 | click | go text/scene (only when used && scene still exists). | Go to scene | да | n/a | OK |
| S-108 | Герои | QuoteRow: ✓ / ↩ toggle (title «Уже в тексте» / «Вернуть в неиспользованные») | views/CharactersView.tsx:240-246 | click | patch used = !used. | Mark used | да (title only) | yes | A11Y |
| S-109 | Герои | Branches: «Линии из героев» | views/CharactersView.tsx:96 | click | Opens HeroBranches (not in scope). | - | да | n/a | OK |
| S-110 | Герои | Branches: ColorDot per line | views/CharactersView.tsx:104 | onChange | patch line colour. | Colour | зависит от ColorDot | yes | OK |
| S-111 | Герои | Branches: line name InlineEdit | views/CharactersView.tsx:105 | blur | patch name (trim, non-empty). | Rename line | да | no undo | OK |
| S-112 | Герои | Branches: × «Удалить линию «…»» (aria-label) | views/CharactersView.tsx:107, 85-90 | click | confirm -> removes lineId from each scene (separate patches, render-time data) -> tombstones line. | «Сцены останутся, с них просто снимется отметка» | да | confirm yes; undo NO | OK |
| S-113 | Герои | Branches: «+ линия — например, второго героя» | views/CharactersView.tsx:112-121 | Enter | createLine; clears. | Add line | да | delete | A11Y |
| S-114 | Герои | TagScenes: effect (scan book) | views/CharactersView.tsx:257-273 | modal open | Reads all texts of the project, counts name mentions >= 2 per scene. | «Читаю историю…» | н/п | n/a | OK |
| S-115 | Герои | TagScenes: hero checkboxes | views/CharactersView.tsx:300-309 | onChange | toggle picked. | Choose heroes | да | n/a | OK |
| S-116 | Герои | TagScenes: «Отмена» | views/CharactersView.tsx:319 | click | close. | - | да | n/a | OK |
| S-117 | Герои | TagScenes: «Отметить» | views/CharactersView.tsx:322, 275-287 | click | Adds ids to scenes (never removes). Toast counts scenes with matches, not scenes actually changed. | «Отмечено в N сценах» | да | no undo | MISMATCH |
| S-118 | Мир | «Найти в мире» search input | views/LoreView.tsx:52 | onChange | Client-side filter. | Search | да | n/a | A11Y |
| S-119 | Мир | Topic chips «Всё» / topics | views/LoreView.tsx:56,60 | click | Filter; click active topic again clears. | Filter | да | n/a | OK |
| S-120 | Мир | «+ запись: название…» input | views/LoreView.tsx:66-72, 39-45 | Enter | createNote("", lore) then patch title/topic (two saves; draft cleared first). | Add entry | да | delete (confirm) | RACE |
| S-121 | Мир | LoreCard: title InlineEdit | views/LoreView.tsx:88 | blur | set title if non-empty. | Rename | да | no undo | OK |
| S-122 | Мир | LoreCard: × (title «Удалить запись») | views/LoreView.tsx:89-99 | click | confirm -> remove("notes") tombstone -> toast (no undo). | «Удалить «…» из мира?» | да | confirm yes; undo NO | A11Y |
| S-123 | Мир | LoreCard: topic / text / aliases InlineEdits | views/LoreView.tsx:101-103 | blur | patch fields. | Edit entry | да | no undo | OK |
| S-124 | Мир | LorePins: × «Открепить» (hero/chapter/scene) | views/LoreView.tsx:127,135,143 | click | Removes the id from characterIds/chapterIds/sceneIds. | Unpin | да | no undo | A11Y |
| S-125 | Мир | LorePins: select «+ где нужно» | views/LoreView.tsx:148-178 | onChange | Adds hero/chapter/scene id to the entry; select resets to "". | Pin entry | да (title only, no label) | yes (×) | OK |
| S-126 | Входящие | «Записать мысль…» textarea | views/InboxView.tsx:38-50 | Enter (without Shift) / onChange | Enter => preventDefault + add() (createNote). Shift+Enter newline. | Capture a thought | да | delete | UNCLEAR |
| S-127 | Входящие | Kind seg «◦ Мысль / ❝ Цитата / — Диалог / ? Вопрос / ≡ Заметка» | views/InboxView.tsx:54 | click | setKind. | Note type | да | n/a | OK |
| S-128 | Входящие | «Сохранить» | views/InboxView.tsx:60 | click | add(). | Save | да | n/a | OK |
| S-129 | Входящие | Filter seg «Неразобранные / Вопросы / Привязанные к сцене / Архив» (+count) | views/InboxView.tsx:75 | click | setFilter. | Filter | да | n/a | MISMATCH |
| S-130 | Входящие | NoteRow: scene link (a href="#") | views/InboxView.tsx:123 | click | preventDefault + go text/scene. | Go to scene | да | n/a | OK |
| S-131 | Входящие | NoteRow: «Разобрать» / «Готово» | views/InboxView.tsx:192 | click | Toggles the panel. | - | да | n/a | OK |
| S-132 | Входящие | NoteRow: select «Привязать к сцене…» | views/InboxView.tsx:131-146 | onChange | patch sceneId (empty value = detach). | Attach to scene | да | yes | MISMATCH |
| S-133 | Входящие | NoteRow: hero chips (quote/dialogue only) | views/InboxView.tsx:152-161 | click | Toggle characterIds. | Whose words | да (no aria-pressed) | yes | A11Y |
| S-134 | Входящие | NoteRow: «☑ В план сцены» | views/InboxView.tsx:171,99-104 | click | Appends a beat to the scene plan, archives the note, toast. | Add to plan | да | note restorable from Архив; beat removable | OK |
| S-135 | Входящие | NoteRow: «✦ Сделать маячком» | views/InboxView.tsx:175,105-109 | click | createMarker(title = whole note text), archives note. | Make a beacon | да | restorable from Архив | OK |
| S-136 | Входящие | NoteRow: kind seg (emoji only) | views/InboxView.tsx:180 | click | patch kind. | Change type | да | yes | A11Y |
| S-137 | Входящие | NoteRow: «Удалить» | views/InboxView.tsx:185 | click | remove("notes") = tombstone, NO confirm, NO toast, NO undo. | «Удалить» | да | NO confirm, NO undo | DATA-LOSS-RISK |
| S-138 | Входящие | NoteRow: ✓ / ↩ (title «В архив» / «Вопрос решён» / «Вернуть») | views/InboxView.tsx:195-201 | click | patch archived = !archived. | Archive | да (title only) | yes | A11Y |
| S-139 | Обложка | BookCover (library card, onClick) | components/BookCover.tsx:12-18 | click | onClick (open story); aria-label = title. | Open | да | n/a | OK |
| S-140 | Обложка | CoverPicker: «Загрузить картинку» / «Другая картинка» (file) | components/BookCover.tsx:45-47 | onChange | imageToCover: downsize to <=900 px JPEG data-URL, setCover into texts["cover:id"]. Errors toasted. Input not reset. | Upload cover | нет (hidden input) | replace only; old image gone | A11Y |
| S-141 | Обложка | CoverPicker: «Вставить скопированную» | components/BookCover.tsx:49 | click | navigator.clipboard.read() image => setCover; errors toasted. | Paste image | да | replace only | OK |
| S-142 | Обложка | CoverPicker: «По ссылке» (prompt) | components/BookCover.tsx:52-69 | click | window.prompt for URL; fetch(cors) or keeps the external URL; toast. | Cover from link | да (native prompt) | replace only | UNCLEAR |
| S-143 | Обложка | CoverPicker: «Убрать» | components/BookCover.tsx:70-73 | click | setCover(projectId, undefined) -> stores src:"" with no confirm. | Remove cover | да | NO undo (image gone locally; sync may keep an older copy) | DATA-LOSS-RISK |
| S-144 | Редактор | TitlePage: fresh flag | components/TitlePage.tsx:19-23 | mount | Dispatches manuscript:fresh true/false. | - | н/п | n/a | OK |
| S-145 | Редактор | TitlePage: editor "update" listener | components/TitlePage.tsx:25-40 | first doc change in a new story | setFresh(false); moves stage idea -> writing once. | «Первые слова переводят из «идея» в «пишу»» | н/п | n/a | OK |
| S-146 | Даты | DateChip: date button | components/DateChip.tsx:24 | click | showPicker() (fallback focus+click) on a hidden date input. | Pick date | да | yes | OK |
| S-147 | Даты | DateChip: × «Убрать дату» | components/DateChip.tsx:28 | click | onChange(undefined). | Clear date | да | yes | OK |
| S-148 | Даты | DateChip: hidden date input | components/DateChip.tsx:32 | onChange | onChange(value or undefined). aria-hidden + tabIndex -1. | - | нет (by design; button opens picker) | yes | OK |
| S-149 | Иконки | Icon component | components/Icon.tsx:36-52 | none | Renders an SVG path from a table; aria-hidden. Unknown name renders an empty <path> without error. | - | н/п | n/a | OK |
| S-150 | Импорт | «Выбрать файл (.docx, .txt)» (file; accepts .docx .txt .md .html .htm) | components/ImportPanel.tsx:119-127 | onChange | onFile -> readFileAsBlocks -> parseBook -> preview. Errors shown inline ("Не удалось прочитать файл: …"). | Choose a file | нет (hidden input) | preview before writing | A11Y |
| S-151 | Импорт | Paste textarea «…или вставь текст сюда» | components/ImportPanel.tsx:132-145 | onPaste / onChange | Keeps clipboard HTML in pastedHtml if present; onChange updates text and clears pastedHtml only when emptied. | Paste | да | n/a | BUG |
| S-152 | Импорт | «Разобрать вставленный текст» | components/ImportPanel.tsx:147-153 | click | show(...) => parse + preview or inline error. | Parse pasted text | да | n/a | OK |
| S-153 | Импорт | Preview «Импортировать» | components/ImportPanel.tsx:106, 71-81 | click | confirm(): importBook -> createChapter + createScene per scene (each its own transaction), toast, onDone. No try/catch/finally. | «Нашла N глав, M сцен, K слов» | да | NO undo | NO-ERROR-HANDLING |
| S-154 | Импорт | Preview «Назад» | components/ImportPanel.tsx:109 | click | setBook(null). | - | да | n/a | OK |
| S-155 | Импорт | Preview text (counts) | components/ImportPanel.tsx:88-96 | render | Counts chapters/scenes/words only; says nothing about text before the first chapter heading, which parseBook turns into the description (or drops). | «Нашла … Главы — по заголовкам…» | н/п | n/a | MISMATCH |
| S-156 | Настройки | Тема seg «Как в системе / Светлая / Тёмная / Бумага» | views/SettingsView.tsx:54-64 | click | setTheme + applyTheme (localStorage + data-theme). | Theme | да (aria-pressed) | yes | OK |
| S-157 | Настройки | Акцент swatches (role=radio, aria-label = colour name) | views/SettingsView.tsx:71-83 | click | applyAccent. | Accent colour | Tab per swatch; no arrow-key radio behaviour | yes | A11Y |
| S-158 | Настройки | TypoControls | views/SettingsView.tsx:88 | not in scope | Component outside the assigned file list. | - | - | - | UNCLEAR |
| S-159 | Настройки | Доска seg «Главы колонками / Сюжетные линии» | views/SettingsView.tsx:102-112 | click | setBoardLayout (localStorage only). | Board layout | да | yes | OK |
| S-160 | Настройки | «Скачать копию» | views/SettingsView.tsx:144 | click | void downloadBackup(): JSON of all 9 synced tables as a file; no feedback of success/size, errors unhandled. | Backup download | да | n/a | NO-ERROR-HANDLING |
| S-161 | Настройки | «Вернуть из копии…» (file .json) | views/SettingsView.tsx:147-150, 23-32 | onChange | readBackupFile (checks only that `projects` is an array) -> confirm() -> restoreBackup: put() records missing here or newer in the file; each put is queued to the outbox; toast counts. | «Добавится всё, чего нет … Ничего не удаляется» | нет (hidden input) | confirm yes; NOT undoable; overwrites newer-in-file records with no snapshot | DATA-LOSS-RISK |
| S-162 | Настройки | Version line | views/SettingsView.tsx:153-156 | render | Shows build time and preview-DB notice. | - | н/п | n/a | OK |
| S-163 | Устройства | Status line + effect currentEmail | views/SettingsView.tsx:172-174, 188-207 | sync.state change | Shows status text; reloads the signed-in email whenever sync.state changes. | Status | н/п | n/a | OK |
| S-164 | Устройства | «Свой сервер синхронизации» Project URL / anon key inputs | views/SettingsView.tsx:215-216 | onChange | Local state only. | Own server | да | n/a | OK |
| S-165 | Устройства | «Подключить» (Supabase) | views/SettingsView.tsx:217-228 | click | setCloudConfig (localStorage, no try/catch) + void syncNow() + location.reload(). | Connect | да | disconnect | NO-ERROR-HANDLING |
| S-166 | Устройства | «Синхронизировать сейчас» | views/SettingsView.tsx:236 | click | void syncNow(); if a round is running just sets `again`. | Sync now | да | n/a | OK |
| S-167 | Устройства | «Выйти» | views/SettingsView.tsx:239 -> db/cloud.ts:168-173 | click | No confirm. supabase signOut, deletes sync.cursor; local data AND the outbox remain. `.then(() => setMe(null))` runs even if run() swallowed an error. | Sign out | да | sign in again | DATA-LOSS-RISK |
| S-168 | Устройства | Email / password inputs | views/SettingsView.tsx:245-253 | onChange | Local state. No <form>, so Enter does not submit. | Sign in | да | n/a | A11Y |
| S-169 | Устройства | «Войти» | views/SettingsView.tsx:255 | click | signIn(email,password,false): resetSyncCursor, queueEverything, syncNow. Errors shown inline in Russian for common cases. | Sign in | да | n/a | OK |
| S-170 | Устройства | «Создать аккаунт» | views/SettingsView.tsx:258-264 | click | signUp; if no session returned shows "открой письмо…" info. | Create account | да | n/a | OK |
| S-171 | Устройства | «Отключить облако» | views/SettingsView.tsx:274-285 | click | confirm -> setCloudConfig(null) -> reload. Does not sign out; Supabase session stays in localStorage. getCloudConfig() falls back to VITE_SUPABASE_* build variables. | «Отключить облако на этом устройстве? Данные на устройстве останутся.» | да | reconnect needs URL+key again (unless build env) | MISMATCH |
| S-172 | Своё облако | «Подключить» (Яндекс Диск) | components/CloudDisks.tsx:75 | click | connectYandex(): location.assign to oauth.yandex.ru (implicit token flow, force_confirm). Disabled until a ClientID exists. | Connect Yandex Disk | да | disconnect | UNCLEAR |
| S-173 | Своё облако | «Синхронизировать» | components/CloudDisks.tsx:59 | click | filesync.syncNow(): read file, merge, write whole DB back. Disabled while syncing. | Sync now | да | n/a | RACE |
| S-174 | Своё облако | «Отключить» | components/CloudDisks.tsx:62-72 | click | confirm -> stopFileSync(); forgetYandex() (removes the local token only; no revoke at Yandex); setConnected(false). | «На этом устройстве всё останется, на Диске — тоже.» | да | reconnect via OAuth | OK |
| S-175 | Своё облако | Status text (ok/error/offline/syncing) | components/CloudDisks.tsx:26-35, 50-55 | state change | Shows only while `connected` (state captured at mount). ago() is computed once per render. | Sync status | н/п | n/a | NO-ERROR-HANDLING |
| S-176 | Своё облако | yandexUser() effect | components/CloudDisks.tsx:22-24 | mount | Calls cloud-api once to show the account name; no catch. | Shows who is connected | н/п | n/a | NO-ERROR-HANDLING |
| S-177 | Своё облако | Link oauth.yandex.ru (target=_blank) | components/CloudDisks.tsx:105 | click | Opens Yandex app registration page. | Instructions | да | n/a | OK |
| S-178 | Своё облако | ClientID input + «Сохранить» | components/CloudDisks.tsx:112-122 | onChange / click | setYandexClientId + reload. | Configure Yandex | да | yes | OK |
| S-179 | Своё облако | Dropbox / Google Диск / iCloud rows | components/CloudDisks.tsx:81-98 | none | Static «Скоро» text, no handlers. | - | н/п | n/a | OK |
| S-180 | Своё облако | startFileSync listeners | lib/filesync.ts:90-100 (via main.tsx:23) | onLocalChange (30 s), window online, visibilitychange | Debounced 30 s after a local change; syncNow on online and on every visibility change. | Keeps stories in step | н/п | n/a | RACE |
| S-181 | Устройства (Supabase) | startCloudSync listeners | db/cloud.ts:129-141 | online/offline/visibilitychange/60 s interval/onLocalChange | Pull then push. Pull cursor is a global bigint sequence. | Sync | н/п | n/a | RACE |
| S-182 | Импорт (lib) | textToBlocks: CRLF / blank lines | lib/importer.ts:52-64 | file/paste | Converts \r\n and lone \r to \n, splits lines, trims, drops blank lines. One non-blank line = one paragraph. | - | н/п | n/a | OK |
| S-183 | Импорт (lib) | textToBlocks: U+200B zero-width space | lib/importer.ts:57-58, 42-47, 49 | file/paste | No handling at all. JS String.trim() does NOT remove U+200B, so a line with a ZWSP at either end is not equal to its clean form. Verified by running the real code: "\u200B========== Часть 1 ==========" is not a heading (whole file lands in the fallback chapter «Начало (до первой главы)»), "\u200B***" is not a scene break, and a ZWSP-only line becomes a visible-empty paragraph/empty scene (0 words). | - | н/п | n/a | BUG |
| S-184 | Импорт (lib) | textToBlocks: Ficbook framed heading «========== Часть N ==========» | lib/importer.ts:34-47 | file/paste | DECORATED_RE strips the =/*/# frame, then isChapterTitle on the inside. Works for clean lines. | - | н/п | n/a | OK |
| S-185 | Импорт (lib) | isChapterTitle prefix test | lib/importer.ts:27-33 | every text line | NUMBERED_RE has no end anchor: any line under 100 chars starting with Глава/Часть/Chapter/Part + a number, roman numeral or ordinal stem is a chapter heading. | - | н/п | n/a | BUG |
| S-186 | Импорт (lib) | isSceneBreak | lib/importer.ts:30,49 | every text line | A line made only of whitespace, *, •, ·, ~, #, —, –, _, =, - is a scene break; "***" and "* * *" work; a line that is ONLY «—» or «-» also counts. | «Сцены — по разделителям * * *» | н/п | n/a | BUG |
| S-187 | Импорт (lib) | Song line after the part heading (isEpigraph) | lib/importer.ts:210-211, 272-279 | each scene first paragraph | First paragraph of a scene that is <=70 chars, no leading dash, no final punctuation, "A — B" with <=5/<=7 words becomes scene.epigraph. The line STAYS in the scene text as the first paragraph; only the card excerpt skips it. | - | н/п | n/a | UNCLEAR |
| S-188 | Импорт (lib) | parseBook: text before the first heading | lib/importer.ts:256-266 | file/paste | All PARAGRAPHS before the first heading become `preface` (title = first line if <=80 chars); breaks are dropped. The preface goes to project.description only when the project has none; otherwise it is discarded. It is NOT imported as a chapter (despite blocksToChapters' «so nothing is lost» comment). | «Предисловие…» preview shows only chapters | н/п | n/a | DATA-LOSS-RISK |
| S-189 | Импорт (lib) | htmlToBlocks (docx via mammoth, pasted HTML, .html) | lib/importer.ts:106-152, 233-242 | file/paste | Any <h1-h6> is a chapter heading regardless of text; <p>/<li> become paragraphs; elements are recursed through `el.children` only, so bare text nodes inside <div>/<span>/<blockquote>/<td> are not read; images, footnotes and mammoth warnings are ignored. | - | н/п | n/a | DATA-LOSS-RISK |
| S-190 | Импорт (lib) | readFileAsBlocks: .txt encoding | lib/importer.ts:241 | file | file.text() decodes UTF-8 only. A Windows-1251 .txt shows mojibake and may still pass the "text found" check. | - | н/п | n/a | UNCLEAR |
| S-191 | Импорт (lib) | textToBlocks: U+2028/U+2029 and Markdown headings | lib/importer.ts:54 | file | Only \n is a line separator (U+2028/2029 stay inside a paragraph). Markdown "# Глава 1" is not a chapter heading because of the "# " prefix. | - | н/п | n/a | UNCLEAR |
| S-192 | Импорт (lib) | importChapters writes | components/ImportPanel.tsx:23-37 -> db/repo.ts:92-118 | import confirm | Sequential awaits: createChapter then createScene (2 saves) per scene; each save is a separate transaction and calls notifyChange (re-triggers live queries, sync timers). | - | н/п | n/a | DATA-LOSS-RISK |
| S-193 | Импорт (lib) | createStory(file) cleanup of the starter chapter | lib/stories.ts:14-25 | import into new story | After parsing, tombstones the starter «Глава 1»/«Первая сцена» and imports; the title comes from the first header line or the file name. | - | н/п | n/a | OK |
| S-194 | Копия (lib) | makeBackup / downloadBackup | lib/backup.ts:12-26 | Скачать копию | Dumps the 9 SYNCED_TABLES (incl. tombstones, snapshots, cover records) as one JSON Blob and clicks a hidden <a download>. Not included: localStorage settings (theme, current story, Supabase config/session, Yandex token/ClientID), outbox, meta flags. | «Все истории, заметки и версии одним файлом» | н/п | n/a | UNCLEAR |
| S-195 | Копия (lib) | restoreBackup merge rule | lib/backup.ts:32-53 (also used by Yandex sync) | restore / every Yandex sync | Per record: skip if local.updatedAt >= file.updatedAt, else put(file row) and enqueue in the outbox. One transaction per table (a failure leaves earlier tables restored). No dirty-flag check, no snapshot of the overwritten text, no tombstone resurrection. | «Ничего не удаляется»; «nobody's work is overwritten» (filesync.ts doc) | н/п | not undoable | DATA-LOSS-RISK |
| S-196 | Копия (lib) | readBackupFile | lib/backup.ts:55-59 | file chosen | JSON.parse the file; only requires an object with a `projects` array. | «Это не копия Manuscript» | н/п | n/a | NO-ERROR-HANDLING |
| S-197 | Копия (lib) | backupDue / snoozeBackup | lib/backup.ts:61-84 | render of BackupReminder | First call stamps FIRST_KEY; due when 7+ days since last download (or first launch); localStorage only (a cleared browser resets it). | Weekly reminder | н/п | n/a | OK |
| S-198 | Яндекс Диск (lib) | yandexStore.read / write | lib/yandex.ts:108-147 | each sync round | GET resources (revision) -> download link -> download JSON; upload via PUT with overwrite=true to app:/manuscript.json. Network failures on GET calls surface as raw "Failed to fetch"; only the PUT is humanised. JSON from the Disk is not validated. | «Истории одинаковые на компьютере и телефоне» | н/п | previous file content is overwritten | NO-ERROR-HANDLING |
| S-199 | Яндекс Диск (lib) | token expiry / 401 | lib/yandex.ts:40-47, 89-96 | any request | getYandexToken() returns null after expiresAt; a 401 calls forgetYandex() and throws a message. No refresh (implicit flow has none). | «Нажми «Подключить» ещё раз» | н/п | n/a | NO-ERROR-HANDLING |
| S-200 | Облако (lib) | syncOnce conflict rule (Supabase) | db/sync.ts:27-91 | each sync | If a record is dirty locally and newer than remote, local wins; if remote wins and the record is a scene text with different content, local text is saved as a snapshot first. Deleted rows travel as tombstones. | «a scene's text is never silently lost» | н/п | n/a | OK |
| S-201 | Облако (lib) | signIn -> queueEverything | db/cloud.ts:144-157 | Войти / Создать аккаунт | Resets the cursor and marks every local record dirty, then syncs. | First sign-in uploads this device | н/п | n/a | DATA-LOSS-RISK |

## Destructive actions

Common to all: removal = `remove(table,id)` = `patch(...{deleted:true})` (repo.ts:37-39): the record stays in IndexedDB with a new updatedAt, is queued in the outbox, and is upserted to Supabase `manuscript_records` as a normal row whose data.deleted=true; the Yandex file also keeps the whole record. There is no purge, no trash screen, no "restore deleted" UI. Most lists filter with alive().

| action | where (file:line) | confirm()? | undo? | exactly what is changed in IndexedDB | what happens in the cloud |
|---|---|---|---|---|---|
| Delete story | LibraryView.tsx:131-140; BookView.tsx:196-206 | yes («Удалить историю «…» со всеми главами и заметками?») | NO (toast «История удалена» has no «Отменить»; Library toasts, BookView does not toast). Backup restore cannot revive it (tombstone newer). | ONLY the `projects` row (deleted:true). Chapters, scenes, texts, snapshots, markers, notes, lines, characters, cover record: untouched (orphans, still counted by LibraryView stats query and still in backups). localStorage keys (manuscript.view.<id>, project id) stay. | Project tombstone to Supabase + Yandex file; other devices hide the story. All child rows remain in Supabase/Yandex = the text is not deleted, only hidden. |
| Delete chapter / scene / marker | BoardView.tsx:392, ScenePlan.tsx:386, SceneSheet.tsx:200, MarkerCard.tsx:52 (outside scope; repo.ts:81-88 deleteChapter) | yes | no | scenes + texts of the chapter tombstoned one by one, snapshots kept | tombstones sync |
| Delete story line | CharactersView.tsx:85-90 (+BoardView.tsx:482) | yes | NO | each scene patched (lineIds minus id, from render-time data) then `lines` row tombstoned; not atomic | tombstones/updated scenes sync |
| Delete hero | CharactersView.tsx:133-138 | yes | NO | scenes patched; `characters` row tombstoned; notes (quotes) NOT patched although the text says they are; lore pins and the hero's same-name line untouched | as above |
| Merge heroes («⇢ …») | CharactersView.tsx:165-174 -> repo.ts:376-390 | yes | NO | scenes + all notes re-pointed, `about` appended, source hero tombstoned; aliases/name/ignoreSceneIds of the source lost | as above |
| Delete lore entry | LoreView.tsx:89-99 | yes | NO | note tombstoned | as above |
| Delete inbox note | InboxView.tsx:185 | NO | NO | note tombstoned | as above |
| Remove cover | BookCover.tsx:70-73 | NO | NO | texts["cover:id"].content = {src:""} | updated record syncs; older image not recoverable locally |
| Restore from backup | SettingsView.tsx:23-32 (confirm); Welcome.tsx:43-61 (no confirm) | Settings yes; Welcome no | NO | put() of every record missing or newer in the file; text replaced without a snapshot; rows queued to outbox; a tombstoned story stays deleted | restored rows upload to Supabase/Yandex |
| Sign out | SettingsView.tsx:239 -> cloud.ts:168-173 | NO | sign in again | session cleared, sync cursor deleted; local data and outbox stay | none; next sign-in uploads everything into whichever account signs in |
| Disconnect cloud (Supabase) | SettingsView.tsx:274-285 | yes | reconnect | localStorage config removed; build-time VITE_SUPABASE_* values come straight back | session stays in localStorage; nothing deleted remotely |
| Disconnect Yandex Disk | CloudDisks.tsx:62-72 | yes | reconnect via OAuth | token removed from localStorage, sync stopped | file on the Disk stays; token is not revoked at Yandex |
| Silent migration on first open | App.tsx:66-74 -> repo.ts:397-446 | NO (automatic) | NO | scenes lacking `excerpt` are re-saved (title can become empty, excerpt set, updatedAt=now); texts re-saved by recountWords | rewritten records sync and win by timestamp |
| «✓ Выложила сегодня» | BookSections.tsx:169-176 | NO | partial (date can be cleared, lock cannot be undone there) | chapter publishedAt + locked:true | syncs |
| Import / «Добавить текст» | ImportPanel.tsx:71-81 | preview only | NO; repeating duplicates | new chapters+scenes appended; createStory(file) first tombstones the starter chapter/scene | syncs |
| «без нормы», «Убрать дату», «не знаю» | BookSections.tsx:301; DateChip.tsx:28; BookView.tsx:125 | NO | retype | field cleared | syncs |
| Service-worker update | main.tsx:28-41 | NO | NO | page reload when hidden | none |

Dangerous combinations: (1) delete the last story -> Welcome -> «Вернуть из копии» restores nothing for that story; (2) the weekly backup nudge is the only safety net for Safari/iOS storage eviction (persist() result is never shown); (3) Supabase sync does not remove child rows of a deleted story, so "delete" does not free cloud storage or erase text.


## Import of Ficbook .txt

Path: file -> `readFileAsBlocks` (importer.ts:233) -> `file.text()` (UTF-8) -> `textToBlocks` -> `parseBook` -> `blocksToChapters` -> preview (ImportPanel) or directly `createStory` (Library/Welcome) -> `importBook`/`importChapters`. Behaviour below was checked by running the real importer.ts on constructed samples.

| feature of the export | how it is handled | way text is dropped or mis-split |
|---|---|---|
| Header (title, fandom, pairing, summary…) before the first "Часть" | textToBlocks makes each line a paragraph block; lines before the first heading become `preface` (joined with \n). Title = first line if <=80 chars. Preface is saved as project.description ONLY if empty. Not imported as scenes. | Preface text never reaches the manuscript. If the story already has a description (adding a file via «Добавить текст»), the preface is discarded entirely. A prologue/dedication before the first recognised heading is treated as header (DATA-LOSS-RISK). |
| "========== Часть N ==========" | DECORATED_RE = 2+ of [\s=*#~_—–-] on both sides, inside text must pass isChapterTitle (Глава/Часть/Chapter/Part + number/roman/ordinal, or Пролог/Эпилог/Интерлюдия). Chapter title becomes "Часть N". Works on a clean line. | Needs the line to START with "=" and END with "=" after trim(). Any invisible char at the ends (ZWSP) breaks it (see below). |
| Scenes split by "***" | isSceneBreak = whole line of [\s*•·~#—–_=-]; every break flushes the current scene; empty scenes are never created by this logic. "<center>* * *" also a break. | A line that is only «—» or «-» is also a break (silent dialogue line splits a scene). A "***" line with an invisible char is not a break. |
| CRLF | `raw.replace(/\r\n?/g, '\n')` before split: handled. Blank lines are dropped; every non-blank line = one paragraph; lines are trim()ed (leading indents lost). | U+2028/U+2029 are not separators and stay inside one paragraph. |
| U+200B zero-width spaces | NOT handled anywhere (no strip in importer, text.ts, countWords or the editor path). `String.prototype.trim()` does not remove U+200B (it removes U+FEFF and NBSP but not ZWSP). | Verified: (a) ZWSP before/after the "====" heading => no heading recognised, entire book lands in one chapter «Начало (до первой главы)» with the header as the first paragraph; (b) ZWSP touching a "***" => no scene break, scenes merge; (c) a ZWSP-only line => an invisible paragraph and, between breaks, an empty-looking scene with 0 words (`"​" w=0`); (d) ZWSP inside a word => countWords counts two words; name detection regex (\p{L}) also splits. No visible text is dropped. The repo's realbook.test.ts counts ZWSP lines but does not assert on them. |
| Song-title line right after the part heading | First paragraph of each scene is tested by isEpigraph (<=70 chars, no leading dash, no ending punctuation, "A — B" with <=5 / <=7 words). If true: scene.epigraph = that line and card excerpt skips it; the line stays as the first paragraph of the text. | No loss. False positives (verified «Гарри - в Хогвартс») and misses (title ending with a dot, >70 chars, no dash) happen. The test runs on the first paragraph of EVERY scene, not only the one after the part heading, so a real opening line such as "Утро - это боль" is tagged as an epigraph too. |
| `<i> <b> <s>` tags | parseTaggedRuns converts i/em, b/strong, s/strike into marks; any other tag `<[a-z]…>` is stripped; entities decoded. | A literal "<b and c>" in prose would be eaten as a tag. Unclosed tags run to the end of the line only. |
| Chapter headings mid-text | Any line < 100 chars that STARTS with Глава/Часть/Chapter/Part + number/roman/ordinal word (no end anchor) is a heading. | «Часть пятая его души молчала.» / «Part I think so.» become chapter titles (verified) and break the chapter. Chapters with no scenes are filtered out. |
| Size | Whole file read as a string; one createChapter + createScene (2 saves, each its own transaction + notifyChange) per scene; no progress, no chunking, no rollback. | A book with ~1000 scenes = several thousand sequential writes; interruption leaves a prefix imported and the UI "Импортирую…" stuck (no finally). Re-importing duplicates. |
| Encoding | UTF-8 only | Windows-1251 files produce mojibake without warning. |
| Pasted text (textarea) | Clipboard HTML is preferred over the textarea text once pasted | Edited text is ignored; bare text inside div/span/blockquote/td in clipboard HTML is dropped (el.children recursion). |
| Preview | Counts chapters/scenes/words only | Does not mention header/preface handling or dropped pieces. |

Counts shown in preview use the editor's own word counter (docWordCount), so imported scenes should not look like lost words on first edit (also covered by recountWords once per project).


## Backup, restore, Yandex Disk

What a backup contains: the 9 tables in SYNCED_TABLES (projects, chapters, scenes, texts [scene texts + cover images], markers, notes, snapshots, lines, characters) including tombstones. Not contained: settings in localStorage (theme, accent, typography, current story, board layout, Supabase URL/key/session, Yandex token/ClientID), the outbox, meta flags.

Where data can be lost or duplicated, or fail silently:

1. **Merge rule is last-writer-wins by client timestamp with no safety copy** (backup.ts:42, used by manual restore AND every Yandex sync). Two devices editing the same scene between syncs: the later updatedAt replaces the other text completely; no snapshot is saved (Supabase's syncOnce does save one). A device whose clock is ahead keeps winning. The doc comment in filesync.ts («nobody's work is overwritten») is true only for different records.
2. **Deleted stories cannot be restored** and are not really deleted (see Destructive actions). Restore after "delete last story" reports «В этой копии нет историй».
3. **Unconditional full upload**: syncWithStore always writes the entire DB (all texts, snapshots, covers as base64) on every round: after each local change (30 s debounce), on every tab show/hide, on `online`. Mobile data/battery cost; the file only grows (snapshots never pruned). The previous Disk file is overwritten (overwrite=true), no rotation.
4. **TOCTOU window**: version() is compared before write() but nothing is atomic; a concurrent write between them is overwritten on the Disk (the other device re-adds its records on its next round because merging is by record, so loss only if that device's local DB is gone).
5. **Token expiry / 401 is silent**: no token at start => sync never starts and Settings shows «Подключить» with no explanation; mid-session 401 forgets the token but `connected` stays true so the reconnect button is hidden until reload; errors appear only in Настройки (no global dot/toast; header dot is Supabase-only). Network errors are shown as raw English.
6. **OAuth state is a constant** («manuscript-yandex») and the `error=` answer is swallowed (main.tsx -> yandex.ts:71-87): token injection by a crafted link; denial gives no message. The token (1 year if expires_in is absent) is kept in localStorage in plain form.
7. **No Yandex option on first launch**: Welcome offers only the Supabase form and Settings is unreachable before a story exists; connecting Disk on a new device means creating a throw-away story first (leftover duplicate "Без названия").
8. **Both engines together**: restoreBackup enqueues every merged row into the Supabase outbox, so Disk-sourced rows are also pushed to Supabase and vice versa (not a loss, extra traffic; deleted-story orphans propagate everywhere).
9. **Signed-out leak**: signOut keeps local data and outbox; signIn does queueEverything => the next account that signs in receives all of it.
10. **Backup reminder** is keyed to Supabase status only; downloadBackup stamps "last backup" immediately and cannot know whether the OS saved the file (iOS standalone PWA); no success/failure toast either in Settings or in the nudge.
11. **Restore is not schema-checked**: rows are put as found; one malformed scene (no `beats`) can crash views that read `s.beats.length`. Partial failure leaves some tables restored (transaction per table).
12. **Storage persistence** is requested at start but the answer is ignored (main.tsx:19). Safari evicts IndexedDB of non-installed sites after inactivity; the user is never told.
13. **First-open migration** (App.tsx:66-74) rewrites excerpt-less scenes at app start, before the first pull, stamping updatedAt=now; it then competes with real edits made elsewhere (LWW). recountWords does get-then-put on texts without a transaction.
14. **Supabase path**: the cursor is a global sequence value taken from a Postgres sequence; a late-committing lower seq can be skipped permanently; the "Отключить облако" button does nothing when the build contains VITE_SUPABASE_*.
15. Duplication: ids are UUIDs, merges are by id, so records do not duplicate; duplicates arise only from user actions (re-importing a file, the Welcome throw-away story, «Новая редакция»).


## Defects found

98 non-OK rows.

### S-002 · NO-ERROR-HANDLING · navigator.storage.persist() (main.tsx:19)
The result of persist() is never read, so the user is never told when the browser refuses it. On Safari (non-installed site) and low-disk situations IndexedDB can be evicted, and the app has no warning besides the weekly backup nudge.

```
navigator.storage?.persist?.().catch(() => {})
```

### S-003 · BUG · Yandex OAuth redirect intake (main.tsx:22, lib/yandex.ts:71-87)
The OAuth "state" is the constant "manuscript-yandex" and is never checked against a per-session random value. Anyone who gets the user to open https://app/#access_token=<attacker token>&state=manuscript-yandex makes the app store the attacker's Yandex token and start uploading the user's whole library to the attacker's Disk. A denied/failed authorisation returns to Settings with no message.

```
state: 'manuscript-yandex'  /  if (p.get('state') !== 'manuscript-yandex') return false
```

### S-004 · NO-ERROR-HANDLING · startFileSync at start (main.tsx:23)
getYandexToken() returns null once expiresAt has passed, so on start sync is simply not started and no message is shown anywhere; the user believes the Disk is in step while it has stopped.

```
if (getYandexToken()) startFileSync(yandexStore())
```

### S-005 · RACE · Service worker update (onNeedRefresh) (main.tsx:28-32)
updateSW(true) makes every controlled client reload when the new worker takes over. A second visible tab/window of the app (browser tab plus installed PWA) is reloaded while the author may be typing; the editor only flushes on pagehide, so the last debounce window can be at risk.

```
if (document.visibilityState === 'hidden') void updateSW(true)
```

### S-010 · UNCLEAR · toast(msg, undo?) (lib/ui.tsx:6)
There is only one toast slot (pushToast). If two actions happen within 6 s, the earlier "Отменить" disappears. Error toasts last only 2.2 s (e.g. "Не получилось прочитать файл"), shorter than needed to read a long Russian sentence.

```
t = setTimeout(() => setMsg(null), undo ? 6000 : 2200)
```

### S-011 · A11Y · «Отменить» (toast undo) (lib/ui.tsx:25-33)
The undo button exists for 6 s and is not announced beyond role="status"; keyboard/screen-reader users have no practical way to reach it in time.

```
<div className={`toast ${msg.undo ? 'has-undo' : ''}`} role="status">
```

### S-013 · A11Y · Modal Esc (lib/ui.tsx:40-44)
Modal has role="dialog" and aria-label but no aria-modal, no focus move into the dialog, no focus trap and no focus return to the opener.

```
<div className="modal card" role="dialog" aria-label={label}>
```

### S-014 · RACE · InlineEdit input (single line) (lib/ui.tsx:85-89)
While the user is typing in an InlineEdit, an incoming sync/Yandex merge that changes the same field resets the draft to the remote value. Also, if the tab is closed with the field focused, no blur fires and the edit is lost.

```
useEffect(() => setV(value), [value])
```

### S-015 · RACE · InlineEdit textarea (multiline) (lib/ui.tsx:77-83)
Same overwrite-on-remote-update behaviour and no save on pagehide.

```
onChange={(e) => setV(e.target.value)}
```

### S-019 · UNCLEAR · Fall back to most recent project (App.tsx:57-63)
On the render in between (data === null for the stale id) the code reaches `!data` and shows <Welcome> ("Начать историю") for a frame even though other stories exist, e.g. right after deleting the open story.

```
if (!projects.length || !data) return <Welcome onCreated={selectProject} sync={sync} />
```

### S-020 · DATA-LOSS-RISK · tidyImportedScenes / recountWords / recountChars (App.tsx:66-74 -> db/repo.ts:397-446)
Runs on app start, possibly before the first cloud pull, and re-saves every excerpt-less scene (plan cards never opened in the editor, or old data) with updatedAt=now. That stamp beats the real edits another device made earlier under last-write-wins. It also erases a hand-written scene title when the text begins with the same words. recountWords does `get` then `save({...t, wordCount})` without a transaction: a keystroke autosave between the two is reverted.

```
title: auto ? '' : s.title,   /  const t = await db.texts.get(s.id) ... await save<SceneText>('texts', { ...t, wordCount: n })
```

### S-024 · MISMATCH · Ctrl/⌘+J (App.tsx:98-102)
The listener is global but QuickCapture/SearchModal are rendered only in the main shell. Pressing the hotkey on Истории/Настройки/Справка sets state with nothing shown; the modal then pops up unexpectedly after navigating to a story view.

```
if (route.view === 'library' || route.view === 'settings' || route.view === 'help') { return (<div className="lib-shell">…
```

### S-025 · MISMATCH · Ctrl/⌘+Shift+F (App.tsx:103-106)
Same as above: the search state is set while in the library shell and the modal appears later.

```
setSearching('')
```

### S-026 · MISMATCH · Loading / Welcome gate (App.tsx:112-115)
Because Settings is only rendered once a story exists, a fresh device cannot reach «Своё облако» (Яндекс Диск) from Welcome: Welcome offers only the Supabase account form. The user must create a throw-away story first, then connect the Disk, and is left with an extra empty "Без названия" story.

```
if (!projects.length || !data) return <Welcome onCreated={selectProject} sync={sync} />
```

### S-032 · MISMATCH · Project name button + caret (title "Все истории") (App.tsx:225)
The caret icon next to the story title suggests a dropdown of stories, but the button just opens the library page.

```
<button className="project-name" title="Все истории" onClick={() => go({ view: 'library' })}>
```

### S-033 · A11Y · Sync dot (span, title only) (App.tsx:229)
The only global sync-health indicator is a tiny span with a title tooltip: invisible on touch/keyboard, and it ignores Yandex Disk failures and the signed-out state, so a stopped sync is silent.

```
{(sync.state === 'offline' || sync.state === 'error') && <span className="sync-dot" data-state={sync.state} title={syncTitle} />}
```

### S-035 · UNCLEAR · «Поиск» (tab-aux, hide-on-phone) (App.tsx:244)
The button carries class hide-on-phone, and Ctrl+Shift+F does not exist on a phone, so book search is reachable on phones only if WriteView provides its own entry (not verified in this audit).

```
<button className="tab-aux hide-on-phone" … onClick={onSearch}>
```

### S-038 · MISMATCH · BackupReminder (shown when sync.state !== "ok") (App.tsx:169, 269-297)
The condition looks only at the Supabase status. A Yandex-Disk-only user is nagged even when synced; a Supabase user with sync "ok" is never reminded (and the cloud copy is not a backup of deletions). Not shown at all on library/settings/help.

```
{sync.state !== 'ok' && <BackupReminder />}
```

### S-039 · NO-ERROR-HANDLING · «Скачать копию» (App.tsx:277-285)
LAST_KEY is stamped inside downloadBackup right after clicking the synthetic <a download>, so the 7-day clock restarts even if the browser/iOS blocked or the user cancelled the save. A thrown error (quota, memory on JSON.stringify of a big base) is an unhandled rejection and the note stays or vanishes without a message.

```
download(new Blob([JSON.stringify(dump)], …)); try { localStorage.setItem(LAST_KEY, String(Date.now())) }
```

### S-044 · A11Y · «Импорт .docx / .txt» (file input) (views/LibraryView.tsx:56-59)
The input has the `hidden` attribute and sits inside a non-focusable <label>, so keyboard users cannot reach the picker. Same pattern in Welcome, Settings restore, ImportPanel and CoverPicker. The input value is also never reset, so choosing the same file again after a failure does nothing.

```
<input type="file" hidden accept=".docx,.txt,.md,.html,.htm" onChange={(e) => e.target.files?.[0] && void create(e.target.files[0])} />
```

### S-045 · NO-ERROR-HANDLING · create() error path (views/LibraryView.tsx:27-35)
If importBook fails midway (quota, closed tab), the new story already exists with the starter chapter removed and only part of the text; nothing is shown. The import is not one transaction (thousands of separate saves).

```
try { const id = await createStory({ file }); onOpen(id, 'text') } finally { setBusy(false) }
```

### S-048 · A11Y · Story title (<strong class="story-title">) (views/LibraryView.tsx:94)
Clickable text with no button role or tabindex; keyboard users reach the story only via the cover button or «Продолжить».

```
<strong className="story-title" onClick={onOpen}>
```

### S-049 · UNCLEAR · «Действия» (⋯ summary of <details class="menu">) (views/LibraryView.tsx:97-100)
Nothing in the code closes the <details> menus (here and on Герои): after cancelling the delete confirm or after changing the colour the menu stays open until toggled again.

```
<details className="menu"> <summary className="icon-btn" aria-label="Действия">
```

### S-053 · A11Y · Menu cover colour swatches (aria-label «Цвет обложки») (views/LibraryView.tsx:120-126)
Eleven swatches share the same aria-label «Цвет обложки», so a screen reader cannot tell them apart and the selected one is only marked with a CSS class (no aria-pressed).

```
className={`swatch ${c === color ? 'on' : ''}`} … aria-label="Цвет обложки"
```

### S-054 · DATA-LOSS-RISK · «Удалить историю» (menu, class danger) (views/LibraryView.tsx:131-140)
Only the project row gets deleted:true (updatedAt=now). Chapters, scenes, texts, snapshots, markers, notes, lines, characters and the cover stay in IndexedDB, Supabase and the Yandex file as orphans — so the text is neither really deleted nor reachable. «Вернуть из копии» cannot undo it either: the tombstone is newer than the project in any older backup and restoreBackup skips records that are not newer.

```
export async function remove(table, id) { return patch(table, id, { deleted: true }) }  /  if (here && (here.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue
```

### S-056 · UNCLEAR · Stats useLiveQuery (views/LibraryView.tsx:36-48)
Reads the whole scenes and chapters tables on every change; with many orphaned scenes from deleted stories this grows and is never garbage-collected.

```
const scenes = alive(await db.scenes.toArray())
```

### S-057 · NO-ERROR-HANDLING · «Начать историю» (views/Welcome.tsx:33)
create() has no try/catch/finally: if createStory throws, setBusy(false) is never reached and both buttons stay disabled on a stuck "Раскладываю текст по главам…" line; no message.

```
setBusy(true); const id = await createStory({ file }); setBusy(false)
```

### S-058 · A11Y · «Импортировать .docx / .txt» (file) (views/Welcome.tsx:36-39)
Hidden file input inside a label (not keyboard reachable); also opens board here but text in Library for the same action.

```
onCreated(id, file ? 'board' : 'text')
```

### S-059 · DATA-LOSS-RISK · «Вернуть из копии» (file, link-plain) (views/Welcome.tsx:43-61)
This screen appears after the user deletes the last story. Restoring an older backup then adds nothing for that story (its tombstone is newer, children already exist locally), returning added=0 and the misleading toast «В этой копии нет историй». JSON.parse errors reach the user as raw English text.

```
toast(added ? 'Всё на месте — истории вернулись из копии' : 'В этой копии нет историй')
```

### S-060 · MISMATCH · «Уже пишу на другом устройстве» (views/Welcome.tsx:62-64)
Only the Supabase account form appears. The headline cloud feature added in the latest commit (Яндекс Диск) cannot be connected from here.

```
{cloud && <SyncSection sync={sync} />}
```

### S-061 · MISMATCH · HelpView (static list) (views/HelpView.tsx:4-58)
Several names in the help text do not match the UI: it says «страница «Книга»» (the tab is «История»), «Герои → Сюжетные ветки → Ветки из героев» (UI: «Сюжетные линии» / «Линии из героев»), and «Копия… Вернуть — ничего не удаляется» (restore can overwrite newer-in-file records).

```
['Что осталось дописать', 'Страница «Книга» → под главами. …']
```

### S-062 · DEAD · BookCover in hero (no onClick) (views/BookView.tsx:68 -> components/BookCover.tsx:12-18)
The cover button has hover-lift styling but no handler on the story page; clicking does nothing.

```
<BookCover project={p} words={words} />   /   .book:hover { transform: translateY(-3px); }
```

### S-066 · A11Y · Обложка CoverPicker + swatches (views/BookView.tsx:86-92)
Eleven colour swatches with identical aria-label «Цвет обложки».

```
aria-label="Цвет обложки" onClick={() => set({ color: c })}
```

### S-069 · MISMATCH · «всего будет» NumberField (views/BookView.tsx:123 -> components/BookSections.tsx:16-30)
Typing 0 is converted to "empty" (undefined), not to the «не знаю» value 0 used elsewhere. Every focus+blur writes the project (new updatedAt) even if nothing changed, which makes the record "newer" under last-write-wins merges on other devices.

```
onSave(Number.isFinite(v) && v > 0 ? v : undefined)
```

### S-078 · MISMATCH · PublishSection: «Скопировать для …» (primary) (components/BookSections.tsx:161 -> views/BookView.tsx:42-63)
On clipboard failure (permission denied, iOS Safari, insecure context) the user clicked «Скопировать», no message appears and a .txt file download starts instead. Also loadChapters is outside the try, so a read error is an unhandled rejection.

```
download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${ch.chapter.title}.txt`)
```

### S-080 · MISMATCH · PublishSection: «✓ Выложила сегодня» (components/BookSections.tsx:169-176)
No confirmation; the action also LOCKS the chapter. Clearing the date in the list below only resets publishedAt, locked stays true.

```
setCh(next.chapter, { publishedAt: dayKey(), locked: true })
```

### S-085 · A11Y · PublishSection: «⧉» per-chapter copy (components/BookSections.tsx:231)
The only accessible name of the button is the glyph «⧉»; the real label is in title.

```
<button className="icon-btn" title={copyLabel} onClick={() => onCopy(chapter.id)}> ⧉
```

### S-087 · UNCLEAR · Essence (Plot.tsx, embedded) (views/BookView.tsx:142)
components/Plot.tsx (Essence), LeftToWrite, HeroBranches, ColorDot, WhereFound, TypoControls were not in the assigned files and are not inventoried here.

```
<Essence project={p} embedded />
```

### S-089 · MISMATCH · «Вся история в Word (.docx)» (views/BookView.tsx:40,164)
Scenes sitting in «Пока без места» (pool) are not part of data.outline, so their text is silently missing from the "whole story" file. Errors (docx chunk load offline, memory) give no feedback.

```
for (const { chapter, scenes } of data.outline) { … }
```

### S-090 · DATA-LOSS-RISK · ImportPanel (embedded under «Добавить текст») (views/BookView.tsx:170)
No de-duplication and no undo: importing the same file twice doubles the chapters (to remove them each chapter must be deleted by hand on the board). Pre-heading text of the file is dropped when the story already has a description (see Import section).

```
if (project && book.preface && !project.description) { … }
```

### S-091 · MISMATCH · «Новая редакция» (views/BookView.tsx:178-194)
Setting the GLOBAL key manuscript.mode=rewrite switches every story into «Переписать» mode, not just the new edition. newEdition is not transactional and has no catch: a failure leaves a half-copied story in the library with no message.

```
localStorage.setItem('manuscript.mode', 'rewrite')
```

### S-092 · DATA-LOSS-RISK · «Удалить эту историю» (views/BookView.tsx:196-206)
Same soft-delete of the project row only (see Library «Удалить историю»). The deleted story's page flashes <Welcome> while the active project resolves.

```
await remove('projects', p.id)
go({ view: 'library' })
```

### S-096 · A11Y · «+ Новый герой» input (views/CharactersView.tsx:66-72)
The only way to add a hero is Enter in a placeholder-only input (no accessible name, no visible "add" button — on a phone keyboard the user may not know to press Return). Typing an existing name silently clears the field.

```
onKeyDown={(e) => e.key === 'Enter' && void add()}
```

### S-098 · BUG · Person: name InlineEdit (views/CharactersView.tsx:155)
A hero can be saved with an empty name (every other title field guards with trim()). The card then has no avatar letter and no name, and mention-matching silently skips the hero.

```
onSave={(name) => set({ name })}
```

### S-099 · UNCLEAR · Person: «Действия» (⋯ details) (views/CharactersView.tsx:156-190)
Menu stays open after any action or cancel (no closing code).

```
<details className="menu"> <summary className="icon-btn" aria-label="Действия">
```

### S-100 · DATA-LOSS-RISK · Menu: «⇢ {other hero}» (merge) (views/CharactersView.tsx:165-174)
The merged-away hero's name and `aliases` are discarded (only `about` is appended), so later «Где встречается» and branch detection no longer recognise the old name; `ignoreSceneIds` also lost. Merge is many separate saves, not atomic.

```
const about = [into.about, from.about]…; await save<Character>('characters', { ...into, about }); await remove('characters', fromId)
```

### S-102 · BUG · Menu: «Удалить героя» (danger) (views/CharactersView.tsx:186, 133-138)
The message promises quotes lose the mark, but only scenes are patched. Quotes keep a dead characterIds entry, so the Inbox filter `!(n.characterIds ?? []).length` hides them, no hero card shows them, and QuoteRow has no delete: the quotes become unreachable. Scene patches use the stale render-time array, which can overwrite concurrent changes.

```
if (s.characterIds?.includes(c.id)) await patch<Scene>('scenes', s.id, { characterIds: s.characterIds.filter((x) => x !== c.id) })
```

### S-106 · BUG · «+ цитата или реплика» input (views/CharactersView.tsx:212-223)
QuoteRow offers only the used/unused toggle. A quote added here cannot be edited or deleted: Inbox hides notes that have characterIds, and the hero card has no delete.

```
const n = await createNote(quote.trim(), 'quote', data.project.id)
await patch<Note>('notes', n.id, { characterIds: [c.id] })
```

### S-108 · A11Y · QuoteRow: ✓ / ↩ toggle (title «Уже в тексте» / «Вернуть в неиспользованные») (views/CharactersView.tsx:240-246)
Icon-only button whose glyph ✓/↩ is the accessible name.

```
title={n.used ? 'Вернуть в неиспользованные' : 'Уже в тексте'}
```

### S-113 · A11Y · Branches: «+ линия — например, второго героя» (views/CharactersView.tsx:112-121)
Placeholder-only input, Enter-only submit, no accessible name.

```
if (e.key !== 'Enter' || !name.trim()) return
```

### S-117 · MISMATCH · TagScenes: «Отметить» (views/CharactersView.tsx:322, 275-287)
The toast number is add.size (scenes that matched), including scenes where nothing changed because the hero was already marked.

```
toast(`Отмечено в ${add.size} сценах`)
```

### S-118 · A11Y · «Найти в мире» search input (views/LoreView.tsx:52)
Placeholder-only (no label).

```
<input className="input lore-search" placeholder="Найти в мире" …/>
```

### S-120 · RACE · «+ запись: название…» input (views/LoreView.tsx:66-72, 39-45)
The draft is cleared before the awaits; if createNote fails the typed title is lost silently. The entry exists for a moment with empty title between the two saves and may sync that way.

```
setDraft('')
const n = await createNote('', 'lore', data.project.id)
await patch<Note>('notes', n.id, { title, topic: topic ?? undefined })
```

### S-122 · A11Y · LoreCard: × (title «Удалить запись») (views/LoreView.tsx:89-99)
Icon-only × with only a title; no aria-label.

```
<button className="icon-btn" title="Удалить запись" onClick={() => {
```

### S-124 · A11Y · LorePins: × «Открепить» (hero/chapter/scene) (views/LoreView.tsx:127,135,143)
All unpin buttons share the label «Открепить» without saying what is unpinned.

```
<button aria-label="Открепить" onClick={() => drop('characterIds', h!.id)}>
```

### S-126 · UNCLEAR · «Записать мысль…» textarea (views/InboxView.tsx:38-50)
Enter submits even while an IME composition is active (no isComposing check); on phones a multi-line note cannot be typed without Shift.

```
if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add() }
```

### S-129 · MISMATCH · Filter seg «Неразобранные / Вопросы / Привязанные к сцене / Архив» (+count) (views/InboxView.tsx:75)
The «Неразобранные» filter excludes any note with characterIds, and no other filter shows an unattached, unarchived hero quote, so those notes appear nowhere in the Inbox.

```
inbox: data.notes.filter((n) => !n.archived && !n.sceneId && !n.used && !(n.characterIds ?? []).length),
```

### S-132 · MISMATCH · NoteRow: select «Привязать к сцене…» (views/InboxView.tsx:131-146)
The placeholder option «Привязать к сцене…» has value "" and selecting it DETACHES the note from its scene; the label does not say so.

```
onChange={(e) => void patch<Note>('notes', note.id, { sceneId: e.target.value || undefined })}
```

### S-133 · A11Y · NoteRow: hero chips (quote/dialogue only) (views/InboxView.tsx:152-161)
Selected state of the chips is conveyed only by a CSS class.

```
className={`ref-chip ${on ? 'on' : ''}`}
```

### S-136 · A11Y · NoteRow: kind seg (emoji only) (views/InboxView.tsx:180)
Icon-only toggle buttons (◦ ❝ — ? ≡) with no label/title; screen readers announce symbols.

```
<button key={x.id} aria-pressed={note.kind === x.id} onClick={…}>{x.icon}</button>
```

### S-137 · DATA-LOSS-RISK · NoteRow: «Удалить» (views/InboxView.tsx:185)
The only destructive action in the app that has neither confirmation nor undo. It sits one click from «Готово» in the same row.

```
<button className="btn sm ghost" onClick={() => void remove('notes', note.id)}>
```

### S-138 · A11Y · NoteRow: ✓ / ↩ (title «В архив» / «Вопрос решён» / «Вернуть») (views/InboxView.tsx:195-201)
Glyph-only button; the name is ✓ or ↩.

```
title={note.archived ? 'Вернуть' : note.kind === 'question' ? 'Вопрос решён' : 'В архив'}
```

### S-140 · A11Y · CoverPicker: «Загрузить картинку» / «Другая картинка» (file) (components/BookCover.tsx:45-47)
Hidden input in a label: not keyboard reachable; same file cannot be picked twice.

```
<input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void run(() => imageToCover(e.target.files![0]))} />
```

### S-142 · UNCLEAR · CoverPicker: «По ссылке» (prompt) (components/BookCover.tsx:52-69)
When CORS blocks the fetch the raw external URL is stored in the synced cover record: the image then loads from the third-party site on every device (IP leak/tracking, breaks offline), though the toast warns about offline only. Uses blocking prompt().

```
return { src: clean, offline: false }
```

### S-143 · DATA-LOSS-RISK · CoverPicker: «Убрать» (components/BookCover.tsx:70-73)
The user's uploaded cover is overwritten with an empty record immediately; there is no confirmation or undo.

```
<button className="btn sm ghost" onClick={() => void setCover(projectId, undefined)}>
```

### S-150 · A11Y · «Выбрать файл (.docx, .txt)» (file; accepts .docx .txt .md .html .htm) (components/ImportPanel.tsx:119-127)
Hidden input inside a label; the label text says only .docx/.txt although .md/.html/.htm are accepted (markdown "#" headings are not recognised as chapters).

```
<input type="file" accept=".docx,.txt,.md,.html,.htm" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
```

### S-151 · BUG · Paste textarea «…или вставь текст сюда» (components/ImportPanel.tsx:132-145)
After pasting, edits made in the textarea are ignored by «Разобрать вставленный текст» because it parses the stored clipboard HTML instead of the (edited) text. Also htmlToBlocks collects text only from <p>/<li>/<h*>; text that sits directly inside <div>/<span>/<blockquote>/<td> (common clipboard HTML) is dropped.

```
onClick={() => show(pastedHtml ? htmlToBlocks(pastedHtml) : textToBlocks(pasted))}
```

### S-153 · NO-ERROR-HANDLING · Preview «Импортировать» (components/ImportPanel.tsx:106, 71-81)
If importBook throws (quota, tab killed), setBusy(false) is never reached: the button stays "Импортирую…" disabled and partial chapters remain with no message. Large books mean thousands of separate writes and a notifyChange per write.

```
setBusy(true)
const first = await importBook(projectId, book)
setBusy(false)
```

### S-155 · MISMATCH · Preview text (counts) (components/ImportPanel.tsx:88-96)
The preview never warns that the "preface" (all paragraphs before the first recognised heading) will not become part of the manuscript.

```
const head = blocks.slice(0, first).filter(…para…)
```

### S-157 · A11Y · Акцент swatches (role=radio, aria-label = colour name) (views/SettingsView.tsx:71-83)
role="radio" without a roving tabindex/arrow navigation: each swatch is a separate Tab stop, contrary to the radiogroup pattern.

```
<button key={a.id} role="radio" aria-checked={accent === a.id} …/>
```

### S-158 · UNCLEAR · TypoControls (views/SettingsView.tsx:88)
components/TypoControls.tsx is not in the assigned list and is not inventoried.

```
<TypoControls />
```

### S-160 · NO-ERROR-HANDLING · «Скачать копию» (views/SettingsView.tsx:144)
No toast on success and none on failure; a thrown error (quota, memory) is an unhandled rejection. The nudge clock (LAST_KEY) is stamped even if the browser did not actually save the file (iOS standalone PWA often cannot handle <a download> blobs).

```
<button className="btn primary" onClick={() => void downloadBackup()}>
```

### S-161 · DATA-LOSS-RISK · «Вернуть из копии…» (file .json) (views/SettingsView.tsx:147-150, 23-32)
The confirm says nothing is deleted, but a scene text whose updatedAt in the file is newer replaces the local text with no version copy (the Supabase path keeps a conflict snapshot, this path does not). Rows are written without schema validation, so a hand-edited or old-format file can store a scene without `beats` and crash the UI. A tombstoned (deleted) story is never resurrected. The raw JSON.parse error text is shown to the user.

```
if (here && (here.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue
await db.table(t).put(row)
```

### S-165 · NO-ERROR-HANDLING · «Подключить» (Supabase) (views/SettingsView.tsx:217-228)
URL/key are not validated; a wrong value is accepted and shows up only as a sync error after the reload. localStorage.setItem is not guarded (private mode throws).

```
setCloudConfig({ url: url.trim(), anonKey: key.trim() })
void syncNow()
location.reload()
```

### S-167 · DATA-LOSS-RISK · «Выйти» (views/SettingsView.tsx:239 -> db/cloud.ts:168-173)
Signing out keeps all local stories and the outbox. Signing in afterwards (signIn) calls queueEverything(), which uploads EVERYTHING on the device into whichever account signs in — a different account then receives the first account's stories. There is no warning or option to clear the device.

```
await resetSyncCursor()
await queueEverything()
await syncNow()
```

### S-168 · A11Y · Email / password inputs (views/SettingsView.tsx:245-253)
Fields are not in a form: Enter in the password field does nothing, password managers may not offer to save, and the inputs rely on placeholders as labels.

```
<input className="input" type="password" autoComplete="current-password" placeholder="Пароль" …/>
```

### S-171 · MISMATCH · «Отключить облако» (views/SettingsView.tsx:274-285)
In a build that has VITE_SUPABASE_URL/KEY (the Pages workflow sets them) the saved config is removed but getCloudConfig() immediately returns the build values again, so after the reload the cloud is still on and the button is still there. The auth session is also left behind.

```
const url = import.meta.env.VITE_SUPABASE_URL …; return url && anonKey ? { url, anonKey } : null
```

### S-172 · UNCLEAR · «Подключить» (Яндекс Диск) (components/CloudDisks.tsx:75)
Leaves the app mid-session by full navigation; the editor relies on pagehide to flush. See also the constant-state weakness in the Boot row.

```
location.assign(`https://oauth.yandex.ru/authorize?${q}`)
```

### S-173 · RACE · «Синхронизировать» (components/CloudDisks.tsx:59)
syncWithStore ALWAYS writes the entire database JSON back, even when nothing changed on either side, and also fires on every visibilitychange (show and hide). Two devices alternating produce version churn that can exhaust the 3 retries («Облако всё время меняется…»), and every tab switch re-uploads all text, snapshots and cover images.

```
if ((await store.version()) !== before) continue
await store.write(await makeBackup())
```

### S-175 · NO-ERROR-HANDLING · Status text (ok/error/offline/syncing) (components/CloudDisks.tsx:26-35, 50-55)
After a 401 the token is forgotten and the status says «Нажми «Подключить» ещё раз», but `connected` is stale-true so the «Подключить» button is not drawn until the page remounts; the user only sees «Отключить». Raw network errors ("Failed to fetch") appear untranslated. Errors are visible only on this screen — no dot, no toast anywhere else.

```
throw new Error('Яндекс Диск попросил войти заново. Нажми «Подключить» ещё раз.')  /  const [connected, setConnected] = useState(() => !!getYandexToken())
```

### S-176 · NO-ERROR-HANDLING · yandexUser() effect (components/CloudDisks.tsx:22-24)
void yandexUser().then(setWho) has no .catch: offline or an expired token raises an unhandled rejection (and a 401 silently forgets the token).

```
if (connected) void yandexUser().then(setWho)
```

### S-180 · RACE · startFileSync listeners (lib/filesync.ts:90-100 (via main.tsx:23))
Merge is per record by updatedAt with no conflict copy and no check for unsynced local edits (see Backup/Yandex section). A device with a clock ahead wins every record it touched even against newer edits elsewhere. If the page is frozen during the hide-time upload (mobile), edits are on the Disk only at the next open.

```
if (here && (here.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue
```

### S-181 · RACE · startCloudSync listeners (db/cloud.ts:129-141)
The cursor is "highest seq seen". A row from a slower concurrent transaction that gets a lower seq but commits later is never fetched. An extra pull also returns the device's own pushed rows each time.

```
.gt('seq', from)  /  await db.meta.put({ key: CURSOR_KEY, value: maxSeq })
```

### S-183 · BUG · textToBlocks: U+200B zero-width space (lib/importer.ts:57-58, 42-47, 49)
Where ZWSP touches a heading, a «***» or sits alone on a line, chapters/scenes are not split or junk empty scenes appear (checked: one scene "Текст. ​ ​*** Вторая. ***​ Третья."). Inside words ZWSP is kept (invisible) and countWords splits such words in two, so counts and name detection drift. No text is dropped, but structure is lost.

```
const t = line.trim() … if (isSceneBreak(t) || …) / DECORATED_RE = ^[\s=*#~_—–-]{2,}(.+?)[\s=*#~_—–-]{2,}$   (no \u200B in any class)
```

### S-185 · BUG · isChapterTitle prefix test (lib/importer.ts:27-33)
A narrative line such as «Часть пятая его души молчала.» or «Part I think so.» (verified) becomes a chapter title and splits the chapter; the sentence is moved into the title. Empty chapters created by such headings are silently dropped by the final filter.

```
NUMBERED_RE = /^\s*(глава|часть|chapter|part)\s*[№#]?\s*(\d+|[IVXLCDM]+(?![a-z])|(перв|втор|…)[\p{L}]*)/iu
```

### S-186 · BUG · isSceneBreak (lib/importer.ts:30,49)
A paragraph that is just a dash (a silent line of dialogue) splits the scene. Verified: "Он молчал.\n—\nОна тоже." yields two scenes.

```
const SCENE_BREAK_RE = /^[\s*•·~#—–_=-]+$/
```

### S-187 · UNCLEAR · Song line after the part heading (isEpigraph) (lib/importer.ts:210-211, 272-279)
No text is lost, but false positives exist (verified: «Гарри - в Хогвартс» is an epigraph) and titles ending in punctuation or longer than 70 chars are not recognised. The song line is duplicated: kept in the body AND stored as epigraph.

```
if (t.length > 70 || /^[—–-]/.test(t) || /[.!?…,:;]$/.test(t)) return false
```

### S-188 · DATA-LOSS-RISK · parseBook: text before the first heading (lib/importer.ts:256-266)
For a manuscript whose first lines are a prologue, dedication or opening scene without a recognised heading, that text becomes the story description and never appears as a scene. When adding a file to a story that already has a description the preface text is dropped silently.

```
if (project && book.preface && !project.description) { await save<Project>('projects', { ...project, description: book.preface }) }
```

### S-189 · DATA-LOSS-RISK · htmlToBlocks (docx via mammoth, pasted HTML, .html) (lib/importer.ts:106-152, 233-242)
Text that lives directly inside a container element is skipped without any message, so a paste or .html file can import with parts missing. A Word subheading styled as Heading N is turned into a chapter. Images are dropped silently.

```
Array.from(dom.body.children).forEach(visit)  /  Array.from(el.children).forEach(visit)
```

### S-190 · UNCLEAR · readFileAsBlocks: .txt encoding (lib/importer.ts:241)
No encoding detection or warning; Ficbook exports are UTF-8 but other .txt files from Russian editors often are not.

```
return textToBlocks(await file.text())
```

### S-191 · UNCLEAR · textToBlocks: U+2028/U+2029 and Markdown headings (lib/importer.ts:54)
.md files are accepted by the picker but their headings are not understood, so the whole file lands in one chapter.

```
const lines = raw.replace(/\r\n?/g, '\n').split('\n')
```

### S-192 · DATA-LOSS-RISK · importChapters writes (components/ImportPanel.tsx:23-37 -> db/repo.ts:92-118)
No single transaction: closing the tab, a quota error or a crash in the middle leaves a prefix of the book imported; re-running imports it again (duplicates). A long book causes several thousand writes and live-query refreshes.

```
for (const ch of chapters) { const chapter = await createChapter(…); for (const sc of ch.scenes) { await createScene(…) } }
```

### S-194 · UNCLEAR · makeBackup / downloadBackup (lib/backup.ts:12-26)
Whole DB is built in memory with JSON.stringify (no streaming); a book with many snapshots or base64 covers can be large on phones. The file includes orphaned data of "deleted" stories.

```
for (const t of SYNCED_TABLES) dump[t] = (await db.table(t).toArray()) as Base[]
```

### S-195 · DATA-LOSS-RISK · restoreBackup merge rule (lib/backup.ts:32-53 (also used by Yandex sync))
If two devices edited the same scene between syncs, the copy with the later updatedAt silently replaces the other whole text — the Supabase path (sync.ts:46-65) saves the loser as a snapshot, the backup/Yandex path does not. updatedAt is client wall-clock, so a device with a fast clock wins every comparison. Restoring cannot revive a story deleted later than the backup.

```
if (here && (here.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue
await db.table(t).put(row)
```

### S-196 · NO-ERROR-HANDLING · readBackupFile (lib/backup.ts:55-59)
No version/shape check beyond `projects`, and a JSON syntax error propagates as a raw English SyntaxError message into the toast.

```
if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) throw new Error('Это не копия Manuscript')
```

### S-198 · NO-ERROR-HANDLING · yandexStore.read / write (lib/yandex.ts:108-147)
One file holds the whole library and is overwritten on every write (overwrite=true) with no copy of the previous version on the Disk. A truncated upload or a failed merge leaves the Disk as the only damaged copy until the next good sync; the app does not warn.

```
await call(`/resources/upload?path=${encodeURIComponent(FILE)}&overwrite=true`, token())
```

### S-199 · NO-ERROR-HANDLING · token expiry / 401 (lib/yandex.ts:40-47, 89-96)
Token expiry silently stops sync: at start nothing runs, mid-session the error is visible only in Настройки, and there is no dot/toast/banner elsewhere. The BackupReminder is also tied to Supabase, not to Yandex state.

```
return t && t.expiresAt > Date.now() ? t : null
```

### S-201 · DATA-LOSS-RISK · signIn -> queueEverything (db/cloud.ts:144-157)
Combined with signOut() not clearing local data, this copies the previous user's whole library into the next account that signs in on the same device (privacy as well as duplication).

```
await resetSyncCursor()
await queueEverything()
```

## Questions for the owner

1. Should «Удалить историю» really hide only the project row? Do you want children tombstoned too (so Supabase/Yandex can drop them), and a "Недавно удалённые" screen / «Отменить» for 30 days?
2. In your real Ficbook export, where exactly do the U+200B characters stand: on blank lines, around «***», around the «========== Часть N ==========» lines, inside words? (The code treats all of them as ordinary text.) Can you run `MANUSCRIPT_REAL_BOOK=<file> npx vitest run realbook` and send the printed zwsp counts?
3. Does the text before the first «Часть 1» in your export contain anything besides the header (e.g. an author's note you want in the book)? Should such text become a first chapter or stay as «Описание»?
4. Is a single «—» on its own line meant to be a scene break in your texts, or is it a dialogue line?
5. When a scene was changed on the phone and on the computer between syncs, which behaviour do you want: keep the newer, keep the newer + save the older as a version (as Supabase does today), or ask?
6. Is Supabase still in use (the Pages workflow bakes VITE_SUPABASE_* in), or is Яндекс Диск the only cloud now? That decides whether «Отключить облако» and the sync dot need to cover Yandex.
7. Should the weekly backup nudge also count a successful Yandex sync, and should it confirm that a file was actually saved (iOS)?
8. May a hero's quotes be edited and deleted in the «Герои» card? Today they cannot be deleted at all and disappear from Входящие once they belong to a hero.
9. What should Help call the story page: «История» (tab) or «Книга» (Help text)? And «Сюжетные линии» vs «Сюжетные ветки»?
10. «Новая редакция» sets the global mode «Переписать» for every story: intended?
11. Should hotkeys Ctrl+J / Ctrl+Shift+F work on Истории/Настройки/Справка (open the modal there) or stay disabled?
12. Is the phone supposed to have a way to search the whole story (the header «Поиск» is hidden on phone widths)?
