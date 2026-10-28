import { confirmWorkitemChanges } from '../support/portfolio';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, portfolioCard } from '../support/portfolio';

test.use({ timezoneId: 'UTC' });

test('adds multiple unplanned workitems to a Planned or Active sprint, preserving cancellation and Board selection', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Assignment', hasHandle: true, tasks: [
    { id: 1, title: 'First item', status: 'backlog', assignees: ['Ana', 'Rui'], responsible: 'Ana' },
    { id: 2, title: 'Second item', status: 'doing', assignees: ['Rui'], responsible: 'Rui' },
    { id: 3, title: 'Board selection', status: 'to-do' }, { id: 4, title: 'Completed item', status: 'done' },
    { id: 5, title: 'Already planned', status: 'to-do', sprintId: 'active' }
  ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
    { id: 'done', title: 'Finished', startDate: '2026-10-01', endDate: '2026-10-18' },
    { id: 'active', title: 'Current', startDate: '2026-10-19', endDate: '2026-10-19' },
    { id: 'planned', title: 'Next', startDate: '2026-10-20', endDate: '2026-11-01' }
  ] } } }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Board selection').locator('input[type="checkbox"]').check();
  await page.locator('[data-view-mode="table"]').click();
  await page.locator('[data-table-view="unplanned"]').click();
  const add = page.locator('#tableAddToSprint');
  await expect(add).toHaveAccessibleName('Add to sprint');
  await expect(add).toBeDisabled();
  await expect(page.locator('#tableCreateSprint + #tableAddToSprint')).toBeVisible();
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(3);
  for (const id of [1, 2]) await page.locator(`#workitemsTable [data-task-id="${id}"] input`).check();
  const original = await readSavedBoard(page, 'p');
  await add.click();
  const select = page.locator('#roadmapEntityExistingSprint');
  await expect(select).toBeFocused();
  await expect(select.locator('option')).toHaveText([
    'Select sprint', 'Sprint 2 - Current • 2026-10-19 to 2026-10-19', 'Sprint 3 - Next • 2026-10-20 to 2026-11-01'
  ]);
  await expect(page.locator('#roadmapEntityModalSaveBtn')).toBeDisabled();
  await select.selectOption('planned');
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  expect(await readSavedBoard(page, 'p')).toEqual(original);
  expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
  for (const id of [1, 2]) await expect(page.locator(`#workitemsTable [data-task-id="${id}"] input`)).toBeChecked();
  await add.click();
  await select.selectOption('active');
  await page.locator('#roadmapEntityModalSaveBtn').click();
  await confirmWorkitemChanges(page);
  await expect(page.locator('#roadmapEntityModal')).toBeHidden();
  await waitForBoardWrites(page);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.extensions.roadmap.sprints).toHaveLength(3);
  expect(saved.board.tasks.slice(0, 2)).toMatchObject([
    { id: 1, status: 'backlog', sprintId: 'active', assignees: ['Ana', 'Rui'], responsible: 'Ana' },
    { id: 2, status: 'doing', sprintId: 'active', assignees: ['Rui'], responsible: 'Rui' }
  ]);
  expect(saved.board.tasks[2].sprintId || '').toBe('');
  expect(saved.extensions.timeline.events.findLast((event: { kind: string }) => event.kind === 'roadmap.bulk-assigned').meta).toMatchObject({ action: 'assign-existing', taskIds: [1, 2] });
  expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(1);
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#tableCounts')).toHaveText('1 of 1 workitems · 1 active · 0 archived');
  await expect(add).toBeDisabled();
  await page.locator('#workitemsTable [data-task-id="3"] input').check();
  await add.click();
  await select.selectOption('planned');
  await page.locator('#roadmapEntityModalSaveBtn').click();
  await confirmWorkitemChanges(page);
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p')).board.tasks[2].sprintId).toBe('planned');
  await expect(page.locator('#workitemsTable')).toHaveCount(0);
  await page.locator('[data-view-mode="board"]').click();
  await expect(portfolioCard(page, 'Board selection').locator('input[type="checkbox"]')).toBeChecked();
});

for (const scenario of ['no sprints', 'all Done', 'read-only'] as const) {
  test(`planning handles ${scenario} without offering an invalid assignment`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
    await gotoApp(page);
    await page.locator('#languageToggleBtn').click();
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Planeamento', hasHandle: scenario !== 'read-only', tasks: [
      { id: 1, title: 'Por planear', status: 'backlog' }
    ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: scenario === 'no sprints' ? [] : [
      { id: 'done', title: 'Terminado', startDate: '2026-10-01', endDate: '2026-10-18' }
    ] } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="unplanned"]').click();
    await page.locator('#workitemsTable input[aria-label="Selecionar Por planear"]').check();
    const add = page.locator('#tableAddToSprint');
    if (scenario === 'read-only') {
      await expect(add).toHaveCount(0);
    } else {
      await expect(add).toHaveAccessibleName('Adicionar ao sprint');
      await expect(add).toBeDisabled();
      await expect(add).toHaveAttribute('title', 'Não existem sprints planeados ou ativos disponíveis. Crie um sprint para planear estes workitems.');
      await expect(page.locator('#tableCreateSprint')).toBeEnabled();
    }
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
  });
}

for (const view of ['Table', 'Board']) {
  test(`an open ${view} sprint picker removes a sprint when it becomes Done at midnight`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-19T23:59:58Z') });
    await page.clock.pauseAt(new Date('2026-10-19T23:59:59Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Midnight assignment', hasHandle: true, tasks: [
      { id: 1, title: 'Unplanned item', status: 'backlog' }
    ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
      { id: 'ending', title: 'Ending', startDate: '2026-10-01', endDate: '2026-10-19' },
      { id: 'next', title: 'Next', startDate: '2026-10-20', endDate: '2026-10-30' }
    ] } } }], { selectedBoardId: 'p' });
    if (view === 'Table') {
      await page.locator('[data-view-mode="table"]').click();
      await page.locator('[data-table-view="unplanned"]').click();
      await page.locator('#workitemsTable input[aria-label="Select Unplanned item"]').check();
      await page.locator('#tableAddToSprint').click();
    } else {
      await portfolioCard(page, 'Unplanned item').locator('input[type="checkbox"]').check();
      await page.locator('#portfolioBulkAssignSprintBtn').click();
    }
    const select = page.locator('#roadmapEntityExistingSprint');
    await select.selectOption('ending');
    await expect(page.locator('#roadmapEntityModalSaveBtn')).toBeEnabled();
    await page.clock.fastForward(2000);
    await expect(select.locator('option[value="ending"]')).toHaveCount(0);
    await expect(select).toHaveValue('');
    await expect(page.locator('#roadmapEntityModalSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    await select.selectOption('next');
    await page.locator('#roadmapEntityModalSaveBtn').click();
  await confirmWorkitemChanges(page);
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p')).board.tasks[0].sprintId).toBe('next');
  });
}
