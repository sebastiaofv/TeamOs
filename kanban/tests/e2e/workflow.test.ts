import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard } from '../support/portfolio';

test('workflow settings are draft-based and state changes share directional rules', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Workflow project', hasHandle: true, tasks: [{ id: 1, title: 'Intake', status: 'backlog' }] }], { selectedBoardId: 'p' });
    await expect(page.locator('.portfolio-column[data-status="backlog"]')).toHaveCount(0);
    await portfolioCard(page, 'Intake').getByRole('button', { name: 'Send to Board' }).click();
    await expect(portfolioCard(page, 'Intake')).toHaveAttribute('data-status', 'to-do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('To Do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('Ready');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow.states[1].name).toBe('Ready');
});
