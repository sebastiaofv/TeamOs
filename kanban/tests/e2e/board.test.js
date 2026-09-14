'use strict';

const { test, expect } = require('@playwright/test');

const {
  gotoApp,
  seedPortfolioBoards,
  waitForBoardWrites,
  portfolioCard
} = require('../support/portfolio');

test.describe('board', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('selected mutable project can create tasks directly from portfolio columns and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Portfolio-created task');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskEffort').selectOption('S');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(portfolioCard(page, 'Portfolio-created task')).toBeVisible();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      taskTitles: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.map((t) => t.title),
      writes: (window.__portfolioTestWrites || []).map((w) => ({ boardId: w.boardId, text: w.text }))
    }));

    expect(result.taskTitles).toContain('Portfolio-created task');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('Portfolio-created task');
  });

  test('all-projects view hides add-task cards and read-only selected project also hides them', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'm1', title: 'Mutable A', hasHandle: true, tasks: [] },
      { id: 'm2', title: 'Mutable B', hasHandle: true, tasks: [] }
    ], { selectedBoardId: '' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);

    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);
    await expect(page.locator('.portfolio-chip.active')).toContainText('Read Only (Read-only)');
    await expect(portfolioCard(page, 'RO Task').locator('button[title="Read-only (no file handle)"]')).toHaveCount(3);
  });

  test('task card delete removes the task and persists the board', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Delete Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Delete me', status: 'backlog' }]
      }
    ], { selectedBoardId: 'd1' });

    const card = portfolioCard(page, 'Delete me');
    await card.hover();

    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Delete me')).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      taskCount: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.length,
      timelineKinds: JSON.parse(window.__portfolioDiskByBoardId.d1.text).extensions.timeline?.events?.map((event) => event.kind) || [],
      writes: window.__portfolioTestWrites || []
    }));
    expect(result.taskCount).toBe(0);
    expect(result.timelineKinds).toEqual(['board.baseline', 'task.deleted']);
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"tasks": []');
  });

  test('delete cancel leaves the task untouched', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Keep me', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.confirm = () => false;
    });

    const card = portfolioCard(page, 'Keep me');
    await card.hover();
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Keep me')).toBeVisible();

    const result = await page.evaluate(() => ({
      taskCount: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.length,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.taskCount).toBe(1);
    expect(result.writes).toEqual([]);
  });

  test('archive confirms before archiving a task', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Archive me', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Archive me');
    await card.hover();

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Archive me')).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(dialogMessage).toContain('Archive "Archive me"?');
    expect(result.archived).toBe(true);
    expect(result.writes.length).toBeGreaterThan(0);
  });

  test('archive cancel leaves the task untouched', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Keep archive', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.confirm = () => false;
    });

    const card = portfolioCard(page, 'Keep archive');
    await card.hover();
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Keep archive')).toBeVisible();

    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.archived).toBe(false);
    expect(result.writes).toEqual([]);
  });

  test('archiving a task can be undone from the toast', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undo me', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Undo me');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Undo me')).toHaveCount(0);
    await expect(page.locator('#undoToast')).toHaveClass(/active/);

    await page.locator('#undoBtn').click();
    await expect(portfolioCard(page, 'Undo me')).toBeVisible();

    // One write for the archive, one for the undo.
    await waitForBoardWrites(page, 2);
    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.archived).toBe(false);
    expect(result.writes.length).toBeGreaterThan(0);
  });

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

  test('clicking Undo in the toast keeps the shortcuts dialog open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undo under dialog', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Undo under dialog');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();
    await expect(page.locator('#undoToast')).toBeVisible();

    await page.locator('#openShortcutsBtn').click();
    await expect(page.locator('#shortcutsModal')).toBeVisible();

    await page.locator('#undoBtn').click();

    await expect(portfolioCard(page, 'Undo under dialog')).toBeVisible();
    await expect(page.locator('#shortcutsModal')).toBeVisible();
  });

  test('card keyboard shortcuts support selection, move, open details, and edit/save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k1',
        title: 'Keyboard Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k1', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(1);

    const selectedBefore = page.locator('.portfolio-task-card.selected');
    await expect(selectedBefore).toContainText('Task A');

    await page.keyboard.press('3');
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card.selected')).toContainText('Task A');

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Task A Edited');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Task A Edited' })).toBeVisible();
  });

  test('hovered card shortcuts take priority over the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k2',
        title: 'Hover Priority Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k2', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    const hoveredCard = portfolioCard(page, 'Task B');
    await hoveredCard.hover();

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await hoveredCard.hover();
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveValue('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskModal')).toBeHidden();
  });

  test('clicking outside cards clears the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k3',
        title: 'Selection Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'backlog' }
        ]
      }
    ], { selectedBoardId: 'k3' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    await page.locator('.header').click();
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(0);
  });

  test('dragging a task across portfolio columns updates status and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Drag Project',
        hasHandle: true,
        tasks: [
          {
            id: 11,
            title: 'Move me',
            status: 'backlog',
            priority: 'medium',
            effort: 'M'
          }
        ]
      }
    ], { selectedBoardId: 'd1' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);
    await expect(card.locator('.task-tag-age')).toContainText('Age');

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Move me' })).toBeVisible();
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' })).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      status: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.find((t) => t.id === 11)?.status,
      statusChangedAt: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.find((t) => t.id === 11)?.statusChangedAt,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.status).toBe('doing');
    expect(result.statusChangedAt).toBeUndefined();
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"status": "doing"');
    expect(result.writes.at(-1).text).not.toContain('"statusChangedAt"');
  });

  test('dragging works in all-projects view for mutable cards', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a1',
        title: 'Alpha',
        hasHandle: true,
        tasks: [{ id: 21, title: 'Drag in all view', status: 'backlog', priority: 'low', effort: 'M' }]
      },
      {
        id: 'b1',
        title: 'Bravo',
        hasHandle: true,
        tasks: [{ id: 22, title: 'Other task', status: 'done', priority: 'medium', effort: 'S' }]
      }
    ], { selectedBoardId: '' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Drag in all view' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Drag in all view' })).toBeVisible();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      alphaStatus: JSON.parse(window.__portfolioDiskByBoardId.a1.text).board.tasks.find((t) => t.id === 21)?.status,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.alphaStatus).toBe('doing');
    expect(result.writes.some((w) => w.boardId === 'a1')).toBe(true);
  });
});
