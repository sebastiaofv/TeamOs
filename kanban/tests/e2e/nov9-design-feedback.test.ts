import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, selectTableView, openFiltersPanel, readSavedBoard } from '../support/portfolio';

const project = {
    id: 'isolated', title: 'Independent views', hasHandle: true,
    tasks: [
        { id: 1, title: 'Epic one', type: 'epic' },
        { id: 2, title: 'Story one', type: 'story', parentId: 1, sprintId: 'a', phaseId: 'p', milestoneId: 'm' },
        { id: 3, title: 'Child one', parentId: 2, sprintId: 'a', priority: 'high' },
        { id: 4, title: 'Epic two', type: 'epic' },
        { id: 5, title: 'Story two', type: 'story', parentId: 4, sprintId: 'b' },
        { id: 6, title: 'Child two', parentId: 5, sprintId: 'b', priority: 'low' },
        { id: 7, title: 'Independent', priority: 'high' }
    ],
    extensions: { roadmap: { version: 3,
        phases: [{ id: 'p', title: 'Delivery', startDate: '2026-11-01', endDate: '2026-11-30' }],
        milestones: [{ id: 'm', title: 'Release', dueDate: '2026-11-20' }],
        sprints: ['a', 'b'].map(id => ({ id, title: `Sprint ${id}`, startDate: '2026-11-01', endDate: '2026-11-14', status: 'planned' }))
    } }
};

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime('2026-11-09T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [project], { selectedBoardId: project.id });
});

test('Board hierarchy filters share Table criteria and remain independent from every Table subsection', async ({ page }) => {
    const initial = await readSavedBoard(page, project.id);
    await openFiltersPanel(page);
    await page.locator('#tableHierarchy-epic').selectOption('1');
    await page.locator('#tableHierarchy-story').selectOption('2');
    await page.keyboard.press('Escape');
    await expect(page.locator('#portfolioBoard .task-title')).toHaveText(['Child one']);
    await page.locator('[data-view-mode="table"]').click();
    await expect(page.locator('#tableCounts')).toContainText('7 of 7');
    await page.locator('#portfolioSearchInput').fill('Epic one');
    await expect(page.locator('#tableCounts')).toContainText('3 of 7');
    // Hierarchy-aware search includes descendants of the matching Epic.
    for (const view of ['epics', 'stories', 'independent', 'all', 'unplanned'] as const) {
        await selectTableView(page, view);
        await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
        await page.locator('#portfolioSearchInput').fill(view);
    }
    await selectTableView(page, 'hierarchy');
    await expect(page.locator('#portfolioSearchInput')).toHaveValue('Epic one');
    await page.locator('[data-view-mode="board"]').click();
    await expect(page.locator('#portfolioBoard .task-title')).toHaveText(['Child one']);
    await openFiltersPanel(page);
    await expect(page.locator('#tableHierarchy-epic')).toHaveValue('1');
    await expect(page.locator('#tableHierarchy-story')).toHaveValue('2');
    await page.keyboard.press('Escape');
    expect(await readSavedBoard(page, project.id)).toEqual(initial);
});

test('each Sprint keeps its own search and filters after collapse, view changes and resets', async ({ page }) => {
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'sprints');
    const a = page.locator('[data-table-sprint="a"]');
    const b = page.locator('[data-table-sprint="b"]');
    for (const section of [a, b]) await section.locator(':scope > summary').click();
    await a.locator('input[type="search"]').fill('Child one');
    await a.locator('[data-portfolio-filter-trigger]').click();
    await a.locator('[id^="portfolioPriorityFilter"]').selectOption('high');
    await page.keyboard.press('Escape');
    await expect(a.locator('[id^="tableCounts"]')).toContainText('1 of 2');
    await expect(b.locator('[id^="tableCounts"]')).toContainText('2 of 2');
    await b.locator('input[type="search"]').fill('Story two');
    await expect(a.locator('input[type="search"]')).toHaveValue('Child one');
    await a.locator(':scope > summary').click();
    await a.locator(':scope > summary').click();
    await expect(a.locator('input[type="search"]')).toHaveValue('Child one');
    await a.locator('[data-portfolio-filter-trigger]').click();
    await expect(a.locator('[id^="portfolioPriorityFilter"]')).toHaveValue('high');
    await page.keyboard.press('Escape');
    await selectTableView(page, 'hierarchy');
    await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
    await selectTableView(page, 'sprints');
    await a.locator(':scope > summary').click();
    await b.locator(':scope > summary').click();
    await expect(a.locator('input[type="search"]')).toHaveValue('Child one');
    await expect(b.locator('input[type="search"]')).toHaveValue('Story two');
    await a.locator('input[type="search"]').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.keyboard.press('r');
    await expect(a.locator('input[type="search"]')).toHaveValue('');
    await expect(b.locator('input[type="search"]')).toHaveValue('Story two');
});

test('Roadmap associated tables use exactly the requested columns regardless of Table preferences', async ({ page }) => {
    await page.locator('[data-view-mode="roadmap"]').click();
    const columns = ['id', 'title', 'type', 'status', 'responsible', 'blocked', 'dependencyBlocked', 'updatedAt'];
    for (const row of ['phase-p', 'sprint-a']) {
        await page.locator(`#roadmap-row-${row} .roadmap-disclosure-btn`).click();
        expect(await page.locator(`#roadmap-row-${row} th[data-column]`).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-column')))).toEqual(columns);
    }
    await page.locator('[data-roadmap-id="m"]').click();
    expect(await page.locator('#milestoneWorkitemsModal th[data-column]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-column')))).toEqual(columns);
    await expect(page.locator('#milestoneWorkitemsModal th:not([data-column])')).toHaveCount(0);
});

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 390]) {
    test(`compact Sprints and milestones remain usable in ${style}/${mode} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('#appSettingsBtn').click();
        await page.locator('input[name="app-theme-style"]').nth(style === 'classic' ? 0 : 1).check();
        await page.locator('input[name="color-mode"]').nth(mode === 'light' ? 0 : 1).check();
        await page.keyboard.press('Escape');
        await page.locator('[data-view-mode="table"]').click();
        await selectTableView(page, 'sprints');
        const section = page.locator('[data-table-sprint="a"]');
        const controls = section.locator('.table-sprint-controls');
        await expect(controls.getByRole('button', { name: 'Start Sprint', exact: true })).toBeVisible();
        await expect(section.locator('.table-sprint-dates')).toContainText('01/11/2026 → 14/11/2026');
        const bounds = (await controls.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await section.locator(':scope > summary').click({ position: { x: 10, y: 10 } });
        await expect(section.locator('table')).toBeVisible();
        await expect(section.locator('.sprint-lifecycle-action')).toHaveText('');
        await expect(section.locator('.roadmap-row-track')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath('sprints.png'), animations: 'disabled' });
        await section.locator('.table-sprint-name').click();
        await expect(page.locator('#roadmapEntityModal')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.locator('[data-view-mode="roadmap"]').click();
        const diamond = page.locator('.milestone-annotation .milestone-diamond');
        await expect(diamond).toHaveAttribute('data-progress', 'na');
        expect((await diamond.boundingBox())!.width).toBeCloseTo(29.333, 1);
        const marker = (await diamond.boundingBox())!;
        const guide = (await page.locator('[data-milestone-guide="m"]').boundingBox())!;
        expect(Math.abs(marker.x + marker.width / 2 - guide.x - guide.width / 2)).toBeLessThan(0.1);
        await page.screenshot({ path: testInfo.outputPath('roadmap.png'), animations: 'disabled' });
    });
}

test('palette opens the focused Sprint filter panel and table Sprint filtering keeps the Board toggle', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).check();
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'sprints');
    const a = page.locator('[data-table-sprint="a"]');
    const b = page.locator('[data-table-sprint="b"]');
    for (const section of [a, b]) await section.locator(':scope > summary').click();
    await b.locator('input[type="search"]').focus();
    await page.keyboard.press('Control+k');
    await page.locator('#commandPaletteInput').fill('Open filters');
    await page.locator('#commandPalette .palette-item').filter({ has: page.getByText('Open filters', { exact: true }) }).click();
    await expect(b.locator('[data-portfolio-filter-trigger]')).toHaveAttribute('aria-expanded', 'true');
    await expect(a.locator('[data-portfolio-filter-trigger]')).toHaveAttribute('aria-expanded', 'false');
    await b.locator('[id^=portfolioSprintFilter]').selectOption('b');
    await page.keyboard.press('Escape');
    await page.locator('[data-view-mode="board"]').click();
    await expect(page.getByRole('checkbox', { name: 'Active Sprints only' })).toBeChecked();
});
