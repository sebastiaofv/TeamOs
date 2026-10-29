import { test, expect, type Locator } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard } from '../support/portfolio';

async function expectContainedArrows(scope: Locator) {
    const fields = await scope.locator('select:not([multiple]):not([size]):visible').evaluateAll((selects) => selects
        .filter((select) => getComputedStyle(select).opacity !== '0')
        .map((select) => {
            const style = getComputedStyle(select);
            const field = select.getBoundingClientRect();
            const arrow = select.parentElement?.querySelector(':scope > .workflow-select-arrow, :scope > .task-editor-select-arrow, :scope > .table-select-arrow');
            const box = arrow?.getBoundingClientRect();
            return {
                id: select.id || select.getAttribute('aria-label'),
                appearance: style.appearance,
                paddingRight: parseFloat(style.paddingRight),
                backgroundImage: style.backgroundImage,
                backgroundPosition: style.backgroundPosition,
                customArrowInside: box ? box.left > field.left && box.right < field.right && box.top > field.top && box.bottom < field.bottom : null
            };
        }));
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
        expect(field.appearance, `${field.id}: suppress the native edge arrow`).toBe('none');
        expect(field.paddingRight, `${field.id}: reserve space for the arrow`).toBeGreaterThanOrEqual(30);
        if (field.customArrowInside !== null) {
            expect(field.customArrowInside, `${field.id}: custom arrow stays inside the field`).toBe(true);
            expect(field.backgroundImage, `${field.id}: show only one arrow`).toBe('none');
        } else {
            expect(field.backgroundImage, `${field.id}: render the shared arrow`).toContain('data:image/svg+xml');
            expect(field.backgroundPosition, `${field.id}: inset the arrow from the right edge`).toBe('calc(100% - 10px) 50%');
        }
    }
}

for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
        test(`dropdown arrows stay inside fields throughout the app at ${width}px (${theme})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 900 });
            await gotoApp(page);
            if (theme === 'dark') await page.locator('#themeToggleBtn').click();
            await seedPortfolioBoards(page, [{
                id: 'arrows', title: 'Arrow checks', hasHandle: true, members: ['Ana'], tags: ['ui'],
                tasks: [{ id: 1, title: 'Arrow task', status: 'backlog' }]
            }], { selectedBoardId: 'arrows' });

            await expectContainedArrows(page.locator('#portfolioToolbar'));
            await page.locator('#portfolioSortSelect').selectOption('effort');
            await expect(page.locator('#portfolioSortSelect')).toHaveValue('effort');
            await page.locator('#portfolioSortSelect').selectOption('priority');
            await page.locator('#portfolioSortSelect').screenshot({ path: testInfo.outputPath('sort-dropdown.png') });
            await page.locator('#portfolioFiltersBtn').click();
            await expectContainedArrows(page.locator('#portfolioFiltersPanel'));
            await page.locator('#portfolioFiltersPanel').getByRole('button', { name: 'Done', exact: true }).click();

            await page.getByRole('button', { name: 'Settings for Arrow checks', exact: true }).click();
            const settings = page.locator('#projectSettingsModal');
            await expectContainedArrows(settings);
            await settings.getByRole('tab', { name: 'Technical workflow', exact: true }).click();
            await expectContainedArrows(settings);
            await settings.getByRole('tab', { name: 'Entry & references', exact: true }).click();
            await expectContainedArrows(settings);
            await page.keyboard.press('Escape');

            await portfolioCard(page, 'Arrow task').getByRole('button', { name: 'Edit', exact: true }).click();
            await expectContainedArrows(page.locator('#taskModal'));
            await page.locator('#taskModal .modal-content').screenshot({ path: testInfo.outputPath('editor-dropdowns.png') });
            await page.keyboard.press('Escape');
            await portfolioCard(page, 'Arrow task').click();
            await expectContainedArrows(page.locator('#taskDetailModal'));
            await page.keyboard.press('Escape');

            await page.locator('[data-view-mode="table"]').click();
            await expectContainedArrows(page.locator('#portfolioTable'));
            await page.locator('.table-hierarchy-options > summary').click();
            await expectContainedArrows(page.locator('#portfolioTable'));
            await page.keyboard.press('Escape');

            await page.locator('[data-view-mode="roadmap"]').click();
            await expectContainedArrows(page.locator('#portfolioRoadmapView'));
            await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
            await expectContainedArrows(page.locator('#roadmapEntityModal'));
            await page.keyboard.press('Escape');

            await page.keyboard.press('ControlOrMeta+k');
            await page.locator('#commandPaletteInput').fill('+ Arrow preview');
            await expect(page.locator('.palette-preview')).toBeVisible();
            await expectContainedArrows(page.locator('#commandPalette'));
        });
    }
}
