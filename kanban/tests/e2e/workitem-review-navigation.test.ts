import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

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

for (const screen of ['board', 'table']) test(`new child details unwind Task → Story → Epic and return to ${screen}`, async ({ page }) => {
    await seed(page);
    if (screen === 'table') {
        await page.locator('[data-view-mode="table"]').click();
        await page.locator('[data-table-view="epics"]').click();
        await page.locator('#workitemsTable tbody').getByRole('button', { name: 'Epic', exact: true }).click();
    } else {
        await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
        await page.getByRole('group', { name: 'Epic', exact: true }).click();
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
    await expect(page.locator('.table-view-options button').first()).toHaveText('ALL');
    await page.locator('[data-table-view="hierarchy"]').click();
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
    await page.locator('.table-hierarchy-options summary').click();
    await page.locator('#tableTypeFilter').selectOption('task');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('.table-tree-toggle')).toHaveCount(0);
});

test('Roadmap phase, milestone and Sprint use the same table and hierarchy as Table', async ({ page }) => {
    await seed(page);
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="hierarchy"]').click();
    const headings = await page.locator('#workitemsTable thead th').allTextContents();
    await page.locator('[data-view-mode="roadmap"]').click();
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    const phase = page.locator('[data-roadmap-task-list="phase:p"]');
    await expect(phase.locator('thead th')).toHaveText(headings);
    await phase.getByRole('button', { name: 'Expand Epic', exact: true }).click();
    await phase.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(phase.locator('tbody tr')).toHaveCount(6);
    await expect(phase.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '2');
    await page.locator('.milestone-annotation[data-roadmap-id="m"]').click();
    const milestone = page.locator('#milestoneWorkitemsModal');
    await expect(milestone.locator('thead th')).toHaveText(headings);
    await milestone.getByRole('button', { name: 'Expand Epic', exact: true }).click();
    await milestone.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(milestone.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '2');
    await milestone.getByRole('button', { name: 'Child', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Child');
    await page.keyboard.press('Escape');
    await expect(milestone).toBeVisible();
    await milestone.locator('.modal-close').click();
    await page.getByRole('button', { name: 'Show tasks for Sprint', exact: true }).click();
    const sprint = page.locator('[data-roadmap-task-list="sprint:s"]');
    await expect(sprint.locator('.workitem-tree')).toHaveCount(0);
    await expect(sprint.locator('thead th')).toHaveText(headings);
    await expect(sprint.locator('tbody tr')).toHaveCount(2);
    await sprint.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(sprint.locator('tbody tr')).toHaveCount(3);
    await expect(sprint.locator('[data-task-id="3"]')).toHaveAttribute('data-depth', '1');
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    const mainSprint = page.locator('[data-table-sprint="s"]');
    await mainSprint.locator(':scope > summary').click();
    await mainSprint.getByRole('button', { name: 'Expand Story', exact: true }).click();
    await expect(mainSprint.locator('thead th')).toHaveText(headings);
    await expect(mainSprint.locator('tbody tr')).toHaveCount(3);
});
