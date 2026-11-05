import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-24.board.json', 'utf8'));

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 960, 390]) {
    test(`section controls stay local and preserve the project at ${width}px (${style}/${mode})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.setFixedTime('2026-11-05T12:00:00Z');
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true,
            tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
        const before = await readSavedBoard(page, 'p');
        await expect(page.locator('.header #portfolioSearchBtn')).toBeVisible();
        await expect(page.locator('.header #portfolioSearchBtn input, .header .palette-search-text')).toHaveCount(0);
        await expect(page.locator('.header-project-context')).toContainText(fixture.board.settings.title);
        await expect(page.locator('#portfolioToolbar input, #portfolioToolbar select, #portfolioToolbar #portfolioFiltersBtn')).toHaveCount(0);
        await expect(page.locator('#portfolioBoardsChips')).toHaveAttribute('aria-label', 'Project selection');
        await page.locator('#portfolioSearchBtn').click();
        await expect(page.locator('#commandPaletteInput')).toBeFocused();
        await page.keyboard.press('Escape');
        const sections = { table: '#portfolioTable', board: '#portfolioBoard', roadmap: '#portfolioRoadmapView', planner: '#portfolioPlannerView' };
        for (const [view, section] of Object.entries(sections)) {
            await page.locator(`[data-view-mode="${view}"]`).click();
            await expect(page.locator(`${section} #sectionSearchInput`)).toBeVisible();
            await expect(page.locator(`${section} #portfolioFiltersBtn`)).toBeVisible();
            await expect(page.locator('#portfolioSortSelect')).toHaveCount(1);
            await page.locator('#portfolioSearchBtn').focus();
            await page.keyboard.press('s');
            await expect(page.locator(`${section} #portfolioSortSelect`)).toBeFocused();
        }
        await page.locator('[data-view-mode="table"]').click();
        await expect(page.locator('#workitemsTable tbody tr').first()).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('table.png'), animations: 'disabled' });
        await page.locator('#sectionSearchInput').fill('Implementar confirmação');
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
