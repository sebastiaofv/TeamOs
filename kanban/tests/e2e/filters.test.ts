import { test, expect } from '@playwright/test';

import {
  gotoApp,
  seedPortfolioBoards,
  openFiltersPanel,
  setBoardSearch,
  portfolioCard,
  portfolioTitlesInColumn
} from '../support/portfolio';

test.describe('filters and sort', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('search highlights literal title text without changing escaped characters', async ({ page }) => {
    const title = 'R&D <amp> "quoted"';
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project', hasHandle: true, tasks: [{ id: 1, title, status: 'backlog' }] }
    ]);
    const renderedTitle = page.locator('#portfolioBoard .task-title');
    for (const term of ['&', 'amp', '<', '"']) {
      await setBoardSearch(page, term);
      await expect(renderedTitle).toHaveText(title);
      await expect(renderedTitle.locator('.search-highlight')).toHaveText(term === '"' ? ['"', '"'] : [term]);
    }
  });

  test('portfolio assignee and blocked filters work', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alex blocked', status: 'backlog', assignees: ['Alex', 'Sam'], blocked: true, blockerReason: 'Vendor response' },
          { id: 2, title: 'Alex active', status: 'backlog', assignees: ['Alex'], blocked: false },
          { id: 3, title: 'Sam active', status: 'backlog', assignees: ['Sam'], blocked: false }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await openFiltersPanel(page);
    await expect(page.locator('#portfolioAssigneeFilter')).toContainText('Alex');
    await expect(page.locator('#portfolioAssigneeFilter')).toContainText('Sam');

    await page.locator('#portfolioAssigneeFilter').selectOption('Alex');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex active', 'Alex blocked']);

    await page.locator('#portfolioAssigneeFilter').selectOption('');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex blocked']);

    await page.locator('#portfolioBlockedFilter').selectOption('unblocked');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex active', 'Sam active']);
  });

  test('portfolio filters and URL params persist in portfolio-only mode', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a',
        title: 'Alpha Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alpha low', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Beta target', status: 'backlog', priority: 'high', effort: 'L' }
        ]
      },
      {
        id: 'b',
        title: 'Bravo Project',
        hasHandle: true,
        tasks: [
          { id: 3, title: 'Gamma', status: 'doing', priority: 'high', effort: 'S' }
        ]
      }
    ]);

    await openFiltersPanel(page);
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('L');
    await setBoardSearch(page, 'beta');
    await page.locator('#portfolioSortSelect').selectOption('score');

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Beta target')).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('pp')).toBe('high');
    expect(url.searchParams.get('pe')).toBe('L');
    expect(url.searchParams.get('pq')).toBe('beta');
    expect(url.searchParams.get('ps')).toBe('score');
    expect(url.searchParams.get('view')).toBeNull();
  });

  test('portfolio controls stay synchronized across board rerenders', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'a', title: 'Alpha Project', hasHandle: true, tasks: [{ id: 1, title: 'Alpha task', status: 'backlog' }] },
      { id: 'b', title: 'Bravo Project', hasHandle: true, tasks: [{ id: 2, title: 'Bravo task', status: 'doing' }] }
    ]);

    await setBoardSearch(page, 'task');
    await openFiltersPanel(page);
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioBoardsChips .portfolio-chip').filter({ hasText: 'Bravo Project' }).getByRole('button', { name: /Bravo Project/ }).click();

    await expect(page.locator('#portfolioSearchBtn')).toContainText('task');
    await openFiltersPanel(page);
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('high');
    await expect(page.locator('#portfolioBoardsChips .portfolio-chip.active')).toContainText('Bravo Project');
    expect(new URL(page.url()).searchParams.get('pb')).toBeTruthy();
  });

  test('board cards follow filtered visible rows and preserve card metadata', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a',
        title: 'Alpha Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Alpha launch', status: 'backlog', tags: ['release'], priority: 'high', effort: 'L' }]
      },
      {
        id: 'b',
        title: 'Bravo Project',
        hasHandle: false,
        tasks: [{ id: 2, title: 'Bravo review', status: 'doing', tags: ['ops'], priority: 'medium', effort: 'M' }]
      }
    ]);

    await expect(page.locator('#portfolioBoard .portfolio-task-card')).toHaveCount(2);
    await expect(page.locator('#portfolioBoard .portfolio-project-badge')).toHaveCount(2);

    await setBoardSearch(page, 'Bravo');
    await expect(page.locator('#portfolioBoard .portfolio-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Bravo review')).toContainText('Bravo Project');
    await expect(portfolioCard(page, 'Bravo review').locator('[data-action="edit-task"]')).toBeDisabled();
  });

  test('panel Reset clears the panel filters but keeps the search text and sort', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'rf1',
        title: 'Reset Filters Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alpha low', status: 'backlog', priority: 'low', effort: 'L', assignees: ['Ana'] },
          { id: 2, title: 'Beta target', status: 'doing', priority: 'high', effort: 'S', assignees: ['Bruno'], blocked: true, blockerReason: 'Waiting on review' }
        ]
      }
    ]);

    await setBoardSearch(page, 'a');
    await page.locator('#portfolioSortSelect').selectOption('score');
    await openFiltersPanel(page);
    await page.locator('#portfolioArchiveFilter').selectOption('all');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    await page.locator('#portfolioAssigneeFilter').selectOption('Bruno');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('S');

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await page.locator('#resetPortfolioFiltersBtn').click();

    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioBlockedFilter')).toHaveValue('all');
    await expect(page.locator('#portfolioAssigneeFilter')).toHaveValue('');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSearchBtn')).toContainText('a');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('score');
    await expect(page.locator('.portfolio-task-card')).toHaveCount(2);

    const url = new URL(page.url());
    expect(url.searchParams.get('pq')).toBe('a');
    expect(url.searchParams.get('ps')).toBe('score');
    for (const key of ['pa', 'pbk', 'pu', 'pp', 'pe']) expect(url.searchParams.get(key)).toBeNull();
  });

  test('filters button shows how many filters are on and the tag row removes them', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'f1', title: 'Filter Project', hasHandle: true,
      tasks: [
        { id: 1, title: 'Blocked high', status: 'backlog', priority: 'high', blocked: true, blockerReason: 'Waiting' },
        { id: 2, title: 'Open low', status: 'backlog', priority: 'low' }
      ]
    }]);
    const button = page.locator('#portfolioFiltersBtn');
    const tags = page.locator('#portfolioActiveFilters');

    await setBoardSearch(page, 'high');
    await expect(button.locator('.portfolio-filters-badge')).toHaveCount(0);
    await expect(tags).toHaveCount(0);
    await setBoardSearch(page, '');

    await openFiltersPanel(page);
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    await expect(button.locator('.portfolio-filters-badge')).toHaveText('2');
    await expect(button).toHaveAttribute('aria-label', 'Filters, 2 active');
    await expect(page.locator('#portfolioFiltersPanel')).toContainText('2 filters on');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveClass(/changed/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#portfolioFiltersPanel')).toHaveCount(0);
    await expect(button).toBeFocused();

    await expect(tags.locator('.portfolio-active-filter')).toHaveText([/Blocked\s*Blocked Only/, /Priority\s*High/]);
    await tags.getByRole('button', { name: 'Remove filter Priority: High' }).click();
    await expect(button.locator('.portfolio-filters-badge')).toHaveText('1');
    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);

    await tags.getByRole('button', { name: 'Clear all' }).click();
    await expect(tags).toHaveCount(0);
    await expect(button.locator('.portfolio-filters-badge')).toHaveCount(0);
    await expect(page.locator('.portfolio-task-card')).toHaveCount(2);
  });

  test('filters panel closes on an outside click and with Done', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'f2', title: 'Close Project', hasHandle: true, tasks: [{ id: 1, title: 'Task', status: 'backlog' }] }]);
    await openFiltersPanel(page);
    await page.locator('#portfolioBoard').click({ position: { x: 20, y: 200 } });
    await expect(page.locator('#portfolioFiltersPanel')).toHaveCount(0);

    await openFiltersPanel(page);
    await page.locator('#portfolioFiltersPanel').getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#portfolioFiltersPanel')).toHaveCount(0);
    await expect(page.locator('#portfolioFiltersBtn')).toBeFocused();
  });

  test('keyboard shortcuts focus sort, reset filters, and cycle project chips', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'One task', status: 'backlog' }] },
      { id: 'p2', title: 'Project Two', hasHandle: true, tasks: [{ title: 'Two task', status: 'doing' }] }
    ], { selectedBoardId: '' });

    await setBoardSearch(page, 'one');
    await openFiltersPanel(page);
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioSortSelect').selectOption('score');
    await page.locator('body').click();

    await page.keyboard.press('s');
    await expect(page.locator('#portfolioSortSelect')).toBeFocused();

    await page.locator('body').click();
    await page.keyboard.press('r');
    await expect(page.locator('#portfolioSearchClearBtn')).toHaveCount(0);
    await openFiltersPanel(page);
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('priority');

    await page.keyboard.press('Escape');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Two');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
  });

  test('portfolio score sort orders cards in board columns', async ({ page }) => {
    const sortProject = [
      {
        id: 's1',
        title: 'Sort Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Low XL', status: 'backlog', priority: 'low', effort: 'XL' },
          { id: 2, title: 'High S', status: 'backlog', priority: 'high', effort: 'S' },
          { id: 3, title: 'Med M', status: 'backlog', priority: 'medium', effort: 'M' }
        ]
      }
    ];

    await seedPortfolioBoards(page, sortProject);
    await page.locator('#portfolioSortSelect').selectOption('score');
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'Low XL',
      'Med M',
      'High S'
    ]);

    // The sort select always sorts ascending; descending is only reachable
    // through the pd URL param, which the app applies on load.
    await page.goto('/?ps=score&pd=desc');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, sortProject);
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'High S',
      'Med M',
      'Low XL'
    ]);
  });
});
