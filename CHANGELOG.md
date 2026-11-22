# Changelog

Notable changes to `@local/sticky-board`. Versions are local (not published).

## 0.17.0

- Schema v3: cards gain `blocked` + `blockedReason` (≤200 chars); settings gain `lastBackupAt`; v1/v2 documents are read as v3 with defaults filled in.
- Daily snapshot backup: the store copies `board.json` to `board.json.bak-YYYY-MM-DD` before the first write of each day and keeps the newest 7 snapshots.
- Blocked cards: drawer toggle + reason input, red `阻塞` chip on the board card, and a "blocked only" board filter.
- Board stats bar: per-column counts, P0+P1, overdue and blocked chips; clicking the latter three toggles the matching filter.
- Wall filters and density: colour multi-select + pinned-only filter, and the previously unused `settings.wallDensity` now drives compact/standard/cozy note density.


## 0.16.0

- One confirm-dialog style for every destructive action: title + subject (name and count) + consequence + an undo hint (`Ctrl+Z`, history clears on restart), with 取消 / 动作 buttons. Copy now says what actually happens — deleting a column moves its cards to the first column, and the old "cannot be undone" wording is gone because writes are undoable.

## 0.15.0

- Every confirmation now uses an in-panel themed dialog instead of `window.confirm` (which showed the raw Electron/Chromium box): deleting a board, removing a column, purging trash entries, clearing the trash, and replacing the document on import. The dialog follows the light/dark palette, closes on backdrop click or `Esc`, and confirms with `Enter`.

## 0.14.2

- Board deletion moved into each board tab: every tab carries its own `✕` (hidden while only one board remains, same confirmation).

## 0.14.0

- Light/dark theme pass: the decorative palette (accent, selection, success, danger, priority colours, hint text) now lives in `--sb-*` variables with a `[data-sb-scheme="light"]` override. The panel reads the Host theme service (`theme.getTheme()` / `theme/change`) and falls back to the OS `prefers-color-scheme` query.
- `npm run check:contrast`: parses both palettes out of `client.js` and enforces WCAG contrast against each scheme's background — it caught the dark danger colour failing at 4.28 before the fix.
- Render test asserts the root element carries the Host scheme (dark without a theme service, light when the service reports light).

## 0.13.0

- Multi-step undo/redo: the store keeps an in-memory history (default 30 steps) of every write, so `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`) undo/redo any change, not just the last soft delete. Restored documents get a fresh `rev` so pollers notice; a Host restart clears the history.
- New `POST history.undo` / `history.redo` actions and `sticky_board_manage` `undo`/`redo` actions; the `⋯` menu lists both with their shortcuts.

## 0.12.1

- Fixed the board-template menu never showing: the tab strip was a horizontal scroll container (`overflow-x: auto`), which clipped the absolutely positioned popover. The strip now wraps instead of scrolling, so the three/five/blank menu is visible; the render test clicks `＋` and asserts all three template items.

## 0.12.0

- Schema v2: cards carry a `checklist` of `{ id, text, done }`. v1 documents are read as v2 (cards get an empty checklist) and are written back as v2 on the next change.
- Drawer checklist editor: toggle, rename inline, remove, add; the section label shows progress (`3/5`) and the board card shows a `☑ 1/2` chip.
- Tools: `sticky_task_create` / `sticky_task_update` accept `checklist`; `sticky_task_list` prints progress.
- Tests: the render suite now drives real interaction against a stateful fake Host (tick an item, type + Enter to add one) and asserts the outgoing `card.update` payload.

## 0.11.0

- Board templates: the `＋` tab button opens a menu with three columns / five columns / blank; `POST board.add` accepts a `columns` array and the `sticky_board_manage` tool accepts `template: three|five|blank`.

## 0.10.0

- D1: one-way "sync note content" — the drawer pulls a linked note's title and lines onto its card while keeping the card's priority, labels, due date, done flag and column (`POST link.sync`, tool `sticky_note_sync_to_task`).
- Board filters: priority P0–P3, open-only, overdue-only and label substring, with an active-count badge and a clear action; filtering disables card dragging so insert positions stay unambiguous.

## 0.9.1

- Board rename now uses an inline input (pencil on the active tab, or double-click): Electron does not implement `window.prompt`, so the old rename did nothing.

## 0.9.0

- Interaction: card drop indicator line (before hovered card / at the end of a column), keyboard navigation (`←→↑↓`, `Enter` opens the drawer, `Space` toggles done, `Ctrl/Cmd+A` selects a column or the whole wall), batch recolour for selected notes.
- Drawer: description has an edit/preview toggle with a small Markdown subset, and the head shows when the Host saved the last change.
- Engineering: real React render smoke test (`test/client-render.test.mjs`, jsdom) covering registration, loading state, board render and clicking a card open the drawer; `scripts/lint-client.mjs` flags hook deps referencing later declarations (the bug that once blanked the panel); `scripts/pack-check.mjs` validates the shipped file set; this changelog.

## 0.8.6

- Drawer action row: outline style, 完成 green, 转为便签 blue, 删除 red; the done state thickens the green outline and adds `✓`.

## 0.8.5

- Drawer bottom actions became one row of three equal-width buttons.

## 0.8.4

- Fixed stale stylesheet after hot reload (`ensureCss` now rewrites the `<style>` text), which had left the selection bar unstyled and wrapped.

## 0.8.3

- Replaced native selects with self-drawn menus: the batch "移到" popover and P0–P3 priority segments; selection actions grouped into one bar.

## 0.8.2

- A single click on a card opens the detail drawer; modifier clicks only select.

## 0.8.1

- `Shift+click` range selection on the board stays inside one column.

## 0.8.0

- Board multi-select (`Ctrl/Cmd+click`, `Shift+click`), batch done / move-to-column / delete (`card.trashMany`).

## 0.7.1

- Notes got a height field (`h`, `null` = auto, 80–900 px); the corner handle resizes width and height.

## 0.7.0

- Small-window layout (toolbar wraps, adaptive column/drawer width), toasts with undo for soft deletes, note multi-select with batch pin / convert / delete; release prep (MIT LICENSE, `private: false`, `npm pack` check).

## 0.6.1

- 🔗 jumps scroll the target into view and flash it.

## 0.6.0

- Drag-to-edge auto scroll, poll dedup by `rev`, clickable 🔗 links (cross-board via `locate`).

## 0.5.0

- Trash multi-select and batch restore/purge (`trash.restoreMany` / `purgeMany`), fixed selection ring colour, flicker-free note dragging.

## 0.4.1

- Fixed a blank panel: the new effect deps referenced `activeBoardId` before its declaration (TDZ).

## 0.4.0

- Note/card selection with `Delete` / `Shift+Delete`; panel error boundary.

## 0.3.1

- Fixed column reorder index math and dragging while searching.

## 0.3.0

- Board/column drag reordering, import merge/replace, server-side search.

## 0.2.0

- Multiple boards, custom columns that survive reload, wall tidy, export/import, empty trash.

## 0.1.0

- First working plugin: sticky wall with drag/resize/colour/pin, three-column task board, wall↔board conversion, JSON store, HTTP route, 13 model tools.
