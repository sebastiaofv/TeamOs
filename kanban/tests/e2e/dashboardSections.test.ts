import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard } from '../support/portfolio';
import { LANGUAGE_STORAGE_KEY } from '../../src/domain/constants';

const section = (page: Page, key: string) => page.locator(`[data-dashboard-section="${key}"]`);
async function seed(page: Page, writable = true) {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: writable, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByLabel('Start date', { exact: true }).fill('24/10/2026');
}

test('nine sections appear in the requested order; visibility affects entire sections and supports all/none', async ({ page }) => {
    await seed(page);
    const keys = ['projectOverview', 'activeSprint', 'projectStatistics', 'started', 'completedInPeriod', 'currentlyInProgress', 'openRisks', 'deliverables', 'decisions'];
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(9);
    expect(await page.locator('[data-dashboard-section]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-dashboard-section')))).toEqual(keys);
    const summary = page.locator('.dashboard-visible-sections summary');
    const start = page.getByLabel('Start date', { exact: true });
    expect((await summary.boundingBox())!.x).toBeLessThan((await start.boundingBox())!.x);
    await summary.click();
    const filter = page.locator('.dashboard-visible-sections');
    await expect(filter.getByRole('checkbox')).toHaveCount(9);
    await filter.getByRole('checkbox', { name: 'Project statistics', exact: true }).uncheck();
    await expect(section(page, 'projectStatistics')).toHaveCount(0);
    await expect(section(page, 'projectOverview')).toBeVisible();
    await filter.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(0);
    await filter.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(9);
    await expect(section(page, 'started').locator('tbody tr')).toHaveCount(2);
});

test('period activity uses category changes, independent Tasks and Stories, and end-date status/responsibility', async ({ page }) => {
    await seed(page);
    await page.getByLabel('End date', { exact: true }).fill('30/10/2026');
    const started = section(page, 'started');
    const completed = section(page, 'completedInPeriod');
    await expect(started.locator('tbody tr')).toHaveCount(2);
    await expect(started).toContainText('Story started then completed');
    await expect(started).toContainText('Independent task started');
    await expect(started.locator('tr', { hasText: 'Story started then completed' })).toContainText('Marta');
    await expect(started.locator('tr', { hasText: 'Independent task started' })).toContainText('Testing');
    await expect(completed.locator('tbody tr')).toHaveCount(2);
    await expect(completed).toContainText('Independent completed at end boundary');
    await expect(started).not.toContainText('Child task excluded');
    await expect(started).not.toContainText('Bug excluded');
    await expect(section(page, 'currentlyInProgress')).toContainText('Independent task started');
    await expect(section(page, 'currentlyInProgress')).not.toContainText('Story started then completed');
    await started.getByRole('button', { name: 'Independent task started', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toContainText('Testing');
    await page.keyboard.press('Escape');
    await page.getByLabel('Start date', { exact: true }).fill('26/10/2026');
    await expect(started.locator('tbody tr')).toHaveCount(0); // Doing → Testing stays in the same category.
    await page.getByLabel('End date', { exact: true }).fill('29/10/2026');
    await expect(completed.locator('tbody tr')).toHaveCount(0);
    await expect(section(page, 'currentlyInProgress')).toContainText('Story started then completed');
});

test('historical controls show risks and decisions still open at end date and deliveries in the period', async ({ page }) => {
    await seed(page);
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(1);
    await expect(section(page, 'decisions').locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'decisions').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'deliverables').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'deliverables')).toContainText('Accepted delivery in period');
    await expect(section(page, 'deliverables')).not.toContainText('Accepted before period');
    await expect(section(page, 'openRisks')).toContainText('High');
    for (const [key, title, status] of [['openRisks', 'Risk closed after period', 'Open'], ['deliverables', 'Accepted delivery in period', 'Accepted'], ['decisions', 'Decision resolved after period', 'Proposed']]) {
        await section(page, key).getByRole('button', { name: title, exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText(title);
        await expect(dialog.getByLabel('Status', { exact: true })).toHaveValue(status.toLowerCase());
        await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    }
    await page.getByLabel('Planning scope', { exact: true }).selectOption('api');
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(0);
    await expect(section(page, 'deliverables').locator('tbody tr')).toHaveCount(0);
    await expect(section(page, 'started').locator('tbody tr')).toHaveCount(0);
});

test('overview excludes child/future/completed phases and shares warning treatment with overdue milestones', async ({ page }) => {
    await seed(page);
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    const overview = section(page, 'projectOverview');
    await expect(overview).toContainText('Overdue parent phase');
    await expect(overview).toContainText('Delivery programme');
    for (const title of ['API delivery', 'UX delivery', 'Completed parent phase', 'Future parent phase']) await expect(overview).not.toContainText(title);
    await expect(overview.locator('[data-dashboard-planning="late"] .dashboard-warning')).toBeVisible();
    await expect(overview.locator('[data-dashboard-planning="late-milestone"] .dashboard-warning')).toBeVisible();
    await expect(overview).toContainText('Next unassigned checkpoint');
    await overview.getByRole('button', { name: 'Next unassigned checkpoint', exact: true }).click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Next unassigned checkpoint');
});

test('three accessible circular charts distinguish semantic categories and exclude child Tasks', async ({ page }) => {
    await seed(page);
    await page.getByLabel('Planning scope', { exact: true }).selectOption('ux');
    await expect(section(page, 'projectStatistics').getByRole('img')).toHaveCount(3);
    const tasks = page.locator('[data-dashboard-statistics="task"]');
    await expect(tasks.getByRole('img')).toHaveAccessibleName(/Independent Tasks: Completed 2, In progress 2, Pending 1/);
    await tasks.getByRole('button', { name: 'In progress 2 (40%)', exact: true }).click();
    await expect(page.locator('#dashboardSources tbody tr')).toHaveCount(2);
    await expect(page.locator('#dashboardSources')).not.toContainText('Child task excluded');
});

test('active sprint displays shared planning-unit completion, dates and navigation; absence is explicit', async ({ page }) => {
    await seed(page);
    const sprint = section(page, 'activeSprint');
    await expect(sprint).toContainText('Sprint 2 - Implementation');
    await expect(sprint).toContainText('15/10/2026');
    await expect(sprint).toContainText('05/11/2026');
    await expect(sprint).toContainText('0%'); // Story validation and independent Task are still open.
    await sprint.getByRole('button', { name: 'Sprint 2 - Implementation', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="sprint:active"]')).toBeVisible();
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByLabel('Planning scope', { exact: true }).selectOption('empty');
    await expect(sprint).toContainText('No active sprint at the selected end date.');
});

for (const theme of ['light', 'dark']) test(`Portuguese read-only sections remain usable at mobile width (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((key) => localStorage.setItem(key, 'pt'), LANGUAGE_STORAGE_KEY);
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    if (theme === 'dark') await page.locator('#themeToggleBtn').click();
    await expect(page.getByRole('heading', { name: 'Estatísticas do projeto', exact: true })).toBeVisible();
    await expect(section(page, 'decisions')).toContainText('Pending architecture decision');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await section(page, 'openRisks').getByRole('button', { name: 'Open high risk', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Open high risk');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `test-results/dashboard-sections-mobile-pt-${theme}.png`, fullPage: true });
});

test('consultation leaves the project file untouched', async ({ page }) => {
    await seed(page);
    const before = await readSavedBoard(page, 'sections');
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await section(page, 'openRisks').getByRole('button', { name: 'Risk closed after period', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('[data-dashboard-kpi="progress"]').click();
    await page.locator('#dashboardSources tbody button').first().click();
    await page.keyboard.press('Escape');
    expect(await readSavedBoard(page, 'sections')).toEqual(before);
});
