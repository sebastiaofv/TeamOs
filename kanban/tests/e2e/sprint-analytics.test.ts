import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme, readSavedBoard } from '../support/portfolio';
import { setDashboardDate } from '../support/dashboard';
import { sprintAnalyticsFixture } from '../support/sprintAnalytics';

async function seed(page: Page, count = 2) {
    await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'));
    await gotoApp(page);
    const data = sprintAnalyticsFixture(count);
    await seedPortfolioBoards(page, [{ id: 'analytics', title: 'Sprint Analytics', hasHandle: true, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'analytics' });
    await page.locator('[data-view-mode="dashboard"]').click();
}
const metric = (page: Page, key: string) => page.locator(`[data-sprint-summary="${key}"] strong`);

test('All Sprints uses frozen results independently of Overview dates, with a newest-first selector', async ({ page }) => {
    await seed(page);
    const before = await readSavedBoard(page, 'analytics');
    await setDashboardDate(page, 'Start date', '01/11/2026');
    await setDashboardDate(page, 'End date', '02/11/2026');
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await expect(page.locator('.dashboard-range-field')).toHaveCount(0);
    const selector = page.getByRole('combobox', { name: 'Sprint', exact: true });
    await expect(selector).toHaveValue('');
    await expect(selector.locator('option')).toHaveText(['All Sprints', 'Planned Sprint', 'Active Sprint', 'Sprint 2', 'Sprint 1']);
    await expect(metric(page, 'velocity')).toHaveText('12.5');
    await expect(metric(page, 'predictability')).toHaveText('75%');
    await expect(metric(page, 'utilization')).toHaveText('113%');
    await expect(metric(page, 'carryover')).toHaveText('2.5');
    await expect(page.locator('.sprint-over-capacity')).toHaveCount(1);
    await expect(page.locator('[data-sprint-trend]')).toHaveCount(4);
    expect(await page.locator('[data-sprint-trend="velocity"] [data-sprint-chart-point]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-sprint-chart-point')))).toEqual(['closed-1', 'closed-2']);
    await expect(page.locator('[data-average-velocity]')).toHaveAttribute('data-average-velocity', '12.5');
    await expect(page.locator('[data-sprint-excess]')).toHaveCount(1);
    const point = page.locator('[data-sprint-trend="capacity"] [data-sprint-chart-point="closed-1"]');
    await point.hover();
    await expect(page.locator('.sprint-chart-tooltip')).toContainText('Capacity SP 8, Planned SP 10, Utilization 125%');
    await point.focus();
    await expect(point).toBeFocused();
    await selector.selectOption('active');
    await expect(page.getByText('Individual Sprint analysis will be available', { exact: false })).toBeVisible();
    await expect(page.locator('[data-sprint-summary]')).toHaveCount(0);
    await selector.selectOption('');
    await expect(metric(page, 'velocity')).toHaveText('12.5');
    expect(await readSavedBoard(page, 'analytics')).toEqual(before);
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.dashboard-range-field')).toContainText('02/11/2026');
});

for (const width of [1840, 390]) for (const style of ['classic', 'modern']) for (const theme of ['light', 'dark']) {
    test(`analytics scrolls and keeps navigation visible at ${width}px (${style}, ${theme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(style => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
        await seed(page, 18);
        if (theme === 'dark') await toggleTheme(page);
        await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const chart = page.locator('.sprint-chart-scroll').first();
        expect(await chart.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await chart.focus();
        await page.keyboard.press('End');
        await page.locator('[data-sprint-trend="carryover"] [data-sprint-chart-point="closed-18"]').focus();
        await expect(page.locator('[data-sprint-trend="carryover"] .sprint-chart-tooltip')).toContainText('Sprint 18');
        await expect(page.getByRole('button', { name: 'Sprint Analytics', exact: true })).toBeInViewport();
        await expect(page.getByRole('combobox', { name: 'Sprint', exact: true })).toBeInViewport();
    });
}

test('empty analytics shows N/A and no invented chart values', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'empty', title: 'Empty', tasks: [] }], { selectedBoardId: 'empty' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await expect(page.locator('[data-sprint-summary] strong')).toHaveText(['N/A', 'N/A', 'N/A', 'N/A']);
    await expect(page.getByText('No completed Sprints yet.', { exact: true })).toHaveCount(4);
});


test('standalone analytics runs offline with frozen results and keyboard details', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.setOffline(true);
    await page.goto(new URL('../../dist-standalone/index.html', import.meta.url).href);
    const data = sprintAnalyticsFixture();
    await seedPortfolioBoards(page, [{ id: 'offline', title: 'Offline analytics', tasks: [], extensions: data.extensions }], { selectedBoardId: 'offline' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await expect(metric(page, 'velocity')).toHaveText('12.5');
    await page.locator('[data-sprint-trend="velocity"] [data-sprint-chart-point="closed-1"]').focus();
    await expect(page.locator('.sprint-chart-tooltip')).toContainText('Planned SP 10, Completed SP 5');
    expect(errors).toEqual([]);
});

test('Portuguese analytics translates metrics, selector and individual-Sprint message', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('teamOsKanbanLanguage', 'pt'));
    await seed(page);
    await page.getByRole('button', { name: 'Análise de sprints', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Velocidade média', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capacidade vs planeamento', exact: true })).toBeVisible();
    const selector = page.getByRole('combobox', { name: 'Sprint', exact: true });
    await expect(selector.locator('option').first()).toHaveText('Todos os sprints');
    await selector.selectOption('closed-1');
    await expect(page.getByText('A análise individual de sprints estará disponível', { exact: false })).toBeVisible();
});
