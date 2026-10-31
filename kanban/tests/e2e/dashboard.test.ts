import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, mutateExternalBoardFile, triggerExternalFileCheck } from '../support/portfolio';
import { LANGUAGE_STORAGE_KEY } from '../../src/domain/constants';

async function seed(page: Page, writable = true) {
    const data = JSON.parse(readFileSync('test-board/us-9.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'p', title: data.board.settings.title, hasHandle: writable, tasks: data.board.tasks, extensions: data.extensions },
        { id: 'other', title: 'Other project', hasHandle: true, tasks: [{ id: 903, title: 'Foreign workitem', status: 'done' }] }
    ], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="dashboard"]').click();
}
const kpi = (page: Page, key: string) => page.locator(`[data-dashboard-kpi="${key}"]`);
const sources = (page: Page) => page.locator('#dashboardSources');

test('selected-project metrics count archived leaves and open their exact sources without changing data', async ({ page }) => {
    await seed(page);
    const before = await readSavedBoard(page, 'p');
    await page.locator('[data-view-mode="board"]').click();
    await page.keyboard.press('j');
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.keyboard.press('x');
    await page.keyboard.press('4');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toHaveCount(0);
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('33.3%');
    await expect(kpi(page, 'blocked').locator('strong')).toHaveText('2');
    await expect(kpi(page, 'overdue').locator('strong')).toHaveText('2');
    await kpi(page, 'progress').focus();
    await page.keyboard.press('Enter');
    await expect(sources(page).locator('tbody tr')).toHaveCount(6);
    await expect(sources(page)).toContainText('Archived pending integration');
    await expect(sources(page)).not.toContainText('Foreign workitem');
    await expect(sources(page)).not.toContainText('Story awaiting functional validation');
    await sources(page).getByRole('button', { name: 'Validated implementation', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sources(page).locator('tbody tr')).toHaveCount(6);
    expect(await readSavedBoard(page, 'p')).toEqual(before);
    await expect(page).toHaveURL(/pv=dashboard/);
    await page.locator('#portfolioBoardsChips [data-board-id=""]').click();
    await expect(page.locator('[data-view-mode="dashboard"]')).toBeHidden();
    await expect(page.locator('#portfolioDashboard')).toBeHidden();
});

test('Gantt marks every overlapping phase; scope and read-only drilldowns retain context', async ({ page }) => {
    await seed(page, false);
    await expect(page.locator('[data-dashboard-planning] .dashboard-gantt-bar.current')).toHaveCount(3);
    await expect(page.locator('.dashboard-date-line').first()).toBeVisible();
    await page.getByLabel('Planning scope', { exact: true }).selectOption('api');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('50%');
    await page.locator('[data-dashboard-planning="api"] .dashboard-gantt-bar').click();
    await expect(sources(page).locator('tbody tr')).toHaveCount(4);
    await sources(page).getByRole('button', { name: 'Archived pending integration', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toContainText('Archived pending integration');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Planning scope', { exact: true })).toHaveValue('api');
    await page.locator('[data-dashboard-planning="api"]').getByRole('button', { name: 'Open in Roadmap', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:api"]')).toBeVisible();
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(page.getByLabel('Planning scope', { exact: true })).toHaveValue('api');
    await page.locator('[data-dashboard-planning="release"]').getByRole('button', { name: 'Open in Roadmap', exact: true }).click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Public release');
    await page.keyboard.press('Escape');
});

test('empty and cancelled-only scopes show unavailable denominators and missing dates', async ({ page }) => {
    await seed(page);
    for (const phase of ['empty', 'cancelled-only']) {
        await page.getByLabel('Planning scope', { exact: true }).selectOption(phase);
        await expect(kpi(page, 'progress').locator('strong')).toHaveText('N/A');
        await expect(kpi(page, 'overdue')).toBeDisabled();
    }
    await kpi(page, 'progress').click();
    await expect(sources(page)).toContainText('No source workitems');
    await page.getByLabel('Planning scope', { exact: true }).selectOption('empty');
    await expect(page.getByText('No workitems in this scope.', { exact: true }).first()).toBeVisible();
});

test('external file reload refreshes metrics and clears stale source lists', async ({ page }) => {
    await seed(page);
    await kpi(page, 'completed').click();
    await expect(sources(page).locator('tbody tr')).toHaveCount(2);
    const changed = await readSavedBoard(page, 'p');
    changed.board.tasks.find((task: { id: number }) => task.id === 903).status = 'doing';
    await mutateExternalBoardFile(page, { boardId: 'p', payload: changed });
    await triggerExternalFileCheck(page);
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('16.7%');
    await expect(sources(page).locator('tbody tr')).toHaveCount(0);
    await kpi(page, 'completed').click();
    await expect(sources(page)).toContainText('Independent validated task');
    await expect(sources(page)).not.toContainText('Validated implementation');
});

test('historical period uses saved observations and historical drilldowns instead of current task status', async ({ page }) => {
    await seed(page);
    await page.getByLabel('From (UTC)', { exact: true }).fill('2026-10-16');
    await page.getByLabel('To (UTC)', { exact: true }).fill('2026-10-19');
    await expect(page.getByText('No recorded observations in this period.', { exact: true })).toBeVisible();
    await page.getByLabel('From (UTC)', { exact: true }).fill('2026-10-21');
    await expect(page.getByRole('alert')).toContainText('The end date');
    await page.getByLabel('Snapshot', { exact: true }).selectOption('0');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('16.7%');
    await expect(page.locator('.dashboard-heading')).toContainText('Historical snapshot');
    await kpi(page, 'progress').click();
    const row = sources(page).locator('tr', { hasText: 'Validated implementation' });
    await expect(row).toContainText('In progress');
    await row.getByRole('button').click();
    await expect(page.locator('#taskDetailModal')).toContainText('In progress');
    await page.keyboard.press('Escape');
    await page.getByLabel('Snapshot', { exact: true }).selectOption('current');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('33.3%');
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Sprint 2 - Implementation', exact: true }).check();
    await page.getByLabel('Snapshot', { exact: true }).selectOption('0');
    await expect(page.locator('.dashboard-scope-changes button')).toHaveCount(0);
    await page.getByLabel('Snapshot', { exact: true }).selectOption('2');
    await expect(page.locator('.dashboard-scope-changes button')).toHaveCount(1);
});

test('sprint selection supports all, single and multiple, and uses recorded sources for scope changes', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'All Sprints', exact: true })).toBeChecked();
    await expect(page.locator('[data-dashboard-sprint]')).toHaveCount(3);
    await page.getByRole('checkbox', { name: 'Sprint 2 - Implementation', exact: true }).check();
    await expect(page.locator('[data-dashboard-sprint]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Recorded sprint scope changes', exact: true })).toBeVisible();
    await page.locator('.dashboard-scope-changes button').click();
    await expect(sources(page)).toContainText('Dependency blocked follow-up');
    await page.getByRole('checkbox', { name: 'Sprint 1 - Discovery', exact: true }).check();
    await expect(page.locator('[data-dashboard-sprint]')).toHaveCount(2);
    await expect(page.getByText('N/A — no sprint finalization records.', { exact: false })).toBeVisible();
    await page.getByRole('checkbox', { name: 'All Sprints', exact: true }).check();
    await expect(page.locator('[data-dashboard-sprint]')).toHaveCount(3);
});

test('Portuguese dark mobile dashboard stays within viewport and remains keyboard accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((key) => localStorage.setItem(key, 'pt'), LANGUAGE_STORAGE_KEY);
    await seed(page, false);
    await page.locator('#themeToggleBtn').click();
    await expect(page.getByRole('button', { name: 'Visão global', exact: true })).toBeVisible();
    const progress = kpi(page, 'progress');
    await progress.focus();
    await page.keyboard.press('Enter');
    await expect(sources(page).getByRole('heading')).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({ path: 'test-results/dashboard-mobile-pt-dark.png', fullPage: true });
});
