import { confirmWorkitemChanges } from '../support/portfolio';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, openFiltersPanel, portfolioCard } from '../support/portfolio';

test('planning view selects eligible workitems and reuses sprint creation without changing their status', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Planning', hasHandle: true, tasks: [
    { id: 1, title: 'Plan A', status: 'backlog' }, { id: 2, title: 'Plan B', status: 'doing' },
    { id: 3, title: 'Completed', status: 'done' }, { id: 4, title: 'Already planned', status: 'to-do', sprintId: 's1' }
  ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Existing', startDate: '2026-10-01', endDate: '2099-10-14' }] } } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await page.getByRole('button', { name: 'Unplanned workitems', exact: true }).click();
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Select this page', exact: true }).check();
  await page.getByRole('button', { name: 'Create Sprint', exact: true }).click();
  await page.locator('#roadmapEntityTitle').fill('Sprint from table');
  await page.locator('#roadmapEntityStartDate').fill('2026-11-01');
  await page.locator('#roadmapEntityEndDate').fill('2026-11-14');
  await page.getByRole('button', { name: 'Save Item', exact: true }).click();
  await confirmWorkitemChanges(page);
  await waitForBoardWrites(page);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.board.tasks.slice(0, 2)).toMatchObject([{ id: 1, status: 'backlog', sprintId: 'sprint-from-table' }, { id: 2, status: 'doing', sprintId: 'sprint-from-table' }]);
  await expect(page.locator('#workitemsTable')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sprints', exact: true }).click();
  const sprint = page.locator('[data-table-sprint="sprint-from-table"]');
  await expect(sprint).toContainText('0%');
  await sprint.locator(':scope > summary').click();
  await expect(sprint.locator('tbody tr')).toHaveCount(2);
});

test('table dates, status colors, blocked emphasis and minimum widths match the delivery review', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Presentation', hasHandle: true, tasks: [
    { id: 1, title: 'A very long workitem title '.repeat(3).slice(0, 80), status: 'backlog', assignees: ['A long participant name '.repeat(8)],
      blocked: true, blockerReason: 'A long blocker reason '.repeat(20), updatedAt: '2026-10-17T10:27:42.462Z', dueDate: '2026-10-20' },
    { id: 2, title: 'To do', status: 'to-do' }, { id: 3, title: 'Doing', status: 'doing' }, { id: 4, title: 'Done', status: 'done' }
  ] }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await expect(page.locator('#workitemsTable [data-task-id="1"] [data-column="updatedAt"]')).toHaveText('2026-10-17 10:27:42');
  await page.locator('#tableColumns summary').click();
  for (const column of ['blocked', 'blockerReason', 'dueDate', 'createdAt', 'milestone', 'sprint', 'effort', 'tags', 'archived']) {
    await page.locator(`#tableColumn-${column}`).check();
  }
  await page.keyboard.press('Escape');
  const first = page.locator('#workitemsTable [data-task-id="1"]');
  await expect(first.locator('[data-column="dueDate"]')).toHaveText('2026-10-20');
  await expect(first.locator('[data-column="blocked"] .table-blocked-badge')).toHaveText('Yes');
  for (const status of ['backlog', 'to-do', 'doing', 'done']) await expect(page.locator(`#workitemsTable .status-${status}`)).toHaveCount(1);
  const colors = await page.locator('#workitemsTable .table-status-badge').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(new Set(colors).size).toBe(4);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const region = page.locator('#portfolioTable .table-scroll');
    expect(await region.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
    const cells = await page.locator('#workitemsTable td[data-column]').evaluateAll(nodes => nodes.map(node => ({
      column: node.getAttribute('data-column'), width: node.getBoundingClientRect().width
    })));
    expect(cells.every(cell => cell.width >= (cell.column === 'id' ? 80 : cell.column === 'title' ? 240 : ['createdAt', 'updatedAt'].includes(cell.column || '') ? 184 : 132))).toBe(true);
    expect(await page.locator('#workitemsTable .table-cell-text, #workitemsTable .table-item-link').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height <= 36))).toBe(true);
    await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    expect(await region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  }
});

test('sprint sections retain counts while collapsed and show only their own filtered workitems', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint tables', hasHandle: true, tasks: [
    { id: 1, title: 'Past complete', status: 'done', sprintId: 'past' },
    { id: 2, title: 'Past incomplete', status: 'doing', sprintId: 'past' },
    { id: 3, title: 'Past archived', status: 'done', archived: true, sprintId: 'past' },
    { id: 4, title: 'Active item', status: 'doing', sprintId: 'active' },
    { id: 5, title: 'Without sprint', status: 'to-do' }
  ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
    { id: 'past', title: 'Past sprint', startDate: '2026-10-01', endDate: '2026-10-10' },
    { id: 'active', title: 'Active sprint', startDate: '2026-10-12', endDate: '2026-10-26' },
    { id: 'future', title: 'Future sprint', startDate: '2026-11-01', endDate: '2026-11-14' }
  ] } } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await page.getByRole('button', { name: 'Sprints', exact: true }).click();
  const past = page.locator('[data-table-sprint="past"]');
  const active = page.locator('[data-table-sprint="active"]');
  const future = page.locator('[data-table-sprint="future"]');
  await expect(past.locator(':scope > summary')).toContainText('Done');
  await expect(past.locator(':scope > summary')).toContainText('66.7% complete (2/3)');
  await expect(past.locator(':scope > summary')).toContainText('2026-10-01 → 2026-10-10');
  await expect(active.locator(':scope > summary')).toContainText('Active');
  await expect(future.locator(':scope > summary')).toContainText('Planned');
  await expect(future.locator(':scope > summary')).toContainText('N/A (0/0)');
  await past.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await active.locator(':scope > summary').click();
  await expect(past.locator('tbody tr')).toHaveCount(2);
  await expect(active.locator('tbody tr')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await past.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('Past complete');
  expect(csv).not.toContain('Active item');
  await past.getByRole('button', { name: 'Past incomplete', exact: true }).click();
  await expect(page.locator('#detailTitle')).toHaveText('Past incomplete');
  await page.keyboard.press('Escape');
  await expect(past).toHaveAttribute('open', '');
  await openFiltersPanel(page);
  await page.locator('#portfolioStatusesFilter').selectOption(['doing']);
  await page.keyboard.press('Escape');
  await expect(past.locator('tbody tr')).toHaveCount(1);
  await expect(past.locator(':scope > summary')).toContainText('66.7% complete (2/3)');
  await past.locator(':scope > summary').click();
  await expect(past.locator('table')).toBeHidden();
  await expect(past.locator(':scope > summary')).toContainText('66.7%');
});

test('planning cancellation preserves items and table selection stays independent from the Board; read-only has no planning action', async ({ page }) => {
  await gotoApp(page);
  const tasks = [{ id: 1, title: 'Table selection', status: 'doing' }, { id: 2, title: 'Board selection', status: 'to-do' }];
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Selection', hasHandle: true, tasks }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Board selection').locator('input[type="checkbox"]').check();
  await page.locator('[data-view-mode="table"]').click();
  await page.getByRole('button', { name: 'Unplanned workitems', exact: true }).click();
  await page.locator('#workitemsTable [data-task-id="1"] input[type="checkbox"]').check();
  await page.locator('#tableCreateSprint').click();
  await page.locator('#roadmapEntityModalCancelBtn').click();
  expect((await readSavedBoard(page, 'p')).extensions.roadmap).toBeUndefined();
  await expect(page.locator('#workitemsTable [data-task-id="1"] input[type="checkbox"]')).toBeChecked();
  await page.locator('#tableCreateSprint').click();
  await page.locator('#roadmapEntityTitle').fill('Only table selection');
  await page.locator('#roadmapEntityStartDate').fill('2026-11-01');
  await page.locator('#roadmapEntityEndDate').fill('2026-11-14');
  await page.getByRole('button', { name: 'Save Item', exact: true }).click();
  await confirmWorkitemChanges(page);
  await waitForBoardWrites(page);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.board.tasks[0].sprintId).toBe('only-table-selection');
  expect(saved.board.tasks[1].sprintId || '').toBe('');
  await page.locator('[data-view-mode="board"]').click();
  await expect(portfolioCard(page, 'Board selection').locator('input[type="checkbox"]')).toBeChecked();
  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'readonly', title: 'Read only', hasHandle: false, tasks }], { selectedBoardId: 'readonly' });
  await page.locator('[data-view-mode="table"]').click();
  await page.getByRole('button', { name: 'Unplanned workitems', exact: true }).click();
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
  await expect(page.locator('#tableCreateSprint')).toHaveCount(0);
});

test.describe('calendar-derived sprint state', () => {
  test.use({ timezoneId: 'UTC' });
  test('refreshes inclusive sprint boundaries after midnight without a board mutation', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-18T23:59:58Z') });
    await page.clock.pauseAt(new Date('2026-10-18T23:59:59Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Midnight', hasHandle: false, tasks: [], extensions: {
      roadmap: { version: 1, phases: [], milestones: [], sprints: [
        { id: 'ending', title: 'Ending', startDate: '2026-10-01', endDate: '2026-10-18' },
        { id: 'starting', title: 'Starting', startDate: '2026-10-19', endDate: '2026-10-30' }
      ] }
    } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    const ending = page.locator('[data-table-sprint="ending"] > summary .table-status-badge');
    const starting = page.locator('[data-table-sprint="starting"] > summary .table-status-badge');
    await expect(ending).toHaveText('Active');
    await expect(starting).toHaveText('Planned');
    await page.clock.fastForward(2000);
    await expect(ending).toHaveText('Done');
    await expect(starting).toHaveText('Active');
  });
});
