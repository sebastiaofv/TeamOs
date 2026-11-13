import { test, expect, type Page } from '@playwright/test';
import { readSavedBoard } from './support/portfolio';
import { seedControlProject as seed, controlKinds as kinds, controlLabels as labels, controlTitles as titles, controlCodes as codes } from './support/control';

const table = (page: Page) => page.locator('.control-table');
for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 390]) {
    test(`Project Control subsections match Table in ${style}/${mode} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await seed(page);
        const before = await readSavedBoard(page, 'control');
        await expect(page.locator('.control-tabs > *')).toHaveCount(3);
        for (const kind of kinds) {
            await page.getByRole('tab', { name: labels[kind], exact: true }).click();
            const scope = `control-${kind}`;
            await expect(page.locator('#control-table-panel .table-heading')).toHaveCount(1);
            await expect(page.locator('.control-filters, .control-toolbar')).toHaveCount(0);
            const buttons = await page.locator('.portfolio-control').locator('.table-tools input[type=search], .table-tools [data-portfolio-filter-trigger], .table-tools > .table-columns, .table-tools > button, .table-management-actions > *').evaluateAll(nodes => nodes.map(node => node.id || node.className));
            expect(buttons).toEqual([`${scope}-search`, `portfolioFiltersBtn-${scope}`, `tableColumns-${scope}`, `tableExportCsv-${scope}`, 'toolbar-divider', `tableCreateRecord-${scope}`]);
            for (const id of [`portfolioFiltersBtn-${scope}`, `tableExportCsv-${scope}`, `tableCreateRecord-${scope}`]) {
                await expect(page.locator(`#${id}`)).toHaveText('');
                await expect(page.locator(`#${id}`)).toHaveAttribute('title', /.+/);
            }
            await expect(table(page).getByRole('checkbox', { name: 'Select this page', exact: true })).toBeVisible();
            await expect(page.locator('.portfolio-control .table-counts')).toContainText('records');
            await expect(page.locator(`#tablePageSize-${scope}`)).toHaveValue('50');
            expect(await page.locator('.portfolio-control .table-tools').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
            await page.mouse.move(1, 1);
            await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
            await expect(page.locator('.portfolio-control')).toHaveScreenshot(`control-${kind}-${style}-${mode}-${width}.png`);
            await table(page).getByRole('checkbox', { name: `Select ${titles[kind]}`, exact: true }).check();
            await expect(page.locator('.portfolio-control .table-counts')).toContainText('1 selected');
            await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
            await table(page).locator('tbody tr').filter({ hasText: titles[kind] }).locator('[data-column=owner]').click();
            await expect(page.locator('.control-modal')).toBeVisible();
            await expect(page.locator('.control-modal .control-type')).toHaveAttribute('data-control-kind', kind);
            await page.keyboard.press('Escape');
            await expect(table(page).getByRole('button', { name: new RegExp(`^ATL-${codes[kind]}-`) }).first()).toBeFocused();
            await page.getByRole('button', { name: 'New record', exact: true }).click();
            await expect(page.locator('.control-modal').getByLabel('Type', { exact: true })).toHaveValue(kind);
            await page.keyboard.press('Escape');
        }
        expect(await readSavedBoard(page, 'control')).toEqual(before);
        expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    });
}
