import { test, expect, type Page } from '@playwright/test';
import { defaultWorkflow } from '@/domain/workflow';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, confirmWorkitemChanges, answerAppMessage, selectTableView, openTableSprintActions } from '../support/portfolio';

test.use({ timezoneId: 'Europe/Lisbon' });

// Answers one message of a chain: the next message may reuse the open dialog,
// so this only waits for the expected text, never for the dialog to close.
async function answerChainedMessage(page: Page, { button, expectText, input }: { button?: string; expectText?: string; input?: string }) {
  const dialog = page.locator('#appMessageModal');
  if (expectText !== undefined) await expect(dialog.locator('#appMessageText')).toContainText(expectText);
  if (input !== undefined) await dialog.locator('#appMessageInput').fill(input);
  await (button ? dialog.getByRole('button', { name: button, exact: true }) : dialog.locator('#appMessageConfirmBtn')).click();
}

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
    await answerChainedMessage(page, { button: 'Use today', expectText: 'start date' });
    await answerAppMessage(page, { button: 'Keep 14/11/2026', expectText: '10 business days' });
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints[0]).toMatchObject({ status: 'active', startDate: '2026-11-04' });
    await expect(roadmapSprint.getByRole('button', { name: 'Finish Sprint', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/us22-roadmap.png', fullPage: true });
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'sprints');
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
    // Planned SP / capacity and completed SP / planned SP, frozen at closure.
    await expect(sprint.locator('[data-sprint-points="capacity"]')).toHaveText('11/21');
    await expect(sprint.locator('[data-sprint-points="completed"]')).toHaveText('0/11');
    await expect(sprint.locator('[data-sprint-points="completed"] .sprint-points-alert')).toHaveText('0');
    await sprint.locator(':scope > summary .table-sprint-name').click();
    await expect(sprint.locator('[data-sprint-closure-note]')).toHaveText('The data in this table reflects the state of the workitems when the Sprint was closed: 04/11/2026.');
    await expect(sprint.locator('tr[data-task-id="1"] [data-column="status"]')).toContainText('Ready to test');
    // The frozen row opens the Story with its current data.
    await sprint.getByRole('button', { name: 'Story awaiting validation', exact: true }).click();
    await expect(page.locator('#detailStoryPointsInput')).toHaveValue('8');
    await expect(page.locator('#detailStatusInput')).toHaveValue('backlog');
    await page.keyboard.press('Escape');
    await selectTableView(page, 'unplanned');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(3);
    await page.locator('#workitemsTable [data-task-id="1"] input[type="checkbox"]').check();
    await openTableSprintActions(page);
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
    await selectTableView(page, 'sprints');
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
  await selectTableView(page, 'unplanned');
  await page.locator('#workitemsTable tbody input[type="checkbox"]').check();
  await openTableSprintActions(page);
  await page.locator('#tableCreateSprint').click();
  await page.locator('#roadmapEntityTitle').fill('Old dates');
  await page.locator('#roadmapEntityStartDate').fill('01/01/2000');
  await page.locator('#roadmapEntityEndDate').fill('14/01/2000');
  await page.locator('#sprintGoal').fill('Manually start later');
  await page.locator('#sprintCapacity').fill('34');
  await page.locator('#roadmapEntityModalSaveBtn').click();
  await confirmWorkitemChanges(page);
  await expect(page.locator('#roadmapEntityModal')).toBeHidden();
  expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints[0]).toMatchObject({ status: 'planned', goal: 'Manually start later', capacity: 34 });
  await selectTableView(page, 'sprints');
  await expect(page.locator('.sprint-status-planned')).toHaveText('Planned');
  await expect(page.getByRole('button', { name: 'Start Sprint', exact: true })).toBeVisible();
});

test('Sprint dates follow the duration in business days, and starting late asks which end date to use', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Durations', hasHandle: true, tasks: [], extensions: { roadmap: { version: 5, milestones: [], phases: [
    { id: 'delivery', title: 'Delivery phase', startDate: '2026-10-01', endDate: '2026-12-31' }
  ], sprints: [
    { id: 'delivery', title: 'Nested', parentId: 'delivery', startDate: '2026-11-02', endDate: '2026-11-16', status: 'planned' }
  ] } } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="roadmap"]').click();
  const nested = page.locator('[data-roadmap-kind="sprints"] [data-roadmap-kind="sprint"][data-roadmap-id="delivery"]');
  await expect(nested.getByRole('button', { name: 'Start Sprint', exact: true })).toBeVisible();
  await nested.getByRole('button', { name: 'Edit Nested', exact: true }).click();
  // #54 detaches Sprints from phases while retaining the Sprint editor and business-day calculation.
  await expect(page.locator('#roadmapPhaseParent')).toHaveCount(0);
  await expect(page.locator('#sprintDuration')).toHaveValue('10');
  await page.locator('#roadmapEntityStartDate').fill('04/11/2026');
  await expect(page.locator('#roadmapEntityEndDate')).toHaveValue('18/11/2026');
  await page.locator('#sprintDuration').fill('5');
  await expect(page.locator('#roadmapEntityEndDate')).toHaveValue('11/11/2026');
  await page.locator('#roadmapEntityEndDate').fill('20/11/2026');
  await expect(page.locator('#sprintDuration')).toHaveValue('12');
  await page.locator('#roadmapEntityModalCancelBtn').click();
  await nested.getByRole('button', { name: 'Start Sprint', exact: true }).click();
  await answerChainedMessage(page, { button: 'Use today', expectText: 'start date' });
  await answerChainedMessage(page, { button: 'Enter another date', expectText: 'ends on 18/11/2026' });
  await answerChainedMessage(page, { input: '31/02/2026', expectText: 'on or after 04/11/2026' });
  await expect(page.locator('#appMessageInput')).toHaveValue('31/02/2026');
  await expect(page.locator('#appMessageInput')).toBeVisible();
  await answerChainedMessage(page, { input: '03/11/2026', expectText: 'on or after 04/11/2026' });
  await answerChainedMessage(page, { button: 'OK', expectText: 'must be on or after the start date' });
  await answerAppMessage(page, { input: '25/11/2026', expectText: 'on or after 04/11/2026' });
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints[0]).toMatchObject({ status: 'active', startDate: '2026-11-04', endDate: '2026-11-25' });
});
