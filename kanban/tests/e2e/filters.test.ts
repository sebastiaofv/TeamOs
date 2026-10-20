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

  test('shares the new filter fields, options and selections across every project view', async ({ page }) => {
    const target = { status: 'doing', phaseId: 'build', milestoneId: 'launch', sprintId: 's1', dueDate: '2026-01-05' };
    await seedPortfolioBoards(page, [{
      id: 'shared', title: 'Shared filters', hasHandle: true,
      tasks: [
        { id: 1, title: 'Matching workitem', ...target },
        { id: 2, title: 'Other status', ...target, status: 'done' },
        { id: 3, title: 'Other phase', ...target, phaseId: 'design' },
        { id: 4, title: 'Other milestone', ...target, milestoneId: 'review' },
        { id: 5, title: 'Other sprint', ...target, sprintId: 's2' }
      ],
      extensions: { roadmap: {
        version: 1,
        phases: ['build', 'design'].map((id) => ({ id, title: id, startDate: '2026-01-01', endDate: '2026-01-30' })),
        milestones: ['launch', 'review'].map((id) => ({ id, title: id, dueDate: '2026-01-10' })),
        sprints: ['s1', 's2'].map((id) => ({ id, title: id, startDate: '2026-01-01', endDate: '2026-01-14' }))
      } }
    }], { selectedBoardId: 'shared' });

    await page.locator('[data-view-mode="table"]').click();
    await openFiltersPanel(page);
    await page.locator('#portfolioStatusesFilter').selectOption(['doing']);
    await page.locator('#portfolioPhaseFilter').selectOption('build');
    await page.locator('#portfolioMilestoneFilter').selectOption('launch');
    await page.locator('#portfolioSprintFilter').selectOption('s1');
    const params = new URL(page.url()).searchParams;
    expect(params.get('pst')).toBe('doing');
    expect(params.get('pph')).toBe('build');
    expect(params.get('pm')).toBe('launch');
    expect(params.get('psp')).toBe('s1');
    const fields = page.locator('#portfolioFiltersPanel select');
    const readFields = () => fields.evaluateAll((nodes) => nodes.map((node) => {
      const select = node as HTMLSelectElement;
      return {
        id: select.id, multiple: select.multiple,
        options: Array.from(select.options, (option) => [option.value, option.text]),
        selected: Array.from(select.selectedOptions, (option) => option.value)
      };
    }));
    const expected = await readFields();
    expect(expected).toHaveLength(10);
    await page.keyboard.press('Escape');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#workitemsTable tbody tr')).toContainText('Matching workitem');

    for (const view of ['board', 'roadmap', 'calendar', 'planner', 'table']) {
      await page.locator(`[data-view-mode="${view}"]`).click();
      await openFiltersPanel(page);
      expect(await readFields()).toEqual(expected);
      await expect(page.locator('#portfolioFiltersBtn .portfolio-filters-badge')).toHaveText('4');
      await page.keyboard.press('Escape');
      if (view === 'board') {
        await expect(page.locator('#portfolioBoard .task-title')).toHaveText(['Matching workitem']);
      } else if (view === 'roadmap') {
        await page.getByRole('button', { name: 'Show tasks for build', exact: true }).click();
        await expect(page.locator('#portfolioRoadmapView .workitems-table tbody [data-column="title"]')).toHaveText(['Matching workitem']);
      } else if (view === 'calendar') {
        await page.locator('[data-action="open-calendar-month"][data-month="0"]').click();
        await page.locator('[data-calendar-day="2026-01-05"] .portfolio-calendar-item-overflow').click();
        await expect(page.locator('#portfolioCalendarView [data-action="open-calendar-task"]')).toHaveCount(1);
        await expect(page.locator('#portfolioCalendarView [data-action="open-calendar-task"]')).toContainText('Matching workitem');
      } else if (view === 'planner') {
        await expect(page.locator('#portfolioPlannerView .planner-tray-card-title')).toHaveText(['Matching workitem']);
      }
    }

    await page.locator('#portfolioActiveFilters [data-filter="statuses"] button').click();
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
    await page.locator('#portfolioClearFilters').click();
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(5);
    await page.locator('[data-view-mode="board"]').click();
    await expect(page.locator('#portfolioBoard .task-title')).toHaveCount(5);
    await expect(page.locator('#portfolioFiltersBtn .portfolio-filters-badge')).toHaveCount(0);
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
