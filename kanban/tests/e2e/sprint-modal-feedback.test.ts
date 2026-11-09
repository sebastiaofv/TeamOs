import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage } from '../support/portfolio';

for (const entry of ['roadmap', 'table'] as const) test(`deleting a Sprint from ${entry} asks once, lists workitems once and clears their associations`, async ({ page }, testInfo) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint deletion', hasHandle: true, tasks: [
        { id: 1, title: 'Selected Story', type: 'story', sprintId: 's', status: 'to-do' },
        { id: 2, title: 'Inherited Task', parentId: 1, sprintId: 's', status: 'doing' },
        { id: 3, title: 'Unrelated Task', sprintId: '', status: 'backlog' }
    ], extensions: { roadmap: { version: 5, phases: [], milestones: [], sprints: [{ id: 's', title: 'Delete me', status: 'planned', startDate: '2026-11-01', endDate: '2026-11-30' }] } } }], { selectedBoardId: 'p' });
    await page.locator(`[data-view-mode=${entry}]`).click();
    if (entry === 'roadmap') await page.getByRole('button', { name: 'Delete me', exact: true }).click();
    else {
        await page.locator('[data-table-view=sprints]').click();
        await page.getByRole('button', { name: 'Edit Delete me', exact: true }).click();
    }
    const remove = async () => {
        await page.locator('#roadmapEntityModal .modal-header summary').click();
        await page.locator('#roadmapEntityModal').getByRole('button', { name: 'Delete', exact: true }).click();
    };
    await remove();
    const modal = page.getByRole('alertdialog');
    await expect(modal.locator('.workitem-review-row')).toHaveCount(2);
    await expect(modal.locator('#appMessageText')).not.toContainText('Selected Story');
    await expect(modal.locator('#appMessageText')).not.toContainText('Inherited Task');
    await expect(modal.locator('.workitem-review-title')).toHaveText(['Selected Story', 'Inherited Task']);
    await modal.screenshot({ path: testInfo.outputPath('sprint-delete-confirmation.png') });
    await answerAppMessage(page, { button: 'Cancel' });
    expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints).toHaveLength(1);
    await remove();
    await answerAppMessage(page, { button: 'Delete' });
    await expect(page.locator('#appMessageModal')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.sprints.length).toBe(0);
    const tasks = (await readSavedBoard(page, 'p')).board.tasks;
    expect(tasks.map((task: { sprintId: string }) => task.sprintId)).toEqual(['', '', '']);
    expect(tasks.map((task: { status: string }) => task.status)).toEqual(['to-do', 'doing', 'backlog']);
});

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) test(`milestone outline and progress remain distinct for every palette colour in ${style}/${mode}`, async ({ page }, testInfo) => {
    await page.addInitScript(({ style, mode }) => {
        localStorage.setItem('teamOsKanbanThemeStyle', style);
        localStorage.setItem('teamOsKanbanTheme', mode);
    }, { style, mode });
    await gotoApp(page);
    const colors = ['#2563eb', '#7c3aed', '#0f766e', '#b45309', '#be123c', '#475569'];
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Milestone contrast', tasks: colors.flatMap((_color, i) => [
        { id: i * 2 + 1, title: `Done ${i}`, status: 'done', milestoneId: `m${i}` },
        { id: i * 2 + 2, title: `Open ${i}`, status: 'to-do', milestoneId: `m${i}` }
    ]), extensions: { roadmap: { version: 5, phases: [], sprints: [], milestones: colors.map((color, i) => ({ id: `m${i}`, title: `Milestone ${i}`, dueDate: `2026-11-${10 + i * 3}`, color })) } } }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode=roadmap]').click();
    const diamonds = page.locator('.milestone-diamond');
    for (const diamond of await diamonds.all()) {
        expect((await diamond.boundingBox())!.width).toBeCloseTo(29.333, 1);
        const contrast = await diamond.evaluate(element => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d')!;
            const luminance = (color: string) => {
                context.fillStyle = color; context.fillRect(0, 0, 1, 1);
                const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
                return rgb.reduce((total, value, i) => total + value * [.2126, .7152, .0722][i], 0);
            };
            const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
            const base = element.querySelector('.milestone-base'), outline = element.querySelector('.milestone-outline'), fill = element.querySelector('.milestone-progress-fill');
            if (!base || !outline || !fill) return null;
            const backdrop = getComputedStyle(element.closest('.roadmap-axis-shell')!).backgroundColor;
            const guide = document.querySelector(`[data-milestone-guide="${element.closest('[data-roadmap-id]')!.getAttribute('data-roadmap-id')}"]`)!;
            return { outlineWidth: parseFloat(getComputedStyle(outline).strokeWidth), outline: ratio(getComputedStyle(outline).stroke, backdrop), progress: ratio(getComputedStyle(base).fill, getComputedStyle(fill).fill),
                guide: ratio(getComputedStyle(guide).color, backdrop), guideOpacity: getComputedStyle(guide).opacity };
        });
        expect(contrast).not.toBeNull();
        expect(contrast!.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(contrast!.outline).toBeGreaterThanOrEqual(3);
        expect(contrast!.progress).toBeGreaterThanOrEqual(2);
        if (mode === 'dark') {
            expect(contrast!.guide).toBeGreaterThanOrEqual(3);
            expect(contrast!.guideOpacity).toBe('1');
        }
    }
    await expect(page.locator('.milestone-annotations')).toHaveCSS('height', '36px');
    await page.locator('.roadmap-workspace').screenshot({ path: testInfo.outputPath('milestone-contrast.png') });
});
