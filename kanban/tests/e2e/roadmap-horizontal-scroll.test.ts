import { test, expect, type Locator, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme } from '../support/portfolio';

async function openRoadmap(page: Page, scope: string) {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'frozen', title: 'Frozen project', hasHandle: true,
        tasks: [
            { id: 1, title: 'Done', status: 'done', phaseId: 'phase', sprintId: 'sprint' },
            { id: 2, title: 'Open', status: 'doing', phaseId: 'phase', sprintId: 'sprint' },
            { id: 3, title: 'Final done', status: 'done', phaseId: 'end' },
            { id: 4, title: 'Final open', status: 'doing', phaseId: 'end' },
            { id: 5, title: 'Final pending', status: 'to-do', phaseId: 'end' }
        ], extensions: { roadmap: { version: 5,
            phases: [
                { id: 'phase', title: 'Delivery', startDate: '2026-01-01', endDate: '2027-01-01' },
                { id: 'end', title: 'Final day', startDate: '2027-01-01', endDate: '2027-01-01' }
            ],
            sprints: [{ id: 'sprint', title: 'Execution', startDate: '2026-01-01', endDate: '2027-01-01' }],
            milestones: [
                { id: 'release', title: 'Release', dueDate: '2026-07-01' },
                { id: 'end', title: 'Final day', dueDate: '2027-01-01' }
            ]
        } }
    }], scope === 'Project' ? { selectedBoardId: 'frozen' } : {});
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('3');
}

// Move the timeline content underneath the frozen column, then check the actual
// painted/hit-tested layer. Position alone cannot catch stacking regressions.
async function expectCovered(page: Page, content: Locator, frozen: Locator) {
    const viewport = page.locator('#portfolioRoadmapView');
    await viewport.evaluate(element => { element.scrollLeft = 0; });
    const label = (await frozen.boundingBox())!;
    const moving = (await content.boundingBox())!;
    const x = label.x + label.width - 20;
    const y = moving.y + moving.height / 2;
    await viewport.evaluate((element, left) => { element.scrollLeft = left; }, moving.x + moving.width / 2 - x);
    await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    expect.soft(await frozen.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x, y }),
        `${await content.getAttribute('class')} must be covered by the identification column`).toBe(true);
}

for (const scope of ['Project', 'ALL']) for (const theme of ['light', 'dark']) {
    test(`${scope}/${theme} frozen identification column covers timeline values and milestones`, async ({ page }, testInfo) => {
        await openRoadmap(page, scope);
        if (theme === 'dark') await toggleTheme(page);
        for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 720 });
            await expectCovered(page, page.locator('[data-roadmap-id="phase"] .roadmap-bar-value'), page.locator('[data-roadmap-id="phase"] .roadmap-row-labels'));
            if (scope === 'Project') {
                await expectCovered(page, page.locator('[data-roadmap-id="sprint"] .roadmap-bar-value'), page.locator('[data-roadmap-id="sprint"] .roadmap-row-labels'));
                await expectCovered(page, page.locator('.milestone-diamond').first(), page.locator('.roadmap-axis-label'));
            } else {
                await expectCovered(page, page.locator('.roadmap-project-row .roadmap-bar-value'), page.locator('.roadmap-project-row .roadmap-row-labels'));
            }
            await page.screenshot({ path: testInfo.outputPath(`frozen-${width}.png`) });
        }
    });

    test(`${scope}/${theme} controls and frozen column stay fixed at the horizontal scroll limit`, async ({ page }) => {
        await openRoadmap(page, scope);
        if (theme === 'dark') await toggleTheme(page);
        const viewport = page.locator('#portfolioRoadmapView');
        const selectors = ['.roadmap-view-controls', '.roadmap-axis-label', '[data-roadmap-id="phase"] .roadmap-row-labels'];
        for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 720 });
            for (const zoom of ['1', '1.25', '2', '3']) {
                await page.getByLabel('Timeline zoom', { exact: true }).selectOption(zoom);
                await viewport.evaluate(element => { element.scrollLeft = 0; });
                const before = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
                await viewport.evaluate(element => { element.scrollLeft = element.scrollWidth; });
                if (zoom === '1') await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
                else await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
                const finalValue = (await page.locator('[data-roadmap-id="end"] .roadmap-bar-value').boundingBox())!;
                const bounds = (await viewport.boundingBox())!;
                expect(finalValue.x + finalValue.width).toBeLessThanOrEqual(bounds.x + bounds.width);
                for (const [index, selector] of selectors.entries()) {
                    const after = (await page.locator(selector).boundingBox())!;
                    // scrollWidth rounds to whole CSS pixels; sticky bounds may be fractional.
                    expect.soft(Math.abs(after.x - before[index]!.x), `${selector} horizontal position at ${width}px/${zoom}`).toBeLessThan(1);
                    expect.soft(after.width, `${selector} width at ${width}px/${zoom}`).toBeCloseTo(before[index]!.width, 0);
                }
            }
        }
    });
}
