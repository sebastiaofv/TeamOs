import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, selectTableView, openTableSprintActions, toggleLanguage } from './support/portfolio';

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 390]) {
    test(`phase date review groups retain room in ${style}/${mode} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'p', title: 'Phase dates', hasHandle: true, tasks: [
            { id: 1, type: 'story', title: 'Check reconciliation with a long workitem title', phaseId: 'p1', phaseMode: 'explicit' },
            { id: 2, title: 'Prepare integration', phaseId: 'p1', phaseMode: 'explicit' },
            { id: 3, title: 'Validate support', phaseId: 'p2', phaseMode: 'explicit' }
        ], extensions: { roadmap: { version: 5, sprints: [], milestones: [], phases: [
            { id: 'p1', title: '1 — Initiation and planning of the reconciliation project', startDate: '2026-11-10', endDate: '2026-11-20' },
            { id: 'p2', title: '2 — Support', startDate: '2026-11-10', endDate: '2026-11-30' }
        ] } } }], { selectedBoardId: 'p' });
        if (mode === 'dark') await toggleLanguage(page);
        await page.locator('[data-view-mode=table]').click();
        await selectTableView(page, 'unplanned');
        for (const checkbox of await page.locator('#workitemsTable tbody input[type=checkbox]').all()) await checkbox.check();
        await openTableSprintActions(page);
        await page.locator('#tableCreateSprint').click();
        await page.locator('#roadmapEntityTitle').fill('Delivery');
        await page.locator('#roadmapEntityStartDate').fill('05/11/2026');
        await page.locator('#roadmapEntityEndDate').fill('25/11/2026');
        await page.locator('#roadmapEntityModalSaveBtn').click();
        const modal = page.getByRole('alertdialog');
        await expect(modal.locator('.phase-date-review-group')).toHaveCount(2);
        await expect(modal.locator('.workitem-review-row')).toHaveCount(3);
        for (const group of await modal.locator('.phase-date-review-group').all()) {
            const select = group.getByRole('combobox');
            expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(34);
            await select.focus();
            await select.selectOption('update');
            await expect(select).toHaveValue('update');
            await select.selectOption('keep');
            await expect(select).toHaveValue('keep');
            const fits = await select.evaluate(element => {
                const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!;
                context.font = getComputedStyle(element).font;
                return [...(element as HTMLSelectElement).options].every(option => context.measureText(option.text).width <= element.clientWidth - 30);
            });
            expect(fits).toBe(true);
        }
        expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await expect(modal).toHaveScreenshot(`phase-date-review-${style}-${mode}-${width}.png`, { animations: 'disabled' });
    });
}
