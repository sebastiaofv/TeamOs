'use strict';

const { test, expect } = require('@playwright/test');
const { seedPortfolioBoards, portfolioCard, FIXED_TIMESTAMP } = require('./support/portfolio');

// Pixel baselines for pieces being ported to React. They are captured against
// the legacy implementation first; a port must match them unchanged. Baselines
// are platform-specific (generated on macOS). Only update them deliberately
// (`npx playwright test tests/visual.test.js --update-snapshots`) and review the
// image diff in the commit.

const FIXED_TIME = '2026-02-26T12:00:00Z';

// Dialogs are opened with mouse clicks, never keys: Radix focuses the close
// button on open, and Chromium only paints a :focus-visible ring for that
// programmatic focus after keyboard input. Legacy never moved focus.
async function gotoVisualApp(page, theme) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript((value) => {
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
}

test('no dialog open after opening and closing one (light)', async ({ page }) => {
  await gotoVisualApp(page, 'light');
  await page.locator('#openShortcutsBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeVisible();
  await page.locator('#shortcutsModalFooterCloseBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeHidden();
  await page.evaluate(() => document.activeElement?.blur());
  await expect(page).toHaveScreenshot('no-dialog-light.png', { fullPage: true });
});

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
