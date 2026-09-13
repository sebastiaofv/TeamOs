'use strict';

const { test, expect } = require('@playwright/test');

// Pixel baselines for pieces being ported to React. They are captured against
// the legacy implementation first; a port must match them unchanged. Baselines
// are platform-specific (generated on macOS). Only update them deliberately
// (`npx playwright test tests/visual.test.js --update-snapshots`) and review the
// image diff in the commit.

const FIXED_TIME = '2026-02-26T12:00:00Z';

// Dialogs are opened with mouse clicks, never keys: Radix focuses the close
// button on open, and Chromium only paints a :focus-visible ring for that
// programmatic focus after keyboard input. Legacy never moved focus.
async function gotoVisualApp(page, theme) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript((value) => {
    window.localStorage.setItem('teamOsKanbanTheme', value);
  }, theme);
  await page.goto('/');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of ['light', 'dark']) {
  test(`shortcuts dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openShortcutsBtn').click();
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsList')).toContainText('Open keyboard shortcuts');
    await expect(page).toHaveScreenshot(`shortcuts-${theme}.png`, { fullPage: true });
  });

  test(`help dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openHelpBtn').click();
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect(page.locator('#helpModal')).toContainText('Drag cards between columns');
    await expect(page).toHaveScreenshot(`help-${theme}.png`, { fullPage: true });
  });
}

test('no dialog open after opening and closing one (light)', async ({ page }) => {
  await gotoVisualApp(page, 'light');
  await page.locator('#openShortcutsBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeVisible();
  await page.locator('#shortcutsModalFooterCloseBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeHidden();
  await page.evaluate(() => document.activeElement?.blur());
  await expect(page).toHaveScreenshot('no-dialog-light.png', { fullPage: true });
});
