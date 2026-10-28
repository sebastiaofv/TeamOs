import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-12.board.json', 'utf8'));
for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
        for (const { type, id } of [{ type: 'task', id: 1204 }, { type: 'story', id: 1202 }, { type: 'epic', id: 1201 }]) {
            test(`${type} workspace at ${width}px in ${theme}`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 900 });
                await page.clock.setFixedTime('2026-10-28T12:00:00Z');
                await gotoApp(page);
                await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
                if (theme === 'dark') await page.locator('#themeToggleBtn').click();
                if (type !== 'task') await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
                const task = fixture.board.tasks.find((entry: { id: number }) => entry.id === id);
                await page.locator(`.portfolio-task-card[data-task-id="${id}"] .task-title`).click();
                const dialog = page.locator('#taskDetailModal .modal-content');
                await expect(page.locator('#detailTitle')).toHaveText(task.title);
                expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width - 20);
                if (width > 760) expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(1000);
                expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
                const footer = await dialog.locator('.modal-footer').boundingBox();
                expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
                await expect(page.locator('.task-relations')).toBeHidden();
                await dialog.screenshot({ path: testInfo.outputPath(`${type}-details-${theme}-${width}.png`) });
                await page.getByRole('tab', { name: 'Relations', exact: true }).click();
                await expect(page.getByRole('region', { name: 'Relations', exact: true })).toBeVisible();
                expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
                await dialog.screenshot({ path: testInfo.outputPath(`${type}-relations-${theme}-${width}.png`) });
                await page.locator('#taskDetailEditBtn').click();
                await expect(page.locator('#taskDetailModal')).toBeHidden();
                await expect(page.locator('#taskName')).toHaveValue(task.title);
                await expect(page.locator('#taskName')).toBeFocused();
                const editor = page.locator('#taskModal .modal-content');
                expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
                await editor.screenshot({ path: testInfo.outputPath(`${type}-editor-${theme}-${width}.png`) });
            });
        }
    }
}

test('Relations has its own keyboard-accessible tab and preserves a link draft across tabs', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Relationships', hasHandle: true, tasks: [{ id: 1, title: 'Source' }, { id: 2, title: 'Target' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Source').click();
    await page.getByRole('tab', { name: 'Details', exact: true }).press('ArrowRight');
    const relations = page.getByRole('tab', { name: 'Relations', exact: true });
    await expect(relations).toBeFocused();
    await page.getByRole('button', { name: 'Link workitem', exact: true }).click();
    await page.getByRole('combobox', { name: 'Search this project by ID or title' }).fill('Target');
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await relations.click();
    await expect(page.getByRole('combobox', { name: 'Search this project by ID or title' })).toHaveValue('Target');
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
});
