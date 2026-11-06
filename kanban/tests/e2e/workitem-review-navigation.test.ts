import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, openProjectPicker, selectTableView, openFiltersPanel } from '../support/portfolio';

async function seed(page: Page) {
    await page.clock.setFixedTime('2026-10-31T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'review', title: 'Review project', hasHandle: true, tasks: [
        { id: 1, type: 'epic', title: 'Epic', phaseId: 'p', phaseMode: 'explicit', milestoneId: 'm', milestoneMode: 'explicit' },
        { id: 2, type: 'story', title: 'Story', parentId: 1, phaseMode: 'inherit', milestoneMode: 'inherit', sprintId: 's' },
        { id: 3, type: 'task', title: 'Child', parentId: 2, phaseMode: 'inherit', milestoneMode: 'inherit', sprintId: 's' },
        { id: 4, type: 'task', title: 'Direct Epic Task', parentId: 1, phaseMode: 'inherit', milestoneMode: 'inherit' },
        { id: 5, type: 'task', title: 'Independent Task', phaseId: 'p', milestoneId: 'm' },
        { id: 6, type: 'bug', title: 'Independent Bug', phaseId: 'p', milestoneId: 'm', sprintId: 's' }
    ], extensions: { roadmap: { version: 1, phases: [{ id: 'p', title: 'Delivery', startDate: '2026-10-01', endDate: '2026-11-30' }], milestones: [{ id: 'm', title: 'Release', dueDate: '2026-11-15' }], sprints: [{ id: 's', title: 'Sprint', startDate: '2026-10-15', endDate: '2026-11-15' }] } } }], { selectedBoardId: 'review' });
}

test('Epics stay out of both Boards in project and aggregate views', async ({ page }) => {
    await seed(page);
    for (const aggregate of [false, true]) {
        if (aggregate) { await openProjectPicker(page); await page.locator('#portfolioBoardsChips').getByRole('button', { name: 'All', exact: true }).click(); }
        for (const board of ['Technical', 'Functional']) {
            await page.getByRole('button', { name: board, exact: true }).click();
            await expect(page.locator('.portfolio-task-card[data-task-id="1"]')).toHaveCount(0);
            await expect(page.locator(`.portfolio-task-card[data-task-id="${board === 'Functional' ? 2 : 5}"]`)).toBeVisible();
        }
    }
});

test('existing child links unwind Task → Story → Epic', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await seed(page);
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'epics');
    await page.locator('#workitemsTable tbody').getByRole('button', { name: 'Epic', exact: true }).click();
    await page.locator('.workitem-hierarchy').getByRole('button', { name: 'Story', exact: true }).click();
    await page.locator('#taskDetailModal .modal-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
    expect(await page.locator('#taskDetailModal .modal-body').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
    await page.locator('.workitem-hierarchy').getByRole('button', { name: 'Child', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Child');
    await expect.poll(() => page.locator('#taskDetailModal .modal-body').evaluate((body) => body.scrollTop)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#detailTitle')).toHaveText('Story');
    await expect.poll(() => page.locator('#taskDetailModal .modal-body').evaluate((body) => body.scrollTop)).toBe(0);
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Epic');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
});

for (const writable of [true, false]) test(`related links unwind across projects with colliding IDs (writable=${writable})`, async ({ page }) => {
    await gotoApp(page);
    const relation = {
        source: { permanentId: 'source-item', projectId: 'source-project', projectTitle: 'Source project', fileName: 'source.board.json', taskId: 1, title: 'Source item' },
        target: { permanentId: 'target-item', projectId: 'target-project', projectTitle: 'Target project', fileName: 'target.board.json', taskId: 1, title: 'Target item' },
        kind: 'related'
    };
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Source project', hasHandle: writable, tasks: [{ id: 1, permanentId: 'source-item', title: 'Source item', assigneeIds: [], responsibleId: '' }],
            extensions: { project: { version: 1, id: 'source-project', description: '', status: null, members: [], tags: [] }, permanentRelations: { version: 1, relations: [relation] } } },
        { id: 'target', title: 'Target project', hasHandle: writable, tasks: [{ id: 1, permanentId: 'target-item', title: 'Target item', assigneeIds: [], responsibleId: '' }],
            extensions: { project: { version: 1, id: 'target-project', description: '', status: null, members: [], tags: [] }, permanentRelations: { version: 1, relations: [relation] } } }
    ], { selectedBoardId: 'source' });
    await page.locator('.portfolio-task-card .task-title').click();
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await page.locator('.relation-item-link').click();
    await expect(page.locator('#detailTitle')).toHaveText('Target item');
    await expect(page.getByRole('tab', { name: 'Relations', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.locator('.relation-item-link').click();
    await expect(page.locator('#detailTitle')).toHaveText('Source item');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Target item');
    await page.keyboard.press('Escape');
    await expect(page.locator('#detailTitle')).toHaveText('Source item');
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
    await expect(page.locator('.portfolio-task-card .task-title')).toHaveText('Source item');
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
});

for (const screen of ['roadmap', 'table']) test(`new child details unwind Task → Story → Epic and return to ${screen}`, async ({ page }) => {
    await seed(page);
    if (screen === 'table') {
        await page.locator('[data-view-mode="table"]').click();
        await selectTableView(page, 'epics');
        await page.locator('#workitemsTable tbody').getByRole('button', { name: 'Epic', exact: true }).click();
    } else {
        await page.locator('[data-view-mode="roadmap"]').click();
        await page.getByRole('button', { name: 'Show tasks for Delivery', exact: false }).click();
        await page.locator('[data-roadmap-task-list="phase:p"] tbody').getByRole('button', { name: 'Epic', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Create User Story', exact: true }).click();
    await page.locator('#taskName').fill('New Story');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('New Story');
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await page.locator('#taskName').fill('New Task');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('New Task');
    await page.locator('#taskDetailEditBtn').click();
    await page.locator('#taskName').fill('Edited Task');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Edited Task');
    await page.keyboard.press('Escape');
    await expect(page.locator('#detailTitle')).toHaveText('New Story');
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await page.locator('#taskModalCancelBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('New Story');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Epic');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();
    await expect(page.locator(`[data-view-mode="${screen}"]`)).toHaveAttribute('aria-pressed', 'true');
    if (screen === 'table') await expect(page.locator('[data-table-view="epics"]')).toHaveAttribute('aria-pressed', 'true');
    const saved = await readSavedBoard(page, 'review');
    expect(saved.board.tasks).toHaveLength(8);
    expect(saved.board.tasks.find((task: { title: string }) => task.title === 'Edited Task').parentId).toBe(saved.board.tasks.find((task: { title: string }) => task.title === 'New Story').id);
});

test('ALL before Epic shows both hierarchy levels and independent workitems with keyboard disclosure', async ({ page }) => {
    await seed(page);
    await page.locator('[data-view-mode="table"]').click();
    await expect(page.locator('#tableViewBtn')).toContainText('All');
    await selectTableView(page, 'hierarchy');
    const table = page.locator('#workitemsTable');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await table.getByRole('button', { name: 'Expand Epic', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await table.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await expect(table.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '2');
    await expect(table.locator('[data-task-id="4"]')).toHaveAttribute('data-depth', '1');
    await table.getByRole('button', { name: 'Collapse Epic', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await openFiltersPanel(page);
    await page.locator('#tableTypeFilter').selectOption('task');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('.table-tree-toggle')).toHaveCount(0);
});

test('Roadmap phase, milestone and Sprint use the same table and hierarchy as Table', async ({ page }) => {
    await seed(page);
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'hierarchy');
    const headings = await page.locator('#workitemsTable thead th').allTextContents();
    await page.locator('[data-view-mode="roadmap"]').click();
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: false }).click();
    const phase = page.locator('[data-roadmap-task-list="phase:p"]');
    await expect(phase.locator('thead th')).toHaveText(headings.filter((heading) => !heading.startsWith('User Story')));
    await phase.getByRole('button', { name: 'Expand Epic', exact: true }).click();
    await phase.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(phase.locator('tbody tr')).toHaveCount(6);
    await expect(phase.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '2');
    await page.locator('.milestone-annotation[data-roadmap-id="m"]').click();
    const milestone = page.locator('#milestoneWorkitemsModal');
    await expect(milestone.locator('thead th')).toHaveText(headings.filter((heading) => !heading.startsWith('User Story')));
    await milestone.getByRole('button', { name: 'Expand Epic', exact: true }).click();
    await milestone.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(milestone.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '2');
    await milestone.getByRole('button', { name: 'Child', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Child');
    await page.keyboard.press('Escape');
    await expect(milestone).toBeVisible();
    await milestone.locator('.modal-close').click();
    await page.getByRole('button', { name: 'Show tasks for Sprint', exact: false }).click();
    const sprint = page.locator('[data-roadmap-task-list="sprint:s"]');
    await expect(sprint.locator('.workitem-tree')).toHaveCount(0);
    await expect(sprint.locator('thead th')).toHaveText(headings.filter((heading) => !heading.startsWith('User Story')));
    await expect(sprint.locator('tbody tr')).toHaveCount(2);
    await sprint.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(sprint.locator('tbody tr')).toHaveCount(3);
    await expect(sprint.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '1');
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'sprints');
    const mainSprint = page.locator('[data-table-sprint="s"]');
    await mainSprint.locator(':scope > summary .table-sprint-name').click();
    await mainSprint.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(mainSprint.locator('thead th')).toHaveText(headings);
    await expect(mainSprint.locator('tbody tr')).toHaveCount(3);
});
