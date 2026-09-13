# Phase 2.1a — Task Detail, Roadmap Entity Modal and Undo Toast — Design

**Date:** 2026-09-13
**Status:** Approved (sections 1–5 reviewed in conversation)
**Parent spec:** `2026-09-13-phase2-foundation-react-bridge-design.md` (Phase 2 decomposition, rules for every sub-project, version-tick bridge). Its rules apply unchanged: DOM ids preserved, legacy CSS classes reused, screenshot baselines captured against legacy first, all tests green at every merge, a port deletes the legacy code it replaces, parity is the bar.

## Decisions taken for 2.1

| Question | Decision |
|---|---|
| Split of 2.1 | **Two sub-projects.** 2.1a (this spec): undo toast, task detail modal, roadmap entity modal. 2.1b (own spec, after 2.1a lands): the task editor modal with its assignee/tag/checklist/attachment editors. |
| How do data-backed dialogs get their data? | **Legacy builds a view model.** Legacy open functions compute a plain, display-ready object and call `openDialog(name, viewModel)`. Components render it and contain no domain logic. |
| How do components trigger legacy behaviour? | **Registered legacy host.** `src/actions/legacyHost.js` exports actions that delegate to implementations `src/legacy/main.js` registers at boot — the same pattern as `setPersistenceHost`. Components never import legacy. |

Rejected alternatives: deriving dialog data in components via extracted selectors (pulls the historical-preview projection and permission logic out of legacy in a modal-porting sub-project); importing helpers from `src/legacy/main.js` (couples components to the file 2.7 deletes); extracting the mutation core now (drags timeline recording, save queueing and renders out of legacy); DOM custom events between React and legacy (untyped, a third communication style).

## Files

```
src/
├─ actions/
│  ├─ dialogs.js                      # modified: openDialog(name, props), closeDialog(name?), flushSync on close
│  └─ legacyHost.js                   # new: setLegacyHost + delegating actions
├─ components/
│  ├─ AppIslands.jsx                  # modified: three more islands, onError per island
│  ├─ IslandErrorBoundary.jsx         # modified: optional onError
│  ├─ UndoToast.jsx                   # new
│  └─ dialogs/
│     ├─ TaskDetailDialog.jsx         # new
│     ├─ RoadmapEntityDialog.jsx      # new
│     └─ useReturnFocus.js            # modified: restore guard, optional initialFocus
├─ legacy/main.js                     # modified: view-model builders, host registration, deletions
└─ state/store.js                     # modified: dialogProps, undoToast
index.html                            # modified: three static blocks deleted
tests/
├─ support/portfolio.js               # new: helpers moved out of app.test.js
├─ app.test.js                        # modified: imports helpers; new behaviour tests
├─ visual.test.js                     # modified: 9 new baselines
└─ unit/
   ├─ dialogs.test.js                 # modified
   └─ legacyHost.test.js              # new
```

## 1. State and the legacy host

### State — `src/state/store.js`

- `activeDialog: null | 'shortcuts' | 'help' | 'taskDetail' | 'roadmapEntity'` — still one open dialog at a time, matching legacy, where shortcut contexts already prevent stacking.
- `dialogProps: null | object` — the view model of the open dialog.
- `undoToast: null | { message }`. `undoAction` and `undoTimer` stay.
- `portfolioDetailContext` and `roadmapEntityContext` stay. Legacy still reads them for shortcut `when` checks, refresh after mutations, and save.

### Dialog actions — `src/actions/dialogs.js`

```js
export function openDialog(name, props = null) {
    appState.activeDialog = name;
    appState.dialogProps = props;
    notifyAppStateChanged();
}

export function closeDialog(name) {
    if (appState.activeDialog === null) return;
    if (name !== undefined && appState.activeDialog !== name) return;
    appState.activeDialog = null;
    appState.dialogProps = null;
    flushSync(() => notifyAppStateChanged());
}
```

- Re-opening the dialog that is already open replaces `props` and notifies; the Radix root stays mounted, so focus and scroll are untouched. This is how the existing refresh calls (`openPortfolioTaskDetails` after task and board mutations) keep the detail modal current.
- `closeDialog(name)` is a no-op when a different dialog is open, so e.g. `closePortfolioContextsForProject` closing the detail modal cannot close a roadmap dialog.
- `flushSync` commits the unmount synchronously — see §4.1. It is valid only because `closeDialog` is never called during a React render (parent spec rule).

### Legacy host — `src/actions/legacyHost.js`

```js
const host = {
    closeTaskDetail: () => {},
    toggleTaskDetailChecklistItem: () => {},
    closeRoadmapEntity: () => {},
    saveRoadmapEntity: () => {},
    performUndo: () => {}
};

export function setLegacyHost(impl = {}) { Object.assign(host, impl); }

export const closeTaskDetail = () => host.closeTaskDetail();
export const toggleTaskDetailChecklistItem = (index, checked) => host.toggleTaskDetailChecklistItem(index, checked);
export const closeRoadmapEntity = () => host.closeRoadmapEntity();
export const saveRoadmapEntity = (draft) => host.saveRoadmapEntity(draft);
export const performUndo = () => host.performUndo();
```

Data-backed dialogs close through the host, never through `closeDialog()` directly: legacy's close functions clear `portfolioDetailContext` / `roadmapEntityContext` first. If Escape or an overlay click only cleared `activeDialog`, a later mutation of the same task would re-open the detail modal on its own (`runPortfolioTaskMutation` → `openPortfolioTaskDetails`).

## 2. View models and components

View models are plain objects built by legacy with display-ready values. Components render them and call actions.

### `TaskDetailDialog` — open when `activeDialog === 'taskDetail'`

View model:

```js
{
    readOnly: boolean,
    fields: {
        title, description, assignees, tags, blocked, blockerReason, priority, effort,
        status, createdAt, updatedAt, dueDate, phase, milestone, sprint
    },                                   // display strings, '-' already substituted
    checklist: [{ text, done }],
    attachments: [{ id, name, isImage, dataUrl, subLabel }]   // subLabel: "12 KB • text/plain"
}
```

- Markup is the legacy `#taskDetailModal` structure with all `#detail*` ids and `.detail-*` classes: Overlay `className="modal active" id="taskDetailModal"`, Content `.modal-content`, header title "Task Details" with `Dialog.Close#taskDetailModalCloseBtn`, `.detail-list` body, footer `Dialog.Close#taskDetailModalFooterCloseBtn`.
- Checklist: empty renders `<li class="detail-value">-</li>`; otherwise `li.detail-checklist-item` (plus `done`) with a checkbox controlled by `done`, `disabled` when `readOnly`, and `span.detail-checklist-text`. Change calls `toggleTaskDetailChecklistItem(index, checked)`. Legacy's mutation reaches `openPortfolioTaskDetails` synchronously, so the new view model arrives in the same tick.
- Attachments: empty renders `.detail-attachments-empty` with `-`; otherwise `.detail-attachment-item` rows with `img.detail-attachment-thumb` (images) or `span.attachment-editor-icon` "FILE", `.detail-attachment-meta` (name, sub), and `a.detail-attachment-download[download]` "Download".
- `onOpenChange(false)` → `closeTaskDetail()`.

### `RoadmapEntityDialog` — open when `activeDialog === 'roadmapEntity'`

View model:

```js
{
    kind, itemId, mode,                  // mode: 'default' | 'create-sprint-from-selection' | 'assign-sprint-from-selection'
    heading,                             // "New Milestone", "Edit Phase", "Create Sprint", "Add to Existing Sprint"
    saveLabel,                           // "Save Item" | "Add to Sprint"
    dateMode: 'single' | 'range',
    dateLabel,
    showExistingSprint: boolean,
    initial: { title, dueDate, startDate, endDate },
    sprintOptions: [{ value, label }],   // label: "Sprint 12 • <formatted range>", same as legacy
    initialFocus: 'title' | 'existingSprint'
}
```

- Form values live in local React state seeded from `initial`. Radix unmounts Content on close, so each open starts fresh; no reset code.
- Markup is the legacy `#roadmapEntityModal` structure with every id, including the hidden `#roadmapEntityKind` / `#roadmapEntityId` inputs. Row visibility toggles the `hidden` class exactly as legacy (`#roadmapEntityExistingSprintRow`, the title `.form-group`, `#roadmapEntitySingleDateRow`, `#roadmapEntityRangeRow`), so rows stay in the DOM. The select renders `<option value="">Select sprint</option>` followed by `sprintOptions`.
- Save button (`#roadmapEntityModalSaveBtn`, text `saveLabel`) calls `saveRoadmapEntity({ kind, itemId, title, existingSprintId, dueDate, startDate, endDate })`. Legacy owns validation, `alert()`s, focus-by-id and closing on success; ids are unchanged so its `getElementById(...).focus()` calls keep working.
- Cancel (`#roadmapEntityModalCancelBtn`), `×` (`#roadmapEntityModalCloseBtn`), Escape and overlay click → `closeRoadmapEntity()`.
- Initial focus matches legacy: `useReturnFocus({ initialFocus })` receives a ref to the title input or the sprint select; when given, it prevents Radix's default autofocus and focuses that element.
- `<form id="roadmapEntityForm" onSubmit={(e) => e.preventDefault()}>` as a safeguard; implicit submission is already blocked because the form has more than one field, and saving stays on the button.

### `UndoToast` — rendered when `appState.undoToast` is set

- `createPortal` into `document.body`: `<div class="undo-toast active" id="undoToast" style="pointer-events:auto"><span class="undo-toast-text" id="undoToastText">{message}</span><button class="btn" id="undoBtn">Undo</button></div>`. The Undo button calls `performUndo()`.
- A plain component, not Radix Toast — Radix Toast adds swipe, a viewport and `aria-live` that legacy does not have.
- Parity difference: when hidden, the element is absent rather than present without `.active`.

### `AppIslands`

Adds `UndoToast`, `TaskDetailDialog` and `RoadmapEntityDialog`, each in `IslandErrorBoundary` with an `onError` (see Error handling).

## 3. Legacy changes — `src/legacy/main.js`, `index.html`

### Task detail

- `openPortfolioTaskDetails(boardId, taskId, options)`: source lookup, read-only check and `portfolioDetailContext` stay. The `textContent` writes are replaced by `buildTaskDetailViewModel(source, readOnly)` + `openDialog('taskDetail', vm)`. The builder uses `normalizeTask`, `formatAssignees`, `normalizeTags`, `normalizeBlockerReason`, `formatDateTime`, `formatDueDateForUi`, `getRoadmapItemTitle`, `normalizeChecklist`, `normalizeAttachmentRecord` and `formatFileSize`, reproducing the current strings exactly (including priority capitalisation and `'-'` fallbacks). Historical-preview callers keep passing `boardData` / `readOnly`.
- `closeDetailModal()`: clears `portfolioDetailContext`, then `closeDialog('taskDetail')`. All existing callers are unchanged.
- `toggleChecklistItem(taskId, itemIndex, checked)` → `toggleChecklistItem(itemIndex, checked)`; it already resolves the task from the context.
- Deleted: `renderDetailChecklist`, `renderDetailAttachments`, `handleDetailChecklistChange` and its listener.

### Roadmap entity

- `openRoadmapEntityModal(kind, itemId, options)`: guards and `roadmapEntityContext` stay. DOM writes, class toggles and `.focus()` calls are replaced by building the view model + `openDialog('roadmapEntity', vm)`.
- `buildRoadmapSprintSelectionOptionMarkup(items, selectedId)` (sole caller is the function above) → `buildRoadmapSprintOptions(items)` returning `[{ value, label }]`.
- `saveRoadmapEntity()` → `saveRoadmapEntity(draft)`; `buildRoadmapEntityDraftFromForm` deleted. Validation, alerts, focus-by-id and all three modes unchanged.
- `closeRoadmapEntityModal()`: clears the context, then `closeDialog('roadmapEntity')`. `form.reset()` deleted.

### Undo

- `showUndo(message, undoFn)`: sets `undoAction`, `appState.undoToast = { message }`, notifies, restarts the 5 s timer.
- `hideUndo()`: clears the timer, `undoAction` and `undoToast`, notifies. `performUndo` unchanged.

### Shared

- `getShortcutModalContext`: `detailModalOpen = appState.activeDialog === 'taskDetail'`; `roadmapEntityModalOpen = appState.activeDialog === 'roadmapEntity'`. `taskModalOpen` still reads the DOM until 2.1b. Precedence unchanged.
- Next to `setPersistenceHost`: `setLegacyHost({ closeTaskDetail: closeDetailModal, toggleTaskDetailChecklistItem: toggleChecklistItem, closeRoadmapEntity: closeRoadmapEntityModal, saveRoadmapEntity, performUndo })`.
- Deleted listeners: `#taskDetailModalCloseBtn`, `#taskDetailModalFooterCloseBtn`, `#roadmapEntityModalCloseBtn`, `#roadmapEntityModalCancelBtn`, `#roadmapEntityModalSaveBtn`, `#undoBtn`, `#detailChecklist` change, overlay clicks on `#taskDetailModal` and `#roadmapEntityModal`. `Refs.taskDetailModal` deleted.
- `index.html`: static `#taskDetailModal`, `#roadmapEntityModal` and `#undoToast` blocks deleted.

### Notify audit (scoped)

2.1a islands read only `activeDialog`, `dialogProps` and `undoToast`, written exclusively through `openDialog`, `closeDialog`, `showUndo` and `hideUndo`, all of which notify. No other legacy code needs to notify for 2.1a. The broader audit of state mutated outside `renderPortfolio()` is required in 2.1b and 2.2, when islands read board and chip state.

## 4. Focus, keyboard and edge cases

1. **Edit from detail keeps focus in the task editor.** `editPortfolioTask` calls `closeDetailModal()` then synchronously focuses `#taskName`. Without a synchronous commit, Radix's focus trap is still mounted and pulls focus back, and focus ends on `body` after unmount. `closeDialog` commits with `flushSync`, so Content is gone before legacy focuses.
2. **Focus return never steals focus.** Radix fires `onCloseAutoFocus` in a timeout after unmount. `useReturnFocus` restores the captured element only when `document.activeElement` is `body` or `null` (focus was lost by the unmount) **and** the captured element `isConnected`. Cards are re-rendered by `renderPortfolio` before details open, so the capture is often gone; focus then stays on `body`, as in legacy.
3. **Undo toast stays usable over an open dialog.** Legacy's toast sits above modals (z-index 1200 vs 1000) and clicking it does not close them. Radix modals set `pointer-events: none` on `body` and treat outside pointer-downs as dismissal. The toast root sets `pointer-events: auto`, and both data dialogs' `onPointerDownOutside` call `event.preventDefault()` when the target is inside `#undoToast`. Radix `aria-hidden` on the toast while a modal is open is an accepted difference.
4. **Escape and single-key shortcuts.** Radix's capture-phase Escape runs first → `closeTaskDetail()` / `closeRoadmapEntity()` clears the context and `activeDialog`; the legacy dispatcher then resolves `global`, where Escape does nothing. `e` / `x` in detail resolve through the `detailModal` context derived from `activeDialog`.
5. **Crashed dialog island.** `IslandErrorBoundary` accepts `onError`; data dialogs pass their host close action, Help/Shortcuts pass `() => closeDialog(name)`. Otherwise a failed island leaves `activeDialog` set and every global shortcut suppressed.
6. **Refresh while open.** Checklist toggles, archive, timeline and board changes re-run `openPortfolioTaskDetails` or `closeDetailModal`; replacing the view model keeps the Radix root mounted.

## Error handling

- `IslandErrorBoundary`: logs `Logger.error('React island failed', { island, error })`, renders `null`, then calls `onError?.()` so the failed dialog's state is cleared.
- Legacy host defaults are no-ops, so actions called before registration (not possible in the app, possible in unit tests) do nothing rather than throw.
- Legacy validation and permission failures keep their existing `alert()` behaviour.

## Testing

### Shared helpers — `tests/support/portfolio.js` (first, standalone)

Move `buildBoardPayload` (with its constants and `buildTaskPayload` / `buildDefaultColumns`), `gotoApp`, `seedPortfolioBoards`, `selectPortfolioBoard`, `portfolioBoardChip`, `escapeForRegExp`, `portfolioCard`, `readSavedBoard`, `waitForBoardWrites`, `focusIsInside` and `closeDialogBy` into a CommonJS module imported by `app.test.js` and `visual.test.js`. Pure move; all 105 Playwright tests stay green. The file does not match `*.test.js`, so it is not collected. `closeDialogBy` gains a `'cancel button'` method (`#<dialogId>CancelBtn`).

### Screenshot baselines — `tests/visual.test.js`

Captured against **legacy** before any port code; the ports must match. A new `describe` uses `test.use({ locale: 'en-US', timezoneId: 'UTC' })` because `formatDateTime` uses `toLocaleString`. Boards are seeded with fixed timestamps; dialogs are opened by mouse (2.0 no-focus-ring rule). Viewport 1280×800, full page, threshold from `playwright.config.js`.

| Baseline | Theme |
|---|---|
| Task detail, fully populated (all fields, 3-item checklist with some done, image + text attachment) | light, dark |
| Task detail, read-only board (disabled checkboxes, no attachments) | light |
| Roadmap entity — New Milestone (single date) | light, dark |
| Roadmap entity — Edit Phase (prefilled range) | light |
| Roadmap entity — Add to Existing Sprint | light |
| Undo toast visible after archiving a task | light, dark |

The toast baseline uses `page.clock.install` so the 5 s hide timer cannot fire before capture. The existing 5 baselines are unchanged.

### Behaviour — `tests/app.test.js`

Unchanged and must pass: every existing detail, roadmap, sprint and undo test, including "archiving a task can be undone from the toast", "read-only task detail keyboard shortcuts do not open edit or mutate", "opening edit from task detail closes the detail modal (no modal stacking)", "checked board tasks can be grouped into a new sprint", "checked board tasks can be added to an existing sprint from the bulk action bar", "roadmap rows can create and delete milestones while clearing task refs", "editing an existing roadmap item preserves its ID", "historical roadmap task rows open the detail modal with projected read-only data", "task detail modal scrolls when content exceeds the viewport", "roadmap entity modal traps shortcut context and Escape closes it" and "card keyboard shortcuts support selection, move, open details, and edit/save".

New (each fails against legacy first where behaviour differs):

1. Detail modal: opening moves focus inside; closing by Escape, `×`, footer Close and overlay click removes it from the DOM.
2. Detail context is cleared on close: close the modal, archive the same task from its card — the detail modal does not re-open.
3. Checklist toggle from detail persists to disk, updates the checkbox and `.done`, and the modal stays open.
4. `e` from detail focuses `#taskName` with its text selected.
5. `x` from detail → confirm → click Undo in the toast: the task is unarchived on disk and the detail modal is still open.
6. Roadmap entity initial focus: Add Milestone focuses `#roadmapEntityTitle`; Add to Existing Sprint focuses `#roadmapEntityExistingSprint`.
7. Roadmap entity closing by Cancel, `×`, Escape and overlay click removes it; reopening Add Milestone shows empty fields.
8. Roadmap validation: saving a milestone without a date raises the existing alert, focuses `#roadmapEntityDate` and keeps the modal open.
9. Undo toast is removed from the DOM after clicking Undo.

### Unit — Vitest (node)

- `tests/unit/dialogs.test.js`: `openDialog(name, props)` sets `dialogProps`; re-opening replaces props and notifies; `closeDialog(name)` with a non-matching name neither closes nor notifies; `closeDialog` clears `dialogProps`. Existing cases stay.
- `tests/unit/legacyHost.test.js`: actions are no-ops before registration; after `setLegacyHost`, each action passes its arguments through and returns the registered return value.
- No jsdom component tests; components and `useReturnFocus` are covered by Playwright.

### Suggested task order

1. Move test helpers. 2. Capture legacy baselines. 3. State, `dialogs.js`, `legacyHost.js`, `useReturnFocus` guard/initialFocus, `IslandErrorBoundary` `onError`. 4. Port undo toast. 5. Port roadmap entity modal. 6. Port task detail modal. Each ends with unit, build and the full Playwright suite green.

## Risks

1. **`flushSync` inside Radix dismissal handlers.** Radix calls `onOpenChange` from native document listeners, not React lifecycles, so `flushSync` is permitted; a React warning in the console would indicate otherwise and fails the task.
2. **View-model string drift.** The builder must reproduce legacy strings exactly (`toLocaleString` dates, `dd/mm/yyyy` due dates, priority capitalisation, attachment sub-labels). The populated detail baseline and existing assertions on `#detailTitle` etc. catch drift.
3. **Stale legacy contexts.** Any close path that bypasses the legacy close functions leaves a context set. Guarded by new test 2 and by routing every React close through the host.
4. **Radix modal side effects** (scroll lock, `aria-hidden`, `pointer-events`) beyond the toast case are accepted, as in 2.0; macOS baselines do not show scrollbar-gap shifts on platforms with classic scrollbars.

## Out of scope for 2.1a

The task editor modal and its sub-editors (2.1b); the broader notify audit (2.1b/2.2); toolbar, chips, views; Zustand; dnd-kit; Tailwind; the chip "Unsaved"/"Saving" quirk.
