import { test, expect } from '@playwright/test';
import { defaultWorkflow } from '@/domain/workflow';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, confirmWorkitemChanges, answerAppMessage } from '../support/portfolio';

test.use({ timezoneId: 'Europe/Lisbon' });

for (const finish of ['button', 'editor'] as const) {
  test(`Roadmap starts a Sprint and Table finishes it through ${finish}, freezing carry-over and preserving Tasks`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint lifecycle', hasHandle: true, tasks: [
      { id: 1, title: 'Story awaiting validation', type: 'story', status: 'ready-to-test', acceptanceCriteria: 'Reviewed', sprintId: 's1', storyPoints: 8 },
      { id: 2, title: 'Completed development', type: 'task', parentId: 1, status: 'done', sprintId: 's1' },
      { id: 3, title: 'Unfinished development', type: 'task', parentId: 1, status: 'doing', sprintId: 's1' },
      { id: 4, title: 'Independent work', type: 'task', status: 'doing', sprintId: 's1', storyPoints: 3 },
      { id: 5, title: 'Future work', type: 'bug', status: 'backlog', storyPoints: 5 }
    ], extensions: { functionalWorkflow: defaultWorkflow(), roadmap: { version: 5, phases: [], milestones: [], sprints: [
      { id: 's1', title: 'Delivery', startDate: '2026-11-01', endDate: '2026-11-14', status: 'planned', goal: 'Ship the increment', capacity: 21 },
      { id: 's2', title: 'Next', startDate: '2026-11-15', endDate: '2026-11-30', status: 'planned' }
    ] } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="roadmap"]').click();
    await expect(page.getByRole('button', { name: '+ Sprint', exact: true })).toHaveCount(0);
    await expect(page.locator('.roadmap-section-btn')).toHaveCount(0);
    const roadmapSprint = page.locator('[data-roadmap-kind="sprint"][data-roadmap-id="s1"]');
    await expect(roadmapSprint.getByRole('button', { name: 'Start Sprint', exact: true })).toBeVisible();
    await roadmapSprint.getByRole('button', { name: 'Start Sprint', exact: true }).click();
    await answerAppMessage(page, { button: 'Use today', expectText: 'start date' });
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints[0]).toMatchObject({ status: 'active', startDate: '2026-11-04' });
    await expect(roadmapSprint.getByRole('button', { name: 'Finish Sprint', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/us22-roadmap.png', fullPage: true });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    const sprint = page.locator('[data-table-sprint="s1"]');
    await sprint.getByRole('button', { name: 'Edit Delivery', exact: true }).click();
    await expect(page.locator('#sprintStatus')).toHaveValue('active');
    await expect(page.locator('#sprintGoal')).toHaveValue('Ship the increment');
    await expect(page.locator('#sprintCapacity')).toHaveValue('21');
    await page.locator('#sprintReview').fill('Demo complete');
    await page.locator('#sprintRetrospective').fill('Reduce batch sizes');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(page.locator('#roadmapEntityModalSaveBtn')).toBeInViewport();
      await expect(page.locator('#roadmapEntityModalCancelBtn')).toBeInViewport();
    }
    await page.screenshot({ path: '/tmp/us22-sprint-editor.png', fullPage: true });
    if (finish === 'editor') await page.locator('#sprintStatus').selectOption('done');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    if (finish === 'button') {
      await expect(page.locator('#roadmapEntityModal')).toBeHidden();
      await sprint.getByRole('button', { name: 'Finish Sprint', exact: true }).click();
    }
    await expect(page.locator('#appMessageText')).toContainText('end date');
    await page.locator('#appMessageModal').getByRole('button', { name: 'Keep planned date', exact: true }).click();
    await confirmWorkitemChanges(page);
    await expect(sprint.locator('.sprint-status-done')).toHaveText('Done');
    await expect(sprint.getByRole('button', { name: 'Finish Sprint', exact: true })).toHaveCount(0);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.roadmap.sprints[0]).toMatchObject({ status: 'done', endDate: '2026-11-14', goal: 'Ship the increment', capacity: 21, review: 'Demo complete', retrospective: 'Reduce batch sizes' });
    const closure = saved.extensions.sprintResults.closures[0];
    expect(closure).toMatchObject({ plannedPoints: 11, velocity: 0, carryOverIds: [1, 4] });
    expect(closure.tasks[0]).toMatchObject({ status: 'ready-to-test', storyPoints: 8 });
    expect(saved.board.tasks.slice(0, 4)).toMatchObject([
      { status: 'backlog', sprintId: '' }, { status: 'done', sprintId: 's1' }, { status: 'doing', sprintId: '' }, { status: 'backlog', sprintId: '' }
    ]);
    await sprint.locator(':scope > summary .table-sprint-name').click();
    await expect(sprint.getByRole('button', { name: 'Story awaiting validation', exact: true })).toBeVisible();
    await sprint.getByRole('button', { name: 'Story awaiting validation', exact: true }).click();
    await expect(page.locator('#detailStoryPoints')).toHaveText('8');
    await expect(page.locator('#detailStatus')).toContainText('Ready to test');
    await page.keyboard.press('Escape');
    await page.locator('[data-table-view="unplanned"]').click();
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(3);
    await page.locator('#workitemsTable [data-task-id="1"] input[type="checkbox"]').check();
    await page.locator('#tableAddToSprint').click();
    await expect(page.locator('#roadmapEntityExistingSprint option[value="s1"]')).toHaveCount(0);
    await page.locator('#roadmapEntityExistingSprint').selectOption('s2');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await confirmWorkitemChanges(page);
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    const reassigned = await readSavedBoard(page, 'p');
    expect(reassigned.board.tasks.slice(0, 3)).toMatchObject([{ sprintId: 's2' }, { sprintId: 's1', status: 'done' }, { sprintId: 's2', status: 'doing' }]);
    expect(reassigned.extensions.sprintResults.closures[0]).toEqual(closure);
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'reopened', title: 'Reopened', hasHandle: true, tasks: reassigned.board.tasks, extensions: reassigned.extensions }], { selectedBoardId: 'reopened' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    await page.getByRole('button', { name: 'Edit Delivery', exact: true }).click();
    await expect(page.locator('#sprintReview')).toHaveValue('Demo complete');
    await page.locator('#sprintReview').fill('Updated review after closure');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    expect((await readSavedBoard(page, 'reopened')).extensions.sprintResults.closures[0]).toEqual(closure);
  });
}

test('Story Points edit independently of Effort and disappear when an independent Task joins a Story', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Estimates', hasHandle: true, tasks: [
    { id: 1, title: 'Story', type: 'story', status: 'backlog', storyPoints: 8 },
    { id: 2, title: 'Independent Task', type: 'task', status: 'backlog', storyPoints: 3, effort: 'XL' },
    { id: 3, title: 'Bug', type: 'bug', status: 'backlog', storyPoints: 5 }
  ] }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await page.getByRole('button', { name: 'Independent Task', exact: true }).click();
  await expect(page.locator('#detailStoryPointsInput')).toHaveValue('3');
  await page.locator('#detailStoryPointsInput').selectOption('13');
  await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[1].storyPoints).toBe(13);
  expect((await readSavedBoard(page, 'p')).board.tasks[1].effort).toBe('XL');
  await page.locator('#detailParentInput').selectOption('1');
  await confirmWorkitemChanges(page);
  await expect(page.locator('#detailStoryPointsInput')).toHaveCount(0);
  expect((await readSavedBoard(page, 'p')).board.tasks[1].storyPoints).toBeUndefined();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bug', exact: true }).click();
  await expect(page.locator('#detailStoryPointsInput')).toHaveValue('5');
});

test('Table selection creates a Planned Sprint with goals/capacity even when all its dates are in the past', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'New Sprint', hasHandle: true, tasks: [{ id: 1, title: 'Plan this', status: 'backlog' }] }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await page.locator('[data-table-view="unplanned"]').click();
  await page.locator('#workitemsTable tbody input[type="checkbox"]').check();
  await page.locator('#tableCreateSprint').click();
  await page.locator('#roadmapEntityTitle').fill('Old dates');
  await page.locator('#roadmapEntityStartDate').fill('2000-01-01');
  await page.locator('#roadmapEntityEndDate').fill('2000-01-14');
  await page.locator('#sprintGoal').fill('Manually start later');
  await page.locator('#sprintCapacity').fill('34');
  await page.locator('#roadmapEntityModalSaveBtn').click();
  await confirmWorkitemChanges(page);
  await expect(page.locator('#roadmapEntityModal')).toBeHidden();
  expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints[0]).toMatchObject({ status: 'planned', goal: 'Manually start later', capacity: 34 });
  await page.locator('[data-table-view="sprints"]').click();
  await expect(page.locator('.sprint-status-planned')).toHaveText('Planned');
  await expect(page.getByRole('button', { name: 'Start Sprint', exact: true })).toBeVisible();
});
