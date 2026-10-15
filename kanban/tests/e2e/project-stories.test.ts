import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

test('US12: create an immutable Bug and preserve its specific fields', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'types', title: 'Types', hasHandle: true }], { selectedBoardId: 'types' });
    await page.getByRole('button', { name: '+ Add Task', exact: true }).first().click();
    await page.locator('#taskType').selectOption('bug');
    await page.locator('#taskName').fill('Reproducible defect');
    await page.locator('#taskReproduction').fill('Open the application');
    await page.locator('#taskExpected').fill('Works correctly');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'types')).board.tasks[0]?.workitemType).toBe('bug');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.locator('#taskType')).toBeDisabled();
    await expect(page.locator('#taskReproduction')).toHaveValue('Open the application');
});

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
