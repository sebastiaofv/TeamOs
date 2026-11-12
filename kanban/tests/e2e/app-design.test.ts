import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, selectPortfolioBoard, toggleLanguage } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('tests/fixtures/manual/us-24.board.json', 'utf8'));

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 960, 390]) {
    test(`query controls use existing view toolbars and preserve the project at ${width}px (${style}/${mode})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.setFixedTime('2026-11-05T12:00:00Z');
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await gotoApp(page);
        await expect(page.locator('#portfolioToolbar, #portfolioBoardsChips, #portfolioQueryToolbar')).toHaveCount(0);
        await expect(page.locator('#portfolioEmptyState h2')).toHaveText('No projects loaded');
        const mainBounds = await page.locator('#portfolioMain').boundingBox();
        const emptyBounds = await page.locator('.portfolio-empty-content').boundingBox();
        expect(Math.abs(emptyBounds!.x + emptyBounds!.width / 2 - mainBounds!.x - mainBounds!.width / 2)).toBeLessThan(2);
        expect(Math.abs(emptyBounds!.y + emptyBounds!.height / 2 - mainBounds!.y - mainBounds!.height / 2)).toBeLessThan(2);
        await expect(page.locator('#openShortcutsBtn svg')).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath('empty.png'), animations: 'disabled' });
        if (width === 390) await toggleLanguage(page);
        await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true,
            tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p', identify: false });
        const identity = page.locator('#projectIdentityModal');
        const helpBounds = await page.locator('#projectIdentityHelp').boundingBox();
        const labelBounds = await identity.locator('label').first().boundingBox();
        const selectBounds = await identity.getByRole('combobox').boundingBox();
        expect(labelBounds!.y - helpBounds!.y - helpBounds!.height).toBeGreaterThanOrEqual(20);
        expect(selectBounds!.y - labelBounds!.y - labelBounds!.height).toBeGreaterThanOrEqual(8);
        await page.screenshot({ path: testInfo.outputPath('identity.png'), animations: 'disabled' });
        await identity.getByRole('combobox').selectOption('@new');
        await expect(page.locator('#projectIdentityName')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('identity-new-member.png'), animations: 'disabled' });
        await identity.getByRole('combobox').selectOption({ index: 1 });
        await identity.getByRole('button', { name: width === 390 ? 'Confirmar' : 'Confirm', exact: true }).click();
        if (width === 390) await toggleLanguage(page);
        await selectPortfolioBoard(page, fixture.board.settings.title);
        await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
        const technical = page.getByRole('button', { name: 'Technical', exact: true });
        const functional = page.getByRole('button', { name: 'Functional', exact: true });
        const selectedColor = await technical.evaluate((element) => getComputedStyle(element).backgroundColor);
        const unselectedColor = await functional.evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(selectedColor).not.toBe(unselectedColor);
        await functional.click();
        await page.mouse.move(1, 1);
        await expect(functional).toHaveAttribute('aria-pressed', 'true');
        await expect(functional).toHaveCSS('background-color', selectedColor);
        await expect(technical).toHaveCSS('background-color', unselectedColor);
        const before = await readSavedBoard(page, 'p');
        await expect(page.locator('.header #portfolioSearchBtn')).toBeVisible();
        await expect(page.locator('.header #portfolioSearchBtn input, .header .palette-search-text')).toHaveCount(0);
        await expect(page.locator('#projectPickerBtn')).toContainText(fixture.board.settings.title);
        await expect(page.locator('#portfolioToolbar input, #portfolioToolbar select, #portfolioToolbar #portfolioFiltersBtn')).toHaveCount(0);
        await expect(page.locator('#portfolioBoardsChips')).toHaveAttribute('aria-label', 'Project selection');
        await page.locator('#portfolioSearchBtn').click();
        await expect(page.locator('#commandPaletteInput')).toBeFocused();
        await page.keyboard.press('Escape');
        const sections = { table: '#portfolioTable .table-heading', board: '.workitem-board-toolbar' };
        for (const [view, section] of Object.entries(sections)) {
            await page.locator(`[data-view-mode="${view}"]`).click();
            await expect(page.locator(`${section} #portfolioSearchInput`)).toBeVisible();
            await expect(page.locator(`${section} #portfolioFiltersBtn`)).toBeVisible();
            await expect(page.locator('#portfolioQueryToolbar')).toHaveCount(0);
            await expect(page.locator('#portfolioSortSelect')).toHaveCount(0);
            for (const control of await page.locator(`${section} #portfolioSearchInput, ${section} #portfolioFiltersBtn, ${section} #portfolioSortSelect, ${section} .table-tools > button`).all()) {
                const bounds = await control.boundingBox();
                expect(bounds!.x).toBeGreaterThanOrEqual(0);
                expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
            }
            if (width === 1280 && view === 'table') {
                const search = await page.locator(`${section} .section-search`).boundingBox();
                const filters = await page.locator(`${section} #portfolioFiltersBtn`).boundingBox();
                const columns = await page.locator(`${section} #tableColumns`).boundingBox();
                expect(search!.x + search!.width).toBeLessThanOrEqual(filters!.x);
                expect(filters!.x + filters!.width).toBeLessThanOrEqual(columns!.x);
                expect(Math.abs(search!.y - columns!.y)).toBeLessThan(2);
            }
            if (view === 'board') await expect(page.locator('.workitem-board-actions').getByRole('button', { name: 'Create workitem', exact: true })).toHaveClass(/btn-primary/);
            if (view === 'board') await page.screenshot({ path: testInfo.outputPath('board.png'), animations: 'disabled' });
            await page.locator('#portfolioSearchBtn').focus();
            await page.keyboard.press('s');
            if (view === 'board') { await expect(page.locator('#portfolioSortSelect')).toBeFocused(); await page.keyboard.press('Escape'); }
            else await expect(page.locator('#workitemsTable th[aria-sort="ascending"] button')).toBeFocused();
        }
        for (const view of ['dashboard', 'control', 'roadmap', 'planner']) {
            await page.locator(`[data-view-mode="${view}"]`).click();
            await expect(page.locator('#portfolioSearchInput, #portfolioFiltersBtn, #portfolioSortSelect')).toHaveCount(0);
        }
        await page.locator('[data-view-mode="table"]').click();
        await expect(page.locator('#workitemsTable tbody tr').first()).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('table.png'), animations: 'disabled' });
        await page.locator('#portfolioSearchInput').fill('Implementar confirmação');
        await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
        await page.locator('#portfolioSearchClearBtn').click();
        await page.locator('#portfolioFiltersBtn').click();
        const bounds = await page.locator('#portfolioFiltersPanel').boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
        await page.keyboard.press('Escape');
        await expect(page.locator('#portfolioFiltersBtn')).toBeFocused();
        expect(await readSavedBoard(page, 'p')).toEqual(before);
    });
}
