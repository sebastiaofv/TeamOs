import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

test('US08: link and correct a GitHub PR with an optional URL', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'prs', title: 'PRs', hasHandle: true, tasks: [{ id: 1, title: 'Code change' }] }], { selectedBoardId: 'prs' });
    await page.locator('.task-title').filter({ hasText: 'Code change' }).click();
    await page.getByRole('tab', { name: 'Pull requests', exact: true }).click();
    await page.locator('#prNumber').fill('123');
    await page.getByRole('button', { name: 'Save PR link', exact: true }).click();
    await expect(page.locator('#taskPullRequests .pr-reference')).toContainText('#123');
    await expect(page.locator('#taskPullRequests .pr-reference a')).toHaveCount(0);
    await page.locator('#taskPullRequests .pr-reference').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#prUrl').fill('https://github.com/team/repo/pull/123');
    await page.getByRole('button', { name: 'Save PR link', exact: true }).click();
    await expect(page.locator('#taskPullRequests .pr-reference a')).toHaveAttribute('href', 'https://github.com/team/repo/pull/123');
    await expect.poll(async () => (await readSavedBoard(page, 'prs')).extensions.pullRequests.byTaskId['1'][0].repository).toBe('team/repo');
});

test('US07: post immutable plain text and a pasted screenshot without altering description', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'comments', title: 'Comments', hasHandle: true, tasks: [{ id: 1, title: 'Discuss', description: 'Original description' }] }], { selectedBoardId: 'comments' });
    await page.locator('.task-title').filter({ hasText: 'Discuss' }).click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await page.locator('#commentBody').fill('Conversation <script>alert(1)</script> @Ana');
    await page.locator('#commentBody').evaluate((element) => {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmVYAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))], 'screenshot.png', { type: 'image/png' }));
        element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }));
    });
    await expect(page.locator('#taskComments form .comment-images img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.locator('.workitem-comments')).toContainText('Conversation <script>alert(1)</script> @Ana');
    await expect(page.locator('.workitem-comments img')).toHaveCount(1);
    await expect(page.locator('.workitem-comments button')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'comments')).extensions.conversation.byTaskId['1'].length).toBe(1);
    expect((await readSavedBoard(page, 'comments')).board.tasks[0].description).toBe('Original description');
});

test('US06: item history shows readable before/after values and unidentified authors', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'history', title: 'History', hasHandle: true, tasks: [{ id: 1, title: 'Before title' }] }], { selectedBoardId: 'history' });
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.locator('#taskName').fill('After title');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await page.locator('.task-title').filter({ hasText: 'After title' }).click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('#taskHistory')).toContainText('Before title');
    await expect(page.locator('#taskHistory')).toContainText('After title');
    await expect(page.locator('#taskHistory')).toContainText('Unidentified');
    await expect(page.locator('#taskHistory .workitem-history > li')).toHaveCount(1);
});

test('US03: reassign to an active team member without changing status', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'team', title: 'Team', hasHandle: true, tasks: [{ id: 1, title: 'Owned', assignees: ['Ana'], status: 'doing' }, { id: 2, title: 'Other', assignees: ['Rui'] }] }], { selectedBoardId: 'team' });
    await page.locator('.task-title').filter({ hasText: 'Owned' }).click();
    await page.locator('#detailResponsible').selectOption({ label: 'Rui' });
    await expect(page.locator('#detailAssignees')).toHaveText('Rui');
    await expect.poll(async () => (await readSavedBoard(page, 'team')).board.tasks[0].assignees).toEqual(['Rui']);
    const saved = await readSavedBoard(page, 'team');
    expect(saved.board.tasks[0].status).toBe('doing');
    expect(saved.board.tasks[0].assigneeId).toBe(saved.extensions.project.team.find((m: { name: string }) => m.name === 'Rui').id);
    expect(saved.extensions.timeline.events.some((event: { changes?: { assigneeId?: unknown } }) => event.changes?.assigneeId)).toBe(true);
});

test('US05: create a subphase and offer only leaf phases for assignment', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'plan', title: 'Plan', hasHandle: true, extensions: { roadmap: { version: 1, phases: [{ id: 'root', title: 'Delivery', startDate: '2026-01-01', endDate: '2026-12-31' }], milestones: [], sprints: [] } } }], { selectedBoardId: 'plan' });
    await page.locator('[data-view-mode="roadmap"]').click();
    await page.locator('[data-action="add-roadmap-item"][data-roadmap-kind="phases"]').click();
    await page.locator('#roadmapEntityTitle').fill('Build');
    await page.locator('#roadmapParentPhase').selectOption('root');
    await page.locator('#roadmapEntityStartDate').fill('2026-02-01');
    await page.locator('#roadmapEntityEndDate').fill('2026-03-31');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'plan')).extensions.projectPlan.phases.build.parentId).toBe('root');
    await page.locator('[data-view-mode="board"]').click();
    await page.getByRole('button', { name: '+ Add Task', exact: true }).first().click();
    await expect(page.locator('#taskPhase option')).toHaveText(['None', 'Build']);
});

test('US02: related creation inherits planning only and links both endpoints', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'relations', title: 'Relations', hasHandle: true, tasks: [{ id: 1, title: 'Original', description: 'Do not copy', phaseId: 'p1', milestoneId: 'm1' }], extensions: { roadmap: { version: 1, phases: [{ id: 'p1', title: 'Build', startDate: '2026-10-01', endDate: '2026-10-30' }], milestones: [{ id: 'm1', title: 'Launch', dueDate: '2026-10-30' }], sprints: [] } } }], { selectedBoardId: 'relations' });
    await page.locator('.task-title').filter({ hasText: 'Original' }).click();
    await page.getByRole('button', { name: 'Create related workitem', exact: true }).click();
    await expect(page.locator('#taskDescription')).toHaveValue('');
    await expect(page.locator('#taskPhase')).toHaveValue('p1');
    await expect(page.locator('#taskMilestone')).toHaveValue('m1');
    await page.locator('#taskName').fill('Related work');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'relations')).extensions.relations.links.length).toBe(1);
    await page.locator('.task-title').filter({ hasText: 'Original' }).click();
    await page.locator('#taskRelations').getByRole('button', { name: '#2 · Related work', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Related work');
    await expect(page.locator('#taskRelations')).toContainText('Original');
});

test('US04: project state names and transitions persist', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'workflow', title: 'Workflow', hasHandle: true, tasks: [{ id: 1, title: 'In review', status: 'doing' }] }], { selectedBoardId: 'workflow' });
    const settings = page.locator('#workflowSettings');
    await settings.locator(':scope > summary').click();
    await settings.getByLabel('Name 3', { exact: true }).fill('Review');
    await settings.getByRole('button', { name: 'Save workflow', exact: true }).click();
    await expect(page.locator('#portfolio-doing-heading')).toHaveText('Review');
    await expect.poll(async () => (await readSavedBoard(page, 'workflow')).extensions.workflow.states[2].name).toBe('Review');
    await expect(page.getByRole('group', { name: 'In review', exact: true })).toBeVisible();
});

test('US12: create an immutable Bug and preserve its specific fields', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'types', title: 'Types', hasHandle: true }], { selectedBoardId: 'types' });
    await page.getByRole('button', { name: '+ Add Task', exact: true }).first().click();
    await page.locator('#taskType').selectOption('bug');
    await page.locator('#taskName').fill('Reproducible defect');
    await page.locator('#taskReproduction').fill('Open the application');
    await page.locator('#taskExpected').fill('Works correctly');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'types')).board.tasks[0]?.workitemType).toBe('bug');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.locator('#taskType')).toBeDisabled();
    await expect(page.locator('#taskReproduction')).toHaveValue('Open the application');
});

test('US11: edit master data and preserve legacy workitems', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'legacy', title: 'Legacy', hasHandle: true, tasks: [{ id: 42, title: 'Preserved', assignees: ['Ana'] }] }], { selectedBoardId: 'legacy' });
    const settings = page.locator('#projectSettings');
    await settings.locator('summary').click();
    await settings.getByLabel('Name', { exact: true }).first().fill('Renamed project');
    await settings.getByLabel('Manager', { exact: true }).fill('Ana');
    await settings.getByLabel('Product / application').fill('Product A');
    await settings.getByLabel('Description', { exact: true }).fill('Project description');
    await settings.getByLabel('Tags', { exact: true }).fill('team');
    await settings.getByLabel('Forecast · Start').fill('2026-10-01');
    await settings.getByLabel('End', { exact: true }).first().fill('2026-12-31');
    await settings.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Renamed project');
    await expect.poll(async () => (await readSavedBoard(page, 'legacy')).extensions.project.name).toBe('Renamed project');
    const saved = await readSavedBoard(page, 'legacy');
    expect(saved.board.tasks[0].id).toBe(42);
    expect(saved.extensions.project.team[0].name).toBe('Ana');
});
