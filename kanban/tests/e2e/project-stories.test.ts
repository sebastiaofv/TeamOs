import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

test('US11: edit master data and preserve legacy workitems', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'legacy', title: 'Legacy', hasHandle: true, tasks: [{ id: 42, title: 'Preserved', assignees: ['Ana'] }] }], { selectedBoardId: 'legacy' });
    const settings = page.locator('#projectSettings');
    await settings.locator('summary').click();
    await settings.getByLabel('Name', { exact: true }).first().fill('Renamed project');
    await settings.getByLabel('Manager', { exact: true }).fill('Ana');
    await settings.getByLabel('Product / application').fill('Product A');
    await settings.getByLabel('Description', { exact: true }).fill('Project description');
    await settings.getByLabel('Tags', { exact: true }).fill('team');
    await settings.getByLabel('Forecast · Start').fill('2026-10-01');
    await settings.getByLabel('End', { exact: true }).first().fill('2026-12-31');
    await settings.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Renamed project');
    await expect.poll(async () => (await readSavedBoard(page, 'legacy')).extensions.project.name).toBe('Renamed project');
    const saved = await readSavedBoard(page, 'legacy');
    expect(saved.board.tasks[0].id).toBe(42);
    expect(saved.extensions.project.team[0].name).toBe('Ana');
});
