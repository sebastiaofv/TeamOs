import type { Page } from '@playwright/test';

export async function setDashboardDate(page: Page, label: string, value: string) {
    const summary = page.locator('.dashboard-range-field');
    await summary.click();
    await page.getByLabel(label, { exact: true }).fill(value);
    await summary.click();
}

export async function selectDashboardSnapshot(page: Page, value: string) {
    const summary = page.locator('.dashboard-range-field');
    await summary.click();
    await page.getByLabel('Snapshot', { exact: true }).selectOption(value);
    await summary.click();
}
