# Phase 2.1a — Task Detail, Roadmap Entity Modal and Undo Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-1a-detail-roadmap-undo-design.md`

**Goal:** Port the undo toast, the roadmap entity modal and the task detail modal from legacy DOM code to React (Radix Dialog for the modals), pixel-identical to legacy, with legacy still owning data and mutations.

**Architecture:** Legacy open functions build plain, display-ready view models and call `openDialog(name, viewModel)`; components render `appState.dialogProps` via `useAppState`. Components trigger legacy behaviour through `src/actions/legacyHost.js`, whose implementations `src/legacy/main.js` registers at boot (same pattern as `setPersistenceHost`). Data-backed dialogs always close through legacy close functions, which clear legacy contexts before `closeDialog(name)`.

**Tech Stack:** Vite 5, React 19, `@radix-ui/react-dialog` 1.1, Vitest 2 (node), Playwright 1.52 (CJS test files).

## Global Constraints

- DOM ids are preserved exactly: `#taskDetailModal`, `#taskDetailModalCloseBtn`, `#taskDetailModalFooterCloseBtn`, `#detailTitle`, `#detailDescription`, `#detailAssignees`, `#detailTags`, `#detailBlocked`, `#detailBlockerReason`, `#detailPriority`, `#detailEffort`, `#detailStatus`, `#detailCreatedAt`, `#detailUpdatedAt`, `#detailDueDate`, `#detailPhase`, `#detailMilestone`, `#detailSprint`, `#detailChecklist`, `#detailAttachments`, `#roadmapEntityModal`, `#roadmapEntityModalTitle`, `#roadmapEntityModalCloseBtn`, `#roadmapEntityForm`, `#roadmapEntityKind`, `#roadmapEntityId`, `#roadmapEntityExistingSprintRow`, `#roadmapEntityExistingSprint`, `#roadmapEntityTitle`, `#roadmapEntitySingleDateRow`, `#roadmapEntityDateLabel`, `#roadmapEntityDate`, `#roadmapEntityRangeRow`, `#roadmapEntityStartDate`, `#roadmapEntityEndDate`, `#roadmapEntityModalCancelBtn`, `#roadmapEntityModalSaveBtn`, `#undoToast`, `#undoToastText`, `#undoBtn`.
- Ported markup reuses the existing `legacy.css` class names and structure. No Tailwind classes.
- Screenshot baselines for this sub-project are captured against **legacy** in Task 2, before any port code; ports must match them. Never run `--update-snapshots` after Task 2. The 5 existing baselines never change.
- A port deletes the legacy render/event code it replaces in the same commit — nothing is rendered by both.
- Parity is the bar. Improvements are filed, not built.
- Components never import `src/legacy/main.js`. Actions are plain modules; nothing is exposed on `window`.
- `notifyAppStateChanged()` and `closeDialog()` are never called during a React render or React lifecycle method; selectors are read-only.
- Tests are black-box: Playwright drives the page only through DOM, URL, keyboard and pointer input (plus the existing fake-disk doubles).
- Every task ends with `npm run test:unit`, then `npm run build && npm test`, all passing. Stage explicit paths (never `git add -A`).
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Facts the tasks rely on

- Playwright serves `dist/` via `npm run preview` on `127.0.0.1:4173` with `reuseExistingServer: true`. **Always `npm run build` before Playwright**, and make sure nothing else is listening on 4173 (`lsof -iTCP:4173 -sTCP:LISTEN`).
- Starting counts: Vitest **829**, Playwright **105** (100 e2e + 5 visual).
- `src/legacy/main.js` is one ES module whose functions are module-level (indented 8 spaces). Its last lines are `setPersistenceHost({...})`, `cacheRefs()`, `bindStaticUiEvents()`, `init()`. Line numbers below are approximate — find code by content.
- `runPortfolioTaskMutation` and `runPortfolioBoardMutation` re-call `openPortfolioTaskDetails(...)` when `appState.portfolioDetailContext` matches, **synchronously** (before their first `await`). That is how an open detail modal refreshes.
- The legacy shortcut dispatcher reads `getShortcutModalContext()`; precedence `taskModal` > `detailModal` > `roadmapEntityModal` > `shortcutsModal` > `helpModal` > `global`. The `close-modal` entry (Escape) calls `closeModal(); closeDetailModal(); closeRoadmapEntityModal(); closeDialog();`.
- Radix Dialog (modal): focuses the first tabbable in Content on open unless `onOpenAutoFocus` calls `preventDefault()`; calls `onCloseAutoFocus` in a `setTimeout` after unmount; sets `body.style.pointerEvents = 'none'`; routes Escape (capture-phase document listener), outside pointer-down, and `Dialog.Close` to `onOpenChange(false)`. `onPointerDownOutside(event)` receives a `CustomEvent` whose original DOM event is `event.detail.originalEvent`; calling `event.preventDefault()` cancels dismissal.
- `formatDateTime` (detail Created/Updated) uses `toLocaleString()` — visual tests must pin locale and timezone.
- The detail modal's containers are CSS grid/flex (`.detail-item`, `.detail-checklist-item`, `.detail-attachment-item`), so whitespace text nodes in legacy markup have no visual effect; JSX needs no `{' '}`.
- Browser `alert()`/`confirm()` in Playwright: register `page.once('dialog', (d) => d.accept())` before the triggering action.
- `EFFORT_BUCKETS = ['XS', 'S', 'M', 'L', 'XL']`.

## File map

| File | Task | Responsibility |
|---|---|---|
| `tests/support/portfolio.js` | create T1, modify T2 | Shared Playwright harness: board payloads, seeding, queries, dialog helpers |
| `tests/app.test.js` | modify T1, T4, T5, T6 | Imports harness; new behaviour tests |
| `tests/visual.test.js` | modify T2 | 9 new legacy baselines |
| `tests/visual.test.js-snapshots/*.png` | create T2 | Baselines |
| `src/state/store.js` | modify T3 | `dialogProps`, `undoToast` |
| `src/actions/dialogs.js` | modify T3 | `openDialog(name, props)`, `closeDialog(name?)` with `flushSync` |
| `src/actions/legacyHost.js` | create T3 | `setLegacyHost` + delegating actions |
| `tests/unit/dialogs.test.js` | modify T3 | New dialog-action cases |
| `tests/unit/legacyHost.test.js` | create T3 | Host delegation |
| `src/components/dialogs/useReturnFocus.js` | modify T3 | Restore guard, `initialFocus` |
| `src/components/IslandErrorBoundary.jsx` | modify T3 | `onError` |
| `src/components/AppIslands.jsx` | modify T3, T4, T5, T6 | Islands with `onError` |
| `src/components/UndoToast.jsx` | create T4 | Undo toast |
| `src/components/dialogs/keepOpenOnUndoToast.js` | create T5 | Shared `onPointerDownOutside` guard |
| `src/components/dialogs/RoadmapEntityDialog.jsx` | create T5 | Roadmap entity modal |
| `src/components/dialogs/TaskDetailDialog.jsx` | create T6 | Task detail modal |
| `src/legacy/main.js` | modify T4, T5, T6 | View models, host registration, deletions |
| `index.html` | modify T4, T5, T6 | Delete static blocks |
| `README.md` | modify T6 | Architecture + test counts |

---

### Task 1: Move the Playwright harness into `tests/support/portfolio.js`

**Files:**
- Create: `tests/support/portfolio.js`
- Modify: `tests/app.test.js` (helper section, lines ~5–406)

**Interfaces:**
- Consumes: nothing.
- Produces (CommonJS `module.exports` of `tests/support/portfolio.js`): `FIXED_TIMESTAMP`, `buildBoardPayload({ title, tasks, extensions })`, `gotoApp(page)`, `seedPortfolioBoards(page, boards, { selectedBoardId, sortKey })`, `portfolioBoardChip(page, title)`, `selectPortfolioBoard(page, title)`, `readSavedBoard(page, boardLabel)`, `waitForBoardWrites(page, minCount = 1)`, `portfolioCard(page, title)`, `focusIsInside(page, selector)`, `closeDialogBy(page, dialogId, method)` where `method` is `'Escape' | 'close button' | 'footer button' | 'cancel button' | 'overlay click'`.

This is a pure move plus one new `closeDialogBy` branch. No test changes behaviour; Playwright stays at 105.

- [ ] **Step 1: Create `tests/support/portfolio.js` by moving code verbatim**

Create the file with this header:

```js
'use strict';

// Shared Playwright harness for the black-box suites (app.test.js and
// visual.test.js). Board payload builders, seeding through the real Import and
// drop flows with a fake File System Access disk, and page queries. Not a test
// file: Playwright only collects *.test.js.

const { expect } = require('@playwright/test');
```

Then **cut** these definitions from `tests/app.test.js` and paste them, unchanged and in this order, below the header: the constants `FIXED_TIMESTAMP`, `BOARD_APP_ID`, `BOARD_SCHEMA_VERSION`, `DEFAULT_COLUMNS`; functions `buildDefaultColumns`, `buildTaskPayload`, `buildBoardPayload`, `gotoApp`; the comment block and function `seedPortfolioBoards`; `escapeForRegExp`, `portfolioBoardChip`, `selectPortfolioBoard`; the comment and function `readSavedBoard`; the comment and function `waitForBoardWrites`; `portfolioCard`; `focusIsInside`; `closeDialogBy`.

Leave every other helper in `tests/app.test.js` (`portfolioProjectChipButtons`, `openTaskEditor`, `renameTaskViaEditor`, `setTimelineSlider`, `mockNewProjectFlow`, `mockImportProjectsPicker`, `mutateExternalBoardFile`, `triggerExternalFileCheck`, `portfolioTitlesInColumn`, `installControlledPortfolioWriter`).

- [ ] **Step 2: Add the `'cancel button'` method to `closeDialogBy`**

In `tests/support/portfolio.js`, `closeDialogBy` becomes:

```js
async function closeDialogBy(page, dialogId, method) {
  if (method === 'Escape') {
    await page.keyboard.press('Escape');
  } else if (method === 'close button') {
    await page.locator(`#${dialogId}CloseBtn`).click();
  } else if (method === 'footer button') {
    await page.locator(`#${dialogId}FooterCloseBtn`).click();
  } else if (method === 'cancel button') {
    await page.locator(`#${dialogId}CancelBtn`).click();
  } else if (method === 'overlay click') {
    await page.locator(`#${dialogId}`).click({ position: { x: 5, y: 5 } });
  } else {
    throw new Error(`Unknown dialog close method: ${method}`);
  }
}
```

- [ ] **Step 3: Export the harness**

At the end of `tests/support/portfolio.js`:

```js
module.exports = {
  FIXED_TIMESTAMP,
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  portfolioBoardChip,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy
};
```

- [ ] **Step 4: Import it in `tests/app.test.js`**

Directly below `const { test, expect } = require('@playwright/test');`:

```js
const {
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy
} = require('./support/portfolio');
```

- [ ] **Step 5: Check nothing is defined twice or left dangling**

Run: `node -e "require('./tests/support/portfolio.js'); console.log('ok')"`
Expected: `ok`

Run: `grep -nE "^(async )?function (buildDefaultColumns|buildTaskPayload|buildBoardPayload|gotoApp|seedPortfolioBoards|escapeForRegExp|portfolioBoardChip|selectPortfolioBoard|readSavedBoard|waitForBoardWrites|portfolioCard|focusIsInside|closeDialogBy)\b|^const (FIXED_TIMESTAMP|BOARD_APP_ID|BOARD_SCHEMA_VERSION|DEFAULT_COLUMNS)\b" tests/app.test.js`
Expected: no output.

Run: `grep -nE "\b(FIXED_TIMESTAMP|BOARD_APP_ID|BOARD_SCHEMA_VERSION|DEFAULT_COLUMNS|buildDefaultColumns|buildTaskPayload|escapeForRegExp|portfolioBoardChip)\b" tests/app.test.js`
Expected: no output (no remaining helper uses these; if one does, add it to the import list and to `module.exports` rather than duplicating it).

- [ ] **Step 6: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 829 passed; Playwright 105 passed.

- [ ] **Step 7: Commit**

```bash
git add tests/support/portfolio.js tests/app.test.js
git commit -m "test: move the Playwright board harness into tests/support

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Legacy screenshot baselines for detail, roadmap entity and undo toast

**Files:**
- Modify: `tests/support/portfolio.js` (`buildTaskPayload`, `module.exports`)
- Modify: `tests/visual.test.js`
- Create: `tests/visual.test.js-snapshots/` (9 PNGs)

**Interfaces:**
- Consumes: Task 1 harness.
- Produces: baselines Tasks 4–6 must match: `task-detail-full-light`, `task-detail-full-dark`, `task-detail-readonly-light`, `roadmap-new-milestone-light`, `roadmap-new-milestone-dark`, `roadmap-edit-phase-light`, `roadmap-add-to-sprint-light`, `undo-toast-light`, `undo-toast-dark`. `buildTaskPayload` passes through `task.attachments` when given.

No source change. The first run fails because no baseline exists and writes it.

- [ ] **Step 1: Let seeded tasks carry attachments**

In `tests/support/portfolio.js`, in `buildTaskPayload`'s returned object, add after `sprintId`:

```js
    ...(Array.isArray(task.attachments) ? { attachments: task.attachments } : {}),
```

No existing test passes `attachments`, so their payloads are unchanged.

- [ ] **Step 2: Append the new baselines to `tests/visual.test.js`**

Below the `require('@playwright/test')` line add:

```js
const { seedPortfolioBoards, portfolioCard, FIXED_TIMESTAMP } = require('./support/portfolio');
```

Append at the end of the file:

```js
// 2.1a baselines: task detail, roadmap entity modal, undo toast. Captured
// against legacy; the React ports must match. formatDateTime uses
// toLocaleString, so locale and timezone are pinned.
test.describe('2.1a modals and toast', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const ROADMAP = {
    roadmap: {
      version: 1,
      milestones: [{ id: 'm1', title: 'Beta release', dueDate: '2026-03-15' }],
      phases: [{ id: 'p1', title: 'Build', startDate: '2026-02-01', endDate: '2026-03-31' }],
      sprints: [{ id: 's1', title: 'Sprint 4', startDate: '2026-03-02', endDate: '2026-03-13' }]
    }
  };

  const FULL_TASK = {
    id: 1,
    title: 'Prepare launch checklist',
    status: 'to-do',
    description: 'Coordinate the release with support and marketing.',
    assignees: ['Ana', 'Rui'],
    tags: ['launch', 'q2'],
    blocked: true,
    blockerReason: 'Waiting on legal review',
    priority: 'high',
    effort: 'L',
    dueDate: '2026-03-10',
    phaseId: 'p1',
    milestoneId: 'm1',
    sprintId: 's1',
    checklist: [
      { text: 'Draft release notes', done: true },
      { text: 'Review copy', done: false },
      { text: 'Schedule announcement', done: true }
    ],
    attachments: [
      { id: 'att_img', name: 'mockup.png', mime: 'image/png', sizeBytes: 68, kind: 'image', dataUrl: ONE_PIXEL_PNG, createdAt: FIXED_TIMESTAMP },
      { id: 'att_txt', name: 'notes.txt', mime: 'text/plain', sizeBytes: 16, kind: 'file', dataUrl: 'data:text/plain;base64,aGVsbG8gYXR0YWNobWVudA==', createdAt: FIXED_TIMESTAMP }
    ]
  };

  for (const theme of ['light', 'dark']) {
    test(`task detail, fully populated (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Launch', hasHandle: true, tasks: [FULL_TASK], extensions: ROADMAP }
      ], { selectedBoardId: 'v1' });
      await portfolioCard(page, 'Prepare launch checklist').click();
      await expect(page.locator('#taskDetailModal')).toBeVisible();
      await expect(page.locator('#detailAttachments')).toContainText('notes.txt');
      await expect(page).toHaveScreenshot(`task-detail-full-${theme}.png`, { fullPage: true });
    });

    test(`roadmap entity, new milestone (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Launch', hasHandle: true, tasks: [], extensions: ROADMAP }
      ], { selectedBoardId: 'v1' });
      await page.getByRole('button', { name: 'Roadmap' }).click();
      await page.getByRole('button', { name: 'Add Milestone' }).click();
      await expect(page.locator('#roadmapEntityModal')).toBeVisible();
      await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('New Milestone');
      await expect(page).toHaveScreenshot(`roadmap-new-milestone-${theme}.png`, { fullPage: true });
    });

    test(`undo toast after archiving (${theme})`, async ({ page }) => {
      // The toast hides after 5 s. Fake timers flow with real time until paused,
      // so pause just before archiving: showUndo's timer can never fire.
      await page.clock.install({ time: FIXED_TIME });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.addInitScript((value) => {
        window.localStorage.setItem('teamOsKanbanTheme', value);
      }, theme);
      await page.goto('/');
      await expect(page.locator('#portfolioView')).toBeVisible();
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Launch', hasHandle: true, tasks: [{ id: 1, title: 'Archive me', status: 'backlog' }] }
      ], { selectedBoardId: 'v1' });
      await page.clock.pauseAt(new Date('2026-02-26T12:00:10Z'));
      const card = portfolioCard(page, 'Archive me');
      await card.hover();
      page.once('dialog', (dialog) => dialog.accept());
      await card.locator('button[title="Archive"]').click();
      await expect(page.locator('#undoToast')).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(page).toHaveScreenshot(`undo-toast-${theme}.png`, { fullPage: true });
    });
  }

  test('task detail, read-only board (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [
      {
        id: 'v2',
        title: 'Archive Board',
        hasHandle: false,
        tasks: [{
          id: 1,
          title: 'Read-only task',
          status: 'backlog',
          checklist: [{ text: 'Locked item', done: true }, { text: 'Another item', done: false }]
        }]
      }
    ], { selectedBoardId: 'v2' });
    await portfolioCard(page, 'Read-only task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Read-only task');
    await expect(page).toHaveScreenshot('task-detail-readonly-light.png', { fullPage: true });
  });

  test('roadmap entity, edit phase (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [
      { id: 'v1', title: 'Launch', hasHandle: true, tasks: [], extensions: ROADMAP }
    ], { selectedBoardId: 'v1' });
    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Edit Build' }).click();
    await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('Edit Phase');
    await expect(page.locator('#roadmapEntityStartDate')).toHaveValue('2026-02-01');
    await expect(page).toHaveScreenshot('roadmap-edit-phase-light.png', { fullPage: true });
  });

  test('roadmap entity, add to existing sprint (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [
      {
        id: 'v1',
        title: 'Launch',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'to-do' }
        ],
        extensions: ROADMAP
      }
    ], { selectedBoardId: 'v1' });
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Add to Existing Sprint' }).click();
    await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('Add to Existing Sprint');
    await expect(page).toHaveScreenshot('roadmap-add-to-sprint-light.png', { fullPage: true });
  });
});
```

- [ ] **Step 3: Run to confirm the 9 new baselines are written**

Run: `npm run build && npx playwright test tests/visual.test.js`
Expected: 5 passed (existing), 9 failed with `A snapshot doesn't exist at …, writing actual.`

If the undo-toast tests fail for another reason (seeding times out under `page.clock.install`, or the toast is not visible), stop and report BLOCKED with the error — do not switch to `setFixedTime` without the pause.

- [ ] **Step 4: Run again to confirm the baselines are stable**

Run: `npx playwright test tests/visual.test.js`
Expected: 14 passed. Run it a third time; still 14 passed. If any baseline flickers, find the moving part and fix the test (never loosen the threshold).

- [ ] **Step 5: Look at each new PNG**

Run: `ls tests/visual.test.js-snapshots/`
Expected: 14 files. Read each of the 9 new images and confirm: full detail shows all fields, 3 checklist rows (2 struck through), an image thumbnail row and a FILE row; read-only detail shows disabled checkboxes and `-` under Attachments; the milestone modal shows one date field; the phase modal shows prefilled start/end; the sprint modal shows the Sprint select and no title field; the toast shows "Task archived" with Undo at bottom-left.

- [ ] **Step 6: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 829 passed; Playwright 114 passed.

- [ ] **Step 7: Commit**

```bash
git add tests/support/portfolio.js tests/visual.test.js tests/visual.test.js-snapshots
git commit -m "test(visual): capture legacy baselines for task detail, roadmap entity modal and undo toast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Dialog state, legacy host, focus guard and error recovery

**Files:**
- Modify: `src/state/store.js` (Shell section)
- Modify: `src/actions/dialogs.js`
- Create: `src/actions/legacyHost.js`
- Modify: `src/components/dialogs/useReturnFocus.js`
- Modify: `src/components/IslandErrorBoundary.jsx`
- Modify: `src/components/AppIslands.jsx`
- Test: `tests/unit/dialogs.test.js`, `tests/unit/legacyHost.test.js`

**Interfaces:**
- Consumes: `appState` (`src/state/store.js`); `notifyAppStateChanged`, `subscribe` (`src/bridge/appStore.js`).
- Produces:
  - `appState.activeDialog: null | 'shortcuts' | 'help' | 'taskDetail' | 'roadmapEntity'`; `appState.dialogProps: null | object`; `appState.undoToast: null | { message: string }`.
  - `openDialog(name: string, props: object | null = null): void`
  - `closeDialog(name?: string): void` — no-op if nothing open or `name` given and not the open dialog; otherwise clears `activeDialog` and `dialogProps` and commits with `flushSync`.
  - `setLegacyHost(impl: Partial<Host>): void` and actions `closeTaskDetail(): void`, `toggleTaskDetailChecklistItem(index: number, checked: boolean): unknown`, `closeRoadmapEntity(): void`, `saveRoadmapEntity(draft: { kind, itemId, title, existingSprintId, dueDate, startDate, endDate }): unknown`, `performUndo(): unknown` — each returns what the registered implementation returns.
  - `useReturnFocus({ initialFocus }?: { initialFocus?: { current: HTMLElement | null } }): { onOpenAutoFocus, onCloseAutoFocus }`
  - `IslandErrorBoundary` props `{ island: string, onError?: () => void, children }`.

- [ ] **Step 1: Write failing unit tests for dialog actions**

Replace `tests/unit/dialogs.test.js` with:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { appState } from '../../src/state/store.js';
import { subscribe } from '../../src/bridge/appStore.js';
import { openDialog, closeDialog } from '../../src/actions/dialogs.js';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    appState.activeDialog = null;
    appState.dialogProps = null;
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = subscribe(listener);
    return listener;
  }

  it('starts with no dialog open and no props', () => {
    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
  });

  it('openDialog sets activeDialog and notifies', () => {
    const listener = listen();

    openDialog('help');

    expect(appState.activeDialog).toBe('help');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('openDialog stores the view model as dialogProps', () => {
    openDialog('taskDetail', { readOnly: true });

    expect(appState.dialogProps).toEqual({ readOnly: true });
  });

  it('openDialog without props clears stale dialogProps', () => {
    appState.dialogProps = { stale: true };

    openDialog('help');

    expect(appState.dialogProps).toBe(null);
  });

  it('re-opening the open dialog replaces its props and notifies', () => {
    openDialog('taskDetail', { version: 1 });
    const listener = listen();

    openDialog('taskDetail', { version: 2 });

    expect(appState.activeDialog).toBe('taskDetail');
    expect(appState.dialogProps).toEqual({ version: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and dialogProps and notifies', () => {
    openDialog('roadmapEntity', { kind: 'milestones' });
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog does not notify when no dialog is open', () => {
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) does nothing when a different dialog is open', () => {
    openDialog('help');
    const listener = listen();

    closeDialog('taskDetail');

    expect(appState.activeDialog).toBe('help');
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) closes the matching dialog', () => {
    openDialog('taskDetail', { readOnly: false });
    const listener = listen();

    closeDialog('taskDetail');

    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write failing unit tests for the legacy host**

Create `tests/unit/legacyHost.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import {
  setLegacyHost,
  closeTaskDetail,
  toggleTaskDetailChecklistItem,
  closeRoadmapEntity,
  saveRoadmapEntity,
  performUndo
} from '../../src/actions/legacyHost.js';

// Order matters: the first test runs before any host is registered.
describe('legacy host actions', () => {
  it('do nothing before a host is registered', () => {
    expect(closeTaskDetail()).toBeUndefined();
    expect(toggleTaskDetailChecklistItem(0, true)).toBeUndefined();
    expect(closeRoadmapEntity()).toBeUndefined();
    expect(saveRoadmapEntity({ kind: 'milestones' })).toBeUndefined();
    expect(performUndo()).toBeUndefined();
  });

  it('delegate to the registered host, passing arguments and returning its result', () => {
    const host = {
      closeTaskDetail: vi.fn(() => 'closed-detail'),
      toggleTaskDetailChecklistItem: vi.fn(() => 'toggled'),
      closeRoadmapEntity: vi.fn(() => 'closed-roadmap'),
      saveRoadmapEntity: vi.fn(() => 'saved'),
      performUndo: vi.fn(() => 'undone')
    };
    setLegacyHost(host);
    const draft = { kind: 'phases', itemId: 'p1', title: 'Build' };

    expect(closeTaskDetail()).toBe('closed-detail');
    expect(toggleTaskDetailChecklistItem(2, false)).toBe('toggled');
    expect(closeRoadmapEntity()).toBe('closed-roadmap');
    expect(saveRoadmapEntity(draft)).toBe('saved');
    expect(performUndo()).toBe('undone');

    expect(host.toggleTaskDetailChecklistItem).toHaveBeenCalledWith(2, false);
    expect(host.saveRoadmapEntity).toHaveBeenCalledWith(draft);
    expect(host.closeTaskDetail).toHaveBeenCalledTimes(1);
    expect(host.closeRoadmapEntity).toHaveBeenCalledTimes(1);
    expect(host.performUndo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/dialogs.test.js tests/unit/legacyHost.test.js`
Expected: `dialogs.test.js` — failures on `dialogProps` (`expected undefined to be null`) and on `closeDialog('taskDetail')` closing `help`; `legacyHost.test.js` — `Failed to load url ../../src/actions/legacyHost.js`.

- [ ] **Step 4: Extend the store**

In `src/state/store.js`, the Shell section becomes:

```js
    // --- Shell: theme, shortcuts, undo, dialogs ---
    undoAction: null,
    undoTimer: null,
    undoToast: null, // null | { message }
    activeTheme: 'light',
    ShortcutRegistry: [],
    activeDialog: null, // null | 'shortcuts' | 'help' | 'taskDetail' | 'roadmapEntity'
    dialogProps: null, // view model of the open dialog, built by its opener
```

- [ ] **Step 5: Rewrite `src/actions/dialogs.js`**

```js
// Dialog actions, shared by legacy code and React components. Plain module
// functions -- never exposed on window.

import { flushSync } from 'react-dom';
import { appState } from '../state/store.js';
import { notifyAppStateChanged } from '../bridge/appStore.js';

// Opens `name` with an optional view model. Re-opening the dialog that is
// already open replaces its props; the Radix root stays mounted.
export function openDialog(name, props = null) {
    appState.activeDialog = name;
    appState.dialogProps = props;
    notifyAppStateChanged();
}

// Closes the open dialog, or only `name` when given. Commits synchronously:
// legacy code often moves focus right after closing a dialog (e.g. into the
// task editor), and Radix's focus trap must already be unmounted by then.
// Never call this during a React render or lifecycle method.
export function closeDialog(name) {
    if (appState.activeDialog === null) return;
    if (name !== undefined && appState.activeDialog !== name) return;
    appState.activeDialog = null;
    appState.dialogProps = null;
    flushSync(() => notifyAppStateChanged());
}
```

- [ ] **Step 6: Create `src/actions/legacyHost.js`**

```js
// Seams where React components hand control back to legacy behaviour that has
// not moved out of src/legacy/main.js yet (Phase 2.1a). Legacy registers the
// real implementations at startup; the defaults are no-ops so this module can
// be used without a document. Components import these actions, never legacy.

const host = {
    closeTaskDetail: () => {},
    toggleTaskDetailChecklistItem: () => {},
    closeRoadmapEntity: () => {},
    saveRoadmapEntity: () => {},
    performUndo: () => {}
};

export function setLegacyHost(impl = {}) {
    Object.assign(host, impl);
}

export const closeTaskDetail = () => host.closeTaskDetail();
export const toggleTaskDetailChecklistItem = (index, checked) => host.toggleTaskDetailChecklistItem(index, checked);
export const closeRoadmapEntity = () => host.closeRoadmapEntity();
export const saveRoadmapEntity = (draft) => host.saveRoadmapEntity(draft);
export const performUndo = () => host.performUndo();
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/dialogs.test.js tests/unit/legacyHost.test.js`
Expected: 11 passed (9 + 2), no warnings in output.

- [ ] **Step 8: Rewrite `src/components/dialogs/useReturnFocus.js`**

```js
import { useRef } from 'react';

// Radix returns focus to Dialog.Trigger on close, but our dialogs are opened by
// legacy buttons, cards and keyboard shortcuts outside React, so there is no
// Trigger. Capture the focused element just before Radix moves focus into the
// dialog, and hand focus back on close -- but only when closing lost focus
// (it fell to body) and the element is still in the document. Legacy code that
// already moved focus elsewhere (e.g. into the task editor) keeps it.
//
// `initialFocus` is an optional ref; when set, it receives focus on open
// instead of Radix's default (the first tabbable element).
// Spread the result onto Dialog.Content.
export function useReturnFocus({ initialFocus } = {}) {
    const returnTargetRef = useRef(null);
    return {
        onOpenAutoFocus: (event) => {
            returnTargetRef.current = document.activeElement;
            if (initialFocus?.current) {
                event.preventDefault();
                initialFocus.current.focus();
            }
        },
        onCloseAutoFocus: (event) => {
            event.preventDefault();
            const target = returnTargetRef.current;
            returnTargetRef.current = null;
            const focusWasLost = !document.activeElement || document.activeElement === document.body;
            if (focusWasLost && target?.isConnected) {
                target.focus();
            }
        }
    };
}
```

- [ ] **Step 9: Add `onError` to `src/components/IslandErrorBoundary.jsx`**

```jsx
import { Component } from 'react';
import { Logger } from '../logger.js';

// A render error in one island is logged and that island renders nothing; the
// legacy app and every other island keep working. `onError` clears the failed
// island's app state (e.g. closes its dialog so shortcuts are not left
// suppressed). It runs in a microtask, outside React's commit phase, because
// closing a dialog commits with flushSync.
export class IslandErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        Logger.error('React island failed', { island: this.props.island, error });
        const { onError } = this.props;
        if (onError) queueMicrotask(onError);
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
```

- [ ] **Step 10: Pass `onError` for the existing dialogs in `src/components/AppIslands.jsx`**

```jsx
import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog.jsx';
import { closeDialog } from '../actions/dialogs.js';

// The single React root. Each island is wrapped in its own error boundary;
// `onError` clears the island's state if it fails to render. Dialogs portal to
// document.body; later islands use createPortal into the legacy containers
// they replace.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="ShortcutsDialog" onError={() => closeDialog('shortcuts')}>
                <ShortcutsDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="HelpDialog" onError={() => closeDialog('help')}>
                <HelpDialog />
            </IslandErrorBoundary>
        </>
    );
}
```

- [ ] **Step 11: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 836 passed; Playwright 114 passed (the 2.0 focus-return tests prove the new restore guard still returns focus to the header buttons).

- [ ] **Step 12: Check the browser console for React warnings**

After `npm run build`, write a throwaway Playwright script outside the repo (or a temporary test deleted before committing) that loads `http://127.0.0.1:4173/`, records `console` messages of type `error`/`warning` and `pageerror` events, opens Help with `#openHelpBtn`, closes it with Escape, opens Shortcuts with `Shift+/`, closes it with `#shortcutsModalFooterCloseBtn`, and prints what it recorded.
Expected: nothing — in particular no `flushSync was called from inside a lifecycle method` warning. Do not commit the script or leave a server running.

- [ ] **Step 13: Commit**

```bash
git add src/state/store.js src/actions/dialogs.js src/actions/legacyHost.js src/components/dialogs/useReturnFocus.js src/components/IslandErrorBoundary.jsx src/components/AppIslands.jsx tests/unit/dialogs.test.js tests/unit/legacyHost.test.js
git commit -m "feat: dialog props, legacy host seam, focus-restore guard and island error recovery

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Port the undo toast

**Files:**
- Create: `src/components/UndoToast.jsx`
- Modify: `src/components/AppIslands.jsx`
- Modify: `src/legacy/main.js` (imports; `showUndo`/`hideUndo` ~2654–2675; `bindStaticUiEvents` `#undoBtn` listener ~4743; host registration next to `setPersistenceHost` ~4826)
- Modify: `index.html` (delete `#undoToast` block)
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `useAppState` (`src/bridge/appStore.js`); `performUndo`, `setLegacyHost` (`src/actions/legacyHost.js`); `notifyAppStateChanged`; `appState.undoToast` (Task 3); harness `seedPortfolioBoards`, `portfolioCard`.
- Produces: `UndoToast` (named export, no props). Legacy registers `setLegacyHost({ performUndo })`; Tasks 5 and 6 add keys to this same call.

- [ ] **Step 1: Write the failing test**

In `tests/app.test.js`, directly after the test `'archiving a task can be undone from the toast'`, add:

```js
  test('undo toast is removed from the page after clicking Undo', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Toast task', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Toast task');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();
    await expect(page.locator('#undoToast')).toBeVisible();
    await expect(page.locator('#undoToastText')).toHaveText('Task archived');

    await page.locator('#undoBtn').click();

    await expect(page.locator('#undoToast')).toHaveCount(0);
    await expect(portfolioCard(page, 'Toast task')).toBeVisible();
  });
```

- [ ] **Step 2: Run it to verify it fails against legacy**

Run: `npm run build && npx playwright test tests/app.test.js -g "undo toast is removed"`
Expected: FAIL at `toHaveCount(0)` — `Expected: 0, Received: 1` (legacy only removes `.active`).

- [ ] **Step 3: Create `src/components/UndoToast.jsx`**

```jsx
import { createPortal } from 'react-dom';
import { useAppState } from '../bridge/appStore.js';
import { performUndo } from '../actions/legacyHost.js';

// Legacy markup and classes, rendered only while a toast is showing. A plain
// component rather than Radix Toast, which would add swipe, a viewport and
// aria-live that legacy never had. pointer-events: auto keeps Undo clickable
// while a Radix modal has set pointer-events: none on body.
export function UndoToast() {
    const toast = useAppState((s) => s.undoToast);
    if (!toast) return null;

    return createPortal(
        <div className="undo-toast active" id="undoToast" style={{ pointerEvents: 'auto' }}>
            <span className="undo-toast-text" id="undoToastText">{toast.message}</span>
            <button className="btn" id="undoBtn" onClick={() => performUndo()}>Undo</button>
        </div>,
        document.body
    );
}
```

- [ ] **Step 4: Render it from `src/components/AppIslands.jsx`**

Add the import `import { UndoToast } from './UndoToast.jsx';` and, as the last child of the fragment:

```jsx
            <IslandErrorBoundary island="UndoToast">
                <UndoToast />
            </IslandErrorBoundary>
```

(No `onError`: a failed toast leaves no input suppressed.)

- [ ] **Step 5: Drive the toast from legacy state**

In `src/legacy/main.js`, add to the imports (after the `../actions/dialogs.js` import):

```js
import { setLegacyHost } from '../actions/legacyHost.js';
```

Replace `showUndo` and `hideUndo` with:

```js
        function showUndo(message, undoFn) {
            appState.undoAction = undoFn;
            appState.undoToast = { message };
            notifyAppStateChanged();
            if (appState.undoTimer) clearTimeout(appState.undoTimer);
            appState.undoTimer = setTimeout(() => hideUndo(), 5000);
        }

        function hideUndo() {
            if (appState.undoTimer) {
                clearTimeout(appState.undoTimer);
                appState.undoTimer = null;
            }
            appState.undoAction = null;
            appState.undoToast = null;
            notifyAppStateChanged();
        }
```

`performUndo` is unchanged.

- [ ] **Step 6: Register the host and delete the legacy toast wiring**

In `src/legacy/main.js`, directly after the `setPersistenceHost({ ... });` call:

```js
        // React components call back into legacy behaviour through these seams;
        // see src/actions/legacyHost.js.
        setLegacyHost({
            performUndo
        });
```

Delete from `bindStaticUiEvents`:

```js
            document.getElementById('undoBtn')?.addEventListener('click', performUndo);
```

In `index.html`, delete:

```html
    <div class="undo-toast" id="undoToast">
        <span class="undo-toast-text" id="undoToastText"></span>
        <button class="btn" id="undoBtn">Undo</button>
    </div>
```

and the blank line after it.

Run: `grep -n "undoToast\|undoBtn" src/legacy/main.js index.html`
Expected: no output.

- [ ] **Step 7: Run the new and existing undo tests**

Run: `npm run build && npx playwright test tests/app.test.js -g "undo"`
Expected: `archiving a task can be undone from the toast` and `undo toast is removed from the page after clicking Undo` pass.

- [ ] **Step 8: Verify the toast baselines match**

Run: `npx playwright test tests/visual.test.js`
Expected: 14 passed. On an `undo-toast-*` diff, inspect the diff image in `test-results/` and fix the component; never update baselines.

- [ ] **Step 9: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 836 passed; Playwright 115 passed.

- [ ] **Step 10: Commit**

```bash
git add src/components/UndoToast.jsx src/components/AppIslands.jsx src/legacy/main.js index.html tests/app.test.js
git commit -m "feat: port the undo toast to React

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Port the roadmap entity modal

**Files:**
- Create: `src/components/dialogs/keepOpenOnUndoToast.js`
- Create: `src/components/dialogs/RoadmapEntityDialog.jsx`
- Modify: `src/components/AppIslands.jsx`
- Modify: `src/legacy/main.js` (`buildRoadmapSprintSelectionOptionMarkup` ~763; `closeRoadmapEntityModal`/`openRoadmapEntityModal`/`buildRoadmapEntityDraftFromForm`/`saveRoadmapEntity` ~3360–3517; `getShortcutModalContext` ~3889; `bindStaticUiEvents` ~4740–4742 and overlay listener ~4784; `setLegacyHost` call)
- Modify: `index.html` (delete `#roadmapEntityModal` block)
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `useAppState`; `closeRoadmapEntity`, `saveRoadmapEntity`, `setLegacyHost` (`src/actions/legacyHost.js`); `openDialog`, `closeDialog(name)`; `useReturnFocus({ initialFocus })`; harness `seedPortfolioBoards`, `portfolioCard`, `focusIsInside`, `closeDialogBy`.
- Produces:
  - `keepOpenOnUndoToast(event: CustomEvent): void` — Radix `onPointerDownOutside` handler; Task 6 reuses it.
  - `RoadmapEntityDialog` (named export, no props).
  - Roadmap view model shape: `{ kind, itemId, mode, heading, saveLabel, dateMode, dateLabel, showExistingSprint, initial: { title, dueDate, startDate, endDate }, sprintOptions: [{ value, label }], initialFocus: 'title' | 'existingSprint' }`.
  - Legacy `saveRoadmapEntity(input)` takes the draft; `closeRoadmapEntityModal()` clears context then `closeDialog('roadmapEntity')`.

- [ ] **Step 1: Write the behaviour tests**

In `tests/app.test.js`, directly after the test `'roadmap entity modal traps shortcut context and Escape closes it'`, add:

```js
  const ROADMAP_EXTENSION = {
    roadmap: {
      version: 1,
      milestones: [],
      phases: [],
      sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
    }
  };

  async function openAddMilestone(page) {
    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();
  }

  test('roadmap entity modal focuses the title when adding a milestone', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
    ], { selectedBoardId: 'alpha' });

    await openAddMilestone(page);

    await expect(page.locator('#roadmapEntityTitle')).toBeFocused();
  });

  test('roadmap entity modal focuses the sprint select when adding to an existing sprint', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'alpha',
        title: 'Alpha',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'to-do' }
        ],
        extensions: ROADMAP_EXTENSION
      }
    ], { selectedBoardId: 'alpha' });
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: 'Add to Existing Sprint' }).click();

    await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('Add to Existing Sprint');
    await expect(page.locator('#roadmapEntityExistingSprint')).toBeFocused();
  });

  for (const method of ['Escape', 'close button', 'cancel button', 'overlay click']) {
    test(`roadmap entity modal closed by ${method} leaves the page and reopens empty`, async ({ page }) => {
      await seedPortfolioBoards(page, [
        { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
      ], { selectedBoardId: 'alpha' });
      await openAddMilestone(page);
      await expect.poll(() => focusIsInside(page, '#roadmapEntityModal')).toBe(true);
      await page.locator('#roadmapEntityTitle').fill('Unsaved draft');

      await closeDialogBy(page, 'roadmapEntityModal', method);

      await expect(page.locator('#roadmapEntityModal')).toHaveCount(0);
      await page.getByRole('button', { name: 'Add Milestone' }).click();
      await expect(page.locator('#roadmapEntityTitle')).toHaveValue('');
    });
  }

  test('roadmap entity modal keeps legacy validation for a milestone without a date', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
    ], { selectedBoardId: 'alpha' });
    await openAddMilestone(page);
    await page.locator('#roadmapEntityTitle').fill('Gamma');

    let alertMessage = '';
    page.once('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    await page.locator('#roadmapEntityModalSaveBtn').click();

    await expect.poll(() => alertMessage).toBe('Milestone requires a valid due date.');
    await expect(page.locator('#roadmapEntityDate')).toBeFocused();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();
  });
```

- [ ] **Step 2: Run them against legacy**

Run: `npm run build && npx playwright test tests/app.test.js -g "roadmap entity modal"`
Expected: the 4 `closed by …` tests FAIL at `toHaveCount(0)` (`Received: 1`); the two focus tests, the validation test and the existing `traps shortcut context` test PASS (they pin legacy behaviour the port must keep).

- [ ] **Step 3: Create `src/components/dialogs/keepOpenOnUndoToast.js`**

```js
// Radix modal dialogs dismiss on any pointer-down outside their content. The
// undo toast sits above modals (as in legacy) and clicking Undo must not close
// the dialog underneath. Pass as Dialog.Content's onPointerDownOutside.
export function keepOpenOnUndoToast(event) {
    const target = event.detail?.originalEvent?.target;
    if (target instanceof Element && target.closest('#undoToast')) {
        event.preventDefault();
    }
}
```

- [ ] **Step 4: Create `src/components/dialogs/RoadmapEntityDialog.jsx`**

```jsx
import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeRoadmapEntity, saveRoadmapEntity } from '../../actions/legacyHost.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';

export function RoadmapEntityDialog() {
    const open = useAppState((s) => s.activeDialog === 'roadmapEntity');
    const vm = useAppState((s) => (s.activeDialog === 'roadmapEntity' ? s.dialogProps : null));
    const titleRef = useRef(null);
    const sprintRef = useRef(null);
    const returnFocus = useReturnFocus({
        initialFocus: vm?.initialFocus === 'existingSprint' ? sprintRef : titleRef
    });

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeRoadmapEntity(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="roadmapEntityModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        {...returnFocus}
                    >
                        {vm && <RoadmapEntityForm vm={vm} titleRef={titleRef} sprintRef={sprintRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// Remounts on every open (Radix unmounts Content when closed), so the draft
// always starts from the view model's initial values.
function RoadmapEntityForm({ vm, titleRef, sprintRef }) {
    const [draft, setDraft] = useState(() => ({ ...vm.initial, existingSprintId: '' }));
    const bind = (field) => ({
        value: draft[field],
        onChange: (event) => setDraft((current) => ({ ...current, [field]: event.target.value }))
    });
    const hideTitle = vm.showExistingSprint;
    const hideSingleDate = vm.showExistingSprint || vm.dateMode !== 'single';
    const hideDateRange = vm.showExistingSprint || vm.dateMode !== 'range';

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="roadmapEntityModalTitle">{vm.heading}</span>
                </Dialog.Title>
                <Dialog.Close className="modal-close" id="roadmapEntityModalCloseBtn">&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="roadmapEntityForm" onSubmit={(event) => event.preventDefault()}>
                    <input type="hidden" id="roadmapEntityKind" value={vm.kind} />
                    <input type="hidden" id="roadmapEntityId" value={vm.itemId} />
                    <div className={`form-group${vm.showExistingSprint ? '' : ' hidden'}`} id="roadmapEntityExistingSprintRow">
                        <label className="required" htmlFor="roadmapEntityExistingSprint">Sprint</label>
                        <select id="roadmapEntityExistingSprint" ref={sprintRef} {...bind('existingSprintId')}>
                            <option value="">Select sprint</option>
                            {vm.sprintOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className={`form-group${hideTitle ? ' hidden' : ''}`}>
                        <label className="required">Title</label>
                        <input type="text" id="roadmapEntityTitle" ref={titleRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className={`roadmap-entity-date-row single${hideSingleDate ? ' hidden' : ''}`} id="roadmapEntitySingleDateRow">
                        <div className="form-group">
                            <label className="required" id="roadmapEntityDateLabel">{vm.dateLabel}</label>
                            <input type="date" id="roadmapEntityDate" {...bind('dueDate')} />
                        </div>
                    </div>
                    <div className={`roadmap-entity-date-row${hideDateRange ? ' hidden' : ''}`} id="roadmapEntityRangeRow">
                        <div className="form-group">
                            <label className="required">Start Date</label>
                            <input type="date" id="roadmapEntityStartDate" {...bind('startDate')} />
                        </div>
                        <div className="form-group">
                            <label className="required">End Date</label>
                            <input type="date" id="roadmapEntityEndDate" {...bind('endDate')} />
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="roadmapEntityModalCancelBtn">Cancel</Dialog.Close>
                <button
                    className="btn btn-primary"
                    id="roadmapEntityModalSaveBtn"
                    onClick={() => saveRoadmapEntity({ kind: vm.kind, itemId: vm.itemId, ...draft })}
                >
                    {vm.saveLabel}
                </button>
            </div>
        </>
    );
}
```

- [ ] **Step 5: Render it from `src/components/AppIslands.jsx`**

Add imports:

```jsx
import { RoadmapEntityDialog } from './dialogs/RoadmapEntityDialog.jsx';
import { closeRoadmapEntity } from '../actions/legacyHost.js';
```

and, before the `UndoToast` island:

```jsx
            <IslandErrorBoundary island="RoadmapEntityDialog" onError={() => closeRoadmapEntity()}>
                <RoadmapEntityDialog />
            </IslandErrorBoundary>
```

- [ ] **Step 6: Replace the sprint option markup builder in legacy**

In `src/legacy/main.js`, replace `buildRoadmapSprintSelectionOptionMarkup` with:

```js
        function buildRoadmapSprintOptions(items) {
            return (Array.isArray(items) ? items : []).map((item) => {
                const range = formatRoadmapDateRange(item);
                return { value: item.id, label: range ? `${item.title} • ${range}` : item.title };
            });
        }
```

Run: `grep -n "buildRoadmapSprintSelectionOptionMarkup" src/legacy/main.js`
Expected: only the call inside `openRoadmapEntityModal`, replaced in the next step.

- [ ] **Step 7: Make legacy open/close build view models and delegate**

Replace `closeRoadmapEntityModal` and `openRoadmapEntityModal` with:

```js
        function closeRoadmapEntityModal() {
            appState.roadmapEntityContext = null;
            closeDialog('roadmapEntity');
        }

        function openRoadmapEntityModal(kind, itemId = '', options = {}) {
            const boardId = appState.selectedPortfolioBoardId;
            const boardRecord = boardId ? getPortfolioBoardRecord(boardId) : null;
            if (!boardRecord) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const config = getRoadmapEntityConfig(kind);
            if (!config) return;
            const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
            const items = Array.isArray(roadmap[config.itemsKey]) ? roadmap[config.itemsKey] : [];
            const item = itemId ? items.find((entry) => entry.id === itemId) : null;
            const mode = options.mode || 'default';
            const assignExistingMode = mode === 'assign-sprint-from-selection';

            appState.roadmapEntityContext = {
                boardId,
                kind,
                itemId: item?.id || '',
                mode
            };

            openDialog('roadmapEntity', {
                kind,
                itemId: item?.id || '',
                mode,
                heading: mode === 'create-sprint-from-selection'
                    ? 'Create Sprint'
                    : assignExistingMode
                        ? 'Add to Existing Sprint'
                        : `${item ? 'Edit' : 'New'} ${config.label}`,
                saveLabel: assignExistingMode ? 'Add to Sprint' : 'Save Item',
                dateMode: config.dateMode,
                dateLabel: config.dateLabel || 'Date',
                showExistingSprint: assignExistingMode,
                initial: {
                    title: item?.title || '',
                    dueDate: item?.dueDate || '',
                    startDate: item?.startDate || '',
                    endDate: item?.endDate || ''
                },
                sprintOptions: buildRoadmapSprintOptions(roadmap.sprints || []),
                initialFocus: assignExistingMode ? 'existingSprint' : 'title'
            });
        }
```

- [ ] **Step 8: Make `saveRoadmapEntity` take the draft**

Delete `buildRoadmapEntityDraftFromForm` entirely. Change the head of `saveRoadmapEntity` from:

```js
        async function saveRoadmapEntity() {
            const draft = buildRoadmapEntityDraftFromForm();
```

to:

```js
        async function saveRoadmapEntity(input = {}) {
            const draft = {
                kind: input.kind,
                itemId: normalizeRoadmapRef(input.itemId),
                title: String(input.title || '').trim(),
                existingSprintId: normalizeRoadmapRef(input.existingSprintId),
                dueDate: normalizeRoadmapDate(input.dueDate),
                startDate: normalizeRoadmapDate(input.startDate),
                endDate: normalizeRoadmapDate(input.endDate)
            };
```

The rest of the function (validation, alerts, `getElementById(...).focus()`, the three modes, `closeRoadmapEntityModal()` calls) is unchanged.

- [ ] **Step 9: Update the shortcut context, host registration and wiring**

In `getShortcutModalContext`, replace

```js
            const roadmapEntityModalOpen = document.getElementById('roadmapEntityModal').classList.contains('active');
```

with

```js
            const roadmapEntityModalOpen = appState.activeDialog === 'roadmapEntity';
```

Extend the `setLegacyHost` call:

```js
        setLegacyHost({
            closeRoadmapEntity: closeRoadmapEntityModal,
            saveRoadmapEntity,
            performUndo
        });
```

Delete from `bindStaticUiEvents`:

```js
            document.getElementById('roadmapEntityModalCloseBtn')?.addEventListener('click', closeRoadmapEntityModal);
            document.getElementById('roadmapEntityModalCancelBtn')?.addEventListener('click', closeRoadmapEntityModal);
            document.getElementById('roadmapEntityModalSaveBtn')?.addEventListener('click', saveRoadmapEntity);
```

and

```js
            document.getElementById('roadmapEntityModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('roadmapEntityModal')) {
                    closeRoadmapEntityModal();
                }
            });
```

In `index.html`, delete the whole `<div class="modal" id="roadmapEntityModal"> … </div>` block and the blank line after it.

Run: `grep -n "roadmapEntityModal'\|roadmapEntityForm\|roadmapEntityTitle\|roadmapEntityExistingSprint\|buildRoadmapEntityDraftFromForm\|buildRoadmapSprintSelectionOptionMarkup" src/legacy/main.js index.html`
Expected: only `getElementById('roadmapEntityTitle').focus()`, `getElementById('roadmapEntityExistingSprint').focus()`, `getElementById('roadmapEntityDate').focus()`/`StartDate` inside `saveRoadmapEntity`'s validation (kept), and no DOM lookups of `roadmapEntityModal` or `roadmapEntityForm`.

- [ ] **Step 10: Run the roadmap and sprint tests**

Run: `npm run build && npx playwright test tests/app.test.js -g "roadmap|sprint"`
Expected: all pass, including the 7 new tests, `checked board tasks can be grouped into a new sprint`, `checked board tasks can be added to an existing sprint from the bulk action bar`, `bulk sprint creation clears selection and board changes clear stale bulk selection`, `roadmap rows can create and delete milestones while clearing task refs` and `editing an existing roadmap item preserves its ID`.

- [ ] **Step 11: Verify the roadmap baselines match**

Run: `npx playwright test tests/visual.test.js`
Expected: 14 passed. On a `roadmap-*` diff, compare the DOM to the deleted `index.html` block (row `hidden` classes, `single` class, label text) and fix the component; never update baselines.

- [ ] **Step 12: Run the full suites and a console check**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 836 passed; Playwright 122 passed.

Throwaway console check (outside the repo, not committed): seed a writable board with a roadmap through the Import button as the harness does, open Add Milestone, type a title, Cancel; open Edit on an item, Escape; record `console` errors/warnings and `pageerror`. Expected: nothing (no controlled/uncontrolled input warnings, no Radix Title warnings).

- [ ] **Step 13: Commit**

```bash
git add src/components/dialogs/keepOpenOnUndoToast.js src/components/dialogs/RoadmapEntityDialog.jsx src/components/AppIslands.jsx src/legacy/main.js index.html tests/app.test.js
git commit -m "feat: port the roadmap entity modal to Radix Dialog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Port the task detail modal, then document

**Files:**
- Create: `src/components/dialogs/TaskDetailDialog.jsx`
- Modify: `src/components/AppIslands.jsx`
- Modify: `src/legacy/main.js` (`openPortfolioTaskDetails` ~2387–2416; `renderDetailChecklist`, `toggleChecklistItem`, `closeDetailModal` ~3322–3358; `renderDetailAttachments` ~3089–3141; `getShortcutModalContext` ~3888; `cacheRefs` `Refs.taskDetailModal` ~4192; `handleDetailChecklistChange` ~4723; `bindStaticUiEvents` ~4738–4739, overlay listener ~4779, `#detailChecklist` listener ~4813; `setLegacyHost` call)
- Modify: `index.html` (delete `#taskDetailModal` block)
- Modify: `README.md`
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `useAppState`; `closeTaskDetail`, `toggleTaskDetailChecklistItem`, `setLegacyHost`; `openDialog`, `closeDialog(name)`; `useReturnFocus()`; `keepOpenOnUndoToast` (Task 5); harness `seedPortfolioBoards`, `portfolioCard`, `readSavedBoard`, `waitForBoardWrites`, `focusIsInside`, `closeDialogBy`.
- Produces:
  - `TaskDetailDialog` (named export, no props).
  - Detail view model: `{ readOnly: boolean, fields: { title, description, assignees, tags, blocked, blockerReason, priority, effort, status, createdAt, updatedAt, dueDate, phase, milestone, sprint }, checklist: [{ text, done }], attachments: [{ id, name, isImage, dataUrl, subLabel }] }`.
  - Legacy `buildTaskDetailViewModel(source, taskId, readOnly)`; `toggleChecklistItem(itemIndex, checked)`; `closeDetailModal()` clears context then `closeDialog('taskDetail')`.

- [ ] **Step 1: Write the behaviour tests**

In `tests/app.test.js`, directly after the test `'opening edit from task detail closes the detail modal (no modal stacking)'`, add:

```js
  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`task detail modal takes focus and leaves the page when closed by ${method}`, async ({ page }) => {
      await seedPortfolioBoards(page, [
        { id: 'd1', title: 'Detail Project', hasHandle: true, tasks: [{ id: 1, title: 'Detail task', status: 'backlog' }] }
      ], { selectedBoardId: 'd1' });

      await portfolioCard(page, 'Detail task').click();
      await expect(page.locator('#taskDetailModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#taskDetailModal')).toBe(true);

      await closeDialogBy(page, 'taskDetailModal', method);

      await expect(page.locator('#taskDetailModal')).toHaveCount(0);
    });
  }

  test('closing task detail forgets the task, so a later change does not reopen it', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'd1', title: 'Detail Project', hasHandle: true, tasks: [{ id: 1, title: 'Forget me', status: 'backlog' }] }
    ], { selectedBoardId: 'd1' });
    await portfolioCard(page, 'Forget me').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    const card = portfolioCard(page, 'Forget me');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();
    await waitForBoardWrites(page);

    await expect(page.locator('#undoToast')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
  });

  test('toggling a checklist item in task detail saves it and keeps the modal open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Detail Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Checklist task', status: 'backlog', checklist: [{ text: 'Step one', done: false }] }]
      }
    ], { selectedBoardId: 'd1' });
    await portfolioCard(page, 'Checklist task').click();
    const item = page.locator('#detailChecklist .detail-checklist-item').first();

    await item.locator('input[type="checkbox"]').check();

    await expect(item).toHaveClass(/\bdone\b/);
    await expect(item.locator('input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await waitForBoardWrites(page);
    await expect.poll(async () => (await readSavedBoard(page, 'd1')).board.tasks[0].checklist[0].done).toBe(true);
  });

  test('editing from task detail puts focus in the task name with its text selected', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'd1', title: 'Detail Project', hasHandle: true, tasks: [{ id: 1, title: 'Focus target', status: 'backlog' }] }
    ], { selectedBoardId: 'd1' });
    await portfolioCard(page, 'Focus target').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toBeFocused();
    const selection = await page.locator('#taskName').evaluate((input) => ({
      start: input.selectionStart,
      end: input.selectionEnd,
      length: input.value.length
    }));
    expect(selection).toEqual({ start: 0, end: 'Focus target'.length, length: 'Focus target'.length });
  });

  test('undo toast works while task detail is open and leaves the modal open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'd1', title: 'Detail Project', hasHandle: true, tasks: [{ id: 1, title: 'Undo in detail', status: 'backlog' }] }
    ], { selectedBoardId: 'd1' });
    await portfolioCard(page, 'Undo in detail').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.keyboard.press('x');
    await expect(page.locator('#undoToast')).toBeVisible();
    await waitForBoardWrites(page, 1);

    await page.locator('#undoBtn').click();

    await waitForBoardWrites(page, 2);
    await expect.poll(async () => (await readSavedBoard(page, 'd1')).board.tasks[0].archived).toBe(false);
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Undo in detail');
  });
```

- [ ] **Step 2: Run them against legacy**

Run: `npm run build && npx playwright test tests/app.test.js -g "task detail|editing from task detail|forgets the task"`
Expected: the 4 `closed by …` tests FAIL at `toHaveCount(0)` (legacy never focuses inside and keeps the element; the first failure may be `focusIsInside` → `Received: false`). The other 4 new tests PASS against legacy — they pin behaviour the port must keep.

- [ ] **Step 3: Create `src/components/dialogs/TaskDetailDialog.jsx`**

```jsx
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeTaskDetail, toggleTaskDetailChecklistItem } from '../../actions/legacyHost.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';

const FIELD_ROWS = [
    { label: 'Title', id: 'detailTitle', key: 'title' },
    { label: 'Description', id: 'detailDescription', key: 'description' },
    { label: 'Assignees', id: 'detailAssignees', key: 'assignees' },
    { label: 'Tags', id: 'detailTags', key: 'tags' },
    { label: 'Blocked', id: 'detailBlocked', key: 'blocked' },
    { label: 'Blocker', id: 'detailBlockerReason', key: 'blockerReason' },
    { label: 'Priority', id: 'detailPriority', key: 'priority' },
    { label: 'Effort', id: 'detailEffort', key: 'effort' },
    { label: 'Status', id: 'detailStatus', key: 'status' },
    { label: 'Created', id: 'detailCreatedAt', key: 'createdAt' },
    { label: 'Updated', id: 'detailUpdatedAt', key: 'updatedAt' },
    { label: 'Due', id: 'detailDueDate', key: 'dueDate' },
    { label: 'Phase', id: 'detailPhase', key: 'phase' },
    { label: 'Milestone', id: 'detailMilestone', key: 'milestone' },
    { label: 'Sprint', id: 'detailSprint', key: 'sprint' }
];

export function TaskDetailDialog() {
    const open = useAppState((s) => s.activeDialog === 'taskDetail');
    const vm = useAppState((s) => (s.activeDialog === 'taskDetail' ? s.dialogProps : null));
    const returnFocus = useReturnFocus();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeTaskDetail(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="taskDetailModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Task Details</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="taskDetailModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            {vm && <TaskDetailList vm={vm} />}
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="taskDetailModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function TaskDetailList({ vm }) {
    return (
        <div className="detail-list">
            {FIELD_ROWS.map((row) => (
                <div className="detail-item" key={row.id}>
                    <span className="detail-label">{row.label}</span>
                    <span className="detail-value" id={row.id}>{vm.fields[row.key]}</span>
                </div>
            ))}
            <div className="detail-item">
                <span className="detail-label">Todo List</span>
                <ul className="detail-checklist" id="detailChecklist">
                    {vm.checklist.length === 0
                        ? <li className="detail-value">-</li>
                        : vm.checklist.map((item, index) => (
                            <li className={`detail-checklist-item ${item.done ? 'done' : ''}`} key={index}>
                                <input
                                    type="checkbox"
                                    checked={item.done}
                                    disabled={vm.readOnly}
                                    onChange={(event) => toggleTaskDetailChecklistItem(index, event.target.checked)}
                                />
                                <span className="detail-checklist-text">{item.text}</span>
                            </li>
                        ))}
                </ul>
            </div>
            <div className="detail-item">
                <span className="detail-label">Attachments</span>
                <div className="detail-attachments" id="detailAttachments">
                    {vm.attachments.length === 0
                        ? <div className="detail-attachments-empty">-</div>
                        : vm.attachments.map((item) => (
                            <div className="detail-attachment-item" key={item.id}>
                                {item.isImage
                                    ? <img className="detail-attachment-thumb" alt="" src={item.dataUrl} />
                                    : <span className="attachment-editor-icon">FILE</span>}
                                <div className="detail-attachment-meta">
                                    <div className="detail-attachment-name">{item.name}</div>
                                    <div className="detail-attachment-sub">{item.subLabel}</div>
                                </div>
                                <a className="detail-attachment-download" href={item.dataUrl} download={item.name || 'attachment'}>Download</a>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Render it from `src/components/AppIslands.jsx`**

Add `import { TaskDetailDialog } from './dialogs/TaskDetailDialog.jsx';`, extend the legacy-host import to `import { closeRoadmapEntity, closeTaskDetail } from '../actions/legacyHost.js';`, and add before the `RoadmapEntityDialog` island:

```jsx
            <IslandErrorBoundary island="TaskDetailDialog" onError={() => closeTaskDetail()}>
                <TaskDetailDialog />
            </IslandErrorBoundary>
```

- [ ] **Step 5: Build the detail view model in legacy**

In `src/legacy/main.js`, replace `openPortfolioTaskDetails` with:

```js
        function buildTaskDetailViewModel(source, taskId, readOnly) {
            const task = normalizeTask(source.task);
            const statusMap = Object.fromEntries((source.boardData.board.columns || []).map(col => [col.status, col.title]));
            const roadmap = getRoadmapExtension(source.boardData);
            return {
                readOnly,
                fields: {
                    title: task.title || '-',
                    description: task.description || '-',
                    assignees: formatAssignees(task.assignees) || '-',
                    tags: normalizeTags(task.tags).join(', ') || '-',
                    blocked: task.blocked ? 'Yes' : 'No',
                    blockerReason: task.blocked ? (normalizeBlockerReason(task.blockerReason) || '-') : '-',
                    priority: task.priority ? (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : '-',
                    effort: task.effort || '-',
                    status: (statusMap[task.status] || task.status) || '-',
                    createdAt: formatDateTime(task.createdAt),
                    updatedAt: formatDateTime(task.updatedAt),
                    dueDate: formatDueDateForUi(task.dueDate) || '-',
                    phase: getRoadmapItemTitle(roadmap, 'phases', task.phaseId) || '-',
                    milestone: getRoadmapItemTitle(roadmap, 'milestones', task.milestoneId) || '-',
                    sprint: getRoadmapItemTitle(roadmap, 'sprints', task.sprintId) || '-'
                },
                checklist: normalizeChecklist(task.checklist).map((item) => ({ text: item.text, done: Boolean(item.done) })),
                attachments: getTaskAttachments(source.boardData, taskId)
                    .map(normalizeAttachmentRecord)
                    .filter(Boolean)
                    .map((item) => ({
                        id: item.id,
                        name: item.name,
                        isImage: item.kind === 'image',
                        dataUrl: item.dataUrl,
                        subLabel: `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`
                    }))
            };
        }

        function openPortfolioTaskDetails(boardId, taskId, options = {}) {
            const source = findPortfolioTaskDetailSource(boardId, taskId, options);
            if (!source) return;
            setSelectedPortfolioCard(boardId, taskId);
            const readOnly = options.readOnly === true || !canUsePortfolioTaskMutations(boardId);

            appState.portfolioDetailContext = { boardId, taskId, readOnly };
            openDialog('taskDetail', buildTaskDetailViewModel(source, taskId, readOnly));
        }
```

- [ ] **Step 6: Close through state and simplify the checklist toggle**

Replace `closeDetailModal` with:

```js
        function closeDetailModal() {
            appState.portfolioDetailContext = null;
            closeDialog('taskDetail');
        }
```

Change `toggleChecklistItem`'s signature and nothing else in its body:

```js
        async function toggleChecklistItem(itemIndex, checked) {
```

Delete `renderDetailChecklist`, `renderDetailAttachments` and `handleDetailChecklistChange` entirely.

- [ ] **Step 7: Update shortcut context, host registration, refs and wiring**

In `getShortcutModalContext`, replace

```js
            const detailModalOpen = document.getElementById('taskDetailModal').classList.contains('active');
```

with

```js
            const detailModalOpen = appState.activeDialog === 'taskDetail';
```

Extend `setLegacyHost`:

```js
        setLegacyHost({
            closeTaskDetail: closeDetailModal,
            toggleTaskDetailChecklistItem: toggleChecklistItem,
            closeRoadmapEntity: closeRoadmapEntityModal,
            saveRoadmapEntity,
            performUndo
        });
```

Delete from `cacheRefs`: `Refs.taskDetailModal = document.getElementById('taskDetailModal');`

Delete from `bindStaticUiEvents`:

```js
            document.getElementById('taskDetailModalCloseBtn')?.addEventListener('click', closeDetailModal);
            document.getElementById('taskDetailModalFooterCloseBtn')?.addEventListener('click', closeDetailModal);
```

```js
            document.getElementById('taskDetailModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('taskDetailModal')) {
                    closeDetailModal();
                }
            });
```

```js
            document.getElementById('detailChecklist')?.addEventListener('change', handleDetailChecklistChange);
```

In `index.html`, delete the whole `<div class="modal" id="taskDetailModal"> … </div>` block and the blank line after it.

Run: `grep -n "taskDetailModal\|detailChecklist\|detailAttachments\|renderDetailChecklist\|renderDetailAttachments\|handleDetailChecklistChange\|getElementById('detail" src/legacy/main.js index.html`
Expected: no output.

Run: `grep -n "toggleChecklistItem(" src/legacy/main.js`
Expected: only the definition `async function toggleChecklistItem(itemIndex, checked)`.

Run: `grep -n "formatFileSize\|normalizeAttachmentRecord\|normalizeChecklist\|formatRoadmapDateRange" src/legacy/main.js | head`
Expected: each still referenced at least once besides its import (do not remove imports that are still used).

- [ ] **Step 8: Run the detail, undo and keyboard tests**

Run: `npm run build && npx playwright test tests/app.test.js -g "detail|undo|keyboard|attachments|tags can be added|historical roadmap|aggregate calendar"`
Expected: all pass, including the 8 new tests, `read-only task detail keyboard shortcuts do not open edit or mutate`, `opening edit from task detail closes the detail modal (no modal stacking)`, `task detail modal scrolls when content exceeds the viewport`, `historical roadmap task rows open the detail modal with projected read-only data`, `task attachments save on the task and show in task details`, `card keyboard shortcuts support selection, move, open details, and edit/save` and `hovered card shortcuts take priority over the selected card`.

- [ ] **Step 9: Verify all baselines match**

Run: `npx playwright test tests/visual.test.js`
Expected: 14 passed. On a `task-detail-*` diff, compare field strings first (date format, `'-'` fallbacks, priority capitalisation, attachment sub-label), then structure against the deleted `index.html` block. Fix the builder or component; never update baselines.

- [ ] **Step 10: Browser console check**

Throwaway script outside the repo (not committed): seed a writable board with a task that has a checklist and an attachment, open detail by click, toggle a checklist item, press Escape; open detail, press `e`, close the editor with Escape; archive from detail with `x` (accept the confirm), click Undo; record `console` errors/warnings and `pageerror`. Expected: nothing (no key warnings, no `flushSync` lifecycle warning, no Radix Title/Description warnings).

- [ ] **Step 11: Update `README.md`**

In the `src/components/` bullet, after the sentence about Shortcuts and Help, add: `The task detail modal, roadmap entity modal and undo toast are React too (Phase 2.1a): legacy builds a display-ready view model and calls openDialog(name, viewModel), and components call back into legacy through src/actions/legacyHost.js.`

In the `src/actions/` bullet, replace its example list with `(openDialog / closeDialog, and legacyHost.js — the seam through which components reach legacy behaviour not yet moved out of src/legacy/main.js)`.

In Testing, set the Vitest count to the number printed by `npm run test:unit` (expected 836), the black-box e2e count to the Playwright total minus visual baselines (expected 116), and the visual-baseline count to 14. Add to the visual-baselines bullet that shared seeding helpers live in `tests/support/portfolio.js`.

- [ ] **Step 12: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: Vitest 836 passed; Playwright 130 passed (116 e2e + 14 visual).

- [ ] **Step 13: Commit**

```bash
git add src/components/dialogs/TaskDetailDialog.jsx src/components/AppIslands.jsx src/legacy/main.js index.html tests/app.test.js README.md
git commit -m "feat: port the task detail modal to Radix Dialog and document 2.1a

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Helpers moved to `tests/support/portfolio.js`; `closeDialogBy` `'cancel button'` | 1 |
| 9 legacy baselines, locale/timezone pinned, clock-controlled toast | 2 |
| `activeDialog` widened, `dialogProps`, `undoToast` | 3 |
| `openDialog(name, props)` replaces props on re-open; `closeDialog(name?)` no-op on mismatch; `flushSync` | 3 |
| `src/actions/legacyHost.js` with no-op defaults and five delegating actions + unit tests | 3 |
| `useReturnFocus` restore guard (`body`/`null` + `isConnected`) and `initialFocus` | 3 (used 5, 6) |
| `IslandErrorBoundary` `onError`; every dialog island passes its close | 3, 5, 6 |
| `UndoToast` portal with legacy markup, `pointer-events: auto`; `showUndo`/`hideUndo` state + notify; listener/markup deleted | 4 |
| Roadmap view model, local draft state, `hidden`-class rows, initial focus, `saveRoadmapEntity(draft)`, close through host, `buildRoadmapSprintOptions`, deletions | 5 |
| `onPointerDownOutside` keeps dialogs open when clicking the toast | 5, 6 |
| Detail view model builder, controlled checklist, attachments, close through host, `toggleChecklistItem(index, checked)`, deletions | 6 |
| Shortcut context from `activeDialog` for detail and roadmap | 5, 6 |
| `setLegacyHost` registered next to `setPersistenceHost` | 4 (extended 5, 6) |
| New behaviour tests 1–9 | 6 (1–5), 5 (6–8), 4 (9) |
| Existing detail/roadmap/sprint/undo/keyboard tests unchanged and green | 4, 5, 6 |
| README | 6 |

Deviations from the spec's file list, both small: `src/components/dialogs/keepOpenOnUndoToast.js` is added so the two data dialogs share the outside-pointer guard instead of duplicating it; `buildTaskDetailViewModel` takes `(source, taskId, readOnly)` because attachments are looked up by `taskId`, as legacy did.
