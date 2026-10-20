import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage } from '../support/portfolio';

async function seed(page: Page, writable = true) {
    const fixture = JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: writable, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
}
const area = (page: Page, key: string) => page.locator(`[data-roadmap-task-list="${key}"]`);
const ids = async (scope: ReturnType<typeof area>) => scope.locator('tbody tr[data-task-id]').evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-task-id'))).sort((a, b) => a - b));

test('compact phase/sprint rows share tables and execution progress; Today spans the complete expanded Gantt', async ({ page }) => {
    await seed(page);
    await expect(page.locator('.roadmap-section[data-roadmap-kind="milestones"]')).toHaveCount(0);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="milestone"]')).toHaveCount(0);
    await expect(page.locator('.milestone-annotation')).toHaveCount(3);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    await expect(page.locator('#roadmap-row-sprint-october .roadmap-bar-value')).toHaveText('25%');
    await expect(page.locator('#roadmap-row-phase-empty-phase .roadmap-bar-value')).toHaveText('N/A');
    const geometry = await page.locator('#roadmap-row-phase-api .roadmap-row-main').evaluate((row) => {
        const name = row.querySelector('.roadmap-row-title')!.getBoundingClientRect();
        const dates = row.querySelector('.roadmap-row-meta')!.getBoundingClientRect();
        const labels = row.querySelector('.roadmap-row-labels')!.getBoundingClientRect();
        const track = row.querySelector('.roadmap-row-track')!.getBoundingClientRect();
        return { height: row.getBoundingClientRect().height, centerDifference: Math.abs(name.y + name.height / 2 - dates.y - dates.height / 2), overlap: labels.right - track.left };
    });
    expect(geometry.height).toBeLessThanOrEqual(40); expect(geometry.centerDifference).toBeLessThan(2); expect(geometry.overlap).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    await expect(area(page, 'phase:delivery').locator('table.workitems-table')).toHaveCount(1);
    expect(await ids(area(page, 'phase:delivery'))).toEqual([501, 502, 504]);
    await expect(area(page, 'phase:delivery').locator('.portfolio-task-card, .roadmap-row-timeline-bar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show tasks for October execution', exact: true }).click();
    await page.locator('#portfolioRoadmapView').evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    expect(await ids(area(page, 'sprint:october'))).toEqual([501, 502, 506, 507]);
    const line = await page.locator('.roadmap-today-marker').boundingBox();
    const sprint = await page.locator('#roadmap-row-sprint-october').boundingBox();
    expect(line!.height).toBeGreaterThan(400); expect(line!.y + line!.height).toBeGreaterThanOrEqual(sprint!.y + sprint!.height);
});

test('phase-scoped sprint/milestone perspectives exclude other work and keep absent associations independent', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    const work = area(page, 'phase:delivery');
    await work.getByRole('button', { name: 'By sprint', exact: true }).click();
    expect(await ids(work.locator('[data-roadmap-group="october"]'))).toEqual([501, 502]);
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([504]);
    await page.getByLabel('Workitem archive visibility', { exact: true }).selectOption('all');
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([503, 504]);
    await work.getByRole('button', { name: 'By milestone', exact: true }).click();
    expect(await ids(work.locator('[data-roadmap-group="release"]'))).toEqual([501, 502, 503]);
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([504]);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    await page.getByRole('group', { name: 'Workitem completion filter', exact: true }).getByRole('button', { name: 'Completed', exact: true }).click();
    expect(await ids(work)).toEqual([501]);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    expect((await readSavedBoard(page, 'p')).extensions.timeline).toBeUndefined();
});

test('unclassified work remains accessible and detail navigation preserves zoom, width, selection and scroll', async ({ page }) => {
    await seed(page);
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('1.5');
    await page.getByLabel('Identification column width', { exact: true }).fill('500');
    await page.locator('.roadmap-unclassified').getByRole('button', { name: 'Show tasks', exact: true }).click();
    const work = page.locator('.roadmap-unclassified');
    expect(await ids(work)).toEqual([505, 506]);
    await work.getByRole('checkbox', { name: 'Select Release item without a phase', exact: true }).check();
    const trigger = work.getByRole('button', { name: 'Release item without a phase', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.locator('#portfolioRoadmapView').evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    await trigger.click();
    await expect(page.locator('#detailPhase')).toHaveText('-');
    await expect(page.locator('#detailMilestone')).toHaveText('Public release');
    await expect(page.locator('#detailSprint')).toHaveText('October execution');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(work.getByRole('checkbox', { name: 'Select Release item without a phase', exact: true })).toBeChecked();
    await expect(page.getByLabel('Timeline zoom', { exact: true })).toHaveValue('1.5');
    await expect(page.getByLabel('Identification column width', { exact: true })).toHaveValue('500');
    const after = await page.locator('#portfolioRoadmapView').evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    expect(Math.abs(after.top - before.top)).toBeLessThan(2); expect(Math.abs(after.left - before.left)).toBeLessThan(2);
});

test('milestone diamonds open the shared table modal and returning from a workitem preserves its context', async ({ page }) => {
    await seed(page);
    const trigger = page.locator('.milestone-annotation[data-roadmap-id="release"]');
    await trigger.click();
    const modal = page.locator('#milestoneWorkitemsModal');
    await expect(modal.getByRole('heading', { name: 'Public release', exact: true })).toBeVisible();
    await expect(modal.locator('.milestone-modal-heading')).toContainText('15/12/2026');
    await expect(modal.locator('.milestone-diamond')).toHaveText('25%');
    expect(await ids(modal)).toEqual([501, 502, 506]);
    await modal.getByLabel('Workitem archive visibility', { exact: true }).selectOption('all');
    expect(await ids(modal)).toEqual([501, 502, 503, 506]);
    await modal.getByRole('checkbox', { name: 'Select API contracts', exact: true }).check();
    await modal.getByRole('button', { name: 'API contracts', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('checkbox', { name: 'Select API contracts', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test('nearby milestones remain separately accessible, empty groups use N/A, and read-only does not expose mutations', async ({ page }) => {
    await seed(page, false);
    const release = await page.locator('.milestone-annotation[data-roadmap-id="release"] .milestone-diamond').boundingBox();
    const checkpoint = await page.locator('.milestone-annotation[data-roadmap-id="checkpoint"] .milestone-diamond').boundingBox();
    expect(Math.abs(release!.x + release!.width / 2 - checkpoint!.x - checkpoint!.width / 2)).toBeLessThan(1);
    expect(Math.abs(release!.y - checkpoint!.y)).toBeGreaterThan(40);
    await page.locator('.milestone-annotation[data-roadmap-id="checkpoint"]').click();
    const modal = page.locator('#milestoneWorkitemsModal');
    await expect(modal.locator('.milestone-diamond')).toHaveText('N/A');
    await expect(modal).toContainText('No tasks assigned');
    await expect(modal.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await expect(modal.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Add Phase', exact: true })).toBeDisabled();
});

test('parent-only phase moves save and structural confirmations identify archived and active affected workitems', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Edit Future work', exact: true }).click();
    await page.locator('#roadmapPhaseParent').selectOption('delivery');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'future').parentId).toBe('delivery');
    await page.getByRole('button', { name: 'Delete Interface', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('#503 · Archived research · Archived');
    await expect(page.locator('#appMessageModal')).toContainText('#504 · UI build');
    await answerAppMessage(page, { button: 'Cancel' });
    await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('Frontend detail'); await page.locator('#roadmapPhaseParent').selectOption('ui');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('#503 · Archived research · Archived');
    await answerAppMessage(page, { button: 'Frontend detail', expectText: '#504 · UI build' });
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.find((task: { id: number }) => task.id === 503).phaseId).toBe('frontend-detail');
    const data = await readSavedBoard(page, 'p');
    expect(data.board.tasks.find((task: { id: number }) => task.id === 503)).toMatchObject({ archived: true, milestoneId: 'release', status: 'to-do' });
    expect(data.board.tasks.find((task: { id: number }) => task.id === 507)).toMatchObject({ phaseId: 'future', sprintId: 'october', responsible: 'Bruno' });
});

test('clarified Roadmap stays readable in the existing light and dark themes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await seed(page);
    await page.getByRole('button', { name: 'Show tasks for API', exact: true }).click();
    await page.getByRole('button', { name: 'Show tasks for October execution', exact: true }).click();
    await page.locator('#portfolioRoadmapView').evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    await page.mouse.move(10, 10); await page.screenshot({ path: testInfo.outputPath('roadmap-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    const background = await page.locator('#roadmap-row-phase-delivery .roadmap-row-timeline-bar').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toBe('none');
    await page.locator('.milestone-annotation[data-roadmap-id="release"]').click();
    await expect(page.locator('#milestoneWorkitemsModal .workitems-table')).toBeVisible();
    await page.mouse.move(10, 10); await page.screenshot({ path: testInfo.outputPath('milestone-dark.png'), fullPage: true });
});
