import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme } from './support/portfolio';

for (const theme of ['light', 'dark']) for (const width of [1840, 390]) {
    test(`dashboard overview widget layout at ${width}px (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 980 });
        await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
        await gotoApp(page);
        const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
        await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: true, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
        await page.locator('[data-view-mode="dashboard"]').click();
        await page.getByLabel('Start date', { exact: true }).fill('24/10/2026');
        await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
        if (theme === 'dark') await toggleTheme(page);
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const grid = page.locator('.dashboard-overview-sections');
        const bounds = (await grid.boundingBox())!;
        // The app scrolls a bounded container. Give the screenshot a tall viewport
        // so every section is painted, rather than capturing clipped blank space.
        await page.setViewportSize({ width, height: Math.ceil(bounds.y + bounds.height + 40) });
        await expect(grid).toHaveScreenshot(`dashboard-sections-${theme}-${width}.png`, { animations: 'disabled' });
    });
}
