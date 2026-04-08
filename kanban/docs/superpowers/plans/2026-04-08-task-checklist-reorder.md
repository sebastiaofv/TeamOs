# Task Checklist Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow checklist items in the task edit modal to be reordered by drag and drop.

**Architecture:** Keep the change inside the existing checklist editor in `kanban.html`. Add a dedicated drag handle to each checklist row, track drag state only within the task modal checklist editor, and reorder by rebuilding the existing checklist row array before syncing it back to `#taskChecklist`. Use a focused Playwright regression to prove drag reorder persists after save.

**Tech Stack:** Single-file browser app in `kanban.html`, Playwright tests in `tests/app.test.js`, npm-based test runner

---

## File Structure

### Runtime

- Modify: `kanban.html`
  - Checklist editor row markup and styles
  - Checklist editor render/update helpers
  - Checklist drag state and drag/drop event handlers
  - Static event binding for the checklist editor container

### Tests

- Modify: `tests/app.test.js`
  - Add a focused task-modal checklist reorder regression

### Docs

- Spec reference: `docs/superpowers/specs/2026-04-08-task-checklist-reorder-design.md`

---

### Task 1: Add The Failing Checklist Reorder Regression

**Files:**
- Modify: `tests/app.test.js`
- Spec: `docs/superpowers/specs/2026-04-08-task-checklist-reorder-design.md`

- [ ] **Step 1: Add a focused Playwright test for checklist row reorder**

Add a new test near the other task modal editor tests that:

- seeds a task with at least three checklist items, for example:

```js
checklist: [
  { text: 'First', done: false },
  { text: 'Second', done: false },
  { text: 'Third', done: true }
]
```

- opens the task for edit with `editPortfolioTask('p1', 1)`
- verifies the initial visible row order in `#taskChecklistItems`
- drags one checklist row handle onto another row to move it
- verifies the visible row order changed immediately before save
- saves the task
- verifies the persisted task checklist order changed in `portfolioBoards[0].data.board.tasks`

Recommended assertion shape:

```js
const checklistTexts = await page.locator('#taskChecklistItems .checklist-editor-row input[type="text"]').evaluateAll((nodes) =>
  nodes.map((node) => node.value)
);
```

Use `dragTo()` on a dedicated drag-handle element, not on the text input.

- [ ] **Step 2: Run the focused checklist reorder test to verify it fails**

Run:

```bash
npm test -- --grep "checklist items can be reordered in the task modal"
```

Expected:

- FAIL because no drag handle exists yet
- or FAIL because dragging does not change visible or persisted checklist order

---

### Task 2: Implement Drag-And-Drop Reorder In The Checklist Editor

**Files:**
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-08-task-checklist-reorder-design.md`

- [ ] **Step 1: Add checklist row drag handle markup and styles**

Update `renderTaskChecklistEditor()` so each `.checklist-editor-row` includes:

- a dedicated handle element, for example a button or span with a class like `.checklist-editor-drag-handle`
- row-level metadata needed for reorder, such as `data-index`
- `draggable="true"` only on the handle, not on the entire row

Add focused styles for:

- the drag handle affordance
- row dragging state
- drop-target indicator on the row/container

Keep checkbox, text input, and remove button layout working as before.

- [ ] **Step 2: Add checklist reorder helpers**

Create small helpers around the existing DOM-driven checklist editor:

- read current checklist items
- move one item from source index to target index
- rerender rows in the new order
- resync `#taskChecklist`

Preferred helper shape:

```js
function moveTaskChecklistEditorItem(fromIndex, toIndex) {
  const items = readTaskChecklistEditorItems();
  // reorder array
  updateTaskChecklistEditor(items);
}
```

Guard against invalid indices and no-op moves.

- [ ] **Step 3: Add checklist drag state and drag/drop event handlers**

Add a small drag state object scoped to the checklist editor, for example:

```js
let taskChecklistDragState = { activeIndex: -1, targetIndex: -1 };
```

Implement container-level handlers for:

- `dragstart` from the drag handle
- `dragover` on checklist rows
- `drop` on checklist rows
- `dragend` / `dragleave` cleanup

Requirements:

- only drag handles start a drag
- dropping on another row reorders relative to that row
- after reorder, row indices are rebuilt by rerendering
- drag/drop visual state is cleared after completion

- [ ] **Step 4: Bind the new checklist drag/drop events**

In `bindStaticUiEvents()`, add the needed event listeners on `#taskChecklistItems`, for example:

- `dragstart`
- `dragover`
- `drop`
- `dragend`

Do not bind anything to `#detailChecklist`.

- [ ] **Step 5: Run the focused checklist reorder test to verify it passes**

Run:

```bash
npm test -- --grep "checklist items can be reordered in the task modal"
```

Expected:

- PASS
- visible row order changes before save
- persisted checklist order matches the new order

---

### Task 3: Verify Nearby Checklist Editing Behavior

**Files:**
- Modify: `kanban.html` only if focused verification exposes a regression
- Modify: `tests/app.test.js` only if focused verification exposes a regression gap

- [ ] **Step 1: Run the focused editor/checklist set**

Run:

```bash
npm test -- --grep "checklist items can be reordered in the task modal|assignee editor can edit and remove existing assignees before save|due date input uses native date picker and saves ISO to JSON"
```

Expected:

- PASS
- checklist reorder works
- existing modal editor behavior still works

- [ ] **Step 2: Commit if working on an isolated branch**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: reorder task checklist items"
```

Skip this step if execution is happening in a deliberately dirty checkout that is not ready for a commit.

---

## Local Review Checklist

- [ ] Checklist rows in the task modal have a dedicated drag handle.
- [ ] Dragging a handle reorders checklist rows immediately in the editor.
- [ ] Saving the task persists the reordered checklist sequence.
- [ ] Checkbox, text editing, and remove-item behavior still work.
- [ ] Detail modal checklist remains unchanged.

## Verification Commands

```bash
npm test -- --grep "checklist items can be reordered in the task modal"
npm test -- --grep "checklist items can be reordered in the task modal|assignee editor can edit and remove existing assignees before save|due date input uses native date picker and saves ISO to JSON"
```
