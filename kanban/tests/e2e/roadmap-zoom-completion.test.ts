import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1000 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'zoom', title: 'Timeline zoom', hasHandle: true, tasks: [
        { id: 1, title: 'Complete', status: 'done', milestoneId: 'complete', phaseId: 'phase', sprintId: 'sprint' },
        { id: 2, title: 'Partial done', status: 'done', milestoneId: 'partial' },
        { id: 3, title: 'Partial open', status: 'doing', milestoneId: 'partial' }
    ], extensions: { roadmap: { version: 5,
        phases: [{ id: 'phase', title: 'Delivery', startDate: '2026-10-01', endDate: '2027-04-30' }],
        sprints: [{ id: 'sprint', title: 'Execution', status: 'planned', startDate: '2026-11-01', endDate: '2026-11-14' }],
        milestones: [
            { id: 'complete', title: 'Complete milestone', dueDate: '2026-12-01', color: '#7c3aed' },
            { id: 'partial', title: 'Partial milestone', dueDate: '2027-01-01', color: '#b45309' },
            { id: 'empty', title: 'Empty milestone', dueDate: '2027-02-01', color: '#0f766e' }
        ]
    } } }], { selectedBoardId: 'zoom' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
});

test('zoom doubles the horizontal date scale even on wide screens', async ({ page }) => {
    const axis = page.locator('.roadmap-axis');
    const initial = (await axis.boundingBox())!.width;
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('2');
    await expect.poll(async () => (await axis.boundingBox())!.width).toBeCloseTo(initial * 2, 0);
    expect(await page.locator('#portfolioRoadmapView').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('all nine zoom levels scale dates and bars while labels, icons and heights stay fixed', async ({ page }) => {
    const zoom = page.getByLabel('Timeline zoom', { exact: true });
    await expect(zoom.locator('option')).toHaveText(['100%', '125%', '150%', '175%', '200%', '225%', '250%', '275%', '300%']);
    const geometry = () => page.locator('.roadmap-axis').evaluate(axis => {
        const rect = axis.getBoundingClientRect();
        const phase = document.querySelector('#roadmap-row-phase-phase .roadmap-row-timeline-bar')!;
        const sprint = document.querySelector('#roadmap-row-sprint-sprint .roadmap-row-timeline-bar')!;
        const diamond = document.querySelector('[data-roadmap-id="complete"] .milestone-diamond')!;
        const label = document.querySelector('.roadmap-axis-label')!;
        return { axis: rect.width, label: label.getBoundingClientRect().width,
            phase: phase.getBoundingClientRect().width, sprint: sprint.getBoundingClientRect().width,
            phaseHeight: phase.getBoundingClientRect().height, sprintHeight: sprint.getBoundingClientRect().height,
            textSize: getComputedStyle(phase.querySelector('.roadmap-bar-value')!).fontSize,
            labelSize: getComputedStyle(label).fontSize,
            diamondSize: diamond.getBoundingClientRect().width,
            milestoneOffset: diamond.getBoundingClientRect().x + diamond.getBoundingClientRect().width / 2 - rect.x,
            sprintOffset: sprint.getBoundingClientRect().x - rect.x };
    });
    for (const width of [2048, 1280, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await zoom.selectOption('1');
        await expect.poll(() => page.locator('#portfolioRoadmapView').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        const initial = await geometry();
        for (const factor of [1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
            await zoom.selectOption(String(factor));
            await expect.poll(async () => (await geometry()).axis).toBeCloseTo(initial.axis * factor, 0);
            const actual = await geometry();
            expect(actual.phase).toBeCloseTo(initial.phase * factor, 0);
            expect(actual.sprint).toBeCloseTo(initial.sprint * factor, 0);
            expect(actual.sprintOffset).toBeCloseTo(initial.sprintOffset * factor, 0);
            expect(actual.milestoneOffset).toBeCloseTo(initial.milestoneOffset * factor, 0);
            for (const field of ['label', 'phaseHeight', 'sprintHeight', 'textSize', 'labelSize', 'diamondSize'] as const) expect(actual[field]).toBe(initial[field]);
        }
        await page.locator('#portfolioRoadmapView').evaluate(element => { element.scrollLeft = element.scrollWidth; });
        expect(await page.locator('#portfolioRoadmapView').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
});

test('zoom responds to label width changes and viewport resizing without losing guide alignment', async ({ page }) => {
    const zoom = page.getByLabel('Timeline zoom', { exact: true });
    await zoom.selectOption('3');
    for (const width of [1280, 2048, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const labels of ['280', '720']) {
            await page.getByLabel('Identification column width', { exact: true }).fill(labels);
            await expect.poll(async () => page.locator('.roadmap-axis').evaluate(axis => {
                const viewport = document.querySelector('#portfolioRoadmapView')!;
                const label = document.querySelector('.roadmap-axis-label')!;
                return Math.abs(axis.getBoundingClientRect().width - (viewport.clientWidth - label.getBoundingClientRect().width - 18) * 3);
            })).toBeLessThan(0.1);
            const diamond = (await page.locator('[data-roadmap-id="complete"] .milestone-diamond').boundingBox())!;
            const guide = (await page.locator('[data-milestone-guide="complete"]').boundingBox())!;
            expect(diamond.x + diamond.width / 2).toBeCloseTo(guide.x + guide.width / 2, 1);
        }
    }
    await zoom.selectOption('1');
    await expect.poll(() => page.locator('#portfolioRoadmapView').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) {
    test(`completed milestones have a white check and preserve their colour in ${style}/${mode}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('#appSettingsBtn').click();
        await page.locator('input[name="app-theme-style"]').nth(style === 'classic' ? 0 : 1).check();
        await page.locator('input[name="color-mode"]').nth(mode === 'light' ? 0 : 1).check();
        await page.keyboard.press('Escape');
        const complete = page.locator('[data-roadmap-id="complete"] .milestone-diamond');
        const partial = page.locator('[data-roadmap-id="partial"] .milestone-diamond');
        const empty = page.locator('[data-roadmap-id="empty"] .milestone-diamond');
        await expect(complete).toHaveAttribute('data-progress', '100');
        await expect(partial).toHaveAttribute('data-progress', '50');
        await expect(empty).toHaveAttribute('data-progress', 'na');
        await expect(complete.locator('.milestone-complete-check')).toHaveCSS('stroke', 'rgb(255, 255, 255)');
        await expect(complete.locator('.milestone-progress-fill')).toHaveCSS('fill', 'rgb(124, 58, 237)');
        await expect(complete.locator('.milestone-progress-fill')).toHaveAttribute('width', '30');
        await expect(partial.locator('.milestone-progress-fill')).toHaveAttribute('width', '15');
        await expect(empty.locator('.milestone-progress-fill')).toHaveAttribute('width', '0');
        await expect(partial.locator('.milestone-complete-check')).toHaveCount(0);
        await expect(empty.locator('.milestone-complete-check')).toHaveCount(0);
        expect((await complete.boundingBox())!.width).toBeCloseTo(29.333, 1);
        // Check the stroke, including its thickness, stays inside the diamond polygon.
        expect(await complete.locator('.milestone-complete-check').evaluate(element => {
            const box = (element as SVGGraphicsElement).getBBox();
            const radius = parseFloat(getComputedStyle(element).strokeWidth) / 2;
            return [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
                .every(([x, y]) => Math.abs(x - 15) + Math.abs(y - 15) + radius * Math.SQRT2 < 14);
        })).toBe(true);
        await complete.hover();
        await expect(page.getByRole('tooltip')).toContainText('100%');
        await partial.hover();
        await expect(page.getByRole('tooltip')).toContainText('50%');
        await empty.hover();
        await expect(page.getByRole('tooltip')).toContainText('N/A');
        await page.mouse.move(1, 1);
        await page.screenshot({ path: testInfo.outputPath('roadmap-completion.png'), animations: 'disabled' });
        await complete.click();
        await expect(page.locator('#milestoneWorkitemsModal .milestone-complete-check')).toBeVisible();
    });
}
