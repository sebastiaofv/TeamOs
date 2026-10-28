import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, installControlledPortfolioWriter, setTimelineSlider } from '../support/portfolio';

test('all workflow states are regular columns and cards/details keep their original presentation', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await expect(page.locator('.portfolio-column')).toHaveCount(9);
    await expect(page.locator('.portfolio-backlog, .portfolio-cancelled, .task-workflow-controls')).toHaveCount(0);
    await expect(portfolioCard(page, 'Blocked but movable').locator('select')).toHaveCount(0);
    await portfolioCard(page, 'Blocked but movable').locator('.task-title').click();
    await expect(page.locator('#taskDetailModal .task-workflow-header')).toHaveCount(0);
    await expect(page.locator('#detailResponsible')).toHaveText('Ana');
    await page.keyboard.press('Escape');
    await portfolioCard(page, 'Blocked but movable').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#taskModal .task-workflow-header, #taskModal .workflow-state-control')).toHaveCount(0);
    await expect(page.locator('#taskResponsible')).toHaveValue('Ana');
});

test('all columns can be hidden and recovered; Table remains unaffected', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Hidden columns', hasHandle: true, tasks: [{ id: 1, title: 'Still available', status: 'to-do' }] }], { selectedBoardId: 'p' });
    const toolbar = page.locator('.workitem-board-toolbar');
    const columns = toolbar.getByRole('button', { name: 'Board columns', exact: true });
    await expect(columns).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    const columnsBox = await columns.boundingBox();
    expect(columnsBox!.x + columnsBox!.width).toBeCloseTo(toolbarBox!.x + toolbarBox!.width - 16, 0);
    await columns.click();
    for (const checkbox of await page.locator('.board-column-panel input[type="checkbox"]').all()) await checkbox.uncheck();
    await expect(page.locator('.portfolio-column')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'All columns are hidden' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Board columns', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.locator('#workitemsTable')).toContainText('Still available');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'to-do', exact: true }).check();
    await expect(page.locator('.portfolio-column')).toHaveCount(1);
    await expect(portfolioCard(page, 'Still available')).toBeVisible();
});

test('visibility controls respect read-only projects and the selected historical snapshot', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Historical columns', hasHandle: true, tasks: [{ id: 1, title: 'Preserved', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'done', exact: true }).uncheck();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.boardView?.hiddenStateIds).toEqual(['done']);
    const saved = await readSavedBoard(page, 'p');
    await page.keyboard.press('Escape');
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    await expect(page.locator('.portfolio-column[data-status="done"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await expect(page.locator('.board-column-panel input:enabled')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'done', exact: true })).toBeChecked();
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'q', title: saved.board.settings.title, hasHandle: false, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'q' });
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await expect(page.locator('.board-column-panel input:enabled')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'done', exact: true })).not.toBeChecked();
});

test('failed visibility saves retry the applied preference without another event', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Retry columns', hasHandle: true, tasks: [{ id: 1, title: 'Kept', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await installControlledPortfolioWriter(page, { boardId: 'p', failWrites: 1 });
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'done', exact: true }).uncheck();
    await expect(page.locator('.portfolio-column[data-status="done"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.chip-save-state.error')).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.boardView?.hiddenStateIds).toEqual(['done']);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.timeline.events).toHaveLength(2);
    expect(saved.board.tasks[0]).toMatchObject({ id: 1, status: 'to-do' });
});

test('restored cards and edit/detail surfaces use the existing theme', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Original presentation', hasHandle: true, tasks: [{ id: 1, title: 'Original card', status: 'doing', assignees: ['Ana'], responsible: 'Ana', priority: 'high', effort: 'M', description: 'Existing content', tags: ['ui'] }] }], { selectedBoardId: 'p' });
    await page.mouse.move(1, 1);
    await page.screenshot({ path: testInfo.outputPath('board-light.png') });
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await portfolioCard(page, 'Original card').locator('.task-title').click();
    await page.screenshot({ path: testInfo.outputPath('detail-dark.png') });
    await page.keyboard.press('Escape');
    await portfolioCard(page, 'Original card').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('editor-dark.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Settings for / }).click();
    await page.getByRole('tab', { name: 'Technical workflow', exact: true }).click();
    const styles = await page.locator('.workflow-editor input:not([type="checkbox"])').first().evaluate((input) => ({ background: getComputedStyle(input).backgroundColor, color: getComputedStyle(input).color }));
    expect(styles.background).toBe('rgb(37, 40, 45)');
    expect(styles.color).toBe('rgb(241, 243, 245)');
    await page.screenshot({ path: testInfo.outputPath('workflow-settings-dark.png') });
});

test('column visibility is stored in the project JSON and restored on reopen without changing tasks', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Cancelled', exact: true }).uncheck();
    await expect(page.locator('.portfolio-column[data-status="cancelled"]')).toHaveCount(0);
    await expect(page.locator('.portfolio-column[data-status="duplication"]')).toHaveCount(1);
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.boardView?.hiddenStateIds).toEqual(['cancelled']);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks.map((task: { id: number; status: string }) => [task.id, task.status])).toEqual(fixture.board.tasks.map((task: { id: number; status: string }) => [task.id, task.status]));
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'reopened', title: saved.board.settings.title, hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopened' });
    await expect(page.locator('.portfolio-column[data-status="cancelled"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Cancelled', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Cancelled', exact: true }).check();
    await expect(page.locator('.portfolio-column[data-status="cancelled"]')).toHaveCount(1);
    await expect.poll(async () => (await readSavedBoard(page, 'reopened')).extensions.boardView.hiddenStateIds).toEqual([]);
});
