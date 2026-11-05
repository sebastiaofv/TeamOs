import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, waitForBoardWrites, answerAppMessage, readSavedBoard, installControlledPortfolioWriter } from '../support/portfolio';

const planning = { version: 5, phases: [
    { id: 'parent', title: 'Delivery', startDate: '2026-11-01', endDate: '2026-11-30' },
    { id: 'leaf', title: 'Implementation', parentId: 'parent', startDate: '2026-11-01', endDate: '2026-11-30' }
], milestones: [{ id: 'release', title: 'Release', dueDate: '2026-11-30' }], sprints: [
    { id: 'active', title: 'Current', startDate: '2020-01-01', endDate: '2099-12-31' },
    { id: 'future', title: 'Next', startDate: '2100-01-01', endDate: '2100-02-01' }
] };

test.beforeEach(async ({ page }) => { await gotoApp(page); });

test('asks for a project member and attributes comments and uploads to that identity', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Identity', hasHandle: true, members: ['Ana', 'Rui'], tasks: [{ id: 1, title: 'Task', status: 'to-do' }] }], { identify: false });
    const identity = page.locator('#projectIdentityModal');
    await expect(identity).toBeVisible();
    await identity.getByRole('combobox').selectOption({ label: 'Rui' });
    await identity.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
    await portfolioCard(page, 'Task').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('.comment-posting-as')).toContainText('Rui');
    await expect(page.getByRole('button', { name: 'Change author' })).toHaveCount(0);
    await page.locator('#commentText').fill('Member identity is selected.');
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.locator('.task-conversation')).toContainText('Member identity is selected.');
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    await expect(page.locator('#taskAttachmentUploader')).toHaveValue('Rui');
    await expect(page.locator('#taskAttachmentUploader')).toHaveAttribute('readonly', '');
    await page.locator('#taskAttachmentsInput').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('note') });
    await waitForBoardWrites(page);
    await expect.poll(() => page.evaluate(() => JSON.parse(window.__portfolioDiskByBoardId.p.text).board.tasks[0].attachments[0]?.uploadedBy)).toBe('Rui');
});

test('defaults to active Sprints and offers all, specific Sprint, direct assignment and a top-right advance button', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Board', hasHandle: true, members: ['Ana', 'Rui'], extensions: { roadmap: planning }, tasks: [
        { id: 1, title: 'Current Task', status: 'to-do', sprintId: 'active' },
        { id: 2, title: 'Future Task', status: 'to-do', sprintId: 'future' },
        { id: 3, title: 'Unplanned Task', status: 'to-do', archived: true }
    ] }], { selectedBoardId: 'p', boardScope: 'default' });
    await expect(page.getByRole('checkbox', { name: 'Active Sprints only' })).toBeChecked();
    await expect(portfolioCard(page, 'Current Task')).toBeVisible();
    await expect(portfolioCard(page, 'Future Task')).toHaveCount(0);
    await expect(portfolioCard(page, 'Unplanned Task')).toHaveCount(0);
    await expect(page.locator('#portfolioQueryToolbar #portfolioFiltersBtn')).toBeVisible();
    await expect(page.locator('#portfolio-to-do-heading .column-category')).toHaveText('To do');
    const card = portfolioCard(page, 'Current Task');
    await expect(card.getByRole('combobox', { name: 'Responsible' })).toHaveValue('');
    await expect(card.getByRole('option', { name: 'Not assigned', exact: true })).toHaveCount(1);
    await card.getByRole('combobox', { name: 'Responsible' }).selectOption('Rui');
    await card.locator('.task-header').getByRole('button', { name: /^Advance to / }).click();
    await expect(card).toHaveAttribute('data-status', 'doing');
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
    await expect(portfolioCard(page, 'Future Task')).toBeVisible();
    await expect(portfolioCard(page, 'Unplanned Task')).toBeVisible();
    await page.locator('#portfolioFiltersBtn').click();
    await expect(page.locator('#portfolioArchiveFilter')).toHaveCount(0);
    await page.locator('#portfolioSprintFilter').selectOption('future');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(portfolioCard(page, 'Future Task')).toBeVisible();
    await expect(portfolioCard(page, 'Current Task')).toHaveCount(0);
    await page.locator('#portfolioFiltersBtn').click();
    await page.locator('#portfolioSprintFilter').selectOption('');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Active Sprints only' })).not.toBeChecked();
    await expect(portfolioCard(page, 'Unplanned Task')).toBeVisible();
});

test('creates functional Bugs with a child execution Task and removes severity', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Bugs', acronym: 'BUGS', hasHandle: true, members: ['Ana'], tasks: [] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
    await page.locator('#workitemType').selectOption('bug');
    await page.locator('#taskName').fill('Checkout failure');
    await expect(page.locator('#workitem-severity')).toHaveCount(0);
    await page.locator('#taskDueDate').fill('25/11/2026');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('.workitem-child-section')).toContainText('Checkout failure');
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await expect(portfolioCard(page, 'Checkout failure')).toHaveCount(1);
    await expect(portfolioCard(page, 'Checkout failure')).toContainText('BUGS-BG-1');
    await page.getByRole('button', { name: 'Technical Board', exact: true }).click();
    await expect(portfolioCard(page, 'Checkout failure')).toHaveCount(1);
    await expect(portfolioCard(page, 'Checkout failure')).toContainText('BUGS-TK-2');
    await portfolioCard(page, 'Checkout failure').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#workitemParent')).toHaveValue('1');
    await expect(page.locator('#workitemParent option:checked')).toContainText('BUGS-BG-1');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await portfolioCard(page, 'Checkout failure').click();
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await expect(page.locator('#workitemParent')).toHaveValue('1');
    await page.locator('#taskName').fill('Second execution Task');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Second execution Task');
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Checkout failure');
    await expect(page.locator('.workitem-child-section li')).toHaveCount(2);
});

test('shows only a bare workitem table under leaf phases and integrates Task-only Calendar and heatmap', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Planning', hasHandle: true, members: ['Ana'], extensions: { roadmap: planning }, tasks: [
        { id: 1, title: 'Task deadline', status: 'to-do', dueDate: '2026-11-15', phaseId: 'leaf' },
        { id: 2, title: 'Story deadline', type: 'story', status: 'to-do', dueDate: '2026-11-15', phaseId: 'leaf' }
    ] }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="roadmap"]').click();
    await page.getByRole('button', { name: 'Show tasks for Implementation' }).click();
    const area = page.locator('[data-roadmap-task-list="phase:leaf"]');
    await expect(area.locator('table')).toBeVisible();
    await expect(area.getByRole('columnheader', { name: 'User Story', exact: true })).toHaveCount(0);
    await expect(area.locator('.table-heading')).toHaveCount(0);
    await expect(page.locator('[data-roadmap-task-list="phase:parent"]')).toHaveCount(0);
    await page.locator('[data-view-mode="planner"]').click();
    await expect(page.getByLabel('Include Stories and Epics')).toHaveCount(0);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Story deadline');
    await page.locator('#portfolioCalendarView').getByRole('button', { name: 'Show heat map view' }).click();
    await expect(page.locator('[data-action="calendar-toggle-mode"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.planner-body')).toBeVisible();
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
});

test('puts Delete in the detail menu and validates day/month/year dates before saving', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Modal actions', hasHandle: true, members: ['Ana'], tasks: [{ id: 1, title: 'Editable', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Editable').click();
    await page.locator('#taskDetailEditBtn').click();
    await page.locator('#taskDueDate').fill('31/02/2026');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskDueDate').fill('28/02/2026');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await portfolioCard(page, 'Editable').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailDueDateInput')).toHaveValue('28/02/2026');
    await page.locator('#taskDetailModal .workitem-header-actions summary').click();
    await page.locator('#taskDetailModal .task-transfer-options').getByRole('button', { name: 'Delete', exact: true }).click();
    await answerAppMessage(page, { button: 'Delete' });
    await expect(portfolioCard(page, 'Editable')).toHaveCount(0);
});

for (const choice of ['keep', 'update'] as const) test(`reviews inherited phase dates when allocating a Story and its Task (${choice})`, async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Date conflict', hasHandle: true, members: ['Ana'], extensions: { roadmap: planning }, tasks: [
        { id: 1, title: 'Parent Story', type: 'story', status: 'to-do', phaseId: 'leaf', phaseMode: 'explicit' },
        { id: 2, title: 'Child Task', status: 'to-do', parentId: 1, phaseMode: 'inherit' }
    ] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await portfolioCard(page, 'Parent Story').click();
    await page.locator('#detailSprintInput').selectOption('active');
    await answerAppMessage(page, { button: 'Confirm' });
    await expect(page.locator('#appMessageModal')).toContainText('falls outside');
    await page.locator('#appMessageSelection-0').selectOption(choice);
    await answerAppMessage(page, { button: 'Confirm' });
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[1].sprintId).toBe('active');
    const phase = (await readSavedBoard(page, 'p')).extensions.roadmap.phases.find((item: { id: string }) => item.id === 'leaf');
    expect(phase.startDate).toBe(choice === 'update' ? '2020-01-01' : '2026-11-01');
    expect(phase.endDate).toBe(choice === 'update' ? '2099-12-31' : '2026-11-30');
});

test('shows a spinner while autosave waits for the project file', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Saving', hasHandle: true, members: ['Ana'], tasks: [{ id: 1, title: 'Assign me', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await installControlledPortfolioWriter(page, { boardId: 'p', holdWrites: true });
    await portfolioCard(page, 'Assign me').getByRole('combobox', { name: 'Responsible' }).selectOption('Ana');
    await expect(page.locator('.chip-save-state.saving .save-spinner')).toBeVisible();
    await expect(portfolioCard(page, 'Assign me').locator('.task-advance .save-spinner')).toBeVisible();
    await page.evaluate(() => window.__releaseNextPortfolioWrite!());
    await expect(page.locator('.chip-save-state.saving')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].responsible).toBe('Ana');
});
