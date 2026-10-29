import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, showTimeline, renameTaskViaEditor, setTimelineSlider, portfolioCard } from '../support/portfolio';

const settingsKey = 'teamOsAppSettings';

async function seedProject(page: Parameters<typeof seedPortfolioBoards>[0]) {
  await seedPortfolioBoards(page, [{
    id: 'settings', title: 'Settings project', hasHandle: true,
    tasks: [{ id: 1, title: 'Original task', status: 'backlog' }]
  }], { selectedBoardId: 'settings' });
}

test('timeline is hidden by default and its app setting persists both choices across reloads', async ({ page }) => {
  await gotoApp(page);
  await seedProject(page);
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);
  await expect(page.locator('#themeToggleBtn + #appSettingsBtn')).toBeVisible();

  await showTimeline(page);
  await expect(page.locator('#appSettingsBtn')).toBeFocused();
  await expect(page.locator('#portfolioTimelinePanel')).toBeVisible();
  await page.reload();
  await seedProject(page);
  await expect(page.locator('#portfolioTimelinePanel')).toBeVisible();

  await page.getByRole('button', { name: 'App settings', exact: true }).click();
  const setting = page.getByRole('checkbox', { name: 'Show timeline bar', exact: true });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);

  await page.reload();
  await seedProject(page);
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);
  await page.getByRole('button', { name: 'App settings', exact: true }).click();
  await expect(setting).not.toBeChecked();
});

test('hiding the timeline exits historical preview and returns to the current board', async ({ page }) => {
  await gotoApp(page);
  await seedProject(page);
  await renameTaskViaEditor(page, 'Original task', 'Current task');
  await showTimeline(page);
  await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
  await setTimelineSlider(page, 0);
  await expect(portfolioCard(page, 'Original task')).toBeVisible();

  await page.getByRole('button', { name: 'App settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show timeline bar', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(portfolioCard(page, 'Current task')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create workitem', exact: true })).toBeVisible();
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);
});

test('malformed saved settings fall back to a hidden timeline', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken'), settingsKey);
  await gotoApp(page);
  await seedProject(page);
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);
  await showTimeline(page);
  await expect(page.locator('#portfolioTimelinePanel')).toBeVisible();
});

test('settings remain usable when localStorage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage unavailable'); } });
  });
  await gotoApp(page);
  await seedProject(page);
  await expect(page.locator('#portfolioTimelinePanel')).toHaveCount(0);
  await showTimeline(page);
  await expect(page.locator('#portfolioTimelinePanel')).toBeVisible();
});
