import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage, toggleLanguage, selectTableView, openTableSprintActions } from '../support/portfolio';

for (const language of ['en', 'pt'] as const) test(`Sprint date review shows independent dated choices beside each phase (${language})`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Phase review', hasHandle: true, tasks: [
        { id: 1, title: 'Story', type: 'story', status: 'to-do', phaseId: 'delivery', phaseMode: 'explicit' },
        { id: 2, title: 'Inherited Task', parentId: 1, status: 'to-do', phaseMode: 'inherit' },
        { id: 3, title: 'Another inherited Task', parentId: 1, status: 'to-do', phaseMode: 'inherit' },
        { id: 4, title: 'Independent Task', status: 'to-do', phaseId: 'support', phaseMode: 'explicit' }
    ], extensions: { roadmap: { version: 5, milestones: [], sprints: [], phases: [
        { id: 'delivery', title: 'Delivery with a longer phase name', startDate: '2026-11-10', endDate: '2026-11-20' },
        { id: 'support', title: 'Support', startDate: '2026-11-10', endDate: '2026-11-30' }
    ] } } }], { selectedBoardId: 'p' });
    if (language === 'pt') await toggleLanguage(page);
    await page.locator('[data-view-mode="table"]').click();
    await selectTableView(page, 'unplanned');
    for (const checkbox of await page.locator('#workitemsTable tbody input[type="checkbox"]').all()) await checkbox.check();
    await openTableSprintActions(page);
    await page.locator('#tableCreateSprint').click();
    await page.locator('#roadmapEntityTitle').fill('Delivery Sprint');
    await page.locator('#roadmapEntityStartDate').fill('05/11/2026');
    await page.locator('#roadmapEntityEndDate').fill('25/11/2026');
    await page.locator('#roadmapEntityModalSaveBtn').click();

    const review = page.getByRole('alertdialog');
    const delivery = review.getByRole('combobox', { name: 'Delivery with a longer phase name', exact: true });
    const support = review.getByRole('combobox', { name: 'Support', exact: true });
    await expect(review.getByRole('combobox')).toHaveCount(2);
    await expect(review.getByText('Delivery with a longer phase name', { exact: true })).toHaveCount(1);
    const current = language === 'pt' ? 'datas atuais' : 'current dates';
    const extended = language === 'pt' ? 'abranger o Sprint' : 'cover Sprint';
    await expect(delivery.locator('option')).toHaveText([
        `10/11/2026 – 20/11/2026 (${current})`, `05/11/2026 – 25/11/2026 (${extended})`
    ]);
    await expect(support.locator('option')).toHaveText([
        `10/11/2026 – 30/11/2026 (${current})`, `05/11/2026 – 30/11/2026 (${extended})`
    ]);
    await expect(delivery).toHaveValue('keep');
    await expect(support).toHaveValue('keep');
    const bounds = await review.boundingBox();
    expect(bounds!.width).toBeGreaterThan(750);
    const labelBounds = await review.getByText('Delivery with a longer phase name', { exact: true }).boundingBox();
    const selectBounds = await delivery.boundingBox();
    expect(selectBounds!.x).toBeGreaterThan(labelBounds!.x + labelBounds!.width);
    expect(Math.abs(selectBounds!.y + selectBounds!.height / 2 - labelBounds!.y - labelBounds!.height / 2)).toBeLessThan(3);
    await page.screenshot({ path: `/tmp/teamos54-phase-dates-${language}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(delivery).toBeVisible();
    expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/teamos54-phase-dates-${language}-mobile.png` });

    await delivery.selectOption('update');
    await answerAppMessage(page, { button: language === 'pt' ? 'Cancelar' : 'Cancel' });
    expect((await readSavedBoard(page, 'p')).extensions.roadmap.sprints).toHaveLength(0);
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();
    await page.locator('#roadmapEntityModalSaveBtn').click();
    await expect(delivery).toHaveValue('keep');
    await support.selectOption('update');
    await answerAppMessage(page, { button: language === 'pt' ? 'Confirmar' : 'Confirm' });
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.sprints.length).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.roadmap.phases.map((phase: { startDate: string; endDate: string }) => [phase.startDate, phase.endDate])).toEqual([
        ['2026-11-10', '2026-11-20'], ['2026-11-05', '2026-11-30']
    ]);
    expect(saved.board.tasks.every((task: { sprintId: string }) => task.sprintId === saved.extensions.roadmap.sprints[0].id)).toBe(true);
});
