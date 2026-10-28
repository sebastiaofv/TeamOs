import { confirmWorkitemChanges } from '../support/portfolio';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites } from '../support/portfolio';

test('sprint creation order and numbering survive name/date edits and reimport', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint identities', hasHandle: true, tasks: [], extensions: {
    roadmap: { version: 1, phases: [], milestones: [], sprints: [
      { id: 'middle', title: 'Design', startDate: '2026-12-01', endDate: '2026-12-14' },
      { id: 'newest', title: 'Implementation', startDate: '2026-01-01', endDate: '2026-01-14' },
      { id: 'oldest', title: 'Discovery', startDate: '2026-10-01', endDate: '2026-10-14' }
    ] },
    sprintCatalog: { version: 1, lastNumber: 3, entries: [
      { sprintId: 'oldest', number: 1, createdAt: '2026-10-01T09:00:00Z' },
      { sprintId: 'middle', number: 2, createdAt: '2026-10-02T09:00:00Z' },
      { sprintId: 'newest', number: 3, createdAt: '2026-10-03T09:00:00Z' }
    ] }
  } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await page.locator('[data-table-view="sprints"]').click();
  const names = page.locator('#portfolioTable .table-sprint-name');
  await expect(names).toHaveText(['Sprint 3 - Implementation', 'Sprint 2 - Design', 'Sprint 1 - Discovery']);
  await page.locator('[data-view-mode="roadmap"]').click();
  await page.getByRole('button', { name: 'Edit Design', exact: true }).click();
  await page.locator('#roadmapEntityTitle').fill('New design name');
  await page.locator('#roadmapEntityStartDate').fill('2025-01-01');
  await page.locator('#roadmapEntityEndDate').fill('2025-01-14');
  await page.getByRole('button', { name: 'Save Item', exact: true }).click();
  await confirmWorkitemChanges(page);
  await waitForBoardWrites(page);
  await page.locator('[data-view-mode="table"]').click();
  await expect(names).toHaveText(['Sprint 3 - Implementation', 'Sprint 2 - New design name', 'Sprint 1 - Discovery']);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.extensions.sprintCatalog.entries[1]).toEqual({ sprintId: 'middle', number: 2, createdAt: '2026-10-02T09:00:00Z' });
  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'reopened', title: saved.board.settings.title, hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopened' });
  await page.locator('[data-view-mode="table"]').click();
  await page.locator('[data-table-view="sprints"]').click();
  await expect(names).toHaveText(['Sprint 3 - Implementation', 'Sprint 2 - New design name', 'Sprint 1 - Discovery']);
});

test('planning creation follows legacy numbering; a second project starts at one', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [
    { id: 'a', title: 'Project A', hasHandle: true, tasks: [{ id: 1, title: 'Plan A', status: 'doing' }], extensions: {
      roadmap: { version: 1, phases: [], milestones: [], sprints: [{ id: 'legacy', title: 'Legacy sprint', startDate: '2027-01-01', endDate: '2027-01-14' }] }
    } },
    { id: 'b', title: 'Project B', hasHandle: true, tasks: [{ id: 1, title: 'Plan B', status: 'to-do' }] }
  ], { selectedBoardId: 'a' });
  for (const [project, id, expectedNumber] of [['Project A', 'a', 2], ['Project B', 'b', 1]] as const) {
    await page.locator('#portfolioBoardsChips [data-action="select-board"]').filter({ hasText: project }).click();
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="unplanned"]').click();
    await page.locator('#workitemsTable tbody input[type="checkbox"]').check();
    await page.locator('#tableCreateSprint').click();
    await page.locator('#roadmapEntityTitle').fill('Execution');
    await page.locator('#roadmapEntityStartDate').fill('2025-01-01');
    await page.locator('#roadmapEntityEndDate').fill('2025-01-14');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
  await confirmWorkitemChanges(page);
    await expect.poll(async () => (await readSavedBoard(page, id)).extensions.sprintCatalog?.lastNumber).toBe(expectedNumber);
    await page.locator('[data-table-view="sprints"]').click();
    await expect(page.locator('.table-sprint-name').first()).toHaveText(`Sprint ${expectedNumber} - Execution`);
    const entries = (await readSavedBoard(page, id)).extensions.sprintCatalog.entries;
    expect(entries.at(-1)).toMatchObject({ number: expectedNumber, createdAt: '2026-10-18T12:00:00.000Z' });
  }
});
