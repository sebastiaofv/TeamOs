import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, confirmWorkitemChanges, answerAppMessage, installControlledPortfolioWriter, openProjectPicker, selectTableView } from '../support/portfolio';

test.beforeEach(async ({ page }) => { await gotoApp(page); });

test('date fields insert separators while typing digits and keep ISO values in the project', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Dates', hasHandle: true, tasks: [{ id: 1, title: 'Task', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Task').click();
    const dueDate = page.locator('#detailDueDateInput');
    await dueDate.pressSequentially('25112026');
    await expect(dueDate).toHaveValue('25/11/2026');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].dueDate).toBe('2026-11-25');
    await dueDate.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 5));
    await dueDate.pressSequentially('12');
    await expect(dueDate).toHaveValue('25/12/2026');
    await dueDate.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 3));
    await dueDate.press('Backspace');
    await expect(dueDate).toHaveValue('2/12/2026');
    await dueDate.pressSequentially('6');
    await expect(dueDate).toHaveValue('26/12/2026');
    await dueDate.press('ControlOrMeta+a');
    await dueDate.press('Backspace');
    await expect(dueDate).toHaveValue('');
});

test('the selected member is fixed for comments while work assignment remains editable', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Identity', hasHandle: true, members: ['Rui', 'Ana'], tasks: [{ id: 1, title: 'Task', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Task').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('.comment-posting-as')).toContainText('Rui');
    await expect(page.locator('.comment-posting-as select')).toHaveCount(0);
    await page.screenshot({ path: '/tmp/teamos54-fixed-identity.png' });
    await page.locator('#commentText').fill('Fixed member identity');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.conversations.entries[0].author.name).toBe('Rui');
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.locator('#detailResponsibleInput').selectOption('Ana');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].responsible).toBe('Ana');
});

test('Bug details and editing omit to-do lists and preserve existing checklist data', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Bugs', hasHandle: true, tasks: [{ id: 1, title: 'Bug', type: 'bug', status: 'to-do', checklist: [{ text: 'Legacy checklist', done: false }] }] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    await portfolioCard(page, 'Bug').click();
    await expect(page.locator('#taskDetailModal').getByText('Legacy checklist', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: '/tmp/teamos54-bug-details.png' });
    await page.locator('#taskDetailEditBtn').click();
    await expect(page.locator('#taskChecklistEditor')).toHaveCount(0);
    await page.locator('#taskName').fill('Bug updated');
    await page.locator('#taskModalSaveBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].title).toBe('Bug updated');
    expect((await readSavedBoard(page, 'p')).board.tasks[0].checklist).toEqual([{ text: 'Legacy checklist', done: false }]);
});

for (const phaseChoice of ['keep', 'update'] as const) test(`creating a Sprint closes the editor after the phase-date decision (${phaseChoice})`, async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Phase dates', hasHandle: true, tasks: [{ id: 1, title: 'Plan this', type: 'story', status: 'to-do', phaseId: 'phase', phaseMode: 'explicit' }, { id: 2, title: 'Execution', parentId: 1, status: 'to-do', phaseMode: 'inherit' }], extensions: { roadmap: { version: 5, milestones: [], sprints: [], phases: [{ id: 'phase', title: 'Delivery', startDate: '2026-11-01', endDate: '2026-11-10' }] } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'unplanned');
    await page.locator('#workitemsTable tbody input[type="checkbox"]').check();
    await page.locator('#tableCreateSprint').click();
    await page.locator('#roadmapEntityTitle').fill('Delivery Sprint');
    await page.locator('#roadmapEntityStartDate').pressSequentially('05112026');
    await page.locator('#roadmapEntityEndDate').pressSequentially('20112026');
    await expect(page.locator('#roadmapEntityStartDate')).toHaveValue('05/11/2026');
    await expect(page.locator('#roadmapEntityEndDate')).toHaveValue('20/11/2026');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await confirmWorkitemChanges(page);
    await expect(page.locator('#appMessageText')).toContainText('falls outside');
    await page.locator('#appMessageSelection-0').selectOption(phaseChoice);
    await installControlledPortfolioWriter(page, { boardId: 'p', holdWrites: true });
    await answerAppMessage(page, { button: 'Confirm' });
    await expect(page.locator('.header-project-picker > .chip-save-state.saving')).toBeVisible();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await page.evaluate(() => window.__releaseNextPortfolioWrite!());
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap?.sprints.length ?? 0).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0].sprintId).toBe(saved.extensions.roadmap.sprints[0].id);
    expect(saved.extensions.roadmap.phases[0].endDate).toBe(phaseChoice === 'update' ? '2026-11-20' : '2026-11-10');
});

test('creating a Sprint from a Story and its Tasks requires no extra allocation confirmation', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint creation', hasHandle: true, tasks: [{ id: 1, title: 'Story', type: 'story', status: 'to-do' }, { id: 2, title: 'Child', parentId: 1, status: 'to-do' }] }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'unplanned');
    await page.locator('#workitemsTable tr[data-task-id="1"] input[type="checkbox"]').check();
    await page.locator('#tableCreateSprint').click();
    await page.locator('#roadmapEntityTitle').fill('New Sprint');
    await page.locator('#roadmapEntityStartDate').pressSequentially('05112026');
    await page.locator('#roadmapEntityEndDate').pressSequentially('20112026');
    await expect(page.locator('#roadmapEntityStartDate')).toHaveValue('05/11/2026');
    await expect(page.locator('#roadmapEntityEndDate')).toHaveValue('20/11/2026');
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(page.locator('#appMessageModal')).toBeHidden();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap?.sprints.length ?? 0).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks.map((task: { sprintId: string }) => task.sprintId)).toEqual([saved.extensions.roadmap.sprints[0].id, saved.extensions.roadmap.sprints[0].id]);
});

test('retrying a failed Sprint save keeps the same Sprint and never reopens its creation form', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Save retry', hasHandle: true, tasks: [{ id: 1, title: 'Task', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'unplanned');
    await page.locator('#workitemsTable tbody input[type="checkbox"]').check();
    await page.locator('#tableCreateSprint').click();
    await page.locator('#roadmapEntityTitle').fill('Single Sprint');
    await page.locator('#roadmapEntityStartDate').fill('05/11/2026');
    await page.locator('#roadmapEntityEndDate').fill('20/11/2026');
    await installControlledPortfolioWriter(page, { boardId: 'p', failWrites: 1 });
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(page.locator('.header-project-picker > .chip-save-state.error')).toBeVisible();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await openProjectPicker(page); await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap?.sprints.length ?? 0).toBe(1);
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
});
