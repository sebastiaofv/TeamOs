const { test, expect } = require('@playwright/test');

async function gotoApp(page) {
  await page.goto('/kanban.html');
  await expect(page.locator('#boardView')).toBeVisible();
  await expect(page.locator('.column').first()).toBeVisible();
}

async function openNewTaskModal(page, columnIndex = 0) {
  await page.locator('.add-task-card').nth(columnIndex).click();
  await expect(page.locator('#taskModal')).toBeVisible();
}

async function createTask(page, { title, priority, effort, dueDate = '', checklist = '', columnIndex = 0 }) {
  await openNewTaskModal(page, columnIndex);
  await page.locator('#taskName').fill(title);
  if (checklist) {
    await page.locator('#taskChecklist').fill(checklist);
  }
  if (dueDate) {
    await page.locator('#taskDueDate').fill(dueDate);
  }
  await page.locator('#taskPriority').selectOption(priority);
  await page.locator('#taskEffort').selectOption(effort);
  await page.locator('#taskModal .btn-primary').click();
  await expect(page.locator('#taskModal')).toBeHidden();
}

function taskCard(page, title) {
  return page.locator('.task-card').filter({ hasText: title }).first();
}

async function taskTitlesInColumn(page, status = 'todo') {
  const titles = await page.locator(`#${status}Column .task-card .task-title`).allTextContents();
  return titles.map((text) => text.trim());
}

async function seedPortfolioRows(page, rows) {
  const boards = Array.from(
    new Map(
      rows.map((row) => [
        row.boardId,
        {
          id: row.boardId,
          title: row.boardTitle,
          fileName: row.boardFileName || `${row.boardId}.board.json`,
          handle: null
        }
      ])
    ).values()
  );

  await page.evaluate(({ boards, rows }) => {
    portfolioBoards = boards;
    portfolioTasks = rows.map((row, index) => ({
      boardIndex: 0,
      taskIndex: index,
      boardId: row.boardId,
      boardTitle: row.boardTitle,
      boardFileName: row.boardFileName,
      columnTitle: row.columnTitle,
      task: {
        id: row.task.id,
        title: row.task.title,
        description: '',
        checklist: [],
        archived: Boolean(row.task.archived),
        createdAt: row.task.createdAt || '2026-02-25T00:00:00.000Z',
        updatedAt: row.task.updatedAt || '2026-02-25T00:00:00.000Z',
        dueDate: row.task.dueDate || '',
        priority: row.task.priority,
        effort: row.task.effort,
        status: row.task.status || 'todo'
      }
    }));
    selectedPortfolioBoardId = '';
    portfolioSortKey = 'priority';
    portfolioSortDir = 'asc';
    setAppMode('portfolio');
    renderPortfolio();
  }, { boards, rows });
}

async function portfolioTaskColumnTexts(page) {
  const texts = await page.locator('#portfolioTableBody tr td:nth-child(2)').allTextContents();
  return texts.map((text) => text.trim());
}

test.describe('kanban app', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads core board UI', async ({ page }) => {
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#portfolioToggleBtn')).toBeVisible();
    await expect(page.locator('#saveStatus')).toHaveText('Saved');
    await expect(page.locator('.add-task-card').first()).toBeVisible();
  });

  test('task modal reflects current model and creates card with score badge', async ({ page }) => {
    await openNewTaskModal(page);

    await expect(page.locator('#taskName')).toBeVisible();
    await expect(page.locator('#taskDueDate')).toBeVisible();
    await expect(page.locator('#taskPriority')).toBeVisible();
    await expect(page.locator('#taskEffort')).toBeVisible();
    await expect(page.locator('#taskTags')).toHaveCount(0);

    await page.locator('#taskName').fill('Playwright score test');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskEffort').selectOption('M');
    await page.locator('#taskModal .btn-primary').click();

    const card = taskCard(page, 'Playwright score test');
    await expect(card).toBeVisible();
    await expect(card.locator('.task-tag-score')).toHaveText('Score 1.00');
    await expect(card).not.toContainText('#');
  });

  test('editing effort updates the score badge value', async ({ page }) => {
    const title = 'Score update test';
    await createTask(page, { title, priority: 'high', effort: 'M' });

    const card = taskCard(page, title);
    await expect(card.locator('.task-tag-score')).toHaveText('Score 1.00');

    await card.locator('button[title="Edit"]').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskEffort').selectOption('XL');
    await page.locator('#taskModal .btn-primary').click();

    await expect(card.locator('.task-tag-score')).toHaveText('Score 0.38');
  });

  test('portfolio view exposes score column', async ({ page }) => {
    await page.locator('#portfolioToggleBtn').click();

    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toBeHidden();
    await expect(page.locator('#portfolioSortHeader-score')).toBeVisible();
    await expect(page.locator('#portfolioTableBody tr')).toHaveCount(1);
    await expect(page.locator('#portfolioTableBody')).toContainText('tasks.');
  });

  test('serialized board data omits tags keys', async ({ page }) => {
    await createTask(page, { title: 'Serialize no tags', priority: 'medium', effort: 'S' });

    const hasTagsKey = await page.evaluate(() => {
      const data = serializeBoardData();

      function walk(value) {
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) {
          return value.some(walk);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'tags')) {
          return true;
        }
        return Object.values(value).some(walk);
      }

      return walk(data);
    });

    expect(hasTagsKey).toBe(false);
  });

  test('board search filters by title only and highlights matches', async ({ page }) => {
    const title = 'Alpha Laundry Task';
    await createTask(page, { title, priority: 'medium', effort: 'S' });

    await page.evaluate((taskTitle) => {
      const task = tasks.find((t) => t.title === taskTitle);
      if (task) {
        task.tags = ['legacy-hidden-tag'];
      }
      renderTasks();
    }, title);

    await page.locator('#searchInput').fill('Alpha');
    await expect(taskCard(page, title)).toBeVisible();
    await expect(taskCard(page, title).locator('.search-highlight')).toContainText('Alpha');

    await page.locator('#searchInput').fill('legacy-hidden-tag');
    await expect(taskCard(page, title)).toHaveCount(0);
  });

  test('board priority and effort filters combine correctly', async ({ page }) => {
    await createTask(page, { title: 'High L task', priority: 'high', effort: 'L' });
    await createTask(page, { title: 'High XS task', priority: 'high', effort: 'XS' });
    await createTask(page, { title: 'Low L task', priority: 'low', effort: 'L' });

    await page.locator('#priorityFilter').selectOption('high');
    await page.locator('#effortFilter').selectOption('L');

    await expect(taskCard(page, 'High L task')).toBeVisible();
    await expect(taskCard(page, 'High XS task')).toHaveCount(0);
    await expect(taskCard(page, 'Low L task')).toHaveCount(0);
    await expect(page.locator('.task-card')).toHaveCount(1);
  });

  test('board sort by effort orders tasks from XS to XL', async ({ page }) => {
    await createTask(page, { title: 'Effort XL', priority: 'medium', effort: 'XL' });
    await createTask(page, { title: 'Effort XS', priority: 'medium', effort: 'XS' });
    await createTask(page, { title: 'Effort M', priority: 'medium', effort: 'M' });

    await page.locator('#boardSortSelect').selectOption('effort');

    await expect
      .poll(async () => (await taskTitlesInColumn(page, 'todo')).slice(0, 3))
      .toEqual(['Effort XS', 'Effort M', 'Effort XL']);
  });

  test('task details modal shows checklist and no tags row, and checklist toggle persists', async ({ page }) => {
    const title = 'Checklist detail test';
    await createTask(page, {
      title,
      priority: 'high',
      effort: 'S',
      dueDate: '2026-03-01',
      checklist: '[ ] First item\n[x] Second item'
    });

    await taskCard(page, title).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal .detail-label').filter({ hasText: 'Tags' })).toHaveCount(0);
    await expect(page.locator('#detailDueDate')).toHaveText('2026-03-01');
    await expect(page.locator('#detailChecklist .detail-checklist-item')).toHaveCount(2);
    await expect(page.locator('#detailChecklist .detail-checklist-item.done')).toHaveCount(1);

    await page.locator('#detailChecklist .detail-checklist-item input[type="checkbox"]').first().check();
    await expect(page.locator('#detailChecklist .detail-checklist-item.done')).toHaveCount(2);

    const checklistState = await page.evaluate((taskTitle) => {
      const task = tasks.find((t) => t.title === taskTitle);
      return task ? task.checklist.map((item) => ({ text: item.text, done: item.done })) : null;
    }, title);

    expect(checklistState).toEqual([
      { text: 'First item', done: true },
      { text: 'Second item', done: true }
    ]);
  });

  test('archive filter can show archived tasks and restore them', async ({ page }) => {
    const title = 'Archive restore test';
    await createTask(page, { title, priority: 'medium', effort: 'S' });

    await taskCard(page, title).locator('button[title="Archive"]').click();
    await expect(taskCard(page, title)).toHaveCount(0);
    await expect(page.locator('#undoToast')).toBeVisible();

    await page.locator('#boardArchiveFilter').selectOption('archived');
    await expect(taskCard(page, title)).toBeVisible();

    await taskCard(page, title).locator('button[title="Restore"]').click();
    await page.locator('#boardArchiveFilter').selectOption('active');
    await expect(taskCard(page, title)).toBeVisible();
  });

  test('undo restores archived task', async ({ page }) => {
    const title = 'Undo archive test';
    await createTask(page, { title, priority: 'low', effort: 'M' });

    await taskCard(page, title).locator('button[title="Archive"]').click();
    await expect(taskCard(page, title)).toHaveCount(0);
    await expect(page.locator('#undoToast')).toBeVisible();
    await expect(page.locator('#undoToastText')).toHaveText('Task archived');

    await page.locator('#undoToast .btn').click();
    await expect(page.locator('#undoToast')).toBeHidden();
    await expect(taskCard(page, title)).toBeVisible();
  });

  test('portfolio score sort toggles order and aria-sort', async ({ page }) => {
    await seedPortfolioRows(page, [
      {
        boardId: 'b1',
        boardTitle: 'Board A',
        boardFileName: 'a.board.json',
        columnTitle: 'To Do',
        task: { id: 1, title: 'Low XL', priority: 'low', effort: 'XL', updatedAt: '2026-02-25T10:00:00.000Z' }
      },
      {
        boardId: 'b1',
        boardTitle: 'Board A',
        boardFileName: 'a.board.json',
        columnTitle: 'To Do',
        task: { id: 2, title: 'High S', priority: 'high', effort: 'S', updatedAt: '2026-02-25T10:01:00.000Z' }
      },
      {
        boardId: 'b2',
        boardTitle: 'Board B',
        boardFileName: 'b.board.json',
        columnTitle: 'Done',
        task: { id: 3, title: 'High XS', priority: 'high', effort: 'XS', updatedAt: '2026-02-25T10:02:00.000Z' }
      }
    ]);

    await page.locator('#portfolioSortHeader-score button').click();
    await expect(page.locator('#portfolioSortHeader-score')).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(async () => (await portfolioTaskColumnTexts(page))[0]).toBe('Low XL');

    await page.locator('#portfolioSortHeader-score button').click();
    await expect(page.locator('#portfolioSortHeader-score')).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(async () => (await portfolioTaskColumnTexts(page))[0]).toBe('High XS');
  });

  test('portfolio filters and search reduce rows and update URL params', async ({ page }) => {
    await seedPortfolioRows(page, [
      {
        boardId: 'b1',
        boardTitle: 'Board A',
        boardFileName: 'a.board.json',
        columnTitle: 'To Do',
        task: { id: 1, title: 'Alpha item', priority: 'high', effort: 'S', updatedAt: '2026-02-25T10:00:00.000Z' }
      },
      {
        boardId: 'b1',
        boardTitle: 'Board A',
        boardFileName: 'a.board.json',
        columnTitle: 'To Do',
        task: { id: 2, title: 'Beta item', priority: 'high', effort: 'L', updatedAt: '2026-02-25T10:01:00.000Z' }
      },
      {
        boardId: 'b2',
        boardTitle: 'Board B',
        boardFileName: 'b.board.json',
        columnTitle: 'Done',
        task: { id: 3, title: 'Gamma item', priority: 'low', effort: 'S', updatedAt: '2026-02-25T10:02:00.000Z' }
      }
    ]);

    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('L');
    await page.locator('#portfolioSearchInput').fill('beta');
    await page.locator('#portfolioSortHeader-score button').click();

    await expect(page.locator('#portfolioTableBody tr')).toHaveCount(1);
    await expect(page.locator('#portfolioTableBody')).toContainText('Beta item');

    const url = new URL(page.url());
    expect(url.searchParams.get('view')).toBe('portfolio');
    expect(url.searchParams.get('pp')).toBe('high');
    expect(url.searchParams.get('pe')).toBe('L');
    expect(url.searchParams.get('pq')).toBe('beta');
    expect(url.searchParams.get('ps')).toBe('score');
  });

  test('board controls persist in URL and restore on reload', async ({ page }) => {
    await page.locator('#searchInput').fill('alpha');
    await page.locator('#priorityFilter').selectOption('high');
    await page.locator('#effortFilter').selectOption('S');
    await page.locator('#boardSortSelect').selectOption('effort');
    await page.locator('#boardArchiveFilter').selectOption('all');

    let url = new URL(page.url());
    expect(url.searchParams.get('q')).toBe('alpha');
    expect(url.searchParams.get('p')).toBe('high');
    expect(url.searchParams.get('e')).toBe('S');
    expect(url.searchParams.get('sort')).toBe('effort');
    expect(url.searchParams.get('archived')).toBe('all');

    await page.reload();
    await expect(page.locator('#boardView')).toBeVisible();
    await expect(page.locator('#searchInput')).toHaveValue('alpha');
    await expect(page.locator('#priorityFilter')).toHaveValue('high');
    await expect(page.locator('#effortFilter')).toHaveValue('S');
    await expect(page.locator('#boardSortSelect')).toHaveValue('effort');
    await expect(page.locator('#boardArchiveFilter')).toHaveValue('all');

    url = new URL(page.url());
    expect(url.searchParams.get('q')).toBe('alpha');
  });

  test('keyboard shortcuts focus search, open new task, and reopen selected task for edit', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.locator('#searchInput')).toBeFocused();

    await page.locator('body').click();
    await page.keyboard.press('n');
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskModal')).toBeHidden();

    const title = 'Shortcut edit test';
    await createTask(page, { title, priority: 'medium', effort: 'S' });
    await taskCard(page, title).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('Edit Task');
  });
});
