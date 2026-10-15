import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage, setTimelineSlider } from '../support/portfolio';

function projectMetadata(id: string, name: string, product: string, state = 'active') {
    return { version: 1, id, name, product, state, description: '', manager: `${product} manager`, team: [], tags: [], forecast: { start: '', end: '' }, baseline: { start: '', end: '' }, actual: { start: '', end: '' }, needsReview: true };
}

test('review regression: confirmed restore keeps immutable comments and local author records', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'restore-comments', title: 'Restore comments', hasHandle: true, tasks: [{ id: 1, title: 'Discuss safely', assignees: ['Ana'] }] }], { selectedBoardId: 'restore-comments' });
    await page.locator('#localProfile').selectOption({ label: 'Ana' });
    await page.locator('.task-title').filter({ hasText: 'Discuss safely' }).click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await page.locator('#commentBody').fill('Immutable across restore');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.locator('.workitem-comments')).toContainText('Immutable across restore');
    await page.locator('#taskDetailModalCloseBtn').click();
    const before = await readSavedBoard(page, 'restore-comments');
    expect(before.extensions.timeline.events.at(-1).meta.actor).toMatchObject({ name: 'Ana', verified: false });
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    await page.locator('#portfolioTimelinePanel .btn-primary').click();
    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await page.locator('.task-title').filter({ hasText: 'Discuss safely' }).click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('.workitem-comments')).toContainText('Immutable across restore');
    expect((await readSavedBoard(page, 'restore-comments')).extensions.project.id).toBe(before.extensions.project.id);
});

test('US13: maintenance stays separate from project delivery and items move without copying', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'maintenance', title: 'Delivery project', hasHandle: true, extensions: { project: projectMetadata('delivery', 'Delivery project', 'Application A', 'completed') }, tasks: [{ id: 1, title: 'Delivered task', status: 'done' }] }], { selectedBoardId: 'maintenance' });
    await page.locator('[data-view-mode="maintenance"]').click();
    await page.getByRole('button', { name: 'Create maintenance area', exact: true }).click();
    await page.getByRole('button', { name: 'Create maintenance workitem', exact: true }).click();
    await page.locator('#taskType').selectOption('bug');
    await page.locator('#taskName').fill('Post-release defect');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(page.locator('#applicationMaintenance')).toContainText('Post-release defect');
    await expect.poll(async () => (await readSavedBoard(page, 'maintenance')).board.tasks.length).toBe(2);
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(page.locator('[data-metric="completed"] strong')).toHaveText('1');
    await expect(page.locator('[data-metric="open"] strong')).toHaveText('0');
    await page.locator('[data-view-mode="maintenance"]').click();
    await page.locator('#applicationMaintenance').getByRole('button', { name: 'Post-release defect', exact: true }).click();
    await page.getByRole('button', { name: 'Return to project backlog', exact: true }).click();
    await answerAppMessage(page);
    await expect.poll(async () => (await readSavedBoard(page, 'maintenance')).board.tasks.find((task: { title: string }) => task.title === 'Post-release defect').workContext).toBe('project');
    await expect(page.locator('#detailTitle')).toHaveText('Post-release defect');
    await page.getByRole('button', { name: 'Move to maintenance backlog', exact: true }).click();
    await answerAppMessage(page);
    await expect.poll(async () => (await readSavedBoard(page, 'maintenance')).board.tasks.find((task: { title: string }) => task.title === 'Post-release defect').workContext).toBe('maintenance');
    const saved = await readSavedBoard(page, 'maintenance');
    expect(saved.board.tasks.map((task: { id: number }) => task.id)).toEqual([1, 2]);
    await page.locator('#taskDetailModalCloseBtn').click();
    await page.locator('#applicationMaintenance').getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.locator('.work-context-banner')).toContainText('Maintenance work');
    await expect(page.locator('#portfolioBoard')).toContainText('Post-release defect');
    await expect(page.locator('#portfolioBoard')).not.toContainText('Delivered task');
});

test('US10: portfolio includes active projects across products and preserves filters on return', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'a', title: 'Project A', hasHandle: true, extensions: { project: projectMetadata('project-a', 'Project A', 'Product A') }, tasks: [{ id: 1, title: 'A done', status: 'done' }] }, { id: 'b', title: 'Project B', hasHandle: true, extensions: { project: projectMetadata('project-b', 'Project B', 'Product B') }, tasks: [{ id: 1, title: 'B open' }] }, { id: 'paused', title: 'Paused', hasHandle: true, extensions: { project: projectMetadata('project-paused', 'Paused', 'Product C', 'paused') } }], { selectedBoardId: 'a' });
    await page.locator('[data-view-mode="portfolio"]').click();
    const dashboard = page.locator('#portfolioDashboard');
    await expect(dashboard.locator('#portfolioProjectTable tbody tr')).toHaveCount(2);
    await expect(dashboard).toContainText('All products');
    await expect(dashboard.locator('.project-kpis')).toContainText('50%');
    await dashboard.getByLabel('Manager', { exact: true }).selectOption('Product B manager');
    await expect(dashboard.locator('#portfolioProjectTable tbody tr')).toHaveCount(1);
    await dashboard.getByRole('button', { name: 'Project B', exact: true }).click();
    await expect(page.locator('#projectDashboard h1')).toContainText('Project B');
    await page.getByRole('button', { name: '← Back to portfolio', exact: true }).click();
    await expect(dashboard.getByLabel('Manager', { exact: true })).toHaveValue('Product B manager');
    await expect(dashboard.locator('#portfolioProjectTable tbody tr')).toHaveCount(1);
});

test('US09: project KPIs use only the selected project and open their exact source items', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'dash', title: 'Dashboard project', hasHandle: true, tasks: [{ id: 1, title: 'Finished', status: 'done' }, { id: 2, title: 'Needs attention', status: 'doing', blocked: true, blockerReason: 'Waiting', dueDate: '2000-01-01' }] }, { id: 'foreign', title: 'Other project', hasHandle: true, tasks: [{ id: 1, title: 'Foreign completed', status: 'done' }] }], { selectedBoardId: 'dash' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(page.locator('[data-metric="completed"] strong')).toHaveText('1');
    await expect(page.locator('[data-metric="open"] strong')).toHaveText('1');
    await expect(page.locator('[data-metric="blocked"] strong')).toHaveText('1');
    await expect(page.locator('[data-metric="overdue"] strong')).toHaveText('1');
    await page.locator('[data-metric="completed"]').click();
    await expect(page.locator('#dashboardSourceList')).toContainText('Finished');
    await expect(page.locator('#dashboardSourceList')).not.toContainText('Foreign completed');
    await page.locator('#dashboardSourceList').getByRole('button', { name: 'Finished', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Finished');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(page.locator('[data-view-mode="dashboard"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-metric="completed"]')).toHaveAttribute('aria-pressed', 'true');
});

test('US15: drill into inherited work, preserve period and expose unclassified items', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'drill', title: 'Drill', hasHandle: true, tasks: [{ id: 1, title: 'Epic', workitemType: 'epic', phaseId: 'p' }, { id: 2, title: 'Story', workitemType: 'story', parentId: 1 }, { id: 3, title: 'Inherited task', parentId: 2 }, { id: 4, title: 'Unclassified task' }], extensions: { roadmap: { version: 1, phases: [{ id: 'p', title: 'Delivery', startDate: '2026-01-01', endDate: '2026-01-10' }], milestones: [], sprints: [] } } }], { selectedBoardId: 'drill' });
    await page.locator('[data-view-mode="roadmap"]').click();
    await page.locator('.roadmap-period-controls').getByLabel('Plan period from', { exact: true }).fill('2026-01-01');
    await page.locator('.roadmap-period-controls').getByLabel('Plan period to', { exact: true }).fill('2026-02-01');
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    const list = page.locator('[data-roadmap-task-list="phase:p"]');
    await list.getByLabel('Group workitems by', { exact: true }).selectOption('hierarchy');
    await expect(list.locator('.portfolio-task-card')).toHaveCount(3);
    await expect(list).toContainText('Inherited association');
    await list.locator('.task-title').filter({ hasText: 'Inherited task' }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Inherited task');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(list.getByLabel('Group workitems by', { exact: true })).toHaveValue('hierarchy');
    await expect(page.locator('.roadmap-period-controls').getByLabel('Plan period to', { exact: true })).toHaveValue('2026-02-01');
    await expect(page.locator('[data-roadmap-task-list="unassociated"]')).toContainText('Unclassified task');
});

test('US19: freeze baseline, replan and record actual variance without losing originals', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'dates', title: 'Dates', hasHandle: true, extensions: { roadmap: { version: 1, phases: [{ id: 'p', title: 'Delivery', startDate: '2026-01-01', endDate: '2026-01-10' }], milestones: [], sprints: [] } } }], { selectedBoardId: 'dates' });
    await page.locator('[data-view-mode="dashboard"]').click();
    const analysis = page.locator('#projectDateAnalysis');
    await analysis.getByLabel('Approval / revision reason', { exact: true }).fill('Plan approval');
    await analysis.getByRole('button', { name: 'Approve plan baseline', exact: true }).click();
    await expect(analysis.locator('tbody')).toContainText('0 days');
    await analysis.getByRole('button', { name: 'Dates and revisions', exact: true }).click();
    await analysis.getByLabel('Actual start', { exact: true }).fill('2026-01-02');
    await analysis.getByLabel('Actual finish', { exact: true }).fill('2026-01-17');
    await analysis.getByRole('button', { name: 'Save actual dates', exact: true }).click();
    await expect(analysis.locator('tbody')).toContainText('+7 days');
    await analysis.getByRole('button', { name: 'Forecast', exact: true }).click();
    await page.locator('#roadmapEntityEndDate').fill('2026-01-15');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(analysis.locator('tbody')).toContainText('+5 days');
    await analysis.getByLabel('Approval / revision reason', { exact: true }).fill('Scope changed');
    await analysis.getByRole('button', { name: 'Approve baseline revision', exact: true }).click();
    await analysis.getByLabel('Baseline reference', { exact: true }).selectOption('latest');
    await expect(analysis.locator('tbody')).toContainText('+2 days');
    await expect.poll(async () => (await readSavedBoard(page, 'dates')).extensions.projectPlan.phases.p.baselineRevisions.length).toBe(2);
    expect((await readSavedBoard(page, 'dates')).extensions.projectPlan.phases.p.baseline.end).toBe('2026-01-10');
});

test('US17: side panel navigates the underlying list, deep-links and confirms unsaved edits', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'panel', title: 'Panel', hasHandle: true, tasks: [{ id: 1, title: 'Alpha' }, { id: 2, title: 'Beta' }] }], { selectedBoardId: 'panel' });
    await page.locator('.task-title').filter({ hasText: 'Alpha' }).click();
    await expect(page).toHaveURL(/wiProject=.*wi=1/);
    const panel = page.locator('.task-detail-panel');
    expect((await panel.boundingBox())!.x).toBeGreaterThan(500);
    await page.getByRole('button', { name: 'Next workitem', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Beta');
    await page.locator('#taskDetailEditBtn').click();
    await page.locator('#taskName').fill('Unsaved title');
    await page.keyboard.press('Escape');
    await answerAppMessage(page, { button: 'Cancel', expectText: 'unsaved' });
    await expect(page.locator('#taskName')).toHaveValue('Unsaved title');
    await page.locator('#taskModalCancelBtn').click();
    await answerAppMessage(page);
    await expect(page.locator('#taskModal')).toBeHidden();
    expect((await readSavedBoard(page, 'panel')).board.tasks[1].title).toBe('Beta');
});

test('US17: mobile uses an accessible full-screen modal and honors read-only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'mobile', title: 'Mobile', tasks: [{ id: 1, title: 'Read only' }] }], { selectedBoardId: 'mobile' });
    await page.locator('.task-title').filter({ hasText: 'Read only' }).click();
    await expect(page.locator('.task-detail-panel')).toHaveAttribute('aria-modal', 'true');
    expect((await page.locator('.task-detail-panel').boundingBox())!.width).toBe(390);
    await expect(page.locator('#taskDetailEditBtn')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toHaveCount(0);
});

test('US16: manage embedded attachments from detail and reject unsafe uploads', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'files', title: 'Files', hasHandle: true, tasks: [{ id: 1, title: 'Documents' }] }], { selectedBoardId: 'files' });
    await page.locator('.task-title').filter({ hasText: 'Documents' }).click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    await page.setInputFiles('#taskAttachmentsInput', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('offline document') });
    await expect(page.locator('#taskAttachmentsList')).toContainText('notes.txt');
    await expect.poll(async () => (await readSavedBoard(page, 'files')).board.tasks[0].attachments.length).toBe(1);
    await page.setInputFiles('#taskAttachmentsInput', { name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('not accepted');
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove attachment notes.txt', exact: true }).click();
    await answerAppMessage(page);
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'files')).board.tasks[0].attachments.length).toBe(0);
});

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
