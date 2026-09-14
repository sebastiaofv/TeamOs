import { test, expect } from '@playwright/test';

import {
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  portfolioCard,
  focusIsInside,
  closeDialogBy,
  portfolioProjectChipButtons,
  mockImportProjectsPicker
} from '../support/portfolio';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads portfolio-only minimalist UI', async ({ page }) => {
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toHaveCount(0);
    await expect(page.locator('.header-actions > #importProjectsBtn')).toBeVisible();
    await expect(page.locator('.header-actions > #newProjectBtn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(page.locator('#portfolioBoardWrap')).toBeVisible();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
  });

  test('top bar theme toggle switches and persists dark mode', async ({ page }) => {
    const root = page.locator('html');
    const toggle = page.locator('#themeToggleBtn');

    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    await expect(toggle.locator('.theme-toggle-icon-light')).toBeVisible();
    await expect(toggle.locator('.theme-toggle-icon-dark')).toBeHidden();

    await toggle.click();

    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(toggle.locator('.theme-toggle-icon-light')).toBeHidden();
    await expect(toggle.locator('.theme-toggle-icon-dark')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('teamOsKanbanTheme'))).toBe('dark');

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#themeToggleBtn')).toHaveAttribute('aria-label', 'Switch to light mode');

    await page.locator('#themeToggleBtn').click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#themeToggleBtn')).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(await page.evaluate(() => localStorage.getItem('teamOsKanbanTheme'))).toBe('light');
  });

  test('app shell does not create a page scrollbar on load', async ({ page }) => {
    const metrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight
    }));

    expect(metrics.docScrollHeight).toBe(metrics.viewportHeight);
    expect(metrics.bodyScrollHeight).toBe(metrics.viewportHeight);
  });

  test('selected project shows board roadmap calendar toggles and persists calendar mode', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'alpha' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page).toHaveURL(/pv=calendar/);
  });

  test('invalid selected board query resets roadmap mode and clears URL state', async ({ page }) => {
    await page.goto('/?pb=ghost&pv=roadmap');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'ghost' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toHaveCount(0);
    await expect(page.locator('#portfolioBoard')).toBeVisible();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('stale selected board query resets roadmap mode on empty startup portfolio', async ({ page }) => {
    await page.goto('/?pb=ghost&pv=roadmap');

    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#portfolioViewModeToggle')).toBeHidden();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
    await expect(portfolioProjectChipButtons(page)).toHaveCount(0);
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
  });

  test('help button opens and closes help modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect(page.locator('#helpModal')).toContainText('Drag cards between columns');

    await page.keyboard.press('Escape');
    await expect(page.locator('#helpModal')).toBeHidden();
  });

  test('keyboard shortcut opens shortcuts modal', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsModal')).toContainText('Import projects');
    await expect(page.locator('#shortcutsModal')).toContainText('Open keyboard shortcuts');

    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcutsModal')).toBeHidden();
  });

  test('keyboard shortcuts can open help and import projects', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeVisible();
    await page.keyboard.press('Escape');

    await mockImportProjectsPicker(page, [
      {
        fileName: 'imported.json',
        payload: buildBoardPayload({
          title: 'Imported Via Shortcut',
          tasks: [{ id: 1, title: 'Shortcut import task', status: 'backlog' }]
        })
      }
    ]);

    await page.keyboard.press('i');
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Imported Via Shortcut');
    await expect(portfolioCard(page, 'Shortcut import task')).toBeVisible();
  });

  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`help dialog takes focus and returns it to the Help button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openHelpBtn');
      await trigger.click();
      await expect(page.locator('#helpModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

      await closeDialogBy(page, 'helpModal', method);

      await expect(page.locator('#helpModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('help dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#helpModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`shortcuts dialog takes focus and returns it to the Shortcuts button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openShortcutsBtn');
      await trigger.click();
      await expect(page.locator('#shortcutsModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

      await closeDialogBy(page, 'shortcutsModal', method);

      await expect(page.locator('#shortcutsModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('shortcuts dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#shortcutsModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('shortcuts dialog groups entries into Global, Cards and Modals', async ({ page }) => {
    await page.locator('#openShortcutsBtn').click();
    const list = page.locator('#shortcutsList');

    await expect(list.locator('.shortcut-section-card-title')).toHaveText(['Global', 'Cards', 'Modals']);
    await expect(list.locator('.shortcut-section-title')).toHaveText(['Task Modal', 'Task Detail', 'Modal']);
    await expect(list.locator('.shortcut-row').filter({ hasText: 'Save task' }).locator('.shortcut-keys'))
      .toHaveText('Ctrl+Enter');
  });
});
