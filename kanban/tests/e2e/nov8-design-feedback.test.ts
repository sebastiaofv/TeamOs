import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, selectTableView, answerAppMessage } from '../support/portfolio';
import { seedControlProject } from '../support/control';

for (const context of ['workitems', 'control']) test(`${context} column chooser supports pointer dragging, arrows, visibility, locks and reset`, async ({ page }, testInfo) => {
    if (context === 'control') await seedControlProject(page);
    else {
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'columns', title: 'Columns', hasHandle: true, tasks: [{ id: 1, title: 'First' }] }], { selectedBoardId: 'columns' });
        await page.locator('[data-view-mode=table]').click();
    }
    const table = page.locator(context === 'control' ? '.control-table' : '#workitemsTable');
    const menu = page.locator(context === 'control' ? '#tableColumns-control-risks' : '#tableColumns');
    await menu.locator('summary').click();
    const visible = menu.getByRole('region', { name: 'Visible', exact: true });
    const hidden = menu.getByRole('region', { name: 'Hidden', exact: true });
    await expect(visible.locator('[data-column-choice=id] .table-column-lock')).toBeVisible();
    await expect(visible.locator('[data-column-choice=title] .table-column-lock')).toBeVisible();
    const third = visible.locator('[data-column-choice]').nth(2);
    const column = (await third.getAttribute('data-column-choice'))!;
    const title = (await third.locator('.table-column-name').innerText()).trim();
    await third.getByRole('button', { name: `Hide ${title}`, exact: true }).click();
    await expect(table.locator(`th[data-column=${column}]`)).toHaveCount(0);
    await hidden.getByRole('button', { name: `Show ${title}`, exact: true }).click();
    await expect(table.locator(`th[data-column=${column}]`)).toHaveCount(1);
    await visible.getByRole('button', { name: `Move ${title} up`, exact: true }).click();
    const idHandle = visible.getByRole('button', { name: 'Drag ID to reorder', exact: true });
    const titleHandle = visible.getByRole('button', { name: 'Drag Title to reorder', exact: true });
    const from = (await titleHandle.boundingBox())!, to = (await idHandle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(table.locator('th[data-column]').first()).toHaveAttribute('data-column', 'title');
    // dnd-kit suppresses the click immediately after a pointer drop for 50 ms.
    await page.waitForTimeout(100);
    await menu.locator('.table-column-panel').screenshot({ path: testInfo.outputPath('column-chooser.png') });
    await visible.getByRole('button', { name: 'Move Title down', exact: true }).click();
    await expect(table.locator('th[data-column]').first()).toHaveAttribute('data-column', 'id');
    const panel = (await menu.locator('.table-column-panel').boundingBox())!;
    expect(panel.width).toBeGreaterThanOrEqual(520); expect(panel.width).toBeLessThanOrEqual(600); expect(panel.height).toBeLessThanOrEqual(500);
    await menu.getByRole('button', { name: 'Reset to default', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(menu.locator('summary')).toBeFocused();
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
});

test('long IDs stay complete while Table view preferences remain independent between projects', async ({ page }) => {
    await gotoApp(page);
    const projects = ['One', 'Two'].map((title, index) => ({ id: title, title, members: [], acronym: index ? 'TWOO' : 'ONEE', hasHandle: true, tasks: [{ id: 9007199254740991, displayId: `${index ? 'TWOO' : 'ONEE'}-TK-9007199254740991`, title: 'Long identity' }] }));
    await seedPortfolioBoards(page, projects, { selectedBoardId: 'One' });
    await page.locator('[data-view-mode=table]').click();
    const id = page.locator('#workitemsTable tbody [data-column=id] .table-item-link');
    expect(await id.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(id).toHaveCSS('white-space', 'nowrap');
    await page.locator('#tableColumns summary').click();
    await page.getByRole('button', { name: 'Hide Priority', exact: true }).click();
    await page.keyboard.press('Escape');
    await selectTableView(page, 'unplanned');
    await expect(page.locator('#workitemsTable th[data-column=priority]')).toHaveCount(1);
    await selectTableView(page, 'hierarchy');
    await expect(page.locator('#workitemsTable th[data-column=priority]')).toHaveCount(0);
    await page.reload();
    await seedPortfolioBoards(page, projects, { selectedBoardId: 'One' });
    await page.locator('[data-view-mode=table]').click();
    await expect(page.locator('#workitemsTable th[data-column=priority]')).toHaveCount(0);
    await page.reload();
    await seedPortfolioBoards(page, projects, { selectedBoardId: 'Two' });
    await page.locator('[data-view-mode=table]').click();
    await expect(page.locator('#workitemsTable th[data-column=priority]')).toHaveCount(1);
});

test('Board arrow advances through the configured workflow without opening details', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'advance', title: 'Advance', hasHandle: true, tasks: [{ id: 1, title: 'Advance me', status: 'to-do' }, { id: 2, title: 'Finished', status: 'done' }] }], { selectedBoardId: 'advance' });
    const card = portfolioCard(page, 'Advance me');
    const top = (await card.locator('.task-card-id').boundingBox())!, title = (await card.locator('.task-title').boundingBox())!;
    expect(top.y).toBeLessThan(title.y);
    await card.getByRole('button', { name: /Move to/ }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'advance')).board.tasks[0].status).toBe('doing');
    await expect(page.locator('#taskDetailModal')).toHaveCount(0);
    await expect(portfolioCard(page, 'Finished').locator('.task-card-next')).toHaveCount(0);
});

test('Roadmap uses compact rows, name editing and the existing Sprint lifecycle confirmation', async ({ page }) => {
    await page.clock.setFixedTime('2026-11-08T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'roadmap', title: 'Roadmap', hasHandle: true, tasks: [{ id: 1, title: 'Associated', phaseId: 'p', sprintId: 's' }], extensions: { roadmap: {
        version: 3, milestones: [], phases: [{ id: 'p', title: 'Phase name', startDate: '2026-11-01', endDate: '2026-11-30' }], sprints: [{ id: 's', title: 'Sprint name', status: 'planned', startDate: '2026-11-01', endDate: '2026-11-14' }]
    } } }], { selectedBoardId: 'roadmap' });
    await page.locator('[data-view-mode=roadmap]').click();
    await expect(page.locator('.roadmap-completion-controls, .roadmap-row-meta')).toHaveCount(0);
    await expect(page.locator('.roadmap-axis-label')).toContainText('Timeline');
    const row = page.locator('#roadmap-row-sprint-s');
    const lifecycle = row.getByRole('button', { name: 'Start Sprint', exact: true });
    await expect(lifecycle).toHaveText('');
    await expect(lifecycle).toHaveAttribute('title', 'Start Sprint');
    expect((await row.locator('.roadmap-row-main').boundingBox())!.height).toBeLessThanOrEqual(40);
    await page.getByRole('button', { name: 'Phase name', exact: true }).click();
    await expect(page.locator('#roadmapEntityTitle')).toHaveValue('Phase name');
    const menu = (await page.locator('#roadmapEntityModal .modal-header summary').boundingBox())!, close = (await page.locator('#roadmapEntityModalCloseBtn').boundingBox())!;
    expect(menu.x).toBeLessThan(close.x);
    await page.keyboard.press('Escape');
    await lifecycle.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await answerAppMessage(page, { button: 'Cancel' });
    expect((await readSavedBoard(page, 'roadmap')).extensions.roadmap.sprints[0].status).toBe('planned');
    await row.getByRole('button', { name: /Expand\/collapse workitems/ }).click();
    await expect(row.locator('.workitems-table')).toContainText('Associated');
});

test('milestone strip uses one lane unless diamonds collide, then scrolls after two lanes', async ({ page }) => {
    await gotoApp(page);
    const phase = { id: 'p', title: 'Range', startDate: '2026-11-01', endDate: '2026-11-30' };
    await seedPortfolioBoards(page, [{ id: 'markers', title: 'Markers', hasHandle: true, tasks: [], extensions: { roadmap: { version: 3, phases: [phase], sprints: [], milestones: [
        { id: 'a', title: 'First', dueDate: '2026-11-01' }, { id: 'b', title: 'Last', dueDate: '2026-11-30' }
    ] } } }], { selectedBoardId: 'markers' });
    await page.locator('[data-view-mode=roadmap]').click();
    await expect(page.locator('.milestone-annotations')).toHaveCSS('height', '52px');
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'crowded', title: 'Crowded', hasHandle: true, tasks: [], extensions: { roadmap: { version: 3, phases: [phase], sprints: [], milestones: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, title: `Milestone ${i}`, dueDate: '2026-11-30' })) } } }], { selectedBoardId: 'crowded' });
    await page.locator('[data-view-mode=roadmap]').click();
    const strip = page.locator('.milestone-annotations');
    await expect(strip).toHaveCSS('height', '104px');
    expect(await strip.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const last = page.locator('.milestone-annotation').last();
    await last.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveText('Milestone 4 · 30/11/2026');
    const box = (await tooltip.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await last.click();
    await expect(page.locator('#milestoneWorkitemsModal .roadmap-completion-controls')).toHaveCount(0);
    await expect(page.locator('#milestoneWorkitemsModal .modal-header summary')).toBeVisible();
});
