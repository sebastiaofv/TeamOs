# Phase 2.1b — Task Editor Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-1b-task-editor-design.md`

**Goal:** Port the task editor modal (`#taskModal`) and its assignee, tag, checklist and attachment editors from legacy DOM code to React on Radix Dialog, pixel-identical to legacy, with the form draft owned by React and validation/saving still owned by legacy.

**Architecture:** Legacy openers build a view model (initial values + option lists) and call `openDialog('taskEditor', vm)`. `TaskEditorDialog` keeps the draft in React state, keyed by `vm.openId`; editing rules are pure functions in `src/domain/taskDraft.js`. Save hands `buildTaskDraft(form)` to legacy through `src/actions/legacyHost.js`; every close path goes through `closeTaskEditor()`, which clears legacy contexts before `closeDialog('taskEditor')`.

**Tech Stack:** Vite 5, React 19, `@radix-ui/react-dialog` 1.1, Vitest 2 (node), Playwright 1.52 (CJS test files).

## Global Constraints

- DOM ids are preserved exactly: `#taskModal`, `#modalTitle`, `#taskModalCloseBtn`, `#taskForm`, `#taskName`, `#taskDescription`, `#taskBlocked`, `#taskBlockerReasonWrap`, `#taskBlockerReason`, `#taskAssigneeEditor`, `#taskAssigneeItems`, `#taskAssigneeNewItem`, `#taskAssigneeAddBtn`, `#taskAssigneeSuggestions`, `#taskTagEditor`, `#taskTagItems`, `#taskTagNewItem`, `#taskTagAddBtn`, `#taskTagSuggestions`, `#taskChecklistEditor`, `#taskChecklistItems`, `#taskChecklistNewItem`, `#taskChecklistAddBtn`, `#taskAttachmentsEditor`, `#taskAttachmentsAddBtn`, `#taskAttachmentsSummary`, `#taskAttachmentsWarnings`, `#taskAttachmentsList`, `#taskAttachmentsInput`, `#taskDueDate`, `#taskPriority`, `#taskEffort`, `#taskPhase`, `#taskMilestone`, `#taskModalCancelBtn`, `#taskModalSaveBtn`.
- **Approved exceptions:** `#taskAssignee`, `#taskTags`, `#taskChecklist` (hidden textareas) and `#taskId` are not reproduced.
- Ported markup reuses the existing `legacy.css` class names and structure. No Tailwind classes.
- Screenshot baselines for this sub-project are captured against **legacy** in Task 1; the port must match them. Never run `--update-snapshots` after Task 1. Existing baselines never change.
- Nothing is rendered by both legacy and React at any commit. The switch-over (Task 4) mounts the island and deletes the legacy code in one commit.
- Parity is the bar, except the three approved exceptions in the spec (dropped ids; the blank-row index bug is not ported; tag suggestions show from the start in create mode).
- Components never import `src/legacy/main.js`. Nothing is exposed on `window`.
- `notifyAppStateChanged()` and `closeDialog()` are never called during a React render or lifecycle method.
- Tests are black-box: Playwright drives the page only through DOM, URL, keyboard and pointer input plus the existing fake-disk doubles.
- Every task ends with `npm run test:unit`, then `npm run build && npm test`, all passing (tests marked `test.fixme` count as skipped). Stage explicit paths (never `git add -A`).
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Facts the tasks rely on

- Work happens on branch `phase2/modals-b` (already created; the spec is committed there).
- Playwright serves `dist/` via `npm run preview` on `127.0.0.1:4173` with `reuseExistingServer: true`. **Always `npm run build` before Playwright**, and make sure nothing stale is listening on 4173 (`lsof -iTCP:4173 -sTCP:LISTEN`).
- Starting counts: Vitest **836** tests (13 files), Playwright **132** tests.
- `src/legacy/main.js` is one ES module; its functions are module-level, indented 8 spaces. Line numbers below are approximate — find code by content.
- `tests/app.test.js` wraps every test in `test.describe('portfolio-only app', ...)` (line ~156) whose `beforeEach` loads the app; the describe closes on the file's last `});`. It has a local helper `openTaskEditor(page, cardTitle)` that clicks the card's `[data-action="edit-task"]` and waits for `#taskModal`. Shared helpers come from `tests/support/portfolio.js`: `seedPortfolioBoards`, `portfolioCard`, `waitForBoardWrites`, `readSavedBoard`, `focusIsInside`, `closeDialogBy(page, dialogId, 'Escape' | 'close button' | 'footer button' | 'cancel button' | 'overlay click')`. The fake disk is `window.__portfolioDiskByBoardId[<test label>].text`.
- The backlog column's add card is `#portfolio-backlog-column .add-task-card`; the card's archive button is `button[title="Archive"]` (hover the card first).
- Calendar: `page.getByRole('button', { name: 'Calendar' })`, then `[data-action="open-calendar-month"]` opens a month, whose clickable days are `.portfolio-calendar-day-cell[data-action="create-calendar-task"][data-due-date]`.
- Legacy closes the editor with `closeModal()` from: `clearPortfolioTimelineSelection`, `setPortfolioTimelineSelection`, `movePortfolioTimelineToLatest`, `closePortfolioContextsForProject`, `restorePortfolioTimelineSelection`, `saveTask` (3×) and the `close-modal` shortcut.
- Legacy shortcut precedence: `taskModal` > `detailModal` > `roadmapEntityModal` > `shortcutsModal` > `helpModal` > `global`. The `save-task-modal` entry (Ctrl/Cmd+Enter, `allowWhileTyping`) lives in context `taskModal`.
- Radix Dialog (modal): focuses the first tabbable unless `onOpenAutoFocus` calls `preventDefault()`; handles Escape in a capture-phase document listener; outside pointer-down and `Dialog.Close` call `onOpenChange(false)`. React listens on the portal container (`document.body`), so a Content `onKeyDown` runs before legacy's `document` keydown listener.
- Every container in the editor (`.form-checkbox-row`, `*-editor-add`, `*-editor-row`, `*-editor-list`, `.attachment-editor-toolbar`, `.attachment-editor-actions`, `.attachment-editor-item`, `.form-row`, `.modal-header`, `.modal-footer`) is flex or grid, so whitespace text nodes in legacy markup have no visual effect; JSX needs no `{' '}`.
- Legacy round-trips assignees and checklists through text: `parseAssigneesInput(assigneesToInput(items))` (splits on commas and newlines) and `parseChecklistInput(checklistToInput(items))`. `buildTaskDraft` and the view model reproduce these compositions exactly.
- `normalizeRoadmapRef('')` is `''`; `normalizeDueDate` returns `''` for anything not `YYYY-MM-DD`; `normalizePriority('')` and `normalizeEffort('')` return `null`.
- `main.jsx` does not use `StrictMode`.

## File map

| File | Task | Responsibility |
|---|---|---|
| `tests/visual.test.js` | modify T1 | Shared fixtures moved to module scope; 6 new legacy baselines |
| `tests/visual.test.js-snapshots/task-editor-*.png` | create T1 | Baselines |
| `tests/app.test.js` | modify T1, T4 | 12 new behaviour tests (6 `fixme` until T4) |
| `src/domain/taskDraft.js` | create T2 | Pure editing rules |
| `tests/unit/taskDraft.test.js` | create T2 | Unit tests for the rules |
| `src/actions/legacyHost.js` | modify T3 | `closeTaskEditor`, `saveTask` |
| `tests/unit/legacyHost.test.js` | modify T3 | Host delegation cases |
| `tests/unit/dialogs.test.js` | modify T3 | `taskEditor` open/close case |
| `src/components/dialogs/useReturnFocus.js` | modify T3 | `selectInitial` |
| `src/components/dialogs/taskEditor/AssigneeEditor.jsx` | create T3 | Assignee editor |
| `src/components/dialogs/taskEditor/TagEditor.jsx` | create T3 | Tag editor |
| `src/components/dialogs/taskEditor/ChecklistEditor.jsx` | create T3 | Checklist editor with native drag |
| `src/components/dialogs/taskEditor/AttachmentsEditor.jsx` | create T3 | Attachment editor |
| `src/components/dialogs/TaskEditorDialog.jsx` | create T3 | Dialog shell, plain fields, Ctrl/Cmd+Enter |
| `src/components/AppIslands.jsx` | modify T4 | Mount `TaskEditorDialog` |
| `src/state/store.js` | modify T4 | `'taskEditor'`; remove three task-modal fields |
| `src/legacy/main.js` | modify T4 | View model, openers, close/save, host, deletions |
| `index.html` | modify T4 | Delete `#taskModal` block |
| `README.md` | modify T5 | Document 2.1b |
| `docs/superpowers/plans/2026-09-13-phase2-1b-task-editor.md` | modify T5 | Record deviations |

---

### Task 1: Legacy baselines and new behaviour tests

**Files:**
- Modify: `tests/visual.test.js`
- Create: `tests/visual.test.js-snapshots/task-editor-new-light-darwin.png`, `task-editor-new-dark-darwin.png`, `task-editor-edit-full-light-darwin.png`, `task-editor-edit-full-dark-darwin.png`, `task-editor-attachments-light-darwin.png`, `task-editor-checklist-drag-light-darwin.png`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: 6 baselines the Task 4 port must match; 12 behaviour tests. Tests whose name ends in `(2.1b)` and that are declared with `test.fixme` are un-fixmed in Task 4.

- [ ] **Step 1: Record the starting counts**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build >/dev/null && npx playwright test 2>&1 | tail -4`
Expected: Vitest `836 passed`; Playwright `132 passed`.

- [ ] **Step 2: Move the shared fixtures in `tests/visual.test.js` to module scope**

Cut `ONE_PIXEL_PNG`, `ROADMAP` and `FULL_TASK` out of the `test.describe('2.1a modals and toast', ...)` body and paste them, unchanged, directly below `const FIXED_TIME = '2026-02-26T12:00:00Z';`. Indentation changes from 4 to 0/2 spaces; values do not change. Nothing else in the 2.1a block changes.

- [ ] **Step 3: Append the 2.1b baselines to `tests/visual.test.js`**

Add at the end of the file:

```js
// 2.1b baselines: the task editor. Captured against legacy; the React port must
// match. The editor focuses #taskName on open, so focus is dropped and the
// mouse parked before capture to keep caret, focus ring and hover out of the
// image.
test.describe('2.1b task editor', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  async function captureEditor(page, name) {
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur());
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  }

  async function openFullTaskEditor(page, theme) {
    await gotoVisualApp(page, theme);
    await seedPortfolioBoards(page, [
      { id: 'v1', title: 'Launch', hasHandle: true, tasks: [FULL_TASK], extensions: ROADMAP }
    ], { selectedBoardId: 'v1' });
    await portfolioCard(page, 'Prepare launch checklist').locator('[data-action="edit-task"]').click();
    await expect(page.locator('#modalTitle')).toHaveText('Edit Task');
    await expect(page.locator('#taskAssigneeItems .assignee-editor-row')).toHaveCount(2);
    await expect(page.locator('#taskChecklistItems .checklist-editor-row')).toHaveCount(3);
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(2);
  }

  for (const theme of ['light', 'dark']) {
    test(`task editor, new task (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Launch', hasHandle: true, tasks: [], extensions: ROADMAP }
      ], { selectedBoardId: 'v1' });
      await page.locator('#portfolio-backlog-column .add-task-card').click();
      await expect(page.locator('#modalTitle')).toHaveText('New Task');
      await captureEditor(page, `task-editor-new-${theme}.png`);
    });

    test(`task editor, edit populated (${theme})`, async ({ page }) => {
      await openFullTaskEditor(page, theme);
      await expect(page.locator('#taskBlockerReason')).toHaveValue('Waiting on legal review');
      await expect(page.locator('#taskPhase')).toHaveValue('p1');
      await captureEditor(page, `task-editor-edit-full-${theme}.png`);
    });
  }

  test('task editor, attachments and picker error (light)', async ({ page }) => {
    await openFullTaskEditor(page, 'light');
    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'huge.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc((10 * 1024 * 1024) + 1)
    });
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');
    await page.locator('#taskAttachmentsList').scrollIntoViewIfNeeded();
    await captureEditor(page, 'task-editor-attachments-light.png');
  });

  test('task editor, checklist mid-drag (light)', async ({ page }) => {
    await openFullTaskEditor(page, 'light');
    const rows = page.locator('#taskChecklistItems .checklist-editor-row');
    await rows.nth(2).scrollIntoViewIfNeeded();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await rows.nth(2).locator('.checklist-editor-drag-handle').dispatchEvent('dragstart', { dataTransfer });
    const box = await rows.nth(0).boundingBox();
    await rows.nth(0).dispatchEvent('dragover', { dataTransfer, clientX: box.x + 10, clientY: box.y + 2 });
    await expect(rows.nth(2)).toHaveClass(/\bdragging\b/);
    await expect(rows.nth(0)).toHaveClass(/\bdrag-over-before\b/);
    await captureEditor(page, 'task-editor-checklist-drag-light.png');
  });
});
```

- [ ] **Step 4: Capture the baselines against legacy**

Run: `npm run build && npx playwright test tests/visual.test.js --update-snapshots -g "2.1b task editor"`
Expected: 6 passed; 6 new `task-editor-*-darwin.png` files.

Then run it twice more without `--update-snapshots`:
Run: `npx playwright test tests/visual.test.js -g "2.1b task editor" --repeat-each=2`
Expected: 12 passed. If the mid-drag test is flaky (class assertions or pixel diff), delete that test and its PNG, and record the removal and reason under "Deviations" at the end of this plan.

Open each PNG and check it shows: empty New Task form; populated Edit Task form (blocked reason visible, two assignee rows, two tags, three checklist rows with two done); attachments list with two items and the red size error; checklist row 3 faded and a drop indicator above row 1.

- [ ] **Step 5: Append the behaviour tests to `tests/app.test.js`**

Insert immediately before the file's final `});` (the end of `test.describe('portfolio-only app', ...)`):

```js
  // Phase 2.1b: task editor. Tests declared with test.fixme fail against the
  // legacy editor by design and are enabled by the React port.
  for (const method of ['Escape', 'close button', 'cancel button', 'overlay click']) {
    test.fixme(`task editor closes by ${method}, leaves the DOM and reopens empty (2.1b)`, async ({ page }) => {
      await seedPortfolioBoards(page, [
        { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
      ], { selectedBoardId: 'p1' });

      await page.locator('#portfolio-backlog-column .add-task-card').click();
      await expect(page.locator('#taskModal')).toBeVisible();
      await page.locator('#taskName').fill('Draft title');
      await page.locator('#taskChecklistNewItem').fill('Draft item');
      await page.locator('#taskChecklistNewItem').press('Enter');
      await expect(page.locator('#taskChecklistItems .checklist-editor-row')).toHaveCount(1);

      await closeDialogBy(page, 'taskModal', method);
      await expect(page.locator('#taskModal')).toHaveCount(0);

      await page.locator('#portfolio-backlog-column .add-task-card').click();
      await expect(page.locator('#modalTitle')).toHaveText('New Task');
      await expect(page.locator('#taskName')).toHaveValue('');
      await expect(page.locator('#taskChecklistItems .checklist-editor-row')).toHaveCount(0);
    });
  }

  test('Ctrl+Enter in the task editor saves while typing in the description (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Saved by keyboard');
    await page.locator('#taskDescription').click();
    await page.keyboard.type('Typed description');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const tasks = await page.evaluate(() => JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks);
    expect(tasks.map((task) => task.title)).toEqual(['Saved by keyboard']);
    expect(tasks[0].description).toBe('Typed description');
  });

  test('checking Blocked focuses the blocker reason and unchecking clears it (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskBlocked').check();
    await expect(page.locator('#taskBlockerReason')).toBeFocused();
    await page.locator('#taskBlockerReason').fill('Waiting on API');

    await page.locator('#taskBlocked').uncheck();
    await expect(page.locator('#taskBlockerReasonWrap')).toBeHidden();
    await page.locator('#taskBlocked').check();
    await expect(page.locator('#taskBlockerReason')).toHaveValue('');
  });

  test.fixme('checklist editor removes the clicked row after another row was cleared (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Checklist task',
          status: 'backlog',
          checklist: [
            { text: 'First', done: false },
            { text: 'Second', done: false },
            { text: 'Third', done: false }
          ]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Checklist task');
    const rows = page.locator('#taskChecklistItems .checklist-editor-row');
    await rows.nth(0).locator('input[type="text"]').fill('');
    await rows.nth(1).getByRole('button', { name: 'Remove todo item' }).click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const texts = await page.evaluate(() => (
      JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks[0].checklist.map((item) => item.text)
    ));
    expect(texts).toEqual(['Third']);
  });

  test('assignee suggestions follow edits to existing assignee rows (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', assignees: ['Alex'] },
          { id: 2, title: 'Task B', status: 'backlog', assignees: ['Sam'] }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task A');
    const suggestions = () => page.evaluate(() => (
      Array.from(document.querySelectorAll('#taskAssigneeSuggestions option')).map((option) => option.value)
    ));
    await expect.poll(suggestions).toEqual(['Sam']);

    await page.locator('#taskAssigneeItems .assignee-editor-row input[type="text"]').fill('Jamie');
    await expect.poll(suggestions).toEqual(['Alex', 'Sam']);
  });

  test('removing an attachment clears the attachment picker error (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Task with file',
          status: 'backlog',
          attachments: [{
            id: 'att_txt',
            name: 'notes.txt',
            mime: 'text/plain',
            sizeBytes: 16,
            kind: 'file',
            dataUrl: 'data:text/plain;base64,aGVsbG8gYXR0YWNobWVudA==',
            createdAt: '2026-02-26T00:00:00.000Z'
          }]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');
    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'huge.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc((10 * 1024 * 1024) + 1)
    });
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');

    await page.getByRole('button', { name: 'Remove attachment notes.txt' }).click();
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(0);
    await expect(page.locator('#taskAttachmentsWarnings')).toHaveText('');
  });

  test('clicking Undo while the task editor is open keeps the editor open (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Archive me', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Archive me');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();
    await expect(page.locator('#undoToast')).toBeVisible();

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#undoBtn').click();

    await expect(page.locator('#undoToast')).toHaveCount(0);
    await expect(page.locator('#taskModal')).toBeVisible();
  });

  test('creating a task from a calendar day prefills the due date (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undated', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.locator('[data-action="open-calendar-month"]').first().click();
    const dayCell = page.locator('.portfolio-calendar-day-cell[data-action="create-calendar-task"]').first();
    const dueDate = await dayCell.getAttribute('data-due-date');
    expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await dayCell.click();
    await expect(page.locator('#modalTitle')).toHaveText('New Task');
    await expect(page.locator('#taskDueDate')).toHaveValue(dueDate);
  });

  test.fixme('a new task lists the board tags as suggestions before any tag is added (2.1b)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Tagged', status: 'backlog', tags: ['bug', 'ui'] }] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      Array.from(document.querySelectorAll('#taskTagSuggestions option')).map((option) => option.value)
    ))).toEqual(['bug', 'ui']);
  });
```

- [ ] **Step 6: Prove the fixme tests really fail on legacy**

Temporarily change the six `test.fixme(` above to `test(` (the loop body counts once but produces four tests), then:
Run: `npm run build && npx playwright test tests/app.test.js -g "\(2\.1b\)"`
Expected: 6 failed (the four close-method tests on `toHaveCount(0)`, the checklist test on `['Third']`, the tag-suggestion test on `['bug', 'ui']`), 6 passed. If any other test fails, fix the **test** (not the app) until only those six fail. Then restore `test.fixme(` on exactly those six.

- [ ] **Step 7: Full verification**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build >/dev/null && npx playwright test 2>&1 | tail -5`
Expected: Vitest 836 passed. Playwright 132 + 6 visual + 12 new = 150 tests: 144 passed, 6 skipped (if the drag baseline was dropped: 149 tests, 143 passed, 6 skipped).

- [ ] **Step 8: Commit**

```bash
git add tests/visual.test.js tests/visual.test.js-snapshots/task-editor-*-darwin.png tests/app.test.js
git commit -m "test: capture legacy task editor baselines and add 2.1b behaviour tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure editing rules — `src/domain/taskDraft.js`

**Files:**
- Create: `src/domain/taskDraft.js`
- Test: `tests/unit/taskDraft.test.js`

**Interfaces:**
- Consumes: `src/domain/constants.js`, `util.js`, `attachments.js`, `task.js`, `calendar.js`, `roadmap.js` (existing exports).
- Produces (used by Task 3 components):
  - `addAssignee(items: string[], name: string): string[]` — returns `items` itself when nothing changes
  - `availableAssigneeSuggestions(pool: string[], items: string[]): string[]`
  - `addTag(items: string[], raw: string): { items: string[] } | { error: string }` — `{ items }` is the same array when `raw` is blank
  - `addChecklistItem(items: {text, done}[], text: string): {text, done}[]` — same array when blank
  - `moveChecklistItem(items, from: number, to: number, placement: 'before' | 'after'): items`
  - `mergePickedAttachments(existing: object[], files: {name, size, type}[], deps?: { readFile, now, createId }): Promise<{ attachments: object[], messages: {type: 'error'|'warning', text}[] }>`
  - `buildAttachmentWarnings(attachments: object[], otherAttachmentBytes: number | null): {type: 'warning', text}[]`
  - `buildTaskDraft(form): TaskDraft` where `form = { title, description, blocked, blockerReason, assignees, tags, checklist, attachments, dueDate, priority, effort, phaseId, milestoneId }` and `TaskDraft = { title, description, assignees, tags, blocked, blockerReason, checklist, attachments, rawDueDate, dueDate, priority, effort, phaseId, milestoneId }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/taskDraft.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  addAssignee,
  availableAssigneeSuggestions,
  addTag,
  addChecklistItem,
  moveChecklistItem,
  mergePickedAttachments,
  buildAttachmentWarnings,
  buildTaskDraft
} from '../../src/domain/taskDraft.js';

const MB = 1024 * 1024;
const CREATED_AT = '2026-02-26T00:00:00.000Z';

function pickedFile(name, size, type = 'text/plain') {
  return { name, size, type };
}

function fakeDeps(overrides = {}) {
  let count = 0;
  return {
    readFile: async (file) => `data:${file.type};base64,QUJD`,
    now: () => CREATED_AT,
    createId: () => `att_${++count}`,
    ...overrides
  };
}

function record(overrides = {}) {
  return {
    id: 'a1',
    name: 'a.txt',
    mime: 'text/plain',
    sizeBytes: 10,
    kind: 'file',
    dataUrl: 'data:text/plain;base64,QUJD',
    createdAt: CREATED_AT,
    ...overrides
  };
}

describe('addAssignee', () => {
  it('appends the trimmed name', () => {
    expect(addAssignee(['Alex'], '  Sam ')).toEqual(['Alex', 'Sam']);
  });

  it('returns the same array for a blank name', () => {
    const items = ['Alex'];
    expect(addAssignee(items, '   ')).toBe(items);
  });

  it('returns the same array for a case-insensitive duplicate', () => {
    const items = ['Alex'];
    expect(addAssignee(items, 'alex')).toBe(items);
  });
});

describe('availableAssigneeSuggestions', () => {
  it('excludes current names case-insensitively and ignores blank rows', () => {
    expect(availableAssigneeSuggestions(['Alex', 'Jamie', 'Sam'], ['sam', ' ', 'Jamie '])).toEqual(['Alex']);
  });
});

describe('addTag', () => {
  it('appends the trimmed, lowercased tag', () => {
    expect(addTag(['bug'], ' UI ')).toEqual({ items: ['bug', 'ui'] });
  });

  it('returns the same items for a blank tag', () => {
    const items = ['bug'];
    const result = addTag(items, '   ');
    expect(result.items).toBe(items);
    expect(result.error).toBeUndefined();
  });

  it('accepts a 30-character tag and rejects a 31-character one', () => {
    expect(addTag([], 'a'.repeat(30))).toEqual({ items: ['a'.repeat(30)] });
    expect(addTag([], 'a'.repeat(31))).toEqual({ error: 'Tags must be 30 characters or fewer.' });
  });

  it('rejects a duplicate regardless of case', () => {
    expect(addTag(['bug'], 'BUG')).toEqual({ error: 'This tag is already added.' });
  });

  it('rejects an eleventh tag', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(addTag(ten, 'extra')).toEqual({ error: 'A task can have at most 10 tags.' });
  });

  it('reports a duplicate before the count limit', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(addTag(ten, 'tag3')).toEqual({ error: 'This tag is already added.' });
  });
});

describe('addChecklistItem', () => {
  it('appends a trimmed, not-done item', () => {
    expect(addChecklistItem([{ text: 'A', done: true }], ' B ')).toEqual([
      { text: 'A', done: true },
      { text: 'B', done: false }
    ]);
  });

  it('returns the same array for blank text', () => {
    const items = [{ text: 'A', done: false }];
    expect(addChecklistItem(items, '  ')).toBe(items);
  });
});

describe('moveChecklistItem', () => {
  const A = { text: 'A', done: false };
  const B = { text: 'B', done: false };
  const C = { text: 'C', done: true };
  const items = [A, B, C];

  it('moves backward before the target', () => {
    expect(moveChecklistItem(items, 2, 0, 'before')).toEqual([C, A, B]);
  });

  it('moves backward after the target', () => {
    expect(moveChecklistItem(items, 2, 0, 'after')).toEqual([A, C, B]);
  });

  it('moves forward after the target', () => {
    expect(moveChecklistItem(items, 0, 2, 'after')).toEqual([B, C, A]);
  });

  it('moves forward before the target', () => {
    expect(moveChecklistItem(items, 0, 2, 'before')).toEqual([B, A, C]);
  });

  it('does not mutate its input', () => {
    moveChecklistItem(items, 2, 0, 'before');
    expect(items).toEqual([A, B, C]);
  });

  it('returns the same array for the same index or an out-of-range index', () => {
    expect(moveChecklistItem(items, 1, 1, 'before')).toBe(items);
    expect(moveChecklistItem(items, 5, 0, 'before')).toBe(items);
    expect(moveChecklistItem(items, 0, -1, 'after')).toBe(items);
  });
});

describe('mergePickedAttachments', () => {
  it('reads new files into attachment records', async () => {
    const result = await mergePickedAttachments([], [pickedFile('n.txt', 3), pickedFile('p.png', 3, 'image/png')], fakeDeps());
    expect(result).toEqual({
      attachments: [
        { id: 'att_1', name: 'n.txt', mime: 'text/plain', sizeBytes: 3, kind: 'file', dataUrl: 'data:text/plain;base64,QUJD', createdAt: CREATED_AT },
        { id: 'att_2', name: 'p.png', mime: 'image/png', sizeBytes: 3, kind: 'image', dataUrl: 'data:image/png;base64,QUJD', createdAt: CREATED_AT }
      ],
      messages: []
    });
  });

  it('estimates the size from the data URL when the file reports 0 bytes', async () => {
    const result = await mergePickedAttachments([], [pickedFile('e.txt', 0)], fakeDeps());
    expect(result.attachments[0].sizeBytes).toBe(3);
  });

  it('skips files over the hard size limit with an error', async () => {
    const result = await mergePickedAttachments([], [pickedFile('huge.bin', (10 * MB) + 1)], fakeDeps());
    expect(result).toEqual({
      attachments: [],
      messages: [{ type: 'error', text: 'huge.bin exceeds the 10 MB limit.' }]
    });
  });

  it('stops at the per-task count limit with one error', async () => {
    const existing = Array.from({ length: 9 }, (_, i) => record({ id: `e${i}`, name: `e${i}.txt` }));
    const files = [pickedFile('x.txt', 3), pickedFile('y.txt', 3), pickedFile('z.txt', 3)];
    const result = await mergePickedAttachments(existing, files, fakeDeps());
    expect(result.attachments).toHaveLength(10);
    expect(result.attachments[9].name).toBe('x.txt');
    expect(result.messages).toEqual([{ type: 'error', text: 'Attachment limit reached (10 per task).' }]);
  });

  it('skips duplicates of existing attachments and within the same pick', async () => {
    const existing = [record({ name: 'a.txt', sizeBytes: 3 })];
    const files = [pickedFile('A.TXT', 3), pickedFile('b.txt', 3), pickedFile('b.txt', 3)];
    const result = await mergePickedAttachments(existing, files, fakeDeps());
    expect(result.attachments.map((item) => item.name)).toEqual(['a.txt', 'b.txt']);
    expect(result.messages).toEqual([
      { type: 'warning', text: 'A.TXT is already attached and was skipped.' },
      { type: 'warning', text: 'b.txt is already attached and was skipped.' }
    ]);
  });

  it('reports read failures and keeps going', async () => {
    const deps = fakeDeps({
      readFile: async (file) => {
        if (file.name === 'bad.txt') throw new Error('boom');
        if (file.name === 'silent.txt') throw new Error('');
        return 'data:text/plain;base64,QUJD';
      }
    });
    const result = await mergePickedAttachments([], [pickedFile('bad.txt', 3), pickedFile('silent.txt', 4), pickedFile('ok.txt', 5)], deps);
    expect(result.attachments.map((item) => item.name)).toEqual(['ok.txt']);
    expect(result.messages).toEqual([
      { type: 'error', text: 'bad.txt: boom' },
      { type: 'error', text: 'silent.txt: Failed to read file.' }
    ]);
  });

  it('does not mutate the existing array', async () => {
    const existing = [record()];
    await mergePickedAttachments(existing, [pickedFile('n.txt', 3)], fakeDeps());
    expect(existing).toHaveLength(1);
  });
});

describe('buildAttachmentWarnings', () => {
  it('returns nothing under every soft limit', () => {
    expect(buildAttachmentWarnings([record()], 0)).toEqual([]);
  });

  it('warns per large file', () => {
    expect(buildAttachmentWarnings([record({ name: 'big.bin', sizeBytes: 3 * MB })], 0)).toEqual([
      { type: 'warning', text: 'big.bin is large (3.0 MB). Embedded files can slow saves.' }
    ]);
  });

  it('warns when the task total passes the soft limit', () => {
    const size = Math.round(2.1 * MB);
    const items = Array.from({ length: 10 }, (_, i) => record({ id: `r${i}`, name: `r${i}.bin`, sizeBytes: size }));
    const messages = buildAttachmentWarnings(items, 0);
    expect(messages.filter((message) => message.text.includes('is large'))).toHaveLength(10);
    expect(messages.at(-1)).toEqual({ type: 'warning', text: 'This task has 21 MB of attachments. Saving may feel slower.' });
  });

  it('warns when the project estimate passes the soft limit', () => {
    expect(buildAttachmentWarnings([record({ sizeBytes: MB })], 25 * MB)).toEqual([
      { type: 'warning', text: 'This project is estimated at 26 MB of embedded attachments.' }
    ]);
  });

  it('skips the project estimate without board bytes', () => {
    expect(buildAttachmentWarnings([record({ sizeBytes: MB })], null)).toEqual([]);
  });
});

describe('buildTaskDraft', () => {
  it('trims and normalises every field the way the legacy form reader did', () => {
    const draft = buildTaskDraft({
      title: '  Ship it  ',
      description: '  Notes ',
      blocked: true,
      blockerReason: '  API down ',
      assignees: ['Alex', ' ', 'alex', 'Sam, Jo'],
      tags: ['bug', ' UI '],
      checklist: [{ text: ' First ', done: true }, { text: '   ', done: false }, { text: 'Second', done: false }],
      attachments: [record()],
      dueDate: ' 2026-03-05 ',
      priority: 'HIGH',
      effort: 'm',
      phaseId: ' p1 ',
      milestoneId: ''
    });

    expect(draft).toEqual({
      title: 'Ship it',
      description: 'Notes',
      assignees: ['Alex', 'Sam', 'Jo'],
      tags: ['bug', 'ui'],
      blocked: true,
      blockerReason: 'API down',
      checklist: [{ text: 'First', done: true }, { text: 'Second', done: false }],
      attachments: [record()],
      rawDueDate: '2026-03-05',
      dueDate: '2026-03-05',
      priority: 'high',
      effort: 'M',
      phaseId: 'p1',
      milestoneId: ''
    });
  });

  it('keeps an invalid raw due date so validation can reject it', () => {
    const draft = buildTaskDraft({
      title: 'x', description: '', blocked: false, blockerReason: '', assignees: [], tags: [],
      checklist: [], attachments: [], dueDate: '05/03/2026', priority: '', effort: '', phaseId: '', milestoneId: ''
    });
    expect(draft.rawDueDate).toBe('05/03/2026');
    expect(draft.dueDate).toBe('');
    expect(draft.priority).toBe(null);
    expect(draft.effort).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/taskDraft.test.js`
Expected: FAIL — `Failed to resolve import "../../src/domain/taskDraft.js"`.

- [ ] **Step 3: Implement `src/domain/taskDraft.js`**

```js
// Editing rules for the task editor draft (Phase 2.1b). Pure: no DOM, no app
// state. The editor components call these; legacy saveTask receives the result
// of buildTaskDraft. Messages and limits reproduce the legacy editor exactly.

import {
    ATTACHMENT_MAX_COUNT,
    ATTACHMENT_HARD_MAX_BYTES,
    ATTACHMENT_SOFT_WARN_BYTES,
    ATTACHMENT_TASK_SOFT_TOTAL_BYTES,
    ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES
} from './constants.js';
import { assigneesToInput, checklistToInput, formatFileSize, nowIso, readFileAsDataUrl } from './util.js';
import {
    attachmentDuplicateKey,
    classifyAttachmentKind,
    createAttachmentId,
    estimateAttachmentDataUrlSizeBytes,
    normalizeAttachmentRecord
} from './attachments.js';
import {
    normalizeAssignee,
    normalizeBlockerReason,
    normalizeEffort,
    normalizePriority,
    parseAssigneesInput,
    parseChecklistInput
} from './task.js';
import { normalizeDueDate } from './calendar.js';
import { normalizeRoadmapRef } from './roadmap.js';

const TAG_MAX_LENGTH = 30;
const TAG_MAX_COUNT = 10;

export function addAssignee(items, name) {
    const trimmed = normalizeAssignee(name);
    if (!trimmed) return items;
    const key = trimmed.toLowerCase();
    if (items.some((item) => normalizeAssignee(item).toLowerCase() === key)) return items;
    return [...items, trimmed];
}

export function availableAssigneeSuggestions(pool, items) {
    const taken = new Set(items.map((item) => normalizeAssignee(item).toLowerCase()).filter(Boolean));
    return pool.filter((name) => !taken.has(name.toLowerCase()));
}

export function addTag(items, raw) {
    const tag = String(raw ?? '').trim().toLowerCase();
    if (!tag) return { items };
    if (tag.length > TAG_MAX_LENGTH) return { error: 'Tags must be 30 characters or fewer.' };
    if (items.includes(tag)) return { error: 'This tag is already added.' };
    if (items.length >= TAG_MAX_COUNT) return { error: 'A task can have at most 10 tags.' };
    return { items: [...items, tag] };
}

export function addChecklistItem(items, text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return items;
    return [...items, { text: trimmed, done: false }];
}

export function moveChecklistItem(items, from, to, placement = 'before') {
    if (!items[from] || !items[to] || from === to) return items;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    let insertIndex = to;
    if (placement === 'after') insertIndex += 1;
    if (from < to) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(next.length, insertIndex));
    next.splice(insertIndex, 0, moved);
    return next;
}

export async function mergePickedAttachments(existing, files, {
    readFile = readFileAsDataUrl,
    now = nowIso,
    createId = createAttachmentId
} = {}) {
    const next = existing.map(normalizeAttachmentRecord).filter(Boolean);
    const messages = [];
    const seenKeys = new Set(next.map((item) => attachmentDuplicateKey(item)).filter(Boolean));

    for (const file of files) {
        if (next.length >= ATTACHMENT_MAX_COUNT) {
            messages.push({ type: 'error', text: `Attachment limit reached (${ATTACHMENT_MAX_COUNT} per task).` });
            break;
        }

        const fileSize = Number(file.size) || 0;
        if (fileSize > ATTACHMENT_HARD_MAX_BYTES) {
            messages.push({ type: 'error', text: `${file.name} exceeds the ${formatFileSize(ATTACHMENT_HARD_MAX_BYTES)} limit.` });
            continue;
        }

        const duplicateKey = attachmentDuplicateKey({
            name: file.name || 'Attachment',
            mime: file.type || '',
            sizeBytes: fileSize
        });
        if (duplicateKey && seenKeys.has(duplicateKey)) {
            messages.push({ type: 'warning', text: `${file.name} is already attached and was skipped.` });
            continue;
        }

        try {
            const dataUrl = await readFile(file);
            next.push({
                id: createId(),
                name: file.name || 'Attachment',
                mime: file.type || '',
                sizeBytes: fileSize || estimateAttachmentDataUrlSizeBytes(dataUrl),
                kind: classifyAttachmentKind(file.type, file.name),
                dataUrl,
                createdAt: now()
            });
            if (duplicateKey) seenKeys.add(duplicateKey);
        } catch (error) {
            messages.push({ type: 'error', text: `${file.name}: ${error.message || 'Failed to read file.'}` });
        }
    }

    return { attachments: next, messages };
}

export function buildAttachmentWarnings(attachments, otherAttachmentBytes) {
    const items = attachments.map(normalizeAttachmentRecord).filter(Boolean);
    const messages = [];
    const totalBytes = items.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0);

    items.forEach((item) => {
        if ((Number(item.sizeBytes) || 0) > ATTACHMENT_SOFT_WARN_BYTES) {
            messages.push({
                type: 'warning',
                text: `${item.name} is large (${formatFileSize(item.sizeBytes)}). Embedded files can slow saves.`
            });
        }
    });

    if (totalBytes > ATTACHMENT_TASK_SOFT_TOTAL_BYTES) {
        messages.push({
            type: 'warning',
            text: `This task has ${formatFileSize(totalBytes)} of attachments. Saving may feel slower.`
        });
    }

    if (Number.isFinite(otherAttachmentBytes)) {
        const projectEstimate = otherAttachmentBytes + totalBytes;
        if (projectEstimate > ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES) {
            messages.push({
                type: 'warning',
                text: `This project is estimated at ${formatFileSize(projectEstimate)} of embedded attachments.`
            });
        }
    }

    return messages;
}

// Same shape and normalisation as legacy readTaskDraftFromForm, including its
// round-trip of assignees and checklist items through their text encodings.
export function buildTaskDraft(form) {
    return {
        title: String(form.title ?? '').trim(),
        description: String(form.description ?? '').trim(),
        assignees: parseAssigneesInput(assigneesToInput(form.assignees)),
        tags: form.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
        blocked: Boolean(form.blocked),
        blockerReason: normalizeBlockerReason(form.blockerReason),
        checklist: parseChecklistInput(checklistToInput(form.checklist)),
        attachments: form.attachments.map(normalizeAttachmentRecord).filter(Boolean),
        rawDueDate: String(form.dueDate ?? '').trim(),
        dueDate: normalizeDueDate(form.dueDate),
        priority: normalizePriority(form.priority),
        effort: normalizeEffort(form.effort),
        phaseId: normalizeRoadmapRef(form.phaseId),
        milestoneId: normalizeRoadmapRef(form.milestoneId)
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/taskDraft.test.js`
Expected: PASS, 32 tests. If a message-text assertion fails, compare against the legacy function named in the spec §2 and fix the implementation, not the expected text.

- [ ] **Step 5: Full verification**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build >/dev/null && npx playwright test 2>&1 | tail -5`
Expected: Vitest 868 passed (836 + 32). Playwright unchanged from Task 1.

- [ ] **Step 6: Commit**

```bash
git add src/domain/taskDraft.js tests/unit/taskDraft.test.js
git commit -m "feat: add pure task editor draft rules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Host actions, focus select and the unmounted editor components

**Files:**
- Modify: `src/actions/legacyHost.js`, `tests/unit/legacyHost.test.js`, `tests/unit/dialogs.test.js`, `src/components/dialogs/useReturnFocus.js`
- Create: `src/components/dialogs/taskEditor/AssigneeEditor.jsx`, `TagEditor.jsx`, `ChecklistEditor.jsx`, `AttachmentsEditor.jsx`, `src/components/dialogs/TaskEditorDialog.jsx`

**Interfaces:**
- Consumes: Task 2 exports; `useAppState` from `src/bridge/appStore.js`; `keepOpenOnUndoToast`; `getTaskChecklistDropPlacement(row, clientY)` from `src/domain/task.js`.
- Produces (used by Task 4):
  - `closeTaskEditor(): void` and `saveTask(draft: TaskDraft): unknown` from `src/actions/legacyHost.js`
  - `useReturnFocus({ initialFocus, selectInitial })`
  - `TaskEditorDialog` (named export), which reads `appState.activeDialog === 'taskEditor'` and `appState.dialogProps` shaped as the spec §3 view model: `{ openId, heading, initial: { title, description, blocked, blockerReason, assignees, tags, checklist, attachments, dueDate, priority, effort, phaseId, milestoneId }, phaseOptions, milestoneOptions, assigneePool, tagSuggestions, otherAttachmentBytes }`

The components are **not mounted** in this task; nothing visible changes.

- [ ] **Step 1: Write the failing host and dialog tests**

In `tests/unit/legacyHost.test.js`, add `closeTaskEditor` and `saveTask` to the import list, then:
- in `'do nothing before a host is registered'`, add:

```js
    expect(closeTaskEditor()).toBeUndefined();
    expect(saveTask({ title: 'x' })).toBeUndefined();
```

- in `'delegate to the registered host...'`, add `closeTaskEditor: vi.fn(() => 'closed-editor')` and `saveTask: vi.fn(() => 'saved-task')` to `host`, and before the final expectations:

```js
    const taskDraft = { title: 'Ship it' };
    expect(closeTaskEditor()).toBe('closed-editor');
    expect(saveTask(taskDraft)).toBe('saved-task');
    expect(host.closeTaskEditor).toHaveBeenCalledTimes(1);
    expect(host.saveTask).toHaveBeenCalledWith(taskDraft);
```

In `tests/unit/dialogs.test.js`, add inside the `describe`:

```js
  it('opens and closes the task editor by name', () => {
    openDialog('taskEditor', { openId: 1 });
    expect(appState.activeDialog).toBe('taskEditor');
    expect(appState.dialogProps).toEqual({ openId: 1 });

    closeDialog('taskDetail');
    expect(appState.activeDialog).toBe('taskEditor');

    closeDialog('taskEditor');
    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
  });
```

- [ ] **Step 2: Run to verify the host test fails**

Run: `npx vitest run tests/unit/legacyHost.test.js tests/unit/dialogs.test.js`
Expected: legacyHost FAIL (`closeTaskEditor is not a function`); dialogs PASS (the action is generic).

- [ ] **Step 3: Add the host actions**

In `src/actions/legacyHost.js`: update the header comment's phase to `(Phase 2.1a, 2.1b)`, add to `host`:

```js
    closeTaskEditor: () => {},
    saveTask: () => {}
```

(placing a comma after `performUndo: () => {}`), and append:

```js
export const closeTaskEditor = () => host.closeTaskEditor();
export const saveTask = (draft) => host.saveTask(draft);
```

- [ ] **Step 4: Run to verify both pass**

Run: `npx vitest run tests/unit/legacyHost.test.js tests/unit/dialogs.test.js`
Expected: PASS.

- [ ] **Step 5: Add `selectInitial` to `useReturnFocus`**

In `src/components/dialogs/useReturnFocus.js`, change the doc comment's `initialFocus` paragraph to:

```js
// `initialFocus` is an optional ref; when set, it receives focus on open
// instead of Radix's default (the first tabbable element). With
// `selectInitial`, its text is selected too.
```

and the signature and open handler to:

```js
export function useReturnFocus({ initialFocus, selectInitial = false } = {}) {
    const returnTargetRef = useRef(null);
    return {
        onOpenAutoFocus: (event) => {
            returnTargetRef.current = document.activeElement;
            if (initialFocus?.current) {
                event.preventDefault();
                initialFocus.current.focus();
                if (selectInitial) initialFocus.current.select?.();
            }
        },
```

(`onCloseAutoFocus` unchanged.)

- [ ] **Step 6: Create `src/components/dialogs/taskEditor/AssigneeEditor.jsx`**

```jsx
import { useRef, useState } from 'react';
import { addAssignee, availableAssigneeSuggestions } from '../../../domain/taskDraft.js';

// Assignee rows stay editable; blank rows are dropped when the draft is built.
export function AssigneeEditor({ value, onChange, pool }) {
    const [composer, setComposer] = useState('');
    const composerRef = useRef(null);

    const addFromComposer = () => {
        const name = composer.trim();
        if (!name) return;
        onChange(addAssignee(value, name));
        setComposer('');
        composerRef.current?.focus();
    };

    return (
        <>
            <div className="assignee-editor" id="taskAssigneeEditor">
                <div className="assignee-editor-list" id="taskAssigneeItems">
                    {value.length === 0 ? (
                        <div className="assignee-editor-empty">No assignees yet.</div>
                    ) : value.map((name, index) => (
                        <div className="assignee-editor-row" data-index={index} key={index}>
                            <input
                                type="text"
                                value={name}
                                list="taskAssigneeSuggestions"
                                aria-label="Assignee name"
                                data-index={index}
                                onChange={(event) => onChange(value.map((item, i) => (i === index ? event.target.value : item)))}
                            />
                            <button
                                type="button"
                                className="assignee-editor-remove"
                                aria-label="Remove assignee"
                                title="Remove"
                                data-index={index}
                                onClick={() => onChange(value.filter((_, i) => i !== index))}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
                <div className="assignee-editor-add">
                    <input
                        type="text"
                        id="taskAssigneeNewItem"
                        list="taskAssigneeSuggestions"
                        placeholder="Add an assignee and press Enter"
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addFromComposer();
                        }}
                    />
                    <button type="button" className="btn" id="taskAssigneeAddBtn" onClick={addFromComposer}>Add</button>
                </div>
            </div>
            <datalist id="taskAssigneeSuggestions">
                {availableAssigneeSuggestions(pool, value).map((name) => <option key={name} value={name} />)}
            </datalist>
        </>
    );
}
```

- [ ] **Step 7: Create `src/components/dialogs/taskEditor/TagEditor.jsx`**

```jsx
import { useRef, useState } from 'react';
import { addTag } from '../../../domain/taskDraft.js';

export function TagEditor({ value, onChange, suggestions }) {
    const [composer, setComposer] = useState('');
    const composerRef = useRef(null);

    const addFromComposer = () => {
        const result = addTag(value, composer);
        if (result.error) {
            window.alert(result.error);
            return;
        }
        if (result.items === value) return;
        onChange(result.items);
        setComposer('');
        composerRef.current?.focus();
    };

    return (
        <>
            <div className="tag-editor" id="taskTagEditor">
                <div className="tag-editor-list" id="taskTagItems">
                    {value.length === 0 ? (
                        <div className="tag-editor-empty">No tags yet.</div>
                    ) : value.map((tag, index) => (
                        <div className="tag-editor-row" data-index={index} key={tag}>
                            <span>{tag}</span>
                            <button
                                type="button"
                                className="tag-editor-remove"
                                aria-label="Remove tag"
                                title="Remove"
                                data-index={index}
                                onClick={() => onChange(value.filter((_, i) => i !== index))}
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                </div>
                <div className="tag-editor-add">
                    <input
                        type="text"
                        id="taskTagNewItem"
                        list="taskTagSuggestions"
                        placeholder="Add a tag and press Enter"
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addFromComposer();
                        }}
                    />
                    <button type="button" className="btn" id="taskTagAddBtn" onClick={addFromComposer}>Add</button>
                </div>
            </div>
            <datalist id="taskTagSuggestions">
                {suggestions.map((tag) => <option key={tag} value={tag} />)}
            </datalist>
        </>
    );
}
```

- [ ] **Step 8: Create `src/components/dialogs/taskEditor/ChecklistEditor.jsx`**

```jsx
import { useRef, useState } from 'react';
import { getTaskChecklistDropPlacement } from '../../../domain/task.js';
import { addChecklistItem, moveChecklistItem } from '../../../domain/taskDraft.js';

const IDLE_DRAG = { activeIndex: -1, targetIndex: -1, placement: '' };

// Native HTML5 drag, as in legacy; dnd-kit replaces it in Phase 2.4.
export function ChecklistEditor({ value, onChange }) {
    const [composer, setComposer] = useState('');
    const [drag, setDrag] = useState(IDLE_DRAG);
    const composerRef = useRef(null);

    const addFromComposer = () => {
        const next = addChecklistItem(value, composer);
        if (next === value) return;
        onChange(next);
        setComposer('');
        composerRef.current?.focus();
    };

    const updateItem = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const rowClassName = (item, index) => {
        const classes = ['checklist-editor-row'];
        if (item.done) classes.push('done');
        if (index === drag.activeIndex) classes.push('dragging');
        if (index === drag.targetIndex && index !== drag.activeIndex && drag.placement) {
            classes.push(drag.placement === 'before' ? 'drag-over-before' : 'drag-over-after');
        }
        return classes.join(' ');
    };

    const onDragStart = (event, index) => {
        setDrag({ activeIndex: index, targetIndex: -1, placement: '' });
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
        }
    };

    const onDragOver = (event, index) => {
        if (drag.activeIndex < 0) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const placement = getTaskChecklistDropPlacement(event.currentTarget, event.clientY);
        if (drag.targetIndex === index && drag.placement === placement) return;
        setDrag({ ...drag, targetIndex: index, placement });
    };

    const onDrop = (event, index) => {
        if (drag.activeIndex < 0) return;
        event.preventDefault();
        const placement = getTaskChecklistDropPlacement(event.currentTarget, event.clientY);
        onChange(moveChecklistItem(value, drag.activeIndex, index, placement));
        setDrag(IDLE_DRAG);
    };

    return (
        <div className="checklist-editor" id="taskChecklistEditor">
            <div className="checklist-editor-list" id="taskChecklistItems">
                {value.length === 0 ? (
                    <div className="checklist-editor-empty">No todo items yet.</div>
                ) : value.map((item, index) => (
                    <div
                        className={rowClassName(item, index)}
                        data-index={index}
                        key={index}
                        onDragOver={(event) => onDragOver(event, index)}
                        onDrop={(event) => onDrop(event, index)}
                    >
                        <button
                            type="button"
                            className="checklist-editor-drag-handle"
                            aria-label="Drag to reorder todo item"
                            title="Drag to reorder"
                            data-index={index}
                            draggable
                            onDragStart={(event) => onDragStart(event, index)}
                            onDragEnd={() => setDrag(IDLE_DRAG)}
                        >
                            ::
                        </button>
                        <input
                            type="checkbox"
                            checked={item.done}
                            aria-label="Mark todo as done"
                            data-index={index}
                            onChange={(event) => updateItem(index, { done: event.target.checked })}
                        />
                        <input
                            type="text"
                            value={item.text}
                            aria-label="Todo item text"
                            data-index={index}
                            onChange={(event) => updateItem(index, { text: event.target.value })}
                        />
                        <button
                            type="button"
                            className="checklist-editor-remove"
                            aria-label="Remove todo item"
                            title="Remove"
                            data-index={index}
                            onClick={() => onChange(value.filter((_, i) => i !== index))}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
            <div className="checklist-editor-add">
                <input
                    type="text"
                    id="taskChecklistNewItem"
                    placeholder="Add a todo item and press Enter"
                    ref={composerRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addFromComposer();
                    }}
                />
                <button type="button" className="btn" id="taskChecklistAddBtn" onClick={addFromComposer}>Add</button>
            </div>
        </div>
    );
}
```

- [ ] **Step 9: Create `src/components/dialogs/taskEditor/AttachmentsEditor.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { ATTACHMENT_MAX_COUNT } from '../../../domain/constants.js';
import { formatFileSize } from '../../../domain/util.js';
import { buildAttachmentWarnings, mergePickedAttachments } from '../../../domain/taskDraft.js';

export function AttachmentsEditor({ value, onChange, otherAttachmentBytes }) {
    const [pickerMessages, setPickerMessages] = useState([]);
    const inputRef = useRef(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const onFilesPicked = async (event) => {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = '';
        if (files.length === 0) return;
        const result = await mergePickedAttachments(value, files);
        // The dialog may have closed while files were being read.
        if (!mountedRef.current) return;
        onChange(result.attachments);
        setPickerMessages(result.messages);
    };

    const remove = (attachmentId) => {
        onChange(value.filter((item) => item.id !== attachmentId));
        setPickerMessages([]);
    };

    const totalBytes = value.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
    const summary = value.length === 0
        ? 'No attachments'
        : `${value.length} / ${ATTACHMENT_MAX_COUNT} • ${formatFileSize(totalBytes)}`;
    const messages = [...pickerMessages, ...buildAttachmentWarnings(value, otherAttachmentBytes)]
        .filter((message) => message && typeof message.text === 'string' && message.text.trim());

    return (
        <div className="attachment-editor" id="taskAttachmentsEditor">
            <div className="attachment-editor-toolbar">
                <button type="button" className="btn" id="taskAttachmentsAddBtn" onClick={() => inputRef.current?.click()}>Add Files</button>
                <span className="attachment-editor-summary" id="taskAttachmentsSummary">{summary}</span>
            </div>
            <div className="attachment-editor-warnings" id="taskAttachmentsWarnings">
                {messages.map((message, index) => (
                    <div key={index} className={message.type === 'error' ? 'attachment-editor-error' : 'attachment-editor-warning'}>
                        {message.text}
                    </div>
                ))}
            </div>
            <div className="attachment-editor-list" id="taskAttachmentsList">
                {value.length === 0 ? (
                    <div className="attachment-editor-empty">No attachments yet.</div>
                ) : value.map((item) => (
                    <div className="attachment-editor-item" key={item.id}>
                        {item.kind === 'image'
                            ? <img className="attachment-editor-thumb" alt="" src={item.dataUrl} />
                            : <span className="attachment-editor-icon">FILE</span>}
                        <div className="attachment-editor-meta">
                            <div className="attachment-editor-name">{item.name}</div>
                            <div className="attachment-editor-sub">
                                {`${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`}
                            </div>
                        </div>
                        <div className="attachment-editor-actions">
                            <a className="attachment-editor-download" href={item.dataUrl} download={item.name || 'attachment'}>Download</a>
                            <button
                                type="button"
                                className="attachment-remove-btn"
                                aria-label={`Remove attachment ${item.name}`}
                                title="Remove"
                                data-attachment-id={item.id}
                                onClick={() => remove(item.id)}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <input type="file" id="taskAttachmentsInput" className="hidden" multiple ref={inputRef} onChange={onFilesPicked} />
        </div>
    );
}
```

- [ ] **Step 10: Create `src/components/dialogs/TaskEditorDialog.jsx`**

```jsx
import { useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeTaskEditor, saveTask } from '../../actions/legacyHost.js';
import { buildTaskDraft } from '../../domain/taskDraft.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';
import { AssigneeEditor } from './taskEditor/AssigneeEditor.jsx';
import { TagEditor } from './taskEditor/TagEditor.jsx';
import { ChecklistEditor } from './taskEditor/ChecklistEditor.jsx';
import { AttachmentsEditor } from './taskEditor/AttachmentsEditor.jsx';

const PRIORITY_OPTIONS = [['', 'None'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const EFFORT_OPTIONS = [['', 'None'], ['XS', 'XS'], ['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']];

// Legacy opens the editor with a view model; this component owns the draft and
// hands a finished draft to legacy saveTask, which validates, saves and closes.
export function TaskEditorDialog() {
    const open = useAppState((s) => s.activeDialog === 'taskEditor');
    const vm = useAppState((s) => (s.activeDialog === 'taskEditor' ? s.dialogProps : null));
    const nameRef = useRef(null);
    const submitRef = useRef(null);
    const returnFocus = useReturnFocus({ initialFocus: nameRef, selectInitial: true });

    // Ctrl/Cmd+Enter saves from anywhere in the dialog. The legacy shortcut
    // registry still lists it, with a no-op handler.
    const onKeyDown = (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key !== 'Enter') return;
        event.preventDefault();
        submitRef.current?.();
    };

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeTaskEditor(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="taskModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onKeyDown={onKeyDown}
                        {...returnFocus}
                    >
                        {vm && <TaskEditorForm key={vm.openId} vm={vm} nameRef={nameRef} submitRef={submitRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// Remounts on every open (keyed by openId), so the draft always starts from the
// view model's initial values.
function TaskEditorForm({ vm, nameRef, submitRef }) {
    const [form, setForm] = useState(() => ({ ...vm.initial }));
    const blockerReasonRef = useRef(null);

    const update = (field, fieldValue) => setForm((current) => ({ ...current, [field]: fieldValue }));
    const bind = (field) => ({ value: form[field], onChange: (event) => update(field, event.target.value) });
    const submit = () => saveTask(buildTaskDraft(form));

    useLayoutEffect(() => {
        submitRef.current = submit;
    });

    const onBlockedChange = (event) => {
        const blocked = event.target.checked;
        setForm((current) => ({ ...current, blocked, blockerReason: blocked ? current.blockerReason : '' }));
        if (blocked) {
            requestAnimationFrame(() => blockerReasonRef.current?.focus());
        }
    };

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="modalTitle">{vm.heading}</span>
                </Dialog.Title>
                <Dialog.Close className="modal-close" id="taskModalCloseBtn">&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="taskForm" onSubmit={(event) => event.preventDefault()}>
                    <div className="form-group">
                        <label className="required">Task Name</label>
                        <input type="text" id="taskName" ref={nameRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea id="taskDescription" {...bind('description')} />
                    </div>
                    <div className="form-group">
                        <label>Blocked</label>
                        <div className="form-checkbox-row">
                            <input type="checkbox" id="taskBlocked" checked={form.blocked} onChange={onBlockedChange} />
                            <span>Mark task as blocked</span>
                        </div>
                    </div>
                    <div className={`form-group${form.blocked ? '' : ' hidden'}`} id="taskBlockerReasonWrap">
                        <label className="required">Blocker Reason</label>
                        <textarea
                            id="taskBlockerReason"
                            placeholder="What's blocking this task?"
                            ref={blockerReasonRef}
                            {...bind('blockerReason')}
                        />
                    </div>
                    <div className="form-group">
                        <label>Assignees</label>
                        <AssigneeEditor value={form.assignees} onChange={(next) => update('assignees', next)} pool={vm.assigneePool} />
                    </div>
                    <div className="form-group">
                        <label>Tags</label>
                        <TagEditor value={form.tags} onChange={(next) => update('tags', next)} suggestions={vm.tagSuggestions} />
                    </div>
                    <div className="form-group">
                        <label>Todo List</label>
                        <ChecklistEditor value={form.checklist} onChange={(next) => update('checklist', next)} />
                    </div>
                    <div className="form-group">
                        <label>Attachments</label>
                        <AttachmentsEditor
                            value={form.attachments}
                            onChange={(next) => update('attachments', next)}
                            otherAttachmentBytes={vm.otherAttachmentBytes}
                        />
                    </div>
                    <div className="form-group">
                        <label>Due Date</label>
                        <input type="date" id="taskDueDate" {...bind('dueDate')} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Priority</label>
                            <select id="taskPriority" {...bind('priority')}>
                                {PRIORITY_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Effort</label>
                            <select id="taskEffort" {...bind('effort')}>
                                {EFFORT_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Phase</label>
                            <select id="taskPhase" {...bind('phaseId')}>
                                <option value="">None</option>
                                {vm.phaseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Milestone</label>
                            <select id="taskMilestone" {...bind('milestoneId')}>
                                <option value="">None</option>
                                {vm.milestoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="taskModalCancelBtn">Cancel</Dialog.Close>
                <button className="btn btn-primary" id="taskModalSaveBtn" onClick={submit}>Save Task</button>
            </div>
        </>
    );
}
```

- [ ] **Step 11: Compile-check the unmounted components**

Vite does not compile files nothing imports, so bundle the dialog on its own:
Run: `npx esbuild src/components/dialogs/TaskEditorDialog.jsx --bundle --format=esm --jsx=automatic --outfile=/dev/null --log-level=warning`
Expected: exits 0 with no errors (warnings about `process.env.NODE_ENV` are fine).

- [ ] **Step 12: Full verification**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build >/dev/null && npx playwright test 2>&1 | tail -5`
Expected: Vitest 869 passed (868 + 1 dialogs case; the legacyHost additions are inside existing tests). Playwright unchanged from Task 1.

- [ ] **Step 13: Commit**

```bash
git add src/actions/legacyHost.js tests/unit/legacyHost.test.js tests/unit/dialogs.test.js src/components/dialogs/useReturnFocus.js src/components/dialogs/TaskEditorDialog.jsx src/components/dialogs/taskEditor/AssigneeEditor.jsx src/components/dialogs/taskEditor/TagEditor.jsx src/components/dialogs/taskEditor/ChecklistEditor.jsx src/components/dialogs/taskEditor/AttachmentsEditor.jsx
git commit -m "feat: add task editor host actions and React editor components (not yet mounted)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Switch the task editor to React

**Files:**
- Modify: `src/components/AppIslands.jsx`, `src/state/store.js`, `src/legacy/main.js`, `index.html`, `tests/app.test.js`

**Interfaces:**
- Consumes: `TaskEditorDialog`, `closeTaskEditor`, `saveTask` host keys (Task 3); `openDialog`, `closeDialog` (existing).
- Produces: legacy functions `buildTaskEditorViewModel(boardRecord, task, { taskId, preferredDueDate })`, `buildRoadmapEntityOptions(items)`, `closeTaskEditor()`, `saveTask(draft)`.

This is one commit: mounting the island, rewiring legacy, deleting legacy editor code and the static markup must land together so nothing renders twice.

- [ ] **Step 1: Mount the island**

In `src/components/AppIslands.jsx`, import `TaskEditorDialog` from `./dialogs/TaskEditorDialog.jsx`, add `closeTaskEditor` to the `legacyHost.js` import, and insert after the `RoadmapEntityDialog` island:

```jsx
            <IslandErrorBoundary island="TaskEditorDialog" onError={() => closeTaskEditor()}>
                <TaskEditorDialog />
            </IslandErrorBoundary>
```

- [ ] **Step 2: Update the store**

In `src/state/store.js`: under `// --- Task modal ---` keep only `pendingNewTaskStatus: null,` (delete `taskModalAttachmentDraft`, `taskModalAttachmentMessages`, `taskChecklistDragState`). Change the `activeDialog` comment to:

```js
    activeDialog: null, // null | 'shortcuts' | 'help' | 'taskDetail' | 'roadmapEntity' | 'taskEditor'
```

- [ ] **Step 3: Delete the static markup**

In `index.html`, delete the whole `<div class="modal" id="taskModal"> … </div>` block (from that opening tag through its matching closing `</div>` directly above `<div id="reactRoot"></div>`), including the blank line that follows it.

- [ ] **Step 4: Add the view-model builder in `src/legacy/main.js`**

Replace `buildRoadmapEntityOptionMarkup` (it has no other callers once `populateTaskRoadmapSelectors` is gone) with:

```js
        function buildRoadmapEntityOptions(items) {
            return (Array.isArray(items) ? items : []).map((item) => ({ value: item.id, label: item.title }));
        }
```

Replace `populateTaskRoadmapSelectors` (directly after `getTaskModalBoardRecord`) with:

```js
        let taskEditorOpenCount = 0;

        // View model for TaskEditorDialog. `task` is null when creating.
        function buildTaskEditorViewModel(boardRecord, task, options = {}) {
            taskEditorOpenCount += 1;
            const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
            const phaseOptions = buildRoadmapEntityOptions(roadmap.phases);
            const milestoneOptions = buildRoadmapEntityOptions(roadmap.milestones);
            const knownRef = (optionList, value) => {
                const ref = normalizeRoadmapRef(value);
                return optionList.some((option) => option.value === ref) ? ref : '';
            };
            const normalized = task ? normalizeTask(task) : null;
            const initial = normalized
                ? {
                    title: normalized.title || '',
                    description: normalized.description || '',
                    blocked: Boolean(normalized.blocked),
                    blockerReason: normalized.blocked ? normalizeBlockerReason(normalized.blockerReason) : '',
                    assignees: parseAssigneesInput(assigneesToInput(normalized.assignees)),
                    tags: normalizeTags(normalized.tags),
                    checklist: parseChecklistInput(checklistToInput(normalized.checklist || [])),
                    attachments: getTaskAttachments(boardRecord.data, options.taskId).map(normalizeAttachmentRecord).filter(Boolean),
                    dueDate: normalizeDueDate(normalized.dueDate) || '',
                    priority: normalizePriority(normalized.priority) || '',
                    effort: normalizeEffort(normalized.effort) || '',
                    phaseId: knownRef(phaseOptions, normalized.phaseId),
                    milestoneId: knownRef(milestoneOptions, normalized.milestoneId)
                }
                : {
                    title: '',
                    description: '',
                    blocked: false,
                    blockerReason: '',
                    assignees: [],
                    tags: [],
                    checklist: [],
                    attachments: [],
                    dueDate: normalizeDueDate(options.preferredDueDate || '') || '',
                    priority: '',
                    effort: '',
                    phaseId: '',
                    milestoneId: ''
                };
            return {
                openId: taskEditorOpenCount,
                heading: normalized ? 'Edit Task' : 'New Task',
                initial,
                phaseOptions,
                milestoneOptions,
                assigneePool: getTaskAssigneeSuggestions([]),
                tagSuggestions: getBoardTagSuggestions(boardRecord.data),
                otherAttachmentBytes: calculateBoardAttachmentBytes(boardRecord.data, { excludeTaskId: normalized ? options.taskId : null })
            };
        }
```

If `getTaskModalBoardRecord` has no remaining callers after Step 10, delete it too.

- [ ] **Step 5: Rewrite the openers**

In `editPortfolioTask`, replace everything from `renderTaskAssigneeSuggestions();` through `focusAndSelectTaskNameInput();` with:

```js
            appState.pendingNewTaskStatus = null;
            openDialog('taskEditor', buildTaskEditorViewModel(source.boardRecord, source.task, { taskId }));
```

In `openPortfolioCreateTaskModal`, replace everything from `renderTaskAssigneeSuggestions();` through `focusAndSelectTaskNameInput();` with:

```js
            openDialog('taskEditor', buildTaskEditorViewModel(boardRecord, null, { preferredDueDate: options.preferredDueDate }));
```

(`appState.pendingNewTaskStatus = null;` already precedes it there.)

- [ ] **Step 6: Replace `closeModal` with `closeTaskEditor`**

Replace the whole `function closeModal() { … }` with:

```js
        // Every close path, React or legacy, goes through here so the edit and
        // create contexts never outlive the dialog.
        function closeTaskEditor() {
            appState.pendingNewTaskStatus = null;
            appState.portfolioEditContext = null;
            appState.portfolioCreateContext = null;
            closeDialog('taskEditor');
        }
```

Then replace every remaining `closeModal();` call with `closeTaskEditor();`:
Run: `grep -n "closeModal" src/legacy/main.js`
Expected after editing: no matches.

- [ ] **Step 7: Take the draft as a parameter in `saveTask`**

Change `async function saveTask() {` / `const draft = readTaskDraftFromForm();` to:

```js
        async function saveTask(draft) {
```

and delete the `readTaskDraftFromForm()` line. In the validation branch delete:

```js
                if (typeof validation.beforeAlert === 'function') {
                    validation.beforeAlert();
                }
```

In `TaskFormValidator`, delete the `beforeAlert: syncTaskBlockedReasonVisibility` property (and the comma before it).

- [ ] **Step 8: Update shortcuts**

In `getShortcutModalContext`, replace the first line with:

```js
            const taskModalOpen = appState.activeDialog === 'taskEditor';
```

In `buildShortcutRegistry`, change the `save-task-modal` entry's handler to:

```js
                    // TaskEditorDialog owns the draft and handles this key; the
                    // entry stays so the Shortcuts dialog lists it.
                    handler: () => {}
```

In the `close-modal` entry, `closeModal();` was already renamed to `closeTaskEditor();` in Step 6.

- [ ] **Step 9: Register the host**

In the `setLegacyHost({ … })` call, add `closeTaskEditor,` and `saveTask` (comma after `performUndo`).

- [ ] **Step 10: Delete the legacy editor code**

Delete these functions entirely:
`getTaskAssigneeEditorRowsContainer`, `getTaskAssigneeTextarea`, `readTaskAssigneeEditorItems`, `syncTaskAssigneeTextareaFromEditor`, `renderTaskAssigneeEditor`, `loadTaskAssigneeEditorFromTextarea`, `updateTaskAssigneeEditor`, `addTaskAssignee`, `addTaskAssigneeFromComposer`, `updateTaskAssigneeEditorItemText`, `removeTaskAssigneeEditorItem`, `renderTagEditor`, `readTagEditorItems`, `addTaskTagFromComposer`, `handleTagEditorClick`, `renderTaskAssigneeSuggestions`, `getTaskChecklistEditorRowsContainer`, `getTaskChecklistTextarea`, `readTaskChecklistEditorItems`, `syncTaskChecklistTextareaFromEditor`, `resetTaskChecklistDragState`, `renderTaskChecklistDragState`, `moveTaskChecklistEditorItem`, `renderTaskChecklistEditor`, `loadTaskChecklistEditorFromTextarea`, `updateTaskChecklistEditor`, `addTaskChecklistItem`, `addTaskChecklistItemFromComposer`, `toggleTaskChecklistEditorItem`, `updateTaskChecklistEditorItemText`, `removeTaskChecklistEditorItem`, `syncTaskBlockedReasonVisibility`, `onTaskBlockedChange`, `getTaskModalAttachmentsDraft`, `getTaskModalAttachmentContext`, `getTaskModalAttachmentDerivedMessages`, `setTaskModalAttachmentDraft`, `resetTaskModalAttachmentDraft`, `renderTaskAttachmentsEditor`, `triggerTaskAttachmentsPicker`, `removeTaskModalAttachment`, `handleTaskAttachmentsInputChange`, `focusAndSelectTaskNameInput`, `readTaskDraftFromForm`, `handleTaskChecklistEditorClick`, `handleTaskChecklistEditorInput`, `handleTaskChecklistEditorChange`, `handleTaskChecklistEditorDragStart`, `handleTaskChecklistEditorDragOver`, `handleTaskChecklistEditorDrop`, `handleTaskChecklistEditorDragEnd`, `handleTaskAssigneeEditorClick`, `handleTaskAssigneeEditorInput`, `handleTaskAttachmentsEditorClick`.

Delete `Refs.taskModal = document.getElementById('taskModal');` in `cacheRefs`.

In `bindStaticUiEvents`, delete every listener on: `#taskModalCloseBtn`, `#taskModalCancelBtn`, `#taskModalSaveBtn`, `#taskAssigneeAddBtn`, `#taskTagAddBtn`, `#taskChecklistAddBtn`, `#taskAttachmentsAddBtn`, `#taskBlocked`, `#taskChecklistNewItem` (keydown), `#taskAssigneeNewItem` (keydown), `#taskTagNewItem` (keydown), `#taskTagItems`, `#taskAttachmentsInput`, `#taskModal` (overlay click), the seven `#taskChecklistItems` listeners, the two `#taskAssigneeItems` listeners and `#taskAttachmentsList`.

- [ ] **Step 11: Check for leftovers**

Run:
```bash
grep -nE "taskModalAttachment|taskChecklistDragState|TaskAssigneeEditor|TaskChecklistEditor|TagEditor|readTaskDraftFromForm|focusAndSelectTaskNameInput|syncTaskBlockedReasonVisibility|renderTaskAttachmentsEditor|populateTaskRoadmapSelectors|buildRoadmapEntityOptionMarkup|getElementById\('task" src/legacy/main.js
```
Expected: no matches except `document.getElementById(fieldId)` inside `focusFieldById` (which does not match the pattern). Fix any caller that still references a deleted function.

Then remove imports that became unused. For each of `readFileAsDataUrl`, `attachmentDuplicateKey`, `classifyAttachmentKind`, `createAttachmentId`, `estimateAttachmentDataUrlSizeBytes`, `getTaskChecklistDropPlacement`, run `grep -c "\bNAME\b" src/legacy/main.js`; if the count is 1 (the import only), delete it from the import list.

- [ ] **Step 12: Enable the fixme tests**

In `tests/app.test.js`, change the six `test.fixme(` declarations whose names end in `(2.1b)` to `test(`.

- [ ] **Step 13: Run unit tests and build**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build 2>&1 | tail -3`
Expected: Vitest 869 passed; build succeeds.

- [ ] **Step 14: Run the task editor tests first**

Run: `npx playwright test tests/app.test.js -g "task|Task|assignee|tag|checklist|attachment|blocked|due date|shortcut|timeline|2\.1b"`
Expected: all pass. Diagnose failures against the spec edge cases (§5) before touching tests; existing tests must not be edited.

If "checklist items can be reordered in the task modal" fails because Radix blocks native drag (spec risk 1), stop and report — do not switch to dnd-kit without recording it as a deviation.

- [ ] **Step 15: Run the visual tests**

Run: `npx playwright test tests/visual.test.js`
Expected: all pass, **without** `--update-snapshots`. If a 2.1b baseline differs, open the diff in `test-results/` and fix the markup/classes; never regenerate.

- [ ] **Step 16: Full verification**

Run: `npx playwright test 2>&1 | tail -5`
Expected: 150 passed, 0 skipped (149 if the drag baseline was dropped in Task 1). Check the browser console is clean of React warnings by running one test headed if in doubt: `npx playwright test tests/app.test.js -g "Ctrl\+Enter" --headed`.

- [ ] **Step 17: Commit**

```bash
git add src/components/AppIslands.jsx src/state/store.js src/legacy/main.js index.html tests/app.test.js
git commit -m "feat: port the task editor modal to Radix Dialog

Legacy builds a view model and opens the dialog; React owns the draft and
hands it to legacy saveTask. Deletes the legacy editor rendering, handlers
and the static #taskModal markup.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation and deviations

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/2026-09-13-phase2-1b-task-editor.md`

**Interfaces:**
- Consumes: the finished port.
- Produces: accurate docs.

- [ ] **Step 1: Update the README intro**

In `README.md` line 3, replace `and the Shortcuts and Help modals already run on React.` with:

```
and every modal (Shortcuts, Help, task detail, task editor, roadmap entity) and the undo toast now run on React.
```

- [ ] **Step 2: Document 2.1b in the architecture list**

In the `src/components/` bullet, after the sentence ending `through \`src/actions/legacyHost.js\`.`, append:

```
The task editor is React as well (Phase 2.1b), but unlike the display-only dialogs it owns its draft: legacy passes initial values and option lists, the assignee, tag, checklist and attachment editors under `src/components/dialogs/taskEditor/` edit the draft using the pure rules in `src/domain/taskDraft.js`, and Save hands the finished draft to legacy `saveTask`, which still validates and saves.
```

In the `src/domain/` bullet list, add after the `persistence.js` line:

```
  - `taskDraft.js` — task editor rules: assignee/tag/checklist edits, attachment picking and warnings, and building the draft legacy saves.
```

and change `11 modules:` to `12 modules:`.

- [ ] **Step 3: Record deviations**

Append to this plan file:

```markdown
## Deviations

- (List every departure from the steps above — e.g. a dropped baseline, a changed test, a spec risk that materialised — with the reason. Write "None." if there were none.)
```

Replace the parenthetical with the actual list or `None.`.

- [ ] **Step 4: Final verification**

Run: `npm run test:unit 2>&1 | tail -4 && npm run build >/dev/null && npx playwright test 2>&1 | tail -5`
Expected: Vitest 869 passed; Playwright 150 passed (or 149, as recorded).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plans/2026-09-13-phase2-1b-task-editor.md
git commit -m "docs: document Phase 2.1b task editor and record plan deviations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Deviations

- None.
