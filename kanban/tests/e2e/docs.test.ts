import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, toggleTheme, toggleLanguage } from '../support/portfolio';

const toggle = (page: Page) => page.locator('#docsToggleBtn');
const docs = (page: Page) => page.locator('#docsView');
const heading = (page: Page) => page.locator('#docsTopicTitle');
const toc = (page: Page) => docs(page).getByRole('navigation', { name: 'Contents' });

test.describe('in-app documentation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('the book button opens the documentation without projects and the app button returns', async ({ page }) => {
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Open documentation');
    await expect(toggle(page)).toHaveAttribute('title', 'Open documentation');
    await expect(toggle(page)).toHaveText('');

    await toggle(page).click();
    await expect(docs(page)).toBeVisible();
    await expect(page.locator('#portfolioView')).toBeHidden();
    await expect(page.locator('.header')).toBeVisible();
    await expect(heading(page)).toHaveText('What TeamOS is');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Back to the app');
    await expect(toggle(page)).toHaveAttribute('title', 'Back to the app');
    await expect(toggle(page)).toBeFocused();

    await toggle(page).click();
    await expect(docs(page)).toBeHidden();
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Open documentation');
  });

  test('returning restores the selected project, view and in-view state', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [{ id: 1, title: 'Alpha story', status: 'to-do', type: 'story' }] }], { selectedBoardId: 'alpha' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Functional', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const url = page.url();

    await toggle(page).click();
    await expect(docs(page)).toBeVisible();
    await expect(page).toHaveURL(url);
    await toggle(page).click();

    await expect(page.locator('.header-project-picker')).toContainText('Alpha');
    await expect(page.getByRole('button', { name: 'Functional', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(url);

    await page.getByRole('button', { name: 'Table', exact: true }).click();
    const table = page.getByRole('region', { name: 'Workitems · Alpha' });
    await expect(table).toContainText('Alpha story');
    await toggle(page).click();
    await toggle(page).click();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(table).toContainText('Alpha story');
  });

  test('contents mark the active topic and links, pager and related topics navigate', async ({ page }) => {
    await toggle(page).click();
    const current = toc(page).locator('[aria-current="page"]');
    await expect(current).toHaveText('What TeamOS is');

    await toc(page).getByRole('link', { name: 'Sprints', exact: true }).click();
    await expect(heading(page)).toHaveText('Sprints');
    await expect(heading(page)).toBeFocused();
    await expect(current).toHaveText('Sprints');

    await docs(page).getByRole('navigation', { name: 'Topic navigation' }).getByRole('link', { name: /Next/ }).click();
    await expect(heading(page)).toHaveText('Planning inheritance');

    await docs(page).getByRole('navigation', { name: 'Topic navigation' }).getByRole('link', { name: /Previous/ }).click();
    await expect(heading(page)).toHaveText('Sprints');

    await toc(page).getByRole('link', { name: 'Roadmap, phases and milestones' }).click();
    await docs(page).locator('.docs-body').getByRole('link', { name: 'Sprints', exact: true }).click();
    await expect(heading(page)).toHaveText('Sprints');
    await expect(heading(page)).toBeFocused();

    await docs(page).locator('.docs-related').getByRole('link', { name: /Sprint planning/ }).click();
    await expect(heading(page)).toHaveText('Sprint planning');
    await expect(docs(page).locator('.docs-callout-rule')).toContainText('App rule');
    await toc(page).getByRole('link', { name: 'Iterative and incremental work' }).click();
    await expect(docs(page).locator('.docs-callout-method')).toContainText('Agile practice');
  });

  test('the documentation reopens on the last topic read', async ({ page }) => {
    await toggle(page).click();
    await toc(page).getByRole('link', { name: 'Day Planner', exact: true }).click();
    await toggle(page).click();
    await toggle(page).click();
    await expect(heading(page)).toHaveText('Day Planner');
  });

  test('search filters the contents', async ({ page }) => {
    await toggle(page).click();
    await docs(page).getByRole('searchbox', { name: 'Search the documentation' }).fill('functional acceptance');
    await expect(toc(page).getByRole('link', { name: 'Acceptance criteria and functional acceptance' })).toBeVisible();
    await expect(toc(page).getByRole('link', { name: 'Theme, language and app settings' })).toHaveCount(0);

    await docs(page).getByRole('searchbox', { name: 'Search the documentation' }).fill('qwertyuiop');
    await expect(docs(page)).toContainText('No topics match "qwertyuiop".');
  });

  test('covers the methodology and an end-to-end example', async ({ page }) => {
    await toggle(page).click();
    for (const title of ['Agile methodology in TeamOS', 'Workitems and organising work', 'Complete example and FAQ']) {
      await expect(toc(page)).toContainText(title);
    }
    await toc(page).getByRole('link', { name: 'End-to-end example' }).click();
    await expect(docs(page)).toContainText('execution is complete, but the Story is not accepted yet');
    await toc(page).getByRole('link', { name: 'Keyboard shortcuts' }).click();
    await expect(docs(page)).toContainText('Open or close the documentation');
  });

  test('H toggles the documentation and moves focus to the shown area', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(docs(page)).toBeVisible();
    await expect(heading(page)).toBeFocused();
    // Workspace-only shortcuts do not act on the hidden workspace.
    await page.keyboard.press('p');
    await expect(docs(page)).toBeVisible();
    await page.keyboard.press('h');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#portfolioMain')).toBeFocused();
  });

  test('the palette offers help for the current view', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'alpha' });
    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('help for the current view');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('Roadmap, phases and milestones');
  });

  test('the toggle works by keyboard and the documentation follows the language', async ({ page }) => {
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(docs(page)).toBeVisible();
    await toggleLanguage(page);
    await expect(heading(page)).toHaveText('O que é o TeamOS');
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Voltar à aplicação');
    await expect(docs(page).getByRole('navigation', { name: 'Índice' })).toContainText('Metodologia Agile no TeamOS');
    await toggleLanguage(page);
  });

  test('uses the dark theme tokens', async ({ page }) => {
    await toggleTheme(page);
    await toggle(page).click();
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      sidebar: getComputedStyle(document.querySelector('.docs-sidebar')!).backgroundColor,
      title: getComputedStyle(document.querySelector('#docsTopicTitle')!).color
    }));
    expect(colors.sidebar).toBe('rgb(37, 40, 45)');
    expect(colors.title).toBe('rgb(241, 243, 245)');
  });
});

test.describe('in-app documentation on a small screen', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('contents collapse behind a disclosure button and the page does not scroll sideways', async ({ page }) => {
    await gotoApp(page);
    await toggle(page).click();
    const contents = docs(page).locator('.docs-contents-toggle');
    await expect(contents).toBeVisible();
    await expect(contents).toHaveAttribute('aria-expanded', 'false');
    await expect(toc(page).getByRole('link', { name: 'Sprints', exact: true })).toBeHidden();

    await contents.click();
    await expect(contents).toHaveAttribute('aria-expanded', 'true');
    await toc(page).getByRole('link', { name: 'Choosing a view', exact: true }).click();
    await expect(heading(page)).toHaveText('Choosing a view');
    await expect(contents).toHaveAttribute('aria-expanded', 'false');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
