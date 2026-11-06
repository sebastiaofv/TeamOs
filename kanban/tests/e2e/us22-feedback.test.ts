import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, confirmWorkitemChanges, portfolioCard, openProjectSettingsFromPicker, selectTableView } from '../support/portfolio';

test.use({ timezoneId: 'Europe/Lisbon' });

test('each workflow selects its workitem types; moving Bugs back to the technical workflow updates the Boards', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Types', hasHandle: true, tasks: [
    { id: 1, title: 'Defect', type: 'bug', status: 'doing' },
    { id: 2, title: 'Implementation', type: 'task', status: 'doing' }
  ] }], { selectedBoardId: 'p' });
  await expect(portfolioCard(page, 'Defect')).toHaveCount(0);
  await openProjectSettingsFromPicker(page, 'Types');
  const modal = page.locator('#projectSettingsModal');
  await modal.getByRole('tab', { name: 'Technical workflow', exact: true }).click();
  await modal.getByRole('tab', { name: /^Workitem types/ }).click();
  await expect(modal.locator('[data-workflow-type="task"]')).toBeChecked();
  await expect(modal.locator('[data-workflow-type="bug"]')).not.toBeChecked();
  await modal.locator('[data-workflow-type="bug"]').check();
  await expect(modal).toContainText('Applies to: Task, Bug.');
  await modal.getByRole('tab', { name: 'Functional workflow', exact: true }).click();
  await modal.getByRole('tab', { name: /^Workitem types/ }).click();
  await expect(modal.locator('[data-workflow-type="bug"]')).not.toBeChecked();
  await expect(modal.locator('[data-workflow-type="story"]')).toBeChecked();
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toBeHidden();
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p')).extensions.workflowTypes).toEqual({ version: 1, functional: ['epic', 'story'] });
  await expect(portfolioCard(page, 'Defect')).toBeVisible();
});

test('a Planned Sprint is deleted from its editor; workitems return to planning and SP over capacity are flagged', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Planning', hasHandle: true, tasks: [
    { id: 1, title: 'Large story', type: 'story', status: 'to-do', sprintId: 's1', storyPoints: 13 },
    { id: 2, title: 'Fix', type: 'bug', status: 'backlog', sprintId: 's1', storyPoints: 8 }
  ], extensions: { roadmap: { version: 5, phases: [], milestones: [], sprints: [
    { id: 's1', title: 'Planned', startDate: '2026-11-09', endDate: '2026-11-20', status: 'planned', capacity: 13 },
    { id: 's2', title: 'Running', startDate: '2026-11-02', endDate: '2026-11-13', status: 'active', capacity: 5 }
  ] } } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="roadmap"]').click();
  const planned = page.locator('[data-roadmap-kind="sprint"][data-roadmap-id="s1"]');
  await expect(planned.locator('[data-sprint-points="capacity"]')).toHaveText('21/13');
  await expect(planned.locator('[data-sprint-points="capacity"] .sprint-points-alert')).toHaveText('21');
  await expect(planned.locator('[data-sprint-points="completed"]')).toHaveCount(0);
  const running = page.locator('[data-roadmap-kind="sprint"][data-roadmap-id="s2"]');
  await expect(running.getByRole('button', { name: 'Delete Running', exact: true })).toHaveCount(0);
  await running.getByRole('button', { name: 'Edit Running', exact: true }).click();
  await expect(page.locator('#roadmapEntityModal .task-transfer-menu')).toHaveCount(0);
  await page.locator('#roadmapEntityModalCancelBtn').click();
  await planned.getByRole('button', { name: 'Edit Planned', exact: true }).click();
  await page.locator('#roadmapEntityModal').getByLabel('Task actions', { exact: true }).click();
  await page.locator('#roadmapEntityModal').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#appMessageText')).toContainText('available for planning again');
  await page.locator('#appMessageModal').getByRole('button', { name: 'Delete', exact: true }).click();
  await confirmWorkitemChanges(page);
  await expect(page.locator('#roadmapEntityModal')).toBeHidden();
  await waitForBoardWrites(page);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.extensions.roadmap.sprints.map((sprint: { id: string }) => sprint.id)).toEqual(['s2']);
  expect(saved.board.tasks.map((task: { status: string; sprintId: string }) => [task.status, task.sprintId])).toEqual([['to-do', ''], ['backlog', '']]);
  await page.locator('[data-view-mode="table"]').click();
  await selectTableView(page, 'unplanned');
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
});
