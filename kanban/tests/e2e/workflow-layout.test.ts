import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
        test(`workflow dropdown arrows stay inside themed fields at ${width}px (${theme})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 900 });
            await gotoApp(page);
            const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
            await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
            if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
            await page.getByRole('button', { name: /^Settings for / }).click();
            await page.getByRole('tab', { name: 'Workflow', exact: true }).click();
            const dialog = page.locator('.workflow-dialog');
            await page.screenshot({ path: testInfo.outputPath(`workflow-states-${theme}-${width}.png`) });
            const checkFields = async () => dialog.locator('.workflow-editor select').evaluateAll((selects) => selects.map((select) => {
                const field = select.getBoundingClientRect();
                const arrow = select.parentElement?.querySelector('svg')?.getBoundingClientRect();
                return { appearance: getComputedStyle(select).appearance, hasArrow: Boolean(arrow), arrowInside: Boolean(arrow && arrow.left >= field.left && arrow.right <= field.right && arrow.top >= field.top && arrow.bottom <= field.bottom) };
            }));
            const fields = await checkFields();
            expect(fields.length).toBeGreaterThan(0);
            expect(fields.every((field) => field.appearance === 'none' && field.hasArrow && field.arrowInside)).toBe(true);
            expect(await dialog.locator('.modal-body:visible').evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
            const footer = await dialog.locator('.modal-footer').boundingBox();
            expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
            const add = await dialog.getByRole('button', { name: 'Add state', exact: true }).boundingBox();
            expect(add!.y + add!.height).toBeLessThanOrEqual(footer!.y);
            await dialog.getByRole('tab', { name: 'Entry & references', exact: true }).click();
            const references = await checkFields();
            expect(references.length).toBe(4);
            expect(references.every((field) => field.appearance === 'none' && field.hasArrow && field.arrowInside)).toBe(true);
            expect(await dialog.locator('.modal-body:visible').evaluate((body) => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`workflow-references-${theme}-${width}.png`) });
        });
    }
}
