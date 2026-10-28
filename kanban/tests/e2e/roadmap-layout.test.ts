import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

// Keep the multi-decade regression independent of the manual fixture's realistic dates.
const fixture = JSON.parse(readFileSync('test-board/us-12.board.json', 'utf8'));
fixture.extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'checkout').endDate = '2099-12-31';
fixture.extensions.roadmap.milestones.find((milestone: { id: string }) => milestone.id === 'release').dueDate = '2099-12-31';

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1100 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'layout', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'layout' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
});

test('long timelines keep year labels separate at every viewport and zoom', async ({ page }) => {
    for (const width of [2048, 1280, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        for (const zoom of ['1', '2']) {
            await page.getByLabel('Timeline zoom', { exact: true }).selectOption(zoom);
            await expect.poll(async () => page.locator('.roadmap-axis-year').evaluateAll((labels) => {
                const rects = labels.map((label) => label.getBoundingClientRect());
                return rects.slice(1).every((rect, index) => rect.left >= rects[index].right + 4);
            })).toBe(true);
            await expect.poll(async () => page.locator('.roadmap-axis-date-label').evaluateAll((labels) => {
                const rects = labels.map((label) => label.getBoundingClientRect());
                return rects.slice(1).every((rect, index) => rect.left >= rects[index].right + 4);
            })).toBe(true);
        }
    }
});

test('date and grid guides stay behind expanded workitem tables', async ({ page }, testInfo) => {
    await page.locator('#roadmap-row-phase-delivery .roadmap-disclosure-btn').click();
    const area = page.locator('#roadmap-row-phase-delivery .roadmap-work-area');
    await expect(area).toContainText('Checkout acessível');
    await page.mouse.move(1, 1);
    await page.locator('#portfolioRoadmapView').click({ position: { x: 1, y: 1 } });
    const box = (await area.boundingBox())!;
    // Sample inside the surface: fractional edge pixels also include adjacent timeline rows.
    const clip = { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 };
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.locator('#themeToggleBtn').click();
        const visibleGuides = await page.screenshot({ clip, animations: 'disabled' });
        const hiddenGuides = await page.screenshot({ clip, animations: 'disabled', style: '.roadmap-temporal-overlay, .roadmap-date-overlay { visibility: hidden !important; }' });
        expect(visibleGuides.equals(hiddenGuides), 'Timeline guides must not paint over expanded table content').toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`roadmap-expanded-${theme}.png`), animations: 'disabled' });
    }
});
