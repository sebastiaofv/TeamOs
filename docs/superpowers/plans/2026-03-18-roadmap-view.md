# Roadmap View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-owned roadmap view to selected portfolio boards, including a `Board | Roadmap` toggle, roadmap item CRUD, phase/milestone task assignment, bulk sprint creation from board view, and roadmap rows that reveal assigned tasks.

**Architecture:** Keep the existing single-file app structure and extend the current portfolio-selected board flow instead of introducing a parallel planning subsystem. Store roadmap entities in `extensions.roadmap`, keep task assignment fields on `board.tasks[]`, and branch the selected-board renderer between the current board grid and a new roadmap timeline. Reuse the existing mutation, validation, save queue, and timeline event infrastructure so roadmap changes behave like first-class board edits.

**Tech Stack:** Plain HTML/CSS/JavaScript in `kanban/kanban.html`, Playwright in `kanban/tests/app.test.js`, JSON board fixtures in `kanban/boards/example.board.json`.

---

## File Structure

- **Modify:** `kanban/kanban.html`
  - Add roadmap schema normalization and validation.
  - Add selected-board view mode state and URL persistence.
  - Add roadmap and sprint modal markup/CSS.
  - Add phase/milestone selectors to the task modal.
  - Add board multi-select state and bulk sprint creation flow.
  - Add roadmap rendering, selectors, CRUD handlers, and timeline events.

- **Modify:** `kanban/tests/app.test.js`
  - Extend board payload helpers to seed roadmap data and task roadmap IDs.
  - Add Playwright coverage for roadmap schema, toolbar toggle, modal assignment, bulk sprint creation, roadmap rendering, and deletion/read-only regressions.

- **Modify:** `kanban/boards/example.board.json`
  - Include a representative `extensions.roadmap` block and one assigned task so exported sample data reflects the new schema.

- **Modify:** `kanban/README.md`
  - Document the roadmap view, roadmap entities, and sprint creation workflow.

### Task 1: Roadmap Schema and Selectors Foundation

**Files:**
- Modify: `kanban/kanban.html`
- Test: `kanban/tests/app.test.js`

- [ ] **Step 1: Write the failing schema test**

```js
test('roadmap schema normalizes roadmap entities and task assignment ids', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'alpha',
    hasHandle: true,
    title: 'Alpha',
    tasks: [{
      id: 1,
      title: 'Mapped task',
      status: 'to-do',
      phaseId: 'phase_foundation',
      milestoneId: 'milestone_alpha',
      sprintId: 'sprint_12'
    }],
    extensions: {
      roadmap: {
        version: 1,
        milestones: [{ id: 'milestone_alpha', title: 'Alpha', dueDate: '2026-04-15' }],
        phases: [{ id: 'phase_foundation', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
        sprints: [{ id: 'sprint_12', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
      }
    }
  }], { selectedBoardId: 'alpha' });

  const snapshot = await page.evaluate(() => structuredClone(getPortfolioBoardRecord('alpha').data));
  expect(snapshot.extensions.roadmap.milestones).toHaveLength(1);
  expect(snapshot.board.tasks[0].phaseId).toBe('phase_foundation');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "roadmap schema normalizes roadmap entities and task assignment ids"`

Expected: FAIL because `buildTaskPayload`, `normalizeTask`, and board validation currently drop or reject `phaseId`, `milestoneId`, `sprintId`, and `extensions.roadmap`.

- [ ] **Step 3: Implement roadmap normalization and validation**

```js
const ROADMAP_EXTENSION_KEY = 'roadmap';
const ROADMAP_VERSION = 1;

function normalizeRoadmapExtension(value) {
  return {
    version: ROADMAP_VERSION,
    milestones: normalizeMilestones(value?.milestones),
    phases: normalizePhases(value?.phases),
    sprints: normalizeSprints(value?.sprints)
  };
}

function normalizeTask(task, options = {}) {
  const normalizedTask = {
    // existing fields...
    phaseId: normalizeRoadmapRef(task.phaseId),
    milestoneId: normalizeRoadmapRef(task.milestoneId),
    sprintId: normalizeRoadmapRef(task.sprintId)
  };
  return clearInvalidRoadmapTaskRefs(normalizedTask, options.roadmap);
}
```

Implementation notes:
- Extend `buildTaskPayload()` in `kanban/tests/app.test.js` to preserve seeded roadmap IDs.
- Update `validateBoardData()` to accept and validate `extensions.roadmap`.
- Update `normalizeBoardExtensionsValue()` and any board import/export helpers to persist the roadmap block.
- Update task validation to allow `phaseId`, `milestoneId`, and `sprintId`.
- Add selectors like `getRoadmapExtension(boardData)`, `getTasksForMilestone(boardData, milestoneId)`, `getTasksForPhase(...)`, and `getTasksForSprint(...)`.
- Extend `buildTaskTimelineChanges()` to include the three new task assignment fields.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --grep "roadmap schema normalizes roadmap entities and task assignment ids"`

Expected: PASS

- [ ] **Step 5: Commit the foundation**

```bash
git add kanban/kanban.html kanban/tests/app.test.js
git commit -m "feat: add roadmap schema foundation"
```

### Task 2: Selected-Board View Mode Toggle and Roadmap Shell

**Files:**
- Modify: `kanban/kanban.html`
- Test: `kanban/tests/app.test.js`

- [ ] **Step 1: Write the failing toggle test**

```js
test('selected project shows a board roadmap toggle and persists roadmap mode', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'alpha' });

  await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
  await page.getByRole('button', { name: 'Roadmap' }).click();

  await expect(page.locator('#portfolioRoadmapView')).toBeVisible();
  await expect(page).toHaveURL(/pv=roadmap/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "selected project shows a board roadmap toggle and persists roadmap mode"`

Expected: FAIL because the toolbar has no view toggle, no roadmap container, and no `pv` query state.

- [ ] **Step 3: Implement view-mode state, markup, and shell renderer**

```js
let selectedPortfolioViewMode = 'board';

function normalizePortfolioViewMode(value) {
  return value === 'roadmap' ? 'roadmap' : 'board';
}

function renderPortfolio() {
  // existing filter and chip rendering...
  renderSelectedBoardViewToggle();
  if (selectedPortfolioViewMode === 'roadmap' && selectedPortfolioBoardId) {
    renderPortfolioRoadmapView(rows);
    return;
  }
  renderPortfolioBoardView(rows);
}
```

Implementation notes:
- Add toggle markup near the right side of the existing portfolio toolbar.
- Add CSS for the toggle and a roadmap container panel.
- Extend `updateUrlState()` and `applyUrlState()` with a `pv` param.
- Reset view mode to `board` when no board is selected.
- Add an empty roadmap shell with a clear “create a milestone, phase, or sprint” prompt.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --grep "selected project shows a board roadmap toggle and persists roadmap mode"`

Expected: PASS

- [ ] **Step 5: Commit the toggle shell**

```bash
git add kanban/kanban.html kanban/tests/app.test.js
git commit -m "feat: add portfolio roadmap view toggle"
```

### Task 3: Roadmap Item CRUD and Task Modal Phase/Milestone Assignment

**Files:**
- Modify: `kanban/kanban.html`
- Test: `kanban/tests/app.test.js`

- [ ] **Step 1: Write the failing task modal assignment test**

```js
test('task modal assigns phase and milestone from roadmap selectors', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'alpha',
    hasHandle: true,
    title: 'Alpha',
    tasks: [{ id: 1, title: 'Task A', status: 'to-do' }],
    extensions: {
      roadmap: {
        version: 1,
        milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
        phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
        sprints: []
      }
    }
  }], { selectedBoardId: 'alpha' });

  await portfolioCard(page, 'Task A').locator('[data-action="edit-task"]').click();
  await page.selectOption('#taskPhase', 'p1');
  await page.selectOption('#taskMilestone', 'm1');
  await page.getByRole('button', { name: 'Save Task' }).click();

  const task = await page.evaluate(() => structuredClone(getPortfolioBoardRecord('alpha').data.board.tasks[0]));
  expect(task.phaseId).toBe('p1');
  expect(task.milestoneId).toBe('m1');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "task modal assigns phase and milestone from roadmap selectors"`

Expected: FAIL because the task modal has no roadmap selectors and `saveTask()` does not persist roadmap refs.

- [ ] **Step 3: Write the failing roadmap CRUD test**

```js
test('roadmap rows can create and delete milestones while clearing task refs', async ({ page }) => {
  await gotoApp(page);
  // seed one board with selected board id and one task already linked to m1
  // switch to roadmap mode, delete milestone m1, then expect task.milestoneId === ''
});
```

- [ ] **Step 4: Run the focused CRUD test to verify it fails**

Run: `npm test -- --grep "roadmap rows can create and delete milestones while clearing task refs"`

Expected: FAIL because roadmap CRUD UI and deletion handlers do not exist.

- [ ] **Step 5: Implement the roadmap modal and task modal selectors**

```js
function readTaskDraftFromForm() {
  return {
    // existing fields...
    phaseId: normalizeRoadmapRef(document.getElementById('taskPhase').value),
    milestoneId: normalizeRoadmapRef(document.getElementById('taskMilestone').value)
  };
}

function buildTaskFieldsFromDraft(draft) {
  return {
    // existing fields...
    phaseId: draft.phaseId,
    milestoneId: draft.milestoneId
  };
}
```

Implementation notes:
- Add `#taskPhase` and `#taskMilestone` `<select>` elements to the existing task modal.
- Populate selectors from the selected board’s roadmap extension on both create and edit flows.
- Add a lightweight reusable roadmap entity modal for create/edit of milestones, phases, and sprints.
- Implement section-level add buttons and per-row edit/delete actions in roadmap view.
- On delete, clear matching task refs before saving and record a roadmap timeline event.
- Show assigned phase, milestone, and sprint labels in the task detail modal if space allows.

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- --grep "task modal assigns phase and milestone from roadmap selectors|roadmap rows can create and delete milestones while clearing task refs"`

Expected: PASS

- [ ] **Step 7: Commit the assignment and CRUD slice**

```bash
git add kanban/kanban.html kanban/tests/app.test.js
git commit -m "feat: add roadmap item management and task assignment"
```

### Task 4: Board Multi-Select and Bulk Sprint Creation

**Files:**
- Modify: `kanban/kanban.html`
- Test: `kanban/tests/app.test.js`

- [ ] **Step 1: Write the failing bulk sprint test**

```js
test('checked board tasks can be grouped into a new sprint', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'alpha',
    hasHandle: true,
    title: 'Alpha',
    tasks: [
      { id: 1, title: 'Task A', status: 'backlog' },
      { id: 2, title: 'Task B', status: 'to-do' }
    ]
  }], { selectedBoardId: 'alpha' });

  await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
  await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Create Sprint' }).click();
  await page.fill('#roadmapItemTitle', 'Sprint 12');
  await page.fill('#roadmapItemStartDate', '01/04/2026');
  await page.fill('#roadmapItemEndDate', '14/04/2026');
  await page.getByRole('button', { name: 'Save Sprint' }).click();

  const board = await page.evaluate(() => structuredClone(getPortfolioBoardRecord('alpha').data));
  expect(board.extensions.roadmap.sprints).toHaveLength(1);
  expect(board.board.tasks.every((task) => task.sprintId === board.extensions.roadmap.sprints[0].id)).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "checked board tasks can be grouped into a new sprint"`

Expected: FAIL because task cards have no selection control, no bulk action bar, and no sprint creation flow.

- [ ] **Step 3: Implement board multi-select and sprint creation**

```js
let portfolioBulkSelectionByBoardId = {};

function togglePortfolioTaskBulkSelection(boardId, taskId, checked) {
  const ids = new Set(portfolioBulkSelectionByBoardId[boardId] || []);
  checked ? ids.add(taskId) : ids.delete(taskId);
  portfolioBulkSelectionByBoardId[boardId] = [...ids];
}

function createSprintFromSelection(boardId, draft) {
  // create sprint entity, assign sprintId to selected tasks, append timeline event
}
```

Implementation notes:
- Add a checkbox to mutable selected-board task cards only.
- Stop checkbox clicks from opening the detail modal.
- Add a bulk action bar above the board grid showing selection count, clear action, and `Create Sprint`.
- Reuse the roadmap entity modal in a `create-sprint-from-selection` mode.
- Clear selection after successful sprint creation or board switch.
- Add a dedicated timeline event for bulk sprint assignment instead of emitting one `task.updated` summary per task.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --grep "checked board tasks can be grouped into a new sprint"`

Expected: PASS

- [ ] **Step 5: Commit the bulk sprint workflow**

```bash
git add kanban/kanban.html kanban/tests/app.test.js
git commit -m "feat: add bulk sprint creation from board tasks"
```

### Task 5: Roadmap Timeline Rendering and Row Task Expansion

**Files:**
- Modify: `kanban/kanban.html`
- Test: `kanban/tests/app.test.js`

- [ ] **Step 1: Write the failing roadmap rendering test**

```js
test('roadmap view renders milestones phases and sprints with assigned task rows', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [/* one board with milestone, phase, sprint, and assigned tasks */], { selectedBoardId: 'alpha' });

  await page.getByRole('button', { name: 'Roadmap' }).click();
  await expect(page.locator('#portfolioRoadmapView')).toContainText('Milestones');
  await expect(page.locator('[data-roadmap-kind="milestone"]')).toHaveCount(1);
  await expect(page.locator('[data-roadmap-kind="phase"]')).toHaveCount(1);
  await expect(page.locator('[data-roadmap-kind="sprint"]')).toHaveCount(1);

  await page.locator('[data-roadmap-kind="phase"]').click();
  await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "roadmap view renders milestones phases and sprints with assigned task rows"`

Expected: FAIL because roadmap mode currently renders only the shell.

- [ ] **Step 3: Implement timeline layout and expand/collapse behavior**

```js
function renderPortfolioRoadmapView(rows) {
  const boardRecord = getPortfolioBoardRecord(selectedPortfolioBoardId);
  const roadmap = getRoadmapExtension(boardRecord.data);
  const range = getVisibleRoadmapDateRange(roadmap);
  // render date axis, milestones, phases, sprints, and expandable task lists
}
```

Implementation notes:
- Compute the visible date range from earliest and latest roadmap dates.
- Render sections in the approved order: milestones, phases, sprints.
- Render milestone markers as points and phases/sprints as positioned bars.
- Use data attributes so Playwright can target rows and task lists reliably.
- Reuse compact task cards for expanded task lists.
- Allow clicking a roadmap task row to open the existing detail modal.
- Preserve read-only restrictions for historical previews and boards without handles.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --grep "roadmap view renders milestones phases and sprints with assigned task rows"`

Expected: PASS

- [ ] **Step 5: Commit the roadmap renderer**

```bash
git add kanban/kanban.html kanban/tests/app.test.js
git commit -m "feat: render roadmap timeline for selected boards"
```

### Task 6: Hardening, Sample Data, Documentation, and Regression Coverage

**Files:**
- Modify: `kanban/kanban.html`
- Modify: `kanban/tests/app.test.js`
- Modify: `kanban/boards/example.board.json`
- Modify: `kanban/README.md`

- [ ] **Step 1: Write the failing regression tests**

```js
test('read only boards block roadmap mutations', async ({ page }) => {
  // seed selected board with hasHandle: false, switch to roadmap, verify add/edit/delete controls are disabled
});

test('historical preview keeps roadmap mutations disabled', async ({ page }) => {
  // select older timeline event, switch to roadmap, verify mutation controls stay disabled
});
```

- [ ] **Step 2: Run the focused regressions to verify they fail**

Run: `npm test -- --grep "read only boards block roadmap mutations|historical preview keeps roadmap mutations disabled"`

Expected: FAIL because roadmap-specific controls are not yet fully respecting the same mutation gates as task editing.

- [ ] **Step 3: Harden roadmap behavior and update supporting docs**

```js
function canUsePortfolioRoadmapMutations(boardId) {
  return isPortfolioBoardMutable(boardId) && !isHistoricalPreviewActiveForBoard(boardId);
}
```

Implementation notes:
- Reuse the same read-only/historical preview gate for roadmap add/edit/delete and sprint creation.
- Ensure deleting roadmap items clears task refs without leaving stale UI state.
- Add roadmap entities to `kanban/boards/example.board.json`.
- Update `kanban/README.md` sections for portfolio view, roadmap planning, and testing notes if new controls need explanation.

- [ ] **Step 4: Run the full Playwright suite**

Run: `npm test`

Expected: PASS for the full suite, including existing portfolio regressions and the new roadmap coverage.

- [ ] **Step 5: Commit the hardening and docs**

```bash
git add kanban/kanban.html kanban/tests/app.test.js kanban/boards/example.board.json kanban/README.md
git commit -m "feat: finalize roadmap planning workflow"
```

## Review Checklist

- [ ] `extensions.roadmap` persists across import, save, and re-open.
- [ ] Tasks never reference more than one phase, milestone, or sprint.
- [ ] Switching selected boards resets invalid roadmap view state and bulk selections.
- [ ] Historical preview and read-only mode prevent roadmap mutations.
- [ ] Deleting a roadmap item clears matching task refs.
- [ ] Roadmap row expansion shows only tasks assigned to that entity.
- [ ] Full Playwright suite passes before merge.
