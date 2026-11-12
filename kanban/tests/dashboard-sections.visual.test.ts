import { setDashboardDate } from './support/dashboard';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme } from './support/portfolio';

for (const style of ['classic', 'modern']) for (const theme of ['light', 'dark']) for (const width of [1840, 390]) {
    test(`dashboard overview widget layout at ${width}px (${theme}, ${style})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 980 });
        const data = JSON.parse(readFileSync('tests/fixtures/manual/us-9-sections.board.json', 'utf8'));
        for (const context of [data, ...data.extensions.timeline.events.flatMap((event: { snapshot?: { extensions?: { workflow?: typeof data.extensions.workflow } } }) => event.snapshot ? [event.snapshot] : [])]) {
            const workflow = context.extensions?.workflow;
            if (workflow) { workflow.states.find((state: { id: string }) => state.id === 'testing').category = 'testing'; workflow.references.testing = 'testing'; }
        }
        await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
        await page.addInitScript((style) => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: true, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
        await page.locator('[data-view-mode="dashboard"]').click();
        await setDashboardDate(page, 'Start date', '24/10/2026');
        await setDashboardDate(page, 'End date', '31/10/2026');
        if (theme === 'dark') await toggleTheme(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme-style', style);
        for (const circle of await page.locator('.dashboard-phase-circle').all()) await expect(circle).toHaveCSS('border-radius', '50%');
        await page.mouse.move(1, 1);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const grid = page.locator('.dashboard-overview-sections');
        const bounds = (await grid.boundingBox())!;
        // The app scrolls a bounded container. Give the screenshot a tall viewport
        // so every section is painted, rather than capturing clipped blank space.
        await page.setViewportSize({ width, height: Math.ceil(bounds.y + bounds.height + 40) });
        await expect(grid).toHaveScreenshot(`dashboard-sections-${theme}-${width}${style === 'modern' ? '-modern' : ''}.png`, { animations: 'disabled' });
    });
}
