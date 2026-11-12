import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme } from './support/portfolio';
import { sprintAnalyticsFixture } from './support/sprintAnalytics';

for (const style of ['classic', 'modern']) for (const theme of ['light', 'dark']) for (const width of [1840, 390]) {
    test(`All Sprints widgets at ${width}px (${style}, ${theme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'));
        await page.addInitScript(style => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await gotoApp(page);
        const data = sprintAnalyticsFixture();
        await seedPortfolioBoards(page, [{ id: 'analytics', title: 'Analytics project', hasHandle: true, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'analytics' });
        if (theme === 'dark') await toggleTheme(page);
        await page.locator('[data-view-mode="dashboard"]').click();
        await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
        const analytics = page.locator('.sprint-analytics');
        const bounds = (await analytics.boundingBox())!;
        await page.setViewportSize({ width, height: Math.ceil(bounds.y + bounds.height + 40) });
        await page.mouse.move(1, 1);
        await expect(analytics).toHaveScreenshot(`all-sprints-${style}-${theme}-${width}.png`, { animations: 'disabled' });
    });
}
