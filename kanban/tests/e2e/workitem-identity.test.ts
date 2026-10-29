import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, answerAppMessage, readSavedBoard, portfolioCard, waitForBoardWrites } from '../support/portfolio';

test('legacy configuration preserves existing IDs and new workitems share permanent typed IDs', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Checkout', hasHandle: true, tasks: [{ id: 1201, title: 'Legacy task' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Legacy task').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#workitemType')).toBeDisabled();
    await page.keyboard.press('Escape');
    for (const [index, type] of ['epic', 'story', 'task', 'bug'].entries()) {
        await page.keyboard.press('ControlOrMeta+k');
        await page.locator('#commandPaletteInput').fill(`+ New ${type} type:${type}`);
        await page.locator('.palette-item').first().click();
        if (index === 0) await answerAppMessage(page, { expectText: 'unique acronym', input: 'chk' });
        await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.length).toBe(index + 2);
    }
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks.map((task: { id: number; displayId?: string }) => task.displayId || String(task.id))).toEqual(['1201', 'CHK-EP-1202', 'CHK-US-1203', 'CHK-TK-1204', 'CHK-BG-1205']);
    await expect(portfolioCard(page, 'New task')).toContainText('CHK-TK-1204');
    await portfolioCard(page, 'New task').dblclick();
    await expect(page.locator('#taskDetailModal')).toContainText('CHK-TK-1204');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings for Checkout', exact: true }).click();
    await expect(page.getByLabel('Project Acronym', { exact: true })).toHaveValue('CHK');
    await expect(page.getByLabel('Project Acronym', { exact: true })).toHaveAttribute('maxlength', '3');
    await page.getByLabel('Project Acronym', { exact: true }).fill('pay');
    await page.locator('#projectName').fill('Payments');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#projectSettingsModal')).toBeHidden();
    await waitForBoardWrites(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill('CHK-TK-1204');
    await expect(page.locator('.palette-item').filter({ hasText: 'New task' })).toContainText('New task');
    await expect(page.locator('.palette-item').filter({ hasText: 'New task' })).toContainText('CHK-TK-1204');
    await page.keyboard.press('Escape');
    const renamed = await readSavedBoard(page, 'p');
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'reopen', title: 'Payments', hasHandle: true, tasks: renamed.board.tasks, extensions: renamed.extensions }], { selectedBoardId: 'reopen' });
    await expect(portfolioCard(page, 'New task')).toContainText('CHK-TK-1204');
    await page.keyboard.press('ControlOrMeta+k'); await page.locator('#commandPaletteInput').fill('+ Another task');
    await page.locator('.palette-item').first().click();
    await expect.poll(async () => (await readSavedBoard(page, 'reopen')).board.tasks.at(-1).displayId).toBe('PAY-TK-1206');
});

test('legacy settings reject an acronym already assigned to another open project', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'a', title: 'Alpha', hasHandle: true }, { id: 'b', title: 'Beta', hasHandle: true }]);
    for (const title of ['Alpha', 'Beta']) {
        await page.getByRole('button', { name: `Settings for ${title}`, exact: true }).click();
        await page.getByLabel('Project Acronym', { exact: true }).fill('ABC');
        await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
        if (title === 'Beta') {
            await answerAppMessage(page, { expectText: 'another open project' });
            await expect(page.locator('#projectSettingsModal')).toBeVisible();
            await page.getByLabel('Project Acronym', { exact: true }).fill('B');
            await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
        }
        await expect(page.locator('#projectSettingsModal')).toBeHidden();
    }
});
