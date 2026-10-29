import { test, expect } from '@playwright/test';

import {
  gotoApp,
  seedPortfolioBoards,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy,
  answerAppMessage
} from '../support/portfolio';

test.describe('task detail', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('task detail modal scrolls when content exceeds the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });

    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Oversized detail task',
          status: 'backlog',
          description: Array.from({ length: 18 }, (_, index) => `Detail line ${index + 1}`).join('\n'),
          checklist: Array.from({ length: 28 }, (_, index) => ({
            text: `Checklist item ${index + 1}`,
            done: index % 2 === 0
          }))
        }]
      }
    ], { selectedBoardId: 'p1' });

    await portfolioCard(page, 'Oversized detail task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const content = document.querySelector('#taskDetailModal .modal-content');
      const body = document.querySelector('#taskDetailModal .modal-body');
      if (!content || !body) {
        return null;
      }
      const rect = content.getBoundingClientRect();
      return {
        bodyScrolls: body.scrollHeight > body.clientHeight,
        bodyOverflowY: getComputedStyle(body).overflowY,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.bodyScrolls).toBe(true);
    expect(['auto', 'scroll']).toContain(metrics!.bodyOverflowY);
    expect(metrics!.top).toBeGreaterThanOrEqual(0);
    expect(metrics!.bottom).toBeLessThanOrEqual(metrics!.viewportHeight);
  });

  test('read-only task detail keyboard shortcuts do not open edit or mutate', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ id: 1, title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await portfolioCard(page, 'RO Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.keyboard.press('x');
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    // Still listed under the default "active" archive filter, so not archived.
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(portfolioCard(page, 'RO Task')).toBeVisible();
    const writes = await page.evaluate(() => window.__portfolioTestWrites || []);
    expect(writes).toEqual([]);
  });

  test('opening edit from task detail closes the detail modal (no modal stacking)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'm1',
        title: 'Modal Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Modal Task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'm1' });

    await portfolioCard(page, 'Modal Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
  });

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
    await card.locator('button[title="Archive"]').click();
    await answerAppMessage(page, { button: 'Archive' });
    await waitForBoardWrites(page);

    await expect(page.locator('#undoToast')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
  });

  test('left-side checklist content requires Edit while sidebar properties are immediately editable', async ({ page }) => {
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

    await expect(item.locator('input[type="checkbox"]')).toBeDisabled();
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
    await page.locator('#taskDetailEditBtn').click();
    await page.locator('#taskChecklistItems input[type="checkbox"]').first().check();
    await page.locator('#taskModalSaveBtn').click();
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
      start: (input as HTMLInputElement).selectionStart,
      end: (input as HTMLInputElement).selectionEnd,
      length: (input as HTMLInputElement).value.length
    }));
    expect(selection).toEqual({ start: 0, end: 'Focus target'.length, length: 'Focus target'.length });
  });

  test('undo toast works while task detail is open and leaves the modal open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'd1', title: 'Detail Project', hasHandle: true, tasks: [{ id: 1, title: 'Undo in detail', status: 'backlog' }] }
    ], { selectedBoardId: 'd1' });
    await portfolioCard(page, 'Undo in detail').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('x');
    await answerAppMessage(page, { button: 'Archive' });
    await expect(page.locator('#undoToast')).toBeVisible();
    await waitForBoardWrites(page, 1);

    await page.locator('#undoBtn').click();

    await waitForBoardWrites(page, 2);
    await expect.poll(async () => (await readSavedBoard(page, 'd1')).board.tasks[0].archived).toBe(false);
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Undo in detail');
  });
});
