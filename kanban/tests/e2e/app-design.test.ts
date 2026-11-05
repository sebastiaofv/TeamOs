import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, selectPortfolioBoard } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-24.board.json', 'utf8'));

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 960, 390]) {
    test(`shared query toolbar stays below projects and preserves the project at ${width}px (${style}/${mode})`, async ({ page }, testInfo) => {
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
        if (width === 390) await page.locator('#languageToggleBtn').click();
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
        if (width === 390) await page.locator('#languageToggleBtn').click();
        await selectPortfolioBoard(page, fixture.board.settings.title);
        await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
        const technical = page.getByRole('button', { name: 'Technical Board', exact: true });
        const functional = page.getByRole('button', { name: 'Functional Board', exact: true });
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
        await expect(page.locator('.header-project-context')).toContainText(fixture.board.settings.title);
        await expect(page.locator('#portfolioToolbar input, #portfolioToolbar select, #portfolioToolbar #portfolioFiltersBtn')).toHaveCount(0);
        await expect(page.locator('#portfolioBoardsChips')).toHaveAttribute('aria-label', 'Project selection');
        await page.locator('#portfolioSearchBtn').click();
        await expect(page.locator('#commandPaletteInput')).toBeFocused();
        await page.keyboard.press('Escape');
        const sections = { table: '#portfolioTable', board: '#portfolioBoard', roadmap: '#portfolioRoadmapView', planner: '#portfolioPlannerView' };
        for (const [view, section] of Object.entries(sections)) {
            await page.locator(`[data-view-mode="${view}"]`).click();
            await expect(page.locator('#portfolioQueryToolbar #portfolioSearchInput')).toBeVisible();
            await expect(page.locator('#portfolioQueryToolbar #portfolioFiltersBtn')).toBeVisible();
            await expect(page.locator(`${section} #portfolioSearchInput, ${section} #portfolioFiltersBtn, ${section} #portfolioSortSelect`)).toHaveCount(0);
            const chipsBounds = await page.locator('#portfolioBoardsChips').boundingBox();
            const toolbarBounds = await page.locator('#portfolioQueryToolbar').boundingBox();
            expect(toolbarBounds!.y).toBeGreaterThanOrEqual(chipsBounds!.y + chipsBounds!.height);
            if (width >= 960) {
                const controlsBounds = await page.locator('.portfolio-query-controls').boundingBox();
                expect(controlsBounds!.x).toBeGreaterThan(100);
                expect(controlsBounds!.x + controlsBounds!.width).toBeCloseTo(width - 16, 0);
            }
            await expect(page.locator('#portfolioSortSelect')).toHaveCount(1);
            await page.locator('#portfolioSearchBtn').focus();
            await page.keyboard.press('s');
            await expect(page.locator('#portfolioQueryToolbar #portfolioSortSelect')).toBeFocused();
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
