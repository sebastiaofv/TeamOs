import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme } from './support/portfolio';
import { sprintExecutionFixture } from './support/sprintAnalytics';

for (const individual of [false, true]) for (const style of ['classic', 'modern']) for (const theme of ['light', 'dark']) for (const width of [1840, 390]) {
    test(`${individual ? 'Individual Sprint' : 'All Sprints'} widgets at ${width}px (${style}, ${theme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'));
        await page.addInitScript(style => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await gotoApp(page);
        const data = sprintExecutionFixture();
        await seedPortfolioBoards(page, [{ id: 'analytics', title: 'Analytics project', hasHandle: true, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'analytics' });
        if (theme === 'dark') await toggleTheme(page);
        await page.locator('[data-view-mode="dashboard"]').click();
        await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
        if (individual) {
            await page.getByRole('combobox', { name: 'Sprint', exact: true }).selectOption('s1');
            await page.locator('[data-sprint-widget="rework"] button').click();
            await page.locator('[data-sprint-widget="rework"] button').evaluate(button => button.blur());
        }
        await page.locator('.portfolio-board-wrap').evaluate(element => { element.scrollTop = 0; });
        const analytics = page.locator('.sprint-analytics');
        if (width === 1840) {
            const cards = await page.locator('[data-sprint-summary]').evaluateAll(elements => elements.map(element => ({ y: element.getBoundingClientRect().y, height: element.getBoundingClientRect().height })));
            expect(new Set(cards.map(card => card.y)).size).toBe(individual ? 2 : 1);
            expect(new Set(cards.map(card => card.height)).size).toBe(1);
        }
        const bounds = (await analytics.boundingBox())!;
        await page.setViewportSize({ width, height: Math.ceil(bounds.y + bounds.height + 40) });
        await page.locator('.portfolio-board-wrap').evaluate(element => { element.scrollTop = 0; });
        await page.mouse.move(1, 1);
        await expect(analytics).toHaveScreenshot(`${individual ? 'individual-sprint' : 'all-sprints'}-${style}-${theme}-${width}.png`, { animations: 'disabled' });
    });
}
