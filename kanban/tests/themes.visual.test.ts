import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from './support/portfolio';

for (const style of ['classic', 'modern']) {
    for (const mode of ['light', 'dark']) {
        for (const width of [390, 1280]) {
            test(`${style} ${mode} at ${width}px`, async ({ page }) => {
                await page.setViewportSize({ width, height: 900 });
                await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
                await page.addInitScript(({ style, mode }) => {
                    localStorage.setItem('teamOsKanbanThemeStyle', style);
                    localStorage.setItem('teamOsKanbanTheme', mode);
                }, { style, mode });
                await gotoApp(page);
                await seedPortfolioBoards(page, [{ id: 'theme', title: 'Team workspace', hasHandle: true,
                    members: ['Alex', 'Sam'], tags: ['design', 'review'],
                    tasks: [
                        { id: 1, title: 'Explore the new workspace', status: 'backlog', tags: ['design'] },
                        { id: 2, title: 'Review the next release', status: 'to-do', priority: 'medium', assignees: ['Alex'] },
                        { id: 3, title: 'Keep work moving', status: 'doing', priority: 'high', assignees: ['Sam'] },
                        { id: 4, title: 'Share the finished plan', status: 'done', priority: 'low' }
                    ] }], { selectedBoardId: 'theme' });
                await page.mouse.move(1, 1);
                await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
                if (width === 1280) {
                    await expect(page).toHaveScreenshot(`${style}-${mode}-board.png`);
                    await page.getByRole('button', { name: 'Table', exact: true }).click();
                    await page.mouse.move(1, 1);
                    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
                    await expect(page).toHaveScreenshot(`${style}-${mode}-table.png`);
                } else {
                    await page.locator('#appSettingsBtn').click();
                    await expect(page).toHaveScreenshot(`${style}-${mode}-picker-mobile.png`);
                }
            });
        }
    }
}
