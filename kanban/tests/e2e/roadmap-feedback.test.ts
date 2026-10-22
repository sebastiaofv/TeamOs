import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';

test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'feedback', title: 'Feedback', hasHandle: true,
        tasks: [{ id: 1, title: 'Done', status: 'done', phaseId: 'p0' }, { id: 2, title: 'Open', status: 'doing', phaseId: 'p0' }],
        extensions: { roadmap: { version: 3, milestones: [{ id: 'm', title: 'Release', dueDate: '2027-01-01' }], sprints: [],
            phases: Array.from({ length: 35 }, (_, i) => ({ id: `p${i}`, title: `Phase ${i}`, startDate: '2026-10-01', endDate: '2027-04-30' })) } }
    }], { selectedBoardId: 'feedback' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
});

test('timeline and milestone identification remain fixed and opaque while phases scroll', async ({ page }) => {
    const header = page.locator('.roadmap-axis-shell');
    const milestone = page.locator('.milestone-annotation');
    const before = await header.boundingBox();
    const milestoneBefore = await milestone.boundingBox();
    await page.locator('#portfolioRoadmapView').evaluate((element) => { element.scrollTop = 250; });
    await expect.poll(() => page.locator('#portfolioRoadmapView').evaluate((element) => element.scrollTop)).toBe(250);
    await expect.poll(async () => (await header.boundingBox())!.y).toBeCloseTo(before!.y, 0);
    expect((await milestone.boundingBox())!.y).toBeCloseTo(milestoneBefore!.y, 0);
    const hit = await header.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.right - 40, rect.top + 30));
    });
    expect(hit).toBe(true);
});

test('phase deletion selects a destination before a single confirmation and can cancel safely', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete Phase 0', exact: true }).click();
    const message = page.locator('#appMessageModal');
    await expect(message).toContainText('#1 · Done');
    const destination = message.getByRole('combobox');
    await expect(destination).toHaveValue('0');
    await expect(destination.locator('option')).toHaveCount(35);
    await destination.selectOption({ label: 'Phase 1' });
    await message.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await readSavedBoard(page, 'feedback')).extensions.roadmap.phases).toHaveLength(35);
    await page.getByRole('button', { name: 'Delete Phase 0', exact: true }).click();
    await expect(destination).toHaveValue('0');
    await destination.selectOption({ label: 'Phase 1' });
    await message.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('#roadmap-row-phase-p0')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).board.tasks.map((task: { phaseId: string }) => task.phaseId)).toEqual(['p1', 'p1']);
});

test('axis uses separate years and denser dates, and phase colours survive editing and saving', async ({ page }) => {
    await expect(page.locator('.roadmap-axis-year')).toHaveText(['2026', '2027']);
    expect(await page.locator('.roadmap-axis-tick').count()).toBeGreaterThan(5);
    const initialTicks = await page.locator('.roadmap-axis-tick').count();
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('2');
    await expect.poll(() => page.locator('.roadmap-axis-tick').count()).toBeGreaterThan(initialTicks);
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('1');
    await expect(page.locator('.roadmap-year-guide')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit Phase 0', exact: true }).click();
    await page.getByRole('radio', { name: 'Purple', exact: true }).check();
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    const bar = page.locator('#roadmap-row-phase-p0 .roadmap-row-timeline-bar');
    await expect(bar).toHaveAttribute('data-progress', '50');
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'p0').color).toBe('#7c3aed');
    await expect(bar).toHaveCSS('--phase-color', '#7c3aed');
    await page.getByRole('button', { name: 'Edit Phase 0', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Purple', exact: true })).toBeChecked();
});

test('phase creation persists the chosen palette colour and default deletion clears only phase associations', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('New phase');
    await page.locator('#roadmapEntityStartDate').fill('2027-01-01');
    await page.locator('#roadmapEntityEndDate').fill('2027-01-31');
    await page.getByRole('radio', { name: 'Teal', exact: true }).check();
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'new-phase')?.color).toBe('#0f766e');
    await page.getByRole('button', { name: 'Delete Phase 0', exact: true }).click();
    await expect(page.locator('#appMessageSelection')).toHaveValue('0');
    await page.locator('#appMessageConfirmBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).board.tasks.map((task: { phaseId: string }) => task.phaseId)).toEqual(['', '']);
    const saved = await readSavedBoard(page, 'feedback');
    expect(saved.board.tasks.map((task: { status: string }) => task.status)).toEqual(['done', 'doing']);
});
