import { setDashboardDate, selectDashboardSnapshot } from '../support/dashboard';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, mutateExternalBoardFile, triggerExternalFileCheck, toggleTheme, openProjectPicker } from '../support/portfolio';
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

for (const width of [1280, 390]) for (const tab of ['Overview', 'Sprint Analytics']) {
    test(`dashboard keeps date filters and removes recorded history in ${tab} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seed(page);
        await page.getByRole('button', { name: tab, exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Recorded history', exact: true })).toHaveCount(0);
        await page.locator('.dashboard-range-field').click();
        await expect(page.getByLabel('Start date', { exact: true })).toBeVisible();
        await expect(page.getByLabel('End date', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Planning scope', { exact: true })).toHaveCount(0);
        await page.locator('.dashboard-range-field').click();
        const sources = page.locator('#dashboardSources');
        await expect(sources).toHaveCount(0);
    });
}

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
    await expect(page.locator('[data-dashboard-statistics]')).toHaveCount(3);
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
    await openProjectPicker(page); await page.locator('#portfolioBoardsChips [data-board-id=""]').click();
    await expect(page.locator('[data-view-mode="dashboard"]')).toBeHidden();
    await expect(page.locator('#portfolioDashboard')).toBeHidden();
});

test('overview shows all active phases and read-only drilldowns retain project context', async ({ page }) => {
    await seed(page, false);
    for (const id of ['delivery']) await expect(page.locator(`[data-dashboard-planning="${id}"]`)).toBeVisible();
    await kpi(page, 'progress').click();
    await expect(sources(page).locator('tbody tr')).toHaveCount(6);
    await sources(page).getByRole('button', { name: 'Archived pending integration', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toContainText('Archived pending integration');
    await page.keyboard.press('Escape');
    await page.locator('[data-dashboard-planning="delivery"]').getByRole('button', { name: 'Delivery programme', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:delivery"]')).toBeVisible();
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(page.getByLabel('Planning scope', { exact: true })).toHaveCount(0);
    await page.locator('[data-dashboard-active-sprint="active"]').getByRole('button', { name: 'Sprint 2 - Implementation', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="sprint:active"]')).toBeVisible();
});

test('empty projects show unavailable progress and discreet empty widget messages', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'empty', title: 'Empty project', hasHandle: true, tasks: [] }], { selectedBoardId: 'empty' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('N/A');
    await expect(page.locator('[data-dashboard-section="activeSprint"]')).toContainText('No active sprint');
    await expect(page.locator('[data-dashboard-section="epics"]')).toContainText('No started Epics');
    await kpi(page, 'progress').click();
    await expect(sources(page)).toContainText('No source workitems');
});

test('external file reload refreshes metrics and clears stale source lists', async ({ page }) => {
    await seed(page);
    await kpi(page, 'progress').click();
    await expect(sources(page).locator('tbody tr')).toHaveCount(6);
    const changed = await readSavedBoard(page, 'p');
    changed.board.tasks.find((task: { id: number }) => task.id === 903).status = 'doing';
    await mutateExternalBoardFile(page, { boardId: 'p', payload: changed });
    await triggerExternalFileCheck(page);
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('16.7%');
    await expect(sources(page).locator('tbody tr')).toHaveCount(0);
    await kpi(page, 'progress').click();
    await expect(sources(page)).toContainText('Independent validated task');
    await expect(sources(page)).toContainText('Validated implementation');
});

test('historical period uses saved observations and historical drilldowns instead of current task status', async ({ page }) => {
    await seed(page);
    await setDashboardDate(page, 'Start date', '16/10/2026');
    await setDashboardDate(page, 'End date', '19/10/2026');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('16.7%');
    await setDashboardDate(page, 'Start date', '21/10/2026');
    await expect(page.getByRole('alert')).toContainText('The end date');
    await selectDashboardSnapshot(page, '0');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('16.7%');
    await expect(page.locator('.dashboard-context')).toContainText('Historical snapshot');
    await kpi(page, 'progress').click();
    const row = sources(page).locator('tr', { hasText: 'Validated implementation' });
    await expect(row).toContainText('In progress');
    await row.getByRole('button').click();
    await expect(page.locator('#taskDetailModal')).toContainText('In progress');
    await page.keyboard.press('Escape');
    await selectDashboardSnapshot(page, 'current');
    await expect(kpi(page, 'progress').locator('strong')).toHaveText('33.3%');
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Sprint 2 - Implementation', exact: true }).check();
    await selectDashboardSnapshot(page, '0');
    await expect(page.locator('.dashboard-scope-changes button')).toHaveCount(0);
    await selectDashboardSnapshot(page, '2');
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
    await toggleTheme(page);
    await expect(page.getByRole('button', { name: 'Visão global', exact: true })).toBeVisible();
    const progress = kpi(page, 'progress');
    await progress.focus();
    await page.keyboard.press('Enter');
    await expect(sources(page).getByRole('heading')).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({ path: 'test-results/dashboard-mobile-pt-dark.png', fullPage: true });
});
