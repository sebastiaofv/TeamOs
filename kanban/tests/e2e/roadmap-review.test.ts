import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, type SeedBoard } from '../support/portfolio';

function project(id: string, status: string | null = 'active', start = '2020-01-01'): SeedBoard {
    return { id, title: id, hasHandle: true, tasks: [
        { id: 1, title: `${id} work`, status: 'doing', phaseId: 'child', sprintId: 'sprint', milestoneId: 'release', updatedAt: '2026-11-12T14:35:42Z', assigneeIds: [], responsibleId: '' }
    ], extensions: {
        project: { version: 1, id, description: '', status, members: [], tags: [] },
        roadmap: { version: 5, phases: [
            { id: 'root', title: 'Delivery', startDate: start, endDate: '2035-12-31', color: '#b45309' },
            { id: 'child', title: 'Implementation', parentId: 'root', startDate: start, endDate: '2035-12-31', color: '#0f766e' },
            ...Array.from({ length: 25 }, (_, index) => ({ id: `phase-${index}`, title: `Phase ${index}`, startDate: start, endDate: '2035-12-31' }))
        ], sprints: [{ id: 'sprint', title: 'Execution', startDate: '2026-11-01', endDate: '2026-11-14' }],
        milestones: [{ id: 'release', title: 'Release', dueDate: '2026-11-13' }] }
    } };
}

test('ALL includes planned and unset statuses, with project colours assigned before date sorting', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [project('Later', 'planned', '2022-01-01'), project('Paused', 'paused'), project('Earlier'), project('Unset', null), project('Completed', 'completed'), project('Archived', 'archived')]);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    const projects = page.locator('[data-roadmap-project]');
    await expect(projects.locator('.roadmap-project-row .roadmap-row-title')).toHaveText(['Earlier', 'Unset', 'Later']);
    const colours = await projects.locator('.roadmap-project-row .roadmap-row-timeline-bar').evaluateAll(bars => bars.map(bar => getComputedStyle(bar).getPropertyValue('--phase-color')));
    expect(new Set(colours).size).toBe(3);
    expect(colours.every(Boolean)).toBe(true);
    await projects.first().locator('.roadmap-tree-toggle').click();
    await expect(projects.first().locator('[data-roadmap-id="child"]')).toHaveCount(0);
    await projects.first().getByRole('button', { name: 'Expand/collapse subphases of Delivery' }).click();
    await expect(projects.first().locator('[data-roadmap-id="child"] .roadmap-row-timeline-bar')).toHaveCSS('--phase-color', '#0f766e');
});

for (const scope of ['project', 'ALL']) test(`${scope} keeps navigation, axis and labels fixed and fits multi-year dates at 100%`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [project('Review')], scope === 'project' ? { selectedBoardId: 'Review' } : {});
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    if (scope === 'ALL') await page.locator('.roadmap-project-row .roadmap-tree-toggle').click();
    await expect(page.locator('[data-roadmap-id="child"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(page.locator('[data-roadmap-id="child"]')).toBeVisible();
    const viewport = page.locator('#portfolioRoadmapView');
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 720 });
        await page.getByLabel('Timeline zoom', { exact: true }).selectOption('1');
        await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        const nav = page.locator('#portfolioViewModeToggle');
        const axis = page.locator('.roadmap-axis-shell');
        const labels = page.locator('[data-roadmap-id="root"] .roadmap-row-labels');
        await viewport.evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
        const navBefore = await nav.boundingBox();
        const axisBefore = await axis.boundingBox();
        await viewport.evaluate(element => { element.scrollTop = 250; });
        await expect.poll(async () => (await axis.boundingBox())!.y).toBeCloseTo(axisBefore!.y, 0);
        expect((await nav.boundingBox())!.y).toBeCloseTo(navBefore!.y, 0);
        if (scope === 'project') await expect(page.locator('.milestone-annotations')).toBeInViewport();
        await page.getByLabel('Timeline zoom', { exact: true }).selectOption('2');
        const labelsBefore = await labels.boundingBox();
        await viewport.evaluate(element => { element.scrollLeft = 120; });
        await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        await expect.poll(async () => (await labels.boundingBox())!.x).toBeCloseTo(labelsBefore!.x, 0);
        expect((await page.locator('.roadmap-axis-label').boundingBox())!.x).toBeCloseTo(labelsBefore!.x, 0);
        await viewport.evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
    }
    await page.screenshot({ path: `test-results/roadmap-review-${scope}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
    await expect(page.locator('[data-roadmap-id="child"]')).toHaveCount(0);
});

test('phase, Sprint and Milestone drilldowns show only the eight requested columns and dates', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [project('Review')], { selectedBoardId: 'Review' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    for (const kind of ['phase', 'sprint', 'milestone']) {
        if (kind === 'milestone') await page.locator('.milestone-annotation').click();
        else await page.locator(`[data-roadmap-kind="${kind}"] .roadmap-disclosure-btn`).first().click();
        const tableScope = kind === 'milestone' ? page.locator('#milestoneWorkitemsModal') : page.locator(`[data-roadmap-task-list="${kind}:${kind === 'phase' ? 'root' : 'sprint'}"]`);
        const headers = ['ID', 'Title', 'Type', 'Status', 'Responsible', 'Manually Blocked', 'Dependency Blocked', 'Updated'];
        await expect(tableScope.getByRole('columnheader')).toHaveCount(headers.length);
        for (const [index, header] of headers.entries()) await expect(tableScope.getByRole('columnheader').nth(index)).toHaveAccessibleName(header);
        await expect(tableScope.locator('input[type="search"], .portfolio-query-controls, .portfolio-filters-btn, .table-heading')).toHaveCount(0);
        await expect(tableScope.locator('td[data-column="updatedAt"]')).toHaveText('12/11/2026');
        await tableScope.getByRole('button', { name: 'Review work', exact: true }).click();
        await expect(page.locator('#taskDetailModal')).toBeVisible();
        await page.locator('#taskDetailModal .modal-close').click();
        if (kind === 'milestone') await page.locator('#milestoneWorkitemsModal .modal-close').click();
    }
});
