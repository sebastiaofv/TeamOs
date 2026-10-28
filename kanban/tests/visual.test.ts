import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedPortfolioBoards, portfolioCard, FIXED_TIMESTAMP, buildBoardPayload, answerAppMessage, dragWithMouse, openFiltersPanel, setBoardSearch } from './support/portfolio';

test.describe('US-4 persisted Board column chooser', () => {
  for (const theme of ['light', 'dark']) {
    test(`column visibility (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{ id: 'columns', title: 'Column preferences', hasHandle: true, tasks: [
        { id: 1, title: 'Original card layout', status: 'doing', assignees: ['Ana'], responsible: 'Ana', tags: ['ui'] }
      ] }], { selectedBoardId: 'columns' });
      await page.getByRole('button', { name: 'Board columns', exact: true }).click();
      await page.getByRole('checkbox', { name: 'done', exact: true }).uncheck();
      await page.mouse.move(1, 1);
      await expect(page).toHaveScreenshot(`board-column-visibility-${theme}.png`, { fullPage: true });
    });
  }
});

test.describe('US-4 workflow configuration layout', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      test(`state editor and references at ${width}px (${theme})`, async ({ page }) => {
        await gotoVisualApp(page, theme);
        await page.setViewportSize({ width, height: 900 });
        const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
        await seedPortfolioBoards(page, [{ id: 'workflow', title: fixture.board.settings.title, hasHandle: true,
          tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'workflow' });
        await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
        const dialog = page.locator('.workflow-dialog');
        expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width);
        await dialog.locator('[data-state-choice="doing"]').click();
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await expect(dialog).toHaveScreenshot(`workflow-editor-states-${theme}-${width}.png`);
        await dialog.getByRole('tab', { name: 'Entry & references', exact: true }).click();
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await expect(dialog).toHaveScreenshot(`workflow-editor-references-${theme}-${width}.png`);
      });
    }
  }
});

// Pixel baselines for pieces being ported to React. They are captured against
// the legacy implementation first; a port must match them unchanged. Baselines
// are platform-specific (generated on macOS). Only update them deliberately
// (`npx playwright test tests/visual.test.ts --update-snapshots`) and review the
// image diff in the commit.

const FIXED_TIME = '2026-02-26T12:00:00Z';

test.describe('US-01 workitems table', () => {
  for (const theme of ['light', 'dark']) {
    test(`delivery review perspectives and badges (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{ id: 'review', title: 'Sprint planning', hasHandle: true, tasks: [
        { id: 1, title: 'Investigate delivery blocker', status: 'backlog', blocked: true, blockerReason: 'Waiting for access', assignees: ['Ana'] },
        { id: 2, title: 'Previous delivery', status: 'done', sprintId: 'past' },
        { id: 3, title: 'Build integration', status: 'doing', sprintId: 'active', assignees: ['Rui'] },
        { id: 4, title: 'Review interface', status: 'done', sprintId: 'active', assignees: ['Marta'] },
        { id: 5, title: 'Prepare next release', status: 'to-do', sprintId: 'future' },
        { id: 6, title: 'Plan documentation', status: 'doing', assignees: ['Ana', 'Rui'] }
      ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
        { id: 'past', title: 'Sprint 1', startDate: '2026-02-01', endDate: '2026-02-14' },
        { id: 'active', title: 'Sprint 2', startDate: '2026-02-15', endDate: '2026-02-28' },
        { id: 'future', title: 'Sprint 3', startDate: '2026-03-01', endDate: '2026-03-14' }
      ] } } }], { selectedBoardId: 'review' });
      await page.locator('[data-view-mode="table"]').click();
      await page.locator('#tableColumns summary').click();
      await page.locator('#tableColumn-blocked').check();
      await page.keyboard.press('Escape');
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`table-review-all-${theme}.png`);
      await page.locator('[data-table-view="unplanned"]').click();
      await page.locator('#workitemsTable [data-task-id="1"] input').check();
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`table-review-planning-${theme}.png`);
      await page.locator('#tableAddToSprint').click();
      await expect(page).toHaveScreenshot(`table-review-assign-${theme}.png`);
      await page.locator('#roadmapEntityModalCancelBtn').click();
      await page.locator('[data-table-view="sprints"]').click();
      await page.locator('[data-table-sprint="active"] > summary').click();
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`table-review-sprints-${theme}.png`);
    });
  }

  for (const theme of ['light', 'dark']) {
    test(`project table with default columns (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{
        id: 'table', title: 'Delivery project', hasHandle: true,
        tasks: [
          { id: 1, title: 'Prepare delivery', status: 'doing', assignees: ['Ana', 'Rui'], priority: 'high', phaseId: 'p1' },
          { id: 2, title: 'Review feedback', status: 'to-do', priority: null },
          { id: 3, title: 'Archived delivery', status: 'done', archived: true }
        ],
        extensions: ROADMAP
      }], { selectedBoardId: 'table' });
      await page.locator('[data-view-mode="table"]').click();
      await page.locator('#tableCsvSeparator').selectOption(';');
      await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`workitems-table-${theme}.png`, { fullPage: true });
      await page.locator('#portfolioFiltersBtn').click();
      await expect(page.locator('#portfolioFiltersPanel')).toBeVisible();
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`workitems-table-filters-${theme}.png`, { fullPage: true });
    });
  }

  test('compact table and filter panel on a narrow screen', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPortfolioBoards(page, [{
      id: 'compact-table', title: 'Delivery', hasHandle: true,
      tasks: [{ id: 1, title: 'Prepare delivery', status: 'doing', assignees: ['Ana'], priority: 'high' }]
    }], { selectedBoardId: 'compact-table' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('#tableCsvSeparator').selectOption(';');
    await expect(page.locator('#portfolioSearchBtn')).toBeVisible();
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('workitems-table-mobile.png', { fullPage: true });
    await page.locator('#portfolioFiltersBtn').click();
    await expect(page.locator('#portfolioFiltersPanel')).toBeVisible();
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('workitems-table-filters-mobile.png', { fullPage: true });
  });
});

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

const TIMELINE_BASELINE = buildBoardPayload({
  title: 'Timeline Project',
  tasks: [{ id: 1, title: 'Timeline task', status: 'backlog', description: 'Initial timeline description.' }]
});

const TIMELINE = {
  timeline: {
    version: 1,
    baselineEventId: 'evt_baseline',
    events: [
      {
        id: 'evt_baseline',
        at: FIXED_TIMESTAMP,
        kind: 'board.baseline',
        entityType: 'board',
        entityId: 'board',
        summary: 'Baseline snapshot created',
        snapshot: TIMELINE_BASELINE
      },
      {
        id: 'evt_updated',
        at: '2026-02-26T01:00:00.000Z',
        kind: 'task.updated',
        entityType: 'task',
        entityId: '1',
        summary: 'Task updated: Timeline task',
        changes: {
          description: {
            before: 'Initial timeline description.',
            after: 'Latest timeline description.'
          }
        }
      }
    ]
  }
};

// Dialogs are opened with mouse clicks, never keys: Radix focuses the close
// button on open, and Chromium only paints a :focus-visible ring for that
// programmatic focus after keyboard input. Legacy never moved focus.
async function gotoVisualApp(page: Page, theme: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript((value: string) => {
    window.localStorage.setItem('teamOsKanbanTheme', value);
  }, theme);
  await page.goto('/');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of ['light', 'dark']) {
  test(`shortcuts dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openShortcutsBtn').click();
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsList')).toContainText('Open keyboard shortcuts');
    await expect(page).toHaveScreenshot(`shortcuts-${theme}.png`, { fullPage: true });
  });

  test(`help dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openHelpBtn').click();
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect(page.locator('#helpModal')).toContainText('Drag cards between columns');
    await expect(page).toHaveScreenshot(`help-${theme}.png`, { fullPage: true });
  });

  test(`help command palette tab (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openHelpBtn').click();
    await page.locator('#helpModal').getByRole('tab', { name: 'Command palette' }).click();
    await expect(page.locator('#helpModal')).toContainText('Create a task in one line');
    await expect(page).toHaveScreenshot(`help-palette-${theme}.png`, { fullPage: true });
  });
}

test('no dialog open after opening and closing one (light)', async ({ page }) => {
  await gotoVisualApp(page, 'light');
  await page.locator('#openShortcutsBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeVisible();
  await page.locator('#shortcutsModalFooterCloseBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeHidden();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page).toHaveScreenshot('no-dialog-light.png', { fullPage: true });
});

// 2.1a baselines: task detail, roadmap entity modal, undo toast. Captured
// against legacy; the React ports must match. formatDateTime uses
// toLocaleString, so locale and timezone are pinned.
test.describe('2.1a modals and toast', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

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
      await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
      await page.getByRole('button', { name: 'Add Milestone' }).click();
      await expect(page.locator('#roadmapEntityModal')).toBeVisible();
      await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('New Milestone');
      await expect(page).toHaveScreenshot(`roadmap-new-milestone-${theme}.png`, { fullPage: true });
    });

    test(`undo toast after archiving (${theme})`, async ({ page }) => {
      // The toast hides after 5 s. Fake timers flow with real time until paused,
      // so pause well after archiving (a full minute of headroom for slow
      // seeding): showUndo's timer can never fire.
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
      await page.clock.pauseAt(new Date('2026-02-26T12:01:00Z'));
      const card = portfolioCard(page, 'Archive me');
      await card.hover();
      await card.locator('button[title="Archive"]').click();
      await answerAppMessage(page, { button: 'Archive' });
      await expect(page.locator('#undoToast')).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(page).toHaveScreenshot(`undo-toast-${theme}.png`, { fullPage: true });
    });
  }

  test('task detail, attachments scrolled into view (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [
      { id: 'v1', title: 'Launch', hasHandle: true, tasks: [FULL_TASK], extensions: ROADMAP }
    ], { selectedBoardId: 'v1' });
    await portfolioCard(page, 'Prepare launch checklist').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    // The modal body scrolls; bring the attachment rows into view.
    await page.locator('#detailAttachments').scrollIntoViewIfNeeded();
    await expect(page.locator('#detailAttachments')).toBeVisible();
    await expect(page.locator('#detailAttachments .detail-attachment-item')).toHaveCount(2);
    await expect(page).toHaveScreenshot('task-detail-attachments-light.png', { fullPage: true });
  });

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

// 2.1b baselines: the task editor. Captured against legacy; the React port must
// match. The editor focuses #taskName on open, so focus is dropped and the
// mouse parked before capture to keep caret, focus ring and hover out of the
// image.
test.describe('2.1b task editor', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  async function captureEditor(page: Page, name: string) {
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  }

  async function openFullTaskEditor(page: Page, theme: string) {
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
    // Hold the third item over the top of the first; the rows it passes shift
    // down to make room. The button stays down, so capture without
    // captureEditor, which would move the mouse and the drag with it.
    await dragWithMouse(page, rows.nth(2).locator('.checklist-editor-drag-handle'), rows.nth(0), {
      targetPosition: { x: 10, y: 2 },
      release: false
    });
    await expect(rows.nth(2)).toHaveClass(/\bdragging\b/);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('task-editor-checklist-drag-light.png', { fullPage: true });
  });
});

// 2.2 baselines: the portfolio toolbar, project chips and bulk actions. These
// are captured against the legacy DOM before the React controls replace it.
test.describe('2.2 toolbar and chips', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  async function captureControls(page: Page, name: string) {
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  }

  for (const theme of ['light', 'dark']) {
    test(`toolbar and project chips, all projects (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Alpha Project', hasHandle: true, tasks: [{ id: 1, title: 'Alpha task', status: 'backlog' }] },
        { id: 'v2', title: 'Beta Project', hasHandle: false, tasks: [{ id: 2, title: 'Beta task', status: 'doing' }] }
      ]);
      await expect(page.locator('#portfolioBoardsChips .portfolio-chip')).toHaveCount(3);
      await captureControls(page, `toolbar-chips-all-${theme}.png`);
    });
  }

  test('selected toolbar with active filters and bulk actions (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [{
      id: 'v1',
      title: 'Launch Project',
      hasHandle: true,
      tasks: [
        { id: 1, title: 'Launch target', status: 'backlog', priority: 'high', effort: 'L', blocked: true, blockerReason: 'Review', assignees: ['Ana'] },
        { id: 2, title: 'Other task', status: 'doing', priority: 'low', effort: 'S' }
      ]
    }], { selectedBoardId: 'v1' });
    await setBoardSearch(page, 'launch');
    await openFiltersPanel(page);
    await page.locator('#portfolioArchiveFilter').selectOption('all');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    await page.locator('#portfolioAssigneeFilter').selectOption('Ana');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('L');
    await page.locator('#portfolioSortSelect').selectOption('score');
    await page.locator('#portfolio-backlog-column input[data-action="toggle-bulk-task-selection"]').check();
    await expect(page.locator('#portfolioBulkActions')).toBeVisible();
    await captureControls(page, 'toolbar-selected-bulk-light.png');
  });

  test('filters panel open with active filters (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [{
      id: 'v1',
      title: 'Launch Project',
      hasHandle: true,
      tasks: [{ id: 1, title: 'Launch target', status: 'backlog', priority: 'high', effort: 'L', assignees: ['Ana'] }]
    }]);
    await openFiltersPanel(page);
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioAssigneeFilter').selectOption('Ana');
    await expect(page.locator('#portfolioFiltersBtn .portfolio-filters-badge')).toHaveText('2');
    await captureControls(page, 'toolbar-filters-panel-light.png');
  });

  test('project chip save failure and retry affordance (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [
      { id: 'v1', title: 'Retry Project', hasHandle: true, tasks: [{ id: 1, title: 'Move me', status: 'backlog' }] }
    ], { selectedBoardId: 'v1' });
    await page.evaluate(() => {
      window.__portfolioTestWrites = [];
      window.__portfolioWriteControl = {
        boardId: 'v1',
        holdWrites: false,
        failRemaining: 1,
        attempts: 0,
        active: 0,
        maxActive: 0,
        pendingResolvers: []
      };
    });
    await dragWithMouse(page, portfolioCard(page, 'Move me'), page.locator('#portfolio-doing-column'));
    const chip = page.locator('#portfolioBoardsChips .portfolio-chip.active');
    await expect(chip).toContainText('Save failed');
    await expect(chip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await captureControls(page, 'toolbar-chip-save-error-light.png');
  });
});

// 2.3 baselines: the portfolio board grid and task cards. These are captured
// against the legacy board renderer before React takes ownership of #portfolioBoard.
test.describe('2.3 board and cards', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  async function captureBoard(page: Page, name: string) {
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  }

  for (const theme of ['light', 'dark']) {
    test(`all-projects board cards (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [
        { id: 'v1', title: 'Launch Project', hasHandle: true, tasks: [FULL_TASK] },
        {
          id: 'v2',
          title: 'Operations Project',
          hasHandle: false,
          tasks: [{
            id: 2,
            title: 'Review operating metrics',
            status: 'doing',
            assignees: ['Rui'],
            tags: ['ops', 'weekly'],
            priority: 'medium',
            effort: 'M',
            dueDate: '2026-03-02'
          }]
        }
      ]);
      await expect(page.locator('#portfolioBoard .portfolio-task-card')).toHaveCount(2);
      await captureBoard(page, `portfolio-board-all-${theme}.png`);
    });

    test(`selected writable board cards and add-task affordances (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{
        id: 'v1',
        title: 'Release Project',
        hasHandle: true,
        tasks: [
          {
            id: 1,
            title: 'Prepare release handoff',
            status: 'backlog',
            assignees: ['Ana', 'Rui'],
            tags: ['release', 'handoff'],
            blocked: true,
            blockerReason: 'Waiting on QA',
            priority: 'high',
            effort: 'L',
            dueDate: '2026-03-04',
            checklist: [{ text: 'Share notes', done: true }, { text: 'Book review', done: false }]
          },
          { id: 2, title: 'Publish notes', status: 'done', priority: 'low', effort: 'S' }
        ]
      }], { selectedBoardId: 'v1' });
      await expect(page.locator('#portfolioBoard .portfolio-task-card')).toHaveCount(2);
      await expect(page.locator('#portfolioBoard .add-task-card')).toHaveCount(4);
      await captureBoard(page, `portfolio-board-selected-${theme}.png`);
    });
  }
});

// 2.4 baselines: the portfolio timeline panel. These are captured against the
// legacy renderer before React takes ownership of #portfolioTimelinePanel.
test.describe('2.4 timeline panel', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  async function openTimeline(page: Page, theme: string) {
    await gotoVisualApp(page, theme);
    await seedPortfolioBoards(page, [{
      id: 'timeline',
      title: 'Timeline Project',
      hasHandle: true,
      tasks: [{ id: 1, title: 'Timeline task', status: 'backlog', description: 'Initial timeline description.' }],
      extensions: TIMELINE
    }], { selectedBoardId: 'timeline' });
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);
  }

  for (const theme of ['light', 'dark']) {
    test(`expanded latest timeline (${theme})`, async ({ page }) => {
      await openTimeline(page, theme);
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page.locator('#portfolioTimelinePanel .timeline-event-item.active')).toHaveAttribute('data-event-index', '1');
      await expect(page).toHaveScreenshot(`portfolio-timeline-latest-${theme}.png`, { fullPage: true });
    });
  }

  test('historical timeline preview (light)', async ({ page }) => {
    await openTimeline(page, 'light');
    await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node) => {
      (node as HTMLInputElement).value = '0';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');
    await expect(page.locator('#portfolioTimelinePanel .timeline-event-item.active')).toHaveAttribute('data-event-index', '0');
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('portfolio-timeline-preview-light.png', { fullPage: true });
  });
});

// 2.5 and 2.6 baselines: roadmap and calendar view surfaces. These snapshots
// protect the existing CSS contract while the renderers move to React.
test.describe('2.5 roadmap and 2.6 calendar views', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  for (const theme of ['light', 'dark']) {
    test(`roadmap with expanded task list (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{
        id: 'roadmap',
        title: 'Roadmap Project',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Prepare launch checklist',
          status: 'backlog',
          priority: 'high',
          effort: 'M',
          phaseId: 'p1',
          milestoneId: 'm1',
          sprintId: 's1'
        }],
        extensions: ROADMAP
      }], { selectedBoardId: 'roadmap' });
      await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
      await page.getByRole('button', { name: 'Show tasks for Build' }).click();
      await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Prepare launch checklist');
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`portfolio-roadmap-expanded-${theme}.png`, { fullPage: true });
      await page.locator('.milestone-annotation[data-roadmap-id="m1"]').click();
      await expect(page.locator('#milestoneWorkitemsModal .workitems-table')).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(page).toHaveScreenshot(`portfolio-roadmap-milestone-${theme}.png`, { fullPage: true });
    });

    test(`calendar year view (${theme})`, async ({ page }) => {
      await gotoVisualApp(page, theme);
      await seedPortfolioBoards(page, [{
        id: 'calendar',
        title: 'Calendar Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Due task', status: 'backlog', dueDate: '2026-03-10' }],
        extensions: ROADMAP
      }], { selectedBoardId: 'calendar' });
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
      await expect(page.locator('.portfolio-calendar-month-card')).toHaveCount(12);
      await page.mouse.move(1, 1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(`portfolio-calendar-year-${theme}.png`, { fullPage: true });
    });
  }

  test('calendar month heatmap view (light)', async ({ page }) => {
    await gotoVisualApp(page, 'light');
    await seedPortfolioBoards(page, [{
      id: 'calendar-month',
      title: 'Calendar Month Project',
      hasHandle: true,
      tasks: [
        { id: 1, title: 'Due task A', status: 'backlog', dueDate: '2026-03-10' },
        { id: 2, title: 'Due task B', status: 'backlog', dueDate: '2026-03-10' }
      ],
      extensions: ROADMAP
    }], { selectedBoardId: 'calendar-month' });
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Heat Map' }).click();
    await page.getByRole('button', { name: 'Open March 2026' }).click();
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('portfolio-calendar-month-heatmap-light.png', { fullPage: true });
  });
});


test.describe('US-7 dedicated Comments tab', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      test(`composer and recent publications at ${width}px (${theme})`, async ({ page }) => {
        await gotoVisualApp(page, theme);
        await page.setViewportSize({ width, height: 900 });
        const fixture = JSON.parse(readFileSync('test-board/us-7.board.json', 'utf8'));
        await seedPortfolioBoards(page, [{ id: 'comments', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'comments' });
        await portfolioCard(page, 'Delivery conversation').click();
        await page.getByRole('tab', { name: 'Comments', exact: true }).click();
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const dialog = page.locator('#taskDetailModal .modal-content');
        expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(dialog).toHaveScreenshot(`comments-tab-${theme}-${width}.png`);
      });
    }
  }
});

test.describe('US-8 dedicated Pull Requests tab', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      test(`local links at ${width}px (${theme})`, async ({ page }) => {
        await gotoVisualApp(page, theme);
        await page.setViewportSize({ width, height: 900 });
        const fixture = JSON.parse(readFileSync('test-board/us-8.board.json', 'utf8'));
        await seedPortfolioBoards(page, [{ id: 'links', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'links' });
        await portfolioCard(page, 'Delivery with multiple servers').click();
        await page.getByRole('tab', { name: 'Pull Requests', exact: true }).click();
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const dialog = page.locator('#taskDetailModal .modal-content');
        expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(dialog).toHaveScreenshot(`pull-requests-tab-${theme}-${width}.png`);
      });
    }
  }
});

test.describe('US-12 workitem detail and functional acceptance', () => {
  for (const theme of ['light', 'dark']) test(`Story and acceptance follow the existing theme (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    const fixture = JSON.parse(readFileSync('test-board/us-12.board.json', 'utf8'));
    await seedPortfolioBoards(page, [{ id: 'us12', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'us12' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="stories"]').click();
    await page.locator('#workitemsTable tr[data-task-id="1202"]').getByRole('button', { name: 'Pagar com cartão', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toHaveScreenshot(`us12-story-${theme}.png`, { animations: 'disabled' });
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill('#1207');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await page.locator('#commandPaletteInput').fill('Done');
    await page.locator('.palette-item').filter({ hasText: /Move to Done/i }).first().click();
    await expect(page.locator('#appMessageModal')).toHaveScreenshot(`us12-acceptance-${theme}.png`, { animations: 'disabled' });
    await answerAppMessage(page, { button: 'Cancel' });
  });
});
