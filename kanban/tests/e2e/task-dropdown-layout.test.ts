import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, openTaskEditor } from '../support/portfolio';

for (const { width, dark } of [1280, 390].flatMap((width) => [false, true].map((dark) => ({ width, dark })))) {
    test(`task member/tag dropdowns stay contained at ${width}px (${dark ? 'dark' : 'light'})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await gotoApp(page);
        if (dark) await page.locator('#themeToggleBtn').click();
        const member = 'A member with a very long display name '.repeat(5).trim();
        const tag = 'w'.repeat(30);
        await seedPortfolioBoards(page, [{ id: 'p', title: 'Dropdowns', hasHandle: true,
            members: ['Ana', member], tags: ['bug', tag], tasks: [{ id: 1, title: 'Edit dropdowns' }] }], { selectedBoardId: 'p' });
        await openTaskEditor(page, 'Edit dropdowns');
        for (const [id, value, editorId] of [
            ['taskAssigneeNewItem', member, 'taskAssigneeEditor'],
            ['taskTagNewItem', tag, 'taskTagEditor']
        ]) {
            const select = page.locator(`#${id}`);
            await select.selectOption(value);
            await select.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `test-results/${id}-${width}-${dark ? 'dark' : 'light'}.png` });
            const selectBox = (await select.boundingBox())!;
            const editorBox = (await page.locator(`#${editorId}`).boundingBox())!;
            const buttonBox = (await page.locator(`#${editorId}`).getByRole('button', { name: 'Add', exact: true }).boundingBox())!;
            expect(selectBox.x + selectBox.width).toBeLessThanOrEqual(buttonBox.x);
            expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
            expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(width);
            const arrow = select.locator('..').locator('svg');
            await expect(arrow).toHaveCount(1);
            const arrowBox = (await arrow.boundingBox())!;
            expect(arrowBox.x).toBeGreaterThan(selectBox.x);
            expect(arrowBox.x + arrowBox.width).toBeLessThan(selectBox.x + selectBox.width);
            expect(arrowBox.y).toBeGreaterThan(selectBox.y);
            expect(arrowBox.y + arrowBox.height).toBeLessThan(selectBox.y + selectBox.height);
            expect(await select.evaluate((node) => getComputedStyle(node).appearance)).toBe('none');
        }
    });
}
