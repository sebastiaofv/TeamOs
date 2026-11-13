import { test, expect } from '@playwright/test';

import { buildBoardPayload, gotoApp, seedPortfolioBoards, portfolioCard, focusIsInside, closeDialogBy, expectProjectCount, mockImportProjectsPicker, toggleTheme, toggleLanguage } from '../support/portfolio';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads portfolio-only minimalist UI', async ({ page }) => {
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toHaveCount(0);
    await expect(page.locator('.header-actions > #importProjectsBtn')).toBeVisible();
    await expect(page.locator('.header-actions > #newProjectBtn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open documentation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help', exact: true })).toHaveCount(0);
    await expect(page.locator('#portfolioBoardWrap')).toBeVisible();
    await expect(page.locator('#portfolioEmptyState h2')).toHaveText('No projects loaded');
    await expect(page.locator('#portfolioToolbar, #portfolioBoardsChips')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Technical', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Functional', exact: true })).toHaveCount(0);
    await expect(page.getByText('All columns are hidden. Use Board columns to show them again.', { exact: true })).toHaveCount(0);
    await mockImportProjectsPicker(page, [{ fileName: 'welcome.board.json', payload: buildBoardPayload({ title: 'Welcome project', tasks: [] }) }]);
    await page.locator('#portfolioEmptyState').getByRole('button', { name: 'Import Projects', exact: true }).click();
    await page.locator('#projectPickerBtn').click();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Welcome project');
    await expect(page.locator('#portfolioEmptyState')).toHaveCount(0);
  });

  test('board controls appear on project load and disappear when the last project is removed', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'empty', title: 'Empty project', hasHandle: true, tasks: [] }], { selectedBoardId: 'empty' });
    await expect(page.getByRole('button', { name: 'Technical', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Functional', exact: true })).toBeVisible();
    await expect(page.locator('.portfolio-column')).toHaveCount(4);
    await page.locator('#projectPickerBtn').click();
    await page.getByRole('button', { name: 'Remove project', exact: true }).click();
    await expect(page.locator('#portfolioEmptyState h2')).toHaveText('No projects loaded');
    await expect(page.locator('.workitem-board-shell')).toHaveCount(0);
  });

  test('settings switch and persist mode and language', async ({ page }) => {
    await toggleTheme(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await toggleLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await expect(page.locator('#docsToggleBtn')).toHaveAttribute('aria-label', 'Abrir documentação');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await toggleTheme(page);
    await toggleLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
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
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toBeVisible();
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page).toHaveURL(/pv=calendar/);
  });

  test('invalid selected board query resets roadmap mode and clears URL state', async ({ page }) => {
    await page.goto('/?pb=ghost&pv=roadmap');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'ghost' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day Planner', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toBeVisible();
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
    await expect(page.locator('#portfolioEmptyState h2')).toHaveText('No projects loaded');
    await expectProjectCount(page, 0);
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
  });

  test('keyboard shortcut opens shortcuts modal', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsModal')).toContainText('Import projects');
    await expect(page.locator('#shortcutsModal')).toContainText('Open keyboard shortcuts');

    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcutsModal')).toBeHidden();
  });

  test('keyboard shortcuts can open documentation and import projects', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#docsView')).toBeVisible();
    await page.keyboard.press('h');
    await expect(page.locator('#portfolioView')).toBeVisible();

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
    await page.locator('#projectPickerBtn').click();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Imported Via Shortcut');
    await expect(portfolioCard(page, 'Shortcut import task')).toBeVisible();
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

  test('shortcuts dialog groups entries into Global, Cards, Day Planner and Modals', async ({ page }) => {
    await page.locator('#openShortcutsBtn').click();
    const list = page.locator('#shortcutsList');

    await expect(list.locator('.shortcut-section-card-title')).toHaveText(['Global', 'Cards', 'Day Planner', 'Modals']);
    await expect(list.locator('.shortcut-section-title'))
      .toHaveText(['Navigation', 'Planner blocks', 'Task Modal', 'Task Detail', 'Modal']);
    await expect(list.locator('.shortcut-row').filter({ hasText: 'Save task' }).locator('.shortcut-keys'))
      .toHaveText('Ctrl+Enter');
  });
});
