import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) {
    test(`${style}/${mode} keeps long project names bounded and composite control names clear`, async ({ page }) => {
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await page.setViewportSize({ width: 320, height: 740 });
        await page.clock.setFixedTime('2026-11-05T12:00:00Z');
        await gotoApp(page);
        const title = `Projeto ${'日本語🚀'.repeat(25)}`;
        await seedPortfolioBoards(page, [{ id: 'polish', title, hasHandle: true, tasks: [{ id: 1, title: 'Workitem', status: 'to-do' }],
            extensions: { roadmap: { version: 1, milestones: [{ id: 'm', title: 'Entrega', dueDate: '2026-11-20' }], phases: [{ id: 'p', title: 'Fase', startDate: '2026-11-01', endDate: '2026-11-30' }], sprints: [] } }
        }], { selectedBoardId: 'polish' });
        await page.locator('#projectPickerBtn').click();
        const chip = page.locator('.portfolio-chip').filter({ has: page.getByRole('button', { name: title, exact: true }) });
        const bounds = (await chip.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
        await expect(chip.locator('[data-action="select-board"]')).toHaveAttribute('title', title);
        await expect(chip.locator('[data-action="remove-board"]')).toBeInViewport();
        await page.keyboard.press('Escape');
        await page.locator('[data-view-mode="table"]').click();
        await page.locator('#tableColumns > summary').click();
        const gap = await page.locator('.table-column-option label').first().evaluate((el) => getComputedStyle(el).gap);
        expect(gap).toBe('8px');
        await page.keyboard.press('Escape');
        await page.locator('[data-view-mode="dashboard"]').click();
        await page.setViewportSize({ width: 768, height: 1024 });
        for (const tab of await page.locator('.dashboard-tabs button').all()) {
            const tabBounds = (await tab.boundingBox())!;
            expect(tabBounds.x).toBeGreaterThanOrEqual(0);
            expect(tabBounds.x + tabBounds.width).toBeLessThanOrEqual(768);
        }
        await page.locator('[data-view-mode="roadmap"]').click();
        await expect(page.locator('#roadmap-row-phase-p .roadmap-disclosure-btn')).toHaveAccessibleName('Show tasks for Fase: 0/0');
        await expect(page.locator('.milestone-annotation')).toHaveAccessibleName('N/A Entrega 20/11/2026');
        await page.locator('[data-view-mode="planner"]').click();
        await page.getByRole('button', { name: 'Calendar', exact: true }).click();
        const january = page.locator('[data-action="open-calendar-month"][data-month="0"]');
        await expect(january).toHaveAccessibleName('January 0 items');
        await expect(january).toHaveAccessibleDescription('Open January 2026');
        await expect(page.locator('[data-action="calendar-prev-year"]')).toHaveAccessibleName('Prev');
        await expect(page.locator('[data-action="calendar-prev-year"]')).toHaveAccessibleDescription('Previous year');
        await january.click();
        await expect(page.locator('[data-action="calendar-back-to-year"]')).toBeVisible();
    });
}
