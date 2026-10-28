import { showTimeline } from '../support/portfolio';
import { test, expect, type Page } from '@playwright/test';
import {
  dragWithMouse,
  gotoApp,
  readSavedBoard,
  seedPortfolioBoards,
  selectPortfolioBoard,
  setTimelineSlider,
  waitForBoardWrites
} from '../support/portfolio';

// The browser and the test runner share the machine's time zone.
function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function openPlannerWithBlock(page: Page) {
  const today = localIsoDate();
  await seedPortfolioBoards(page, [{
    id: 'alpha', hasHandle: true, title: 'Alpha',
    tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }],
    extensions: { dayPlanner: { version: 1, blocks: [{ id: 'b1', taskId: 1, date: today, start: '09:00', end: '10:00' }] } }
  }]);
  await page.getByRole('button', { name: 'Day Planner' }).click();
  return { today, block: page.locator('[data-block-id="b1"]') };
}

test.describe('day planner', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('opens from the toolbar, lists tasks by status and keeps the view in the URL', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [
        { id: 1, title: 'Write spec', status: 'to-do' },
        { id: 2, title: 'Ship build', status: 'doing' },
        { id: 3, title: 'Someday idea', status: 'backlog' }
      ]
    }]);

    await page.getByRole('button', { name: 'Day Planner' }).click();

    const planner = page.locator('#portfolioPlannerView');
    await expect(planner).toBeVisible();
    await expect(page).toHaveURL(/pv=planner/);
    const tray = planner.locator('.planner-tray');
    await expect(tray.locator('.planner-tray-card')).toHaveCount(2);
    await expect(tray).toContainText('Write spec');
    await expect(tray).toContainText('Ship build');

    await tray.getByRole('button', { name: 'Backlog' }).click();
    await expect(tray.locator('.planner-tray-card')).toHaveCount(3);
  });

  test('switches between day and week and navigates dates', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();
    const planner = page.locator('#portfolioPlannerView');
    const label = planner.locator('#portfolioPlannerPeriod');
    const todayLabel = (await label.textContent())!;

    await planner.getByRole('button', { name: 'Next day' }).click();
    await expect(label).not.toHaveText(todayLabel);
    await planner.getByRole('button', { name: 'Today' }).click();
    await expect(label).toHaveText(todayLabel);

    const weekButton = planner.getByRole('button', { name: 'Week', exact: true });
    await weekButton.click();
    await expect(weekButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.planner-day')).toHaveCount(5);
    await expect(planner.getByRole('button', { name: 'Next week' })).toBeVisible();
    await planner.getByRole('button', { name: 'Today' }).click();
    await expect(weekButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('renders stored blocks at their times, side by side when they overlap', async ({ page }) => {
    const today = localIsoDate();
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }, { id: 2, title: 'Review', status: 'doing' }],
      extensions: { dayPlanner: { version: 1, blocks: [
        { id: 'b1', taskId: 1, date: today, start: '09:00', end: '10:30' },
        { id: 'b2', taskId: 2, date: today, start: '10:00', end: '11:00' }
      ] } }
    }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();

    const day = page.locator(`.planner-day[data-planner-date="${today}"]`);
    const first = day.locator('[data-block-id="b1"]');
    const second = day.locator('[data-block-id="b2"]');
    await expect(first).toContainText('Write spec');
    await expect(first).toContainText('09:00–10:30');

    const dayBox = (await day.boundingBox())!;
    const firstBox = (await first.boundingBox())!;
    const secondBox = (await second.boundingBox())!;
    // 09:00 is 8 slots of 24px below 07:00; 90 minutes is 6 slots.
    expect(Math.round(firstBox.y - dayBox.y)).toBeGreaterThanOrEqual(8 * 24);
    expect(Math.round(firstBox.y - dayBox.y)).toBeLessThanOrEqual(8 * 24 + 2);
    expect(Math.round(firstBox.height)).toBeGreaterThanOrEqual(6 * 24 - 4);
    expect(secondBox.x).toBeGreaterThan(firstBox.x + firstBox.width / 2);
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 21) await expect(day.locator('.planner-now')).toHaveCount(1);
  });

  test('dragging a task onto the day creates a 15-minute block and saves it without changing the task', async ({ page }) => {
    const today = localIsoDate();
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }]
    }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();

    const card = page.locator('.planner-tray-card').filter({ hasText: 'Write spec' });
    const day = page.locator(`.planner-day[data-planner-date="${today}"]`);
    // 10:00 is 12 slots of 24px below 07:00; aim inside that slot.
    await dragWithMouse(page, card, day, { targetPosition: { x: 40, y: 12 * 24 + 6 } });

    await expect(day.locator('.planner-block')).toHaveAttribute('aria-label', /10:00 to 10:15/);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.dayPlanner.blocks).toEqual([
      expect.objectContaining({ taskId: 1, date: today, start: '10:00', end: '10:15' })
    ]);
    expect(saved.board.tasks[0].status).toBe('to-do');
    expect(saved.extensions.timeline.events).toContainEqual(expect.objectContaining({
      kind: 'planner.block.added',
      entityId: '1',
      summary: expect.stringContaining('Planned "Write spec"')
    }));
    await expect(card).toContainText('planned');
  });

  test('planner changes appear in the timeline and a historical preview shows the earlier plan', async ({ page }) => {
    const { block } = await openPlannerWithBlock(page);
    await selectPortfolioBoard(page, 'Alpha');
    await block.focus();
    await page.keyboard.press('ArrowDown');
    await expect(block).toContainText('09:15–10:15');
    await waitForBoardWrites(page);

    await showTimeline(page);
    const panel = page.locator('#portfolioTimelinePanel');
    await panel.locator('.timeline-toggle-btn').click();
    await expect(panel).toContainText('Moved "Write spec"');
    await expect(panel).toContainText('Baseline snapshot created');

    // The fixed wording follows the selected language; the task name does not.
    await page.locator('#languageToggleBtn').click();
    await expect(panel).toContainText('"Write spec" movida para');
    await expect(panel).toContainText('Cópia de base criada');
    await page.locator('#languageToggleBtn').click();
    await expect(panel).toContainText('Moved "Write spec"');

    // Event 0 is the baseline, before the move.
    await setTimelineSlider(page, 0);
    await expect(panel.locator('.timeline-preview-banner.active')).toBeVisible();
    await expect(page.locator('[data-block-id="b1"]')).toContainText('09:00–10:00');
    await expect(page.locator('[data-block-id="b1"]')).toHaveClass(/read-only/);
  });

  test('drags a block to move it and its bottom edge to resize it', async ({ page }) => {
    const { today, block } = await openPlannerWithBlock(page);
    await expect(block).toBeVisible();
    const box = (await block.boundingBox())!;

    // Move down 4 slots (1 hour).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4 * 24, { steps: 8 });
    await page.mouse.up();
    await expect(block).toContainText('10:00–11:00');

    // Resize the bottom edge down 2 slots (30 minutes).
    const moved = (await block.boundingBox())!;
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3 + 2 * 24, { steps: 6 });
    await page.mouse.up();
    await expect(block).toContainText('10:00–11:30');

    await waitForBoardWrites(page, 2);
    await expect.poll(async () => (await readSavedBoard(page, 'alpha')).extensions.dayPlanner.blocks[0])
      .toMatchObject({ date: today, start: '10:00', end: '11:30' });
  });

  test('keyboard moves, resizes and deletes a block, and undo restores it', async ({ page }) => {
    const { block } = await openPlannerWithBlock(page);
    await block.focus();
    await page.keyboard.press('ArrowDown');
    await expect(block).toContainText('09:15–10:15');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(block).toContainText('09:15–10:30');
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-block-id="b1"]')).toHaveCount(0);

    await page.locator('#undoBtn').click();
    await expect(page.locator('[data-block-id="b1"]')).toContainText('09:15–10:30');
  });

  test('double-clicking a block opens the task details', async ({ page }) => {
    const { block } = await openPlannerWithBlock(page);
    await block.dblclick();
    await expect(page.getByRole('dialog')).toContainText('Write spec');
  });

  test('planner keyboard shortcuts switch view, mode and date and are listed in the shortcuts dialog', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }]);
    await page.locator('body').click();

    await page.keyboard.press('p');
    const planner = page.locator('#portfolioPlannerView');
    await expect(planner).toBeVisible();
    const label = planner.locator('#portfolioPlannerPeriod');
    const todayLabel = (await label.textContent())!;

    await page.keyboard.press('w');
    await expect(page.locator('.planner-day')).toHaveCount(5);
    await page.keyboard.press('d');
    await expect(page.locator('.planner-day')).toHaveCount(1);
    await page.keyboard.press('.');
    await expect(label).not.toHaveText(todayLabel);
    await page.keyboard.press('t');
    await expect(label).toHaveText(todayLabel);

    await page.keyboard.press('?');
    const dialog = page.locator('#shortcutsModal');
    await expect(dialog).toContainText('Day Planner');
    await expect(dialog).toContainText('Jump to today');
    await expect(dialog).toContainText('Move the focused block by 15 minutes');
  });
});
