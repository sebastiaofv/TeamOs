# Phase 2.1b — Task Editor Modal — Design

**Date:** 2026-09-13
**Status:** Approved (sections 1–4 reviewed in conversation)
**Parent specs:** `2026-09-13-phase2-foundation-react-bridge-design.md` (decomposition, rules for every sub-project, version-tick bridge) and `2026-09-13-phase2-1a-detail-roadmap-undo-design.md` (view-model dialogs, legacy host, `flushSync` close, `useReturnFocus` guard). Their rules apply unless an exception below says otherwise.

## Decisions taken for 2.1b

| Question | Decision |
|---|---|
| Where does the form draft live while the editor is open? | **React.** Legacy builds a view model with initial values and option lists; the component owns the draft; Save hands a finished draft to legacy's `saveTask(draft)`. |
| Where do the editing rules live? | **`src/domain/taskDraft.js`**, as pure functions with Vitest coverage. Components call them; they contain no rules of their own. |
| Checklist drag and drop | **Native HTML5 drag, re-implemented in React.** dnd-kit stays in 2.4 as planned; the existing reorder test keeps passing unchanged. |

Rejected: keeping the draft in `appState` with a host action per keystroke (builds a large seam that 2.7 has to delete); splitting ownership per editor (two patterns in one dialog).

### Exceptions to the Phase 2 rules

1. **Dropped ids.** The hidden `#taskAssignee`, `#taskTags`, `#taskChecklist` textareas and `#taskId` are not reproduced. They only passed data between legacy functions; no test or other code reads them, and `#taskId` was always empty.
2. **Legacy index bug not ported.** Legacy removes blank checklist rows (and blank assignee rows) before resolving a row by its rendered index, so after clearing one row's text, toggling or removing a later row acts on the wrong row. The React editors act on the row that was clicked; blank rows are dropped when the draft is built.
3. **Tag suggestions in create mode.** Legacy shows no tag suggestions for a new task until the first tag is added. The React editor shows the board's tags from the start.

## Files

```
src/
├─ domain/taskDraft.js                    # new: pure editing rules
├─ actions/legacyHost.js                  # modified: closeTaskEditor, saveTask(draft)
├─ components/
│  ├─ AppIslands.jsx                      # modified: TaskEditorDialog island
│  └─ dialogs/
│     ├─ TaskEditorDialog.jsx             # new: shell, plain fields, footer, Ctrl/Cmd+Enter
│     ├─ useReturnFocus.js                # modified: optional select of the initial-focus field
│     └─ taskEditor/
│        ├─ AssigneeEditor.jsx            # new
│        ├─ TagEditor.jsx                 # new
│        ├─ ChecklistEditor.jsx           # new
│        └─ AttachmentsEditor.jsx         # new
├─ legacy/main.js                         # modified: view-model builder, host registration, deletions
└─ state/store.js                         # modified: 'taskEditor' dialog; three task-modal fields removed
index.html                                # modified: static #taskModal block deleted
tests/
├─ app.test.js                            # modified: new behaviour tests
├─ visual.test.js                         # modified: new baselines
└─ unit/
   ├─ taskDraft.test.js                   # new
   ├─ legacyHost.test.js                  # modified
   └─ dialogs.test.js                     # modified
```

## 1. Data flow

1. `editPortfolioTask(boardId, taskId)` and `openPortfolioCreateTaskModal(boardId, preferredStatus, options)` keep their guards, `closeDetailModal()`, context assignment and `pendingNewTaskStatus` handling. Their DOM writes are replaced by `openDialog('taskEditor', buildTaskEditorViewModel(...))`.
2. `TaskEditorDialog` seeds local state from `vm.initial`. The form is keyed by `vm.openId`, so every open starts fresh.
3. Save (button or Ctrl/Cmd+Enter) calls `saveTask(buildTaskDraft(form))`. The draft has exactly the shape `readTaskDraftFromForm` returns today.
4. Legacy `saveTask(draft)` is unchanged apart from where the draft comes from: `TaskFormValidator`, `alert()`, `focusFieldById`, timeline recording, save queue, render, and `closeTaskEditor()` on success.
5. Every close path — Escape, `×`, Cancel, overlay click, and legacy callers — goes through `closeTaskEditor()`, which clears `pendingNewTaskStatus`, `portfolioEditContext` and `portfolioCreateContext`, then calls `closeDialog('taskEditor')`.

### State — `src/state/store.js`

- `activeDialog` gains `'taskEditor'`.
- Removed: `taskModalAttachmentDraft`, `taskModalAttachmentMessages`, `taskChecklistDragState`.
- `pendingNewTaskStatus`, `portfolioEditContext`, `portfolioCreateContext` stay; legacy save and shortcut code reads them.

### Legacy host — `src/actions/legacyHost.js`

Adds, with no-op defaults:

```js
export const closeTaskEditor = () => host.closeTaskEditor();
export const saveTask = (draft) => host.saveTask(draft);
```

## 2. Pure rules — `src/domain/taskDraft.js`

| Function | Behaviour (matches legacy) |
|---|---|
| `addAssignee(items, name)` | Trims; ignores empty; case-insensitive duplicate returns `items` unchanged; otherwise appends. |
| `addTag(items, raw)` | Trims and lowercases; empty returns `{ items }` unchanged. Returns `{ error }` with `'Tags must be 30 characters or fewer.'` (> 30), `'This tag is already added.'`, `'A task can have at most 10 tags.'` (≥ 10 existing), checked in that order; otherwise `{ items: [...items, tag] }`. |
| `addChecklistItem(items, text)` | Trims; ignores empty; appends `{ text, done: false }`. |
| `moveChecklistItem(items, from, to, placement)` | Same index arithmetic as legacy `moveTaskChecklistEditorItem`: remove at `from`, insert at `to` (+1 if `'after'`, −1 if `from < to`), clamped. Returns `items` unchanged for equal or out-of-range indices. |
| `mergePickedAttachments(existing, files, { readFile, now, createId })` | Async. Stops at `ATTACHMENT_MAX_COUNT` with `Attachment limit reached (10 per task).`; skips files over `ATTACHMENT_HARD_MAX_BYTES` with `<name> exceeds the 10 MB limit.`; skips duplicates (`attachmentDuplicateKey`) with the warning `<name> is already attached and was skipped.`; read failures produce `<name>: <message>`. Builds records exactly as `handleTaskAttachmentsInputChange` does. Returns `{ attachments, messages }`. |
| `buildAttachmentWarnings(attachments, otherAttachmentBytes)` | Per-file soft warning, per-task total warning and project estimate warning with the legacy texts and thresholds. |
| `buildTaskDraft(form)` | Returns `{ title, description, assignees, tags, blocked, blockerReason, checklist, attachments, rawDueDate, dueDate, priority, effort, phaseId, milestoneId }` using `normalizeAssignees`, `normalizeBlockerReason`, `normalizeChecklist`, `normalizeAttachmentRecord`, `normalizeDueDate`, `normalizePriority`, `normalizeEffort`, `normalizeRoadmapRef`, with trimmed title, description and raw due date. |

## 3. View model and components

### View model — `buildTaskEditorViewModel(boardRecord, task, options)` in legacy

```js
{
    openId,                         // incremented on every open
    heading,                        // 'New Task' | 'Edit Task'
    initial: {
        title, description, blocked, blockerReason,
        assignees: string[], tags: string[],
        checklist: [{ text, done }],
        attachments: AttachmentRecord[],
        dueDate, priority, effort, phaseId, milestoneId      // '' when unset
    },
    phaseOptions: [{ value, label }],
    milestoneOptions: [{ value, label }],
    assigneePool: string[],         // getTaskAssigneeSuggestions([])
    tagSuggestions: string[],       // getBoardTagSuggestions(boardRecord.data)
    otherAttachmentBytes: number    // calculateBoardAttachmentBytes(board, { excludeTaskId })
}
```

Edit mode fills `initial` exactly as `editPortfolioTask` fills the form today (`normalizeTask`, `normalizeTags`, `normalizeBlockerReason`, `normalizeChecklist`, `getTaskAttachments`, `normalizeDueDate`, `normalizePriority`, `normalizeEffort`). Create mode leaves everything empty except `dueDate = normalizeDueDate(options.preferredDueDate || '')`. `populateTaskRoadmapSelectors` and `buildRoadmapEntityOptionMarkup` are replaced by `buildRoadmapEntityOptions(items)` returning `[{ value, label }]`.

### `TaskEditorDialog` — open when `activeDialog === 'taskEditor'`

- Markup reproduces the legacy `#taskModal` block: Overlay `className="modal active" id="taskModal"`, Content `.modal-content`, `Dialog.Title` as `span.modal-title#modalTitle`, `Dialog.Close.modal-close#taskModalCloseBtn`, `form#taskForm` with the same `.form-group` / `.form-row` order, footer `Dialog.Close.btn#taskModalCancelBtn` and `button.btn.btn-primary#taskModalSaveBtn` "Save Task".
- Controlled plain fields: `#taskName` (`required`, `maxLength={80}`), `#taskDescription`, `#taskBlocked`, `#taskBlockerReason` (placeholder unchanged), `#taskDueDate` (`type="date"`), `#taskPriority`, `#taskEffort`, `#taskPhase`, `#taskMilestone` (each select starts with `None`).
- Blocked: `#taskBlockerReasonWrap` has `hidden` when not blocked. Unchecking clears the reason. Checking focuses `#taskBlockerReason` in `requestAnimationFrame`.
- Focus on open: `useReturnFocus({ initialFocus: nameRef, selectInitial: true })` focuses and selects `#taskName`. This replaces `focusAndSelectTaskNameInput()`, which cannot work because Content is not yet mounted when legacy calls `openDialog`.
- `onKeyDown` on Content: Ctrl/Cmd+Enter (no Alt) → `preventDefault()` and save. React's portal listener runs before legacy's `document` listener. The legacy `save-task-modal` registry entry stays so the Shortcuts dialog still lists it; its handler becomes a no-op with a comment pointing at the component.
- `onPointerDownOutside={keepOpenOnUndoToast}`; `onOpenChange(false)` → `closeTaskEditor()`.
- `<form onSubmit={(e) => e.preventDefault()}>` as a safeguard.

### Editors — `components/dialogs/taskEditor/`

Each takes `value`, `onChange` and its suggestion data, and reuses legacy classes, aria-labels and composer ids.

- **`AssigneeEditor`** — `#taskAssigneeEditor` > `#taskAssigneeItems` with editable `.assignee-editor-row` text inputs (`list="taskAssigneeSuggestions"`, aria-label "Assignee name") and `.assignee-editor-remove` (aria-label "Remove assignee", title "Remove", text `×`); empty state `.assignee-editor-empty` "No assignees yet.". Composer `#taskAssigneeNewItem` + `#taskAssigneeAddBtn`: Enter or Add → `addAssignee`, clear and refocus the composer. `datalist#taskAssigneeSuggestions` = `assigneePool` minus current names (case-insensitive), recomputed on every edit.
- **`TagEditor`** — `#taskTagEditor` > `#taskTagItems` with `.tag-editor-row` (`span` + `.tag-editor-remove`, aria-label "Remove tag"); empty state `.tag-editor-empty` "No tags yet.". Composer `#taskTagNewItem` + `#taskTagAddBtn`: `addTag` → on `error`, `alert(error)` and keep the composer text; otherwise clear and refocus. `datalist#taskTagSuggestions` = `tagSuggestions`.
- **`ChecklistEditor`** — `#taskChecklistEditor` > `#taskChecklistItems` with `.checklist-editor-row` (plus `done`) containing `.checklist-editor-drag-handle` (`draggable`, text `::`), checkbox, text input and `.checklist-editor-remove`, all with the legacy aria-labels and titles; empty state `.checklist-editor-empty` "No todo items yet.". Composer `#taskChecklistNewItem` + `#taskChecklistAddBtn`. Drag: `onDragStart` on the handle records the active index and sets `dataTransfer`; `onDragOver` on a row computes placement with `getTaskChecklistDropPlacement` and `preventDefault`s; `onDrop` calls `moveChecklistItem`; `onDragEnd` resets. `dragging`, `drag-over-before`, `drag-over-after` come from local drag state.
- **`AttachmentsEditor`** — `#taskAttachmentsEditor` with toolbar (`#taskAttachmentsAddBtn` clicks the hidden `input[type=file]#taskAttachmentsInput[multiple]`, `#taskAttachmentsSummary` "No attachments" or `N / 10 • <size>`), `#taskAttachmentsWarnings` (picker messages then `buildAttachmentWarnings`, as `.attachment-editor-error` / `.attachment-editor-warning`), `#taskAttachmentsList` (`.attachment-editor-item` with `img.attachment-editor-thumb` or `span.attachment-editor-icon` "FILE", `.attachment-editor-meta` name/sub, `.attachment-editor-actions` with `a.attachment-editor-download[download]` and `button.attachment-remove-btn`, aria-label `Remove attachment <name>`); empty `.attachment-editor-empty` "No attachments yet.". File change → clear the input value, `mergePickedAttachments` → replace attachments and messages. Remove → filter by id and clear picker messages. A pick that resolves after unmount is ignored (mounted ref).

### `AppIslands`

Adds `TaskEditorDialog` in `IslandErrorBoundary` with `onError={() => closeTaskEditor()}`.

## 4. Legacy changes — `src/legacy/main.js`, `index.html`

- `closeModal()` → `closeTaskEditor()` as described in §1; callers updated (timeline clear/restore, `closePortfolioContextsForProject`, `saveTask`, Escape shortcut).
- `saveTask()` → `saveTask(draft)`. `TaskFormValidator` stays; its `beforeAlert: syncTaskBlockedReasonVisibility` is removed because the reason row is always visible while blocked.
- `getShortcutModalContext`: `taskModalOpen = appState.activeDialog === 'taskEditor'`. No context reads the DOM any more.
- `setLegacyHost` adds `closeTaskEditor` and `saveTask`.
- Deleted: all assignee editor functions and handlers (`getTaskAssigneeEditorRowsContainer` … `removeTaskAssigneeEditorItem`, `handleTaskAssigneeEditorClick/Input`); `renderTagEditor`, `readTagEditorItems`, `addTaskTagFromComposer`, `handleTagEditorClick`; all `*TaskChecklistEditor*` functions, `resetTaskChecklistDragState`, `renderTaskChecklistDragState`, `moveTaskChecklistEditorItem`, `addTaskChecklistItem*`, and the drag handlers; `syncTaskBlockedReasonVisibility`, `onTaskBlockedChange`; `getTaskModalAttachmentsDraft`, `getTaskModalAttachmentContext`, `getTaskModalAttachmentDerivedMessages`, `setTaskModalAttachmentDraft`, `resetTaskModalAttachmentDraft`, `renderTaskAttachmentsEditor`, `triggerTaskAttachmentsPicker`, `removeTaskModalAttachment`, `handleTaskAttachmentsInputChange`, `handleTaskAttachmentsEditorClick`; `readTaskDraftFromForm`, `focusAndSelectTaskNameInput`, `renderTaskAssigneeSuggestions`, `populateTaskRoadmapSelectors`; `Refs.taskModal`; the task-modal listeners in `bindStaticUiEvents`. `getTaskAssigneeSuggestions` and `focusFieldById` stay.
- `index.html`: the static `#taskModal` block is deleted.

## 5. Edge cases

1. **Edit from detail.** `closeDetailModal()` commits synchronously (`flushSync`), then `openDialog('taskEditor')`; one dialog at a time; initial focus selects `#taskName`.
2. **Escape.** Radix's capture-phase Escape → `closeTaskEditor()`; legacy's dispatcher then resolves `global`, where Escape does nothing.
3. **Typing.** The `taskModal` context only contains Save and Escape, so single-key shortcuts stay suppressed.
4. **Validation.** Legacy `alert()` then `getElementById(focusFieldId).focus()` works on the React inputs; the dialog stays open and the draft is kept.
5. **Double save.** Legacy has no guard; none is added.
6. **External close.** Project unload or timeline restore calls `closeTaskEditor()`; the unsaved draft is discarded, as in legacy.
7. **Late attachment read.** Ignored after unmount.
8. **Crashed island.** `onError` → `closeTaskEditor()`, so shortcuts are not left suppressed.
9. **Return focus.** `useReturnFocus` restores only when focus fell to `body` and the captured element is connected (2.1a rule).

## Error handling

- Validation keeps `alert()`; tag errors keep `alert()`.
- File read failures become picker messages with the legacy text.
- Host defaults are no-ops before registration.
- `IslandErrorBoundary` logs and closes the editor through `onError`.

## Testing

### Screenshot baselines — `tests/visual.test.js`

Captured against **legacy** before any port code, in `describe('2.1b task editor')` with `test.use({ locale: 'en-US', timezoneId: 'UTC' })`. Focus is moved to `body` before capture so the caret and focus ring cannot flake.

| Baseline | Theme |
|---|---|
| New task, empty (from the backlog Add Task card) | light, dark |
| Edit task, populated: blocked + reason, 2 assignees, 2 tags, 3-item checklist with one done, phase, milestone, due date, priority, effort | light, dark |
| Edit task, scrolled to attachments: image + text attachment and the oversized-file error | light |
| Checklist mid-drag: `dragging` and `drag-over-before` visible | light |

If the mid-drag state cannot be captured reliably, that baseline is dropped and the plan records why.

### Behaviour — `tests/app.test.js`

Every existing test that opens the task editor must pass unchanged, including the assignee, tag, checklist reorder, attachment, blocked, due date, phase/milestone, keyboard shortcut, edit-from-detail and timeline/save tests.

New (tests that fail on legacy are marked `test.fixme` until the switch-over commit):

1. Closing by Escape, `×`, Cancel and overlay click removes `#taskModal`; reopening Add Task shows empty fields and "New Task".
2. Ctrl+Enter while typing in `#taskDescription` saves the task to disk and closes the editor.
3. Checking Blocked focuses `#taskBlockerReason`; unchecking and re-checking shows an empty reason.
4. Clearing a checklist row's text, then removing the next row, removes that next row. *(fails on legacy — exception 2)*
5. Renaming assignee "Alex" to "Jamie" in an existing row brings "Alex" back into `#taskAssigneeSuggestions`.
6. After an oversized pick shows its error, removing an attachment clears the error.
7. With the undo toast visible, opening the editor and clicking Undo keeps the editor open.
8. Creating a task from the calendar prefills `#taskDueDate`.
9. A new task lists the board's tags in `#taskTagSuggestions` before any tag is added. *(fails on legacy — exception 3)*

### Unit — Vitest (node)

- `tests/unit/taskDraft.test.js`: every function in §2, including all three tag errors, move arithmetic in both directions and both placements, count/size/duplicate/read-failure paths and data-URL size estimation, the three warning thresholds, and `buildTaskDraft` trimming and normalisation.
- `tests/unit/legacyHost.test.js`: `closeTaskEditor` and `saveTask` are no-ops before registration and pass through after.
- `tests/unit/dialogs.test.js`: opening and closing `'taskEditor'`.
- No jsdom component tests.

### Task order

1. Capture legacy baselines; add new behaviour tests (`test.fixme` where they fail on legacy).
2. `taskDraft.js`, test-first.
3. State, host actions, `useReturnFocus` `selectInitial`.
4. Build `TaskEditorDialog` and the four editors **without mounting them**.
5. Switch-over commit: mount the island, switch legacy openers/closers/save to the view model and host, delete the legacy code and the `#taskModal` block, un-fixme the new tests.
6. README update and plan deviations.

Each task ends with `npm run test:unit`, `npm run build` and the full Playwright suite green. Nothing is rendered by both legacy and React at any commit.

## Risks

1. **Native drag inside a Radix dialog.** Radix's focus trap and `pointer-events` handling could interfere with HTML5 drag events. The existing reorder test catches it; fallback is dnd-kit for the checklist now, which would be recorded as a deviation.
2. **Draft shape drift.** `buildTaskDraft` must match `readTaskDraftFromForm` exactly or saves change. Guarded by unit tests and the save-to-disk assertions in the existing suite.
3. **Focus timing.** Validation focus-by-id and blocked-reason focus rely on ids being in the DOM at call time; both happen after the dialog is mounted.
4. **Large file switch-over.** Step 5 touches many call sites at once. Mitigation: steps 1–4 land first so step 5 is wiring and deletion only.

## Out of scope for 2.1b

Toolbar, chips and views (2.2+); dnd-kit (2.4, unless risk 1 forces it); Zustand; Tailwind; the chip "Unsaved"/"Saving" quirk.
