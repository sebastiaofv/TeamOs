import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, toggleLanguage, selectTableView } from '../support/portfolio';

test.describe.configure({ mode: 'parallel' });
for (const style of ['classic', 'modern']) for (const width of [1280, 390]) test(`Table toolbar and view menu in ${style} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(style => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'table', title: 'Table design', hasHandle: true, tasks: [
        { id: 1, title: 'Delivery', type: 'epic' },
        { id: 2, title: 'Customer value', type: 'story', parentId: 1 },
        { id: 3, title: 'Build it', parentId: 2 },
        { id: 4, title: 'Independent task', status: 'to-do' }
    ] }], { selectedBoardId: 'table' });
    const initial = await readSavedBoard(page, 'table');
    await page.locator('[data-view-mode="table"]').click();
    await expect(page.locator('#tableViewBtn')).toHaveText('All');
    await expect(page.locator('.table-view-options > *')).toHaveCount(3);
    await expect(page.locator('[data-table-view="unplanned"]')).toHaveText('Backlog');
    await expect(page.locator('.table-summary, .table-hierarchy-options, #tableCsvSeparator')).toHaveCount(0);
    const heading = page.locator('#portfolioTable .table-heading');
    for (const id of ['portfolioSearchInput', 'portfolioFiltersBtn', 'tableColumns', 'tableExportCsv', 'tableCreateTask']) await expect(heading.locator(`#${id}`)).toBeVisible();
    await expect(page.locator('#portfolioFiltersBtn')).toHaveText('');
    await expect(page.locator('#portfolioFiltersBtn')).toHaveAccessibleName('Filters');
    await expect(page.locator('#portfolioFiltersBtn')).toHaveAttribute('title', 'Filters');
    await expect(page.locator('#tableColumns > summary')).toHaveText('');
    await expect(page.locator('#tableColumns > summary')).toHaveAccessibleName('Columns');
    await expect(page.locator('#tableExportCsv')).toHaveText('');
    await expect(page.locator('#tableCreateTask')).toHaveText('');
    await page.locator('#tableViewBtn').click();
    await expect(page.locator('.table-view-panel [data-table-view]')).toHaveText(['All', 'Epic', 'User Stories', 'Independent Workitems', 'All Tasks & Bugs']);
    await page.locator('[data-table-view="all"]').click();
    await expect(page.locator('#tableViewBtn')).toContainText('All Tasks & Bugs');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
    await page.locator('#portfolioFiltersBtn').click();
    for (const id of ['tableTypeFilter', 'tableHierarchy-epic', 'tableHierarchy-story']) await expect(page.locator(`#portfolioFiltersPanel #${id}`)).toBeVisible();
    await page.locator('#tableTypeFilter').selectOption('task');
    await page.locator('#tableHierarchy-epic').selectOption('1');
    await page.keyboard.press('Escape');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
    await page.getByRole('checkbox', { name: 'Select Build it', exact: true }).check();
    await expect(heading).toContainText('1 selected');
    await page.screenshot({ path: testInfo.outputPath('table-toolbar.png') });
    await page.locator('#tableExportCsv').click();
    await expect(page.getByRole('alertdialog', { name: 'Export CSV' })).toBeVisible();
    await page.locator('#appMessageSelection').selectOption('1');
    const download = page.waitForEvent('download');
    await page.locator('#appMessageConfirmBtn').click();
    expect((await download).suggestedFilename()).toContain('workitems.csv');
    await expect(page.locator('#tableExportCsv')).toBeFocused();
    await page.locator('#tableCreateTask').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await readSavedBoard(page, 'table')).toEqual(initial);
});

test('each expanded Sprint has scoped search, filters, counts, columns and export in one toolbar', async ({ page }) => {
    await page.clock.setFixedTime('2026-11-06T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sprints', title: 'Sprints', hasHandle: true, tasks: [
        { id: 1, title: 'First sprint work', sprintId: 'a' }, { id: 2, title: 'Second sprint work', sprintId: 'b' }
    ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
        { id: 'a', title: 'Alpha', startDate: '2026-11-01', endDate: '2026-11-10' },
        { id: 'b', title: 'Beta', startDate: '2026-11-11', endDate: '2026-11-20' }
    ] } } }], { selectedBoardId: 'sprints' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    for (const id of ['a', 'b']) {
        const sprint = page.locator(`[data-table-sprint="${id}"]`);
        await sprint.locator(':scope > summary .table-sprint-name').click();
        await expect(sprint.locator('.table-heading')).toHaveCount(1);
        await expect(sprint.locator('table input[type=checkbox], .table-sprint-actions, [id^=tableCreateSprint], [id^=tableAddToSprint]')).toHaveCount(0);
        await expect(sprint.locator('thead th:not([data-column])')).toHaveCount(0);
        await expect(sprint.locator(`[id=portfolioFiltersBtn-sprint-${id}]`)).toHaveText('');
        await expect(sprint.locator(`[id="tableCounts-sprint-${id}"]`)).toContainText('1 of 1');
        await sprint.locator(`[id="portfolioFiltersBtn-sprint-${id}"]`).click();
        await expect(sprint.locator(`[id="tableTypeFilter-sprint-${id}"]`)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(sprint.locator(`[id="tableExportCsv-sprint-${id}"]`)).toBeVisible();
    }
    await page.locator('#tableCreateTask-sprint-a').click();
    await page.locator('#taskName').fill('New Sprint Task');
    await page.locator('#taskModalSaveBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'sprints')).board.tasks.find((task: { title: string }) => task.title === 'New Sprint Task')?.sprintId).toBe('a');
    await page.keyboard.press('Escape');
    expect(await page.locator('#portfolioTable [id]').evaluateAll(nodes => nodes.map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index))).toEqual([]);
});

for (const style of ['classic', 'modern']) for (const language of ['en', 'pt']) for (const width of [1280, 390, 320]) {
    test(`Sprint Actions preserves planning, order and keyboard focus in ${style}/${language} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(style => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'planning', title: 'Sprint actions', hasHandle: true, tasks: [
            { id: 1, title: 'Plan this work', status: 'to-do' }
        ], extensions: { roadmap: { version: 5, phases: [], milestones: [], sprints: [
            { id: 'next', title: 'Next', status: 'planned', startDate: '2026-11-09', endDate: '2026-11-20' }
        ] } } }], { selectedBoardId: 'planning' });
        if (language === 'pt') await toggleLanguage(page);
        await page.locator('[data-view-mode="table"]').click();
        await selectTableView(page, 'unplanned');
        const trigger = page.locator('#tableSprintActions > summary');
        await expect(trigger).toHaveAccessibleName(language === 'pt' ? 'Ações de sprint' : 'Sprint Actions');
        await expect(trigger.locator('svg')).toHaveCount(2);
        await expect(page.locator('.table-counts button')).toHaveCount(0);
        await expect(page.locator('.table-management-actions > *')).toHaveCount(3);
        await expect(page.locator('.table-management-actions > :first-child')).toHaveClass('toolbar-divider');
        await expect(page.locator('.table-management-actions > :last-child')).toHaveAttribute('id', 'tableCreateTask');
        const order = await page.locator('.table-tools input[type=search], .table-tools [data-portfolio-filter-trigger], .table-tools > details, .table-tools > button, .table-management-actions > *').evaluateAll(nodes => nodes.map(node => node.id || node.className));
        expect(order).toEqual(['portfolioSearchInput', 'portfolioFiltersBtn', 'tableColumns', 'tableExportCsv', 'toolbar-divider', 'tableSprintActions', 'tableCreateTask']);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#tableCreateSprint')).toBeVisible();
        await expect(page.locator('#tableCreateSprint')).toBeDisabled();
        await expect(page.locator('#tableAddToSprint')).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(page.locator('#tableSprintActions')).not.toHaveAttribute('open', '');
        await expect(trigger).toBeFocused();
        await page.locator('#workitemsTable tbody input[type=checkbox]').check();
        await expect(page.locator('.table-counts')).toContainText(language === 'pt' ? '1 selecionados' : '1 selected');
        await trigger.click();
        await expect(page.locator('#tableCreateSprint')).toBeEnabled();
        await expect(page.locator('#tableAddToSprint')).toBeEnabled();
        const panel = page.locator('.table-sprint-actions-panel');
        const rect = await panel.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(900);
        await expect(page.locator('.table-tools')).toBeInViewport();
        expect(await page.locator('.table-tools').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('sprint-actions.png'), fullPage: true });
        await page.locator('#tableAddToSprint').click();
        await expect(page.locator('#tableSprintActions')).not.toHaveAttribute('open', '');
        await expect(page.locator('#roadmapEntityExistingSprint')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.locator('#portfolioSearchInput').click();
        await expect(page.locator('#tableSprintActions')).not.toHaveAttribute('open', '');
        await page.locator('.table-counts button').click();
        await trigger.click();
        await expect(page.locator('#tableAddToSprint')).toBeDisabled();
        expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    });
}
