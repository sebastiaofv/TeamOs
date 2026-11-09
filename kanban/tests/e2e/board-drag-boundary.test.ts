import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { defaultWorkflow } from '../../src/domain/workflow';
import { gotoApp, seedPortfolioBoards, portfolioCard, dragWithMouse, answerAppMessage, readSavedBoard } from '../support/portfolio';

type BoardMode = 'technical' | 'functional';
async function seedBoard(page: Page, mode: BoardMode, status: string) {
    const workflow = defaultWorkflow();
    await seedPortfolioBoards(page, [{ id: 'edge', title: 'Board boundary', hasHandle: true,
        extensions: { workflow, functionalWorkflow: defaultWorkflow() },
        // Occupied columns must retain their full width in the compact design.
        tasks: [{ id: 1, title: 'Boundary workitem', type: mode === 'functional' ? 'story' : 'task', status, acceptanceCriteria: 'Reviewed' },
            ...workflow.states.map((state, index) => ({ id: index + 2, title: `Context ${state.id}`, type: mode === 'functional' ? 'story' : 'task', status: state.id }))]
    }], { selectedBoardId: 'edge' });
    await page.getByRole('button', { name: mode === 'functional' ? 'Functional' : 'Technical', exact: true }).click();
    const columns = page.locator('.workitem-board-columns');
    expect(await columns.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    return columns;
}
async function expectPageWithinViewport(page: Page) {
    const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, x: window.scrollX }));
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.x).toBe(0);
    const logo = (await page.locator('.header img').boundingBox())!;
    expect(logo.x).toBeGreaterThanOrEqual(0);
    expect(logo.x + logo.width).toBeLessThanOrEqual(bounds.viewport);
}

for (const style of ['classic', 'modern']) {
    for (const mode of ['technical', 'functional'] as const) {
        for (const width of [390, 1280]) test(`${style} ${mode}: a completed card stays within the Board at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript((style) => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
            await gotoApp(page);
            const columns = await seedBoard(page, mode, 'done');
            // Offscreen cards and their accessible names must not enlarge the document.
            await expectPageWithinViewport(page);
            await columns.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
            await portfolioCard(page, 'Boundary workitem').click();
            await expect(portfolioCard(page, 'Boundary workitem')).toHaveClass(/selected/);
            await page.keyboard.press('Escape');
            await expectPageWithinViewport(page);
            expect(await columns.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        });

        for (const action of ['drop', 'cancel']) test(`${style} ${mode}: ${action} at the final column keeps the header and page fixed`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.addInitScript((style) => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
            await gotoApp(page);
            await seedBoard(page, mode, 'testing');
            const target = page.locator('#portfolio-done-column');
            await target.scrollIntoViewIfNeeded();
            const targetBounds = (await target.boundingBox())!;
            await dragWithMouse(page, portfolioCard(page, 'Boundary workitem').locator('.task-title'), target, { release: false, targetPosition: { x: targetBounds.width - 8, y: 60 } });
            await expect(page.locator('.drag-overlay')).toBeVisible();
            await expectPageWithinViewport(page);
            if (action === 'cancel') await page.keyboard.press('Escape');
            await page.mouse.up();
            // dnd-kit suppresses clicks for 50 ms after a drop.
            await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 60)));
            if (action === 'drop' && mode === 'functional') await answerAppMessage(page, { button: 'Accept workitem' });
            const status = action === 'drop' ? 'done' : 'testing';
            await expect(portfolioCard(page, 'Boundary workitem')).toHaveAttribute('data-status', status);
            if (action === 'drop') await expect.poll(async () => (await readSavedBoard(page, 'edge')).board.tasks[0].status).toBe(status);
            await expectPageWithinViewport(page);
            // The document must remain unscrollable even if horizontal panning is attempted.
            await page.evaluate(() => window.scrollTo(200, 0));
            await expectPageWithinViewport(page);
            await page.screenshot({ path: testInfo.outputPath(`${style}-${mode}-${action}.png`) });
        });
    }
    test(`${style}: standalone keeps completed cards and their accessible labels inside the Board`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.addInitScript((style) => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await page.goto(pathToFileURL(resolve('dist-standalone/index.html')).href);
        const columns = await seedBoard(page, 'functional', 'done');
        await expectPageWithinViewport(page);
        await columns.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
        await portfolioCard(page, 'Boundary workitem').click();
        await expect(portfolioCard(page, 'Boundary workitem')).toHaveClass(/selected/);
        await page.keyboard.press('Escape');
        await expectPageWithinViewport(page);
    });
}
