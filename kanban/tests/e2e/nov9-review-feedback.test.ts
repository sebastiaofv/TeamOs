import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, answerAppMessage, readSavedBoard } from '../support/portfolio';

const phases = [{ id: 'root', title: 'Parent', startDate: '2026-11-01', endDate: '2026-11-30' }, { id: 'leaf', parentId: 'root', title: 'Leaf', startDate: '2026-11-01', endDate: '2026-11-30' }];

test('phase date review includes only the allocated planning unit', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Review', hasHandle: true, tasks: [
        { id: 1, type: 'story', title: 'Selected Story', phaseId: 'leaf', phaseMode: 'explicit', status: 'to-do' },
        { id: 2, parentId: 1, title: 'Inherited child', phaseMode: 'inherit', status: 'to-do' },
        { id: 3, title: 'Unrelated neighbour', phaseId: 'leaf', phaseMode: 'explicit' }
    ], extensions: { roadmap: { version: 4, phases, milestones: [], sprints: [{ id: 's', title: 'Long Sprint', startDate: '2026-11-01', endDate: '2026-12-15', status: 'planned' }] } } }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    await portfolioCard(page, 'Selected Story').click();
    await page.locator('#detailSprintInput').selectOption('s');
    await answerAppMessage(page, { button: 'Confirm' });
    const modal = page.locator('#appMessageModal');
    await expect(modal).toContainText('falls outside');
    await expect(modal).toContainText('Selected Story');
    await expect(modal).not.toContainText('Inherited child');
    await expect(modal).not.toContainText('Unrelated neighbour');
});

for (const count of [1, 2, 3]) test(`milestone strip fits ${count} same-day diamonds with scroll only after two`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Markers', tasks: [], extensions: { roadmap: { version: 4, phases, sprints: [], milestones: Array.from({ length: count }, (_, i) => ({ id: `m${i}`, title: `Milestone ${i}`, dueDate: '2026-11-15' })) } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode=roadmap]').click();
    const strip = page.locator('.milestone-annotations');
    expect(await strip.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(count > 2);
    expect(await strip.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    await expect(page.locator('.milestone-diamond')).toHaveText(Array(count).fill(''));
    await page.locator('.milestone-annotation').first().hover();
    await expect(page.getByRole('tooltip')).toContainText('N/A');
    expect(await page.getByRole('tooltip').evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('parent phase workitem table is independent of child expansion and has both blocking columns and filters', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Tree', tasks: [{ id: 1, title: 'Descendant work', phaseId: 'leaf', phaseMode: 'explicit' }], extensions: { roadmap: { version: 4, phases, sprints: [], milestones: [] } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode=roadmap]').click();
    const parent = page.locator('#roadmap-row-phase-root');
    await parent.locator('.roadmap-disclosure-btn').click();
    await expect(parent.locator('.workitems-table')).toContainText('Descendant work');
    await expect(parent.locator('th[data-column=blocked]')).toContainText('Manually Blocked');
    await expect(parent.locator('th[data-column=dependencyBlocked]')).toContainText('Dependency Blocked');
    await expect(page.locator('#roadmap-row-phase-leaf .roadmap-tree-toggle')).toHaveCount(0);
    await parent.locator('.roadmap-tree-toggle').click();
    await expect(page.locator('#roadmap-row-phase-leaf')).toHaveCount(0);
    await expect(parent.locator('.workitems-table')).toBeVisible();
    await parent.locator('[data-portfolio-filter-trigger]').click();
    await expect(parent.getByLabel('Manually Blocked', { exact: true })).toBeVisible();
    await expect(parent.getByLabel('Dependency Blocked', { exact: true })).toBeVisible();
});

test('Board and Table show only the filter counter with Clear all before Reset', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Filters', tasks: [{ id: 1, title: 'High', priority: 'high' }, { id: 2, title: 'Low', priority: 'low' }] }], { selectedBoardId: 'p' });
    for (const view of ['board', 'table']) {
        await page.locator(`[data-view-mode=${view}]`).click();
        const trigger = page.locator('[data-portfolio-filter-trigger]:visible');
        await trigger.click();
        const panel = page.locator('.portfolio-filters-panel:visible');
        await panel.getByLabel('Priority', { exact: true }).selectOption('high');
        await expect(trigger.locator('.portfolio-filters-badge')).toHaveText('1');
        await expect(page.locator('.portfolio-query-fields .portfolio-active-filters')).toHaveCount(0);
        const clear = panel.getByRole('button', { name: 'Clear all', exact: true });
        const reset = panel.getByRole('button', { name: 'Reset', exact: true });
        expect((await clear.boundingBox())!.x).toBeLessThan((await reset.boundingBox())!.x);
        await clear.click();
        await expect(trigger.locator('.portfolio-filters-badge')).toHaveCount(0);
        await page.keyboard.press('Escape');
    }
});

test('blocking columns and filters recalculate after Done while manual blocking and links survive', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Blocking', hasHandle: true, tasks: [
        { id: 1, title: 'Blocker', status: 'doing' },
        { id: 2, title: 'Manual', blocked: true, blockerReason: 'External' },
        { id: 3, title: 'Dependency' },
        { id: 4, title: 'Both', blocked: true, blockerReason: 'External' }
    ], extensions: { taskRelations: { version: 1, relations: [{ sourceId: 1, targetId: 3, kind: 'blocks' }, { sourceId: 1, targetId: 4, kind: 'blocks' }] } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode=table]').click();
    await page.locator('#tableColumns summary').click();
    for (const label of ['Manually Blocked', 'Dependency Blocked']) await page.getByRole('button', { name: `Show ${label}`, exact: true }).click();
    await page.keyboard.press('Escape');
    const both = page.locator('#workitemsTable [data-task-id="4"]');
    const dependency = page.locator('#workitemsTable [data-task-id="3"]');
    await expect(both.locator('[data-column=blocked]')).toHaveText('Yes');
    await expect(both.locator('[data-column=dependencyBlocked]')).toHaveText('Yes');
    await expect(dependency.locator('[data-column=blocked]')).toHaveText('No');
    await expect(dependency.locator('[data-column=dependencyBlocked]')).toHaveText('Yes');
    await page.locator('#portfolioFiltersBtn').click();
    await page.getByLabel('Dependency Blocked', { exact: true }).selectOption('blocked');
    await page.getByLabel('Manually Blocked', { exact: true }).selectOption('blocked');
    await page.keyboard.press('Escape');
    await expect(page.locator('#workitemsTable tbody [data-task-id]')).toHaveCount(1);
    await expect(both).toBeVisible();
    await page.locator('#portfolioFiltersBtn').click();
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('[data-view-mode=dashboard]').click();
    const blocked = page.locator('[data-dashboard-kpi=blocked]');
    await expect(blocked).toHaveCount(0); // Blocked metrics belong to Project Control.
    await page.locator('[data-view-mode=table]').click();
    await page.locator('#workitemsTable [data-task-id="1"]').getByRole('button', { name: 'Blocker', exact: true }).click();
    await page.locator('#detailStatusInput').selectOption('done');
    await page.keyboard.press('Escape');
    await expect(both.locator('[data-column=blocked]')).toHaveText('Yes');
    await expect(both.locator('[data-column=dependencyBlocked]')).toHaveText('No');
    await expect(dependency.locator('[data-column=dependencyBlocked]')).toHaveText('No');
    await page.locator('[data-view-mode=dashboard]').click();
    await expect(blocked).toHaveCount(0);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 4).blocked).toBe(true);
    expect(saved.extensions.taskRelations.relations).toHaveLength(2);
});
