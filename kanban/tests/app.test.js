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
  await expect(page.locator('#taskName')).toBeFocused();
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

async function taskTitlesInColumn(page, status = 'backlog') {
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
        status: row.task.status || 'backlog'
      }
    }));
    selectedPortfolioBoardId = '';
    portfolioSortKey = 'priority';
    portfolioSortDir = 'asc';
    setAppMode('portfolio');
    renderPortfolio();
  }, { boards, rows });
}

async function seedPortfolioBoards(page, boards, { displayMode = 'board' } = {}) {
  await page.evaluate(({ boards, displayMode }) => {
    window.__portfolioTestWrites = [];

    portfolioBoards = boards.map((board, index) => {
      const handle = board.hasHandle
        ? {
            async createWritable() {
              return {
                async write(text) {
                  window.__portfolioTestWrites.push({ boardId: board.id, text: String(text) });
                },
                async close() {}
              };
            }
          }
        : null;

      return {
        id: board.id,
        handle,
        fileName: board.fileName || `${board.id}.board.json`,
        title: board.title,
        data: {
          meta: {
            schemaVersion: 4,
            appId: 'household-task-board',
            createdAt: '2026-02-26T00:00:00.000Z',
            updatedAt: '2026-02-26T00:00:00.000Z'
          },
          board: {
            columns: [
              { status: 'backlog', title: 'backlog' },
              { status: 'to-do', title: 'to-do' },
              { status: 'doing', title: 'in progress' },
              { status: 'done', title: 'done' }
            ],
            tasks: (board.tasks || []).map((task) => ({
              id: task.id,
              title: task.title,
              description: task.description || '',
              checklist: task.checklist || [],
              archived: Boolean(task.archived),
              createdAt: task.createdAt || '2026-02-26T00:00:00.000Z',
              updatedAt: task.updatedAt || '2026-02-26T00:00:00.000Z',
              dueDate: task.dueDate || '',
              priority: Object.prototype.hasOwnProperty.call(task, 'priority') ? task.priority : null,
              effort: Object.prototype.hasOwnProperty.call(task, 'effort') ? task.effort : null,
              status: task.status || 'backlog'
            })),
            settings: {
              title: board.title,
              sortMode: 'manual',
              showArchivedOnly: false,
              archiveFilter: 'active'
            }
          },
          extensions: {}
        }
      };
    });

    selectedPortfolioBoardId = '';
    portfolioSortKey = 'priority';
    portfolioSortDir = 'asc';
    portfolioDisplayMode = displayMode === 'board' ? 'board' : 'table';
    buildPortfolioTasks();
    setAppMode('portfolio');
    renderPortfolio();
  }, { boards, displayMode });
}

function portfolioBoardCard(page, title) {
  return page.locator('.portfolio-task-card').filter({ hasText: title }).first();
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
    await expect(page.getByRole('button', { name: 'Timeline' })).toHaveCount(0);
    await expect(page.locator('#timelineModal')).toHaveCount(0);
  });

  test('task modal reflects current model and creates card with score badge', async ({ page }) => {
    await openNewTaskModal(page);

    await expect(page.locator('#taskName')).toBeVisible();
    await expect(page.locator('#taskDueDate')).toBeVisible();
    await expect(page.locator('#taskPriority')).toBeVisible();
    await expect(page.locator('#taskEffort')).toBeVisible();
    await expect(page.locator('#taskTags')).toHaveCount(0);
    await expect(page.locator('#taskPriority')).toHaveValue('');
    await expect(page.locator('#taskEffort')).toHaveValue('');

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
    await expect(page.locator('#portfolioTableBody tr')).toHaveCount(0);
  });

  test('serialized board data omits tags keys and timeline extension', async ({ page }) => {
    await createTask(page, { title: 'Serialize no tags', priority: 'medium', effort: 'S' });

    const serializedChecks = await page.evaluate(() => {
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

      return {
        hasTagsKey: walk(data),
        hasExtensionsObject: Boolean(data.extensions && typeof data.extensions === 'object' && !Array.isArray(data.extensions)),
        hasTimelineExtension: Boolean(data.extensions && Object.prototype.hasOwnProperty.call(data.extensions, 'timeline'))
      };
    });

    expect(serializedChecks.hasTagsKey).toBe(false);
    expect(serializedChecks.hasExtensionsObject).toBe(true);
    expect(serializedChecks.hasTimelineExtension).toBe(false);
  });

  test('legacy board with timeline extension loads and timeline is dropped on serialize', async ({ page }) => {
    const result = await page.evaluate(() => {
      const legacy = {
        meta: {
          schemaVersion: 4,
          appId: 'household-task-board',
          createdAt: '2026-02-26T00:00:00.000Z',
          updatedAt: '2026-02-26T00:00:00.000Z'
        },
        board: {
          columns: [
            { status: 'backlog', title: 'backlog' },
            { status: 'to-do', title: 'to-do' },
            { status: 'doing', title: 'in progress' },
            { status: 'done', title: 'done' }
          ],
          tasks: [
            {
              id: 101,
              title: 'Legacy timeline task',
              description: '',
              checklist: [],
              archived: false,
              createdAt: '2026-02-26T00:00:00.000Z',
              updatedAt: '2026-02-26T00:00:00.000Z',
              dueDate: '',
              priority: null,
              effort: null,
              status: 'backlog'
            }
          ],
          settings: {
            title: 'Legacy Board',
            sortMode: 'manual',
            showArchivedOnly: false,
            archiveFilter: 'active'
          }
        },
        extensions: {
          timeline: {
            version: 1,
            nextId: 2,
            events: [
              { id: 1, ts: '2026-02-26T00:00:00.000Z', type: 'init', data: {} }
            ]
          }
        }
      };

      applyBoardData(legacy);
      renderBoard();
      renderTasks();
      const serialized = serializeBoardData();
      return {
        boardTitle,
        taskCount: tasks.length,
        hasTimelineExtension: Boolean(
          serialized.extensions && Object.prototype.hasOwnProperty.call(serialized.extensions, 'timeline')
        )
      };
    });

    expect(result.boardTitle).toBe('Legacy Board');
    expect(result.taskCount).toBe(1);
    expect(result.hasTimelineExtension).toBe(false);
    await expect(taskCard(page, 'Legacy timeline task')).toBeVisible();
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
      .poll(async () => (await taskTitlesInColumn(page, 'backlog')).slice(0, 3))
      .toEqual(['Effort XS', 'Effort M', 'Effort XL']);
  });

  test('board sort by score orders tasks by priority/effort', async ({ page }) => {
    await createTask(page, { title: 'Score low', priority: 'low', effort: 'XL' });   // 0.125
    await createTask(page, { title: 'Score mid', priority: 'medium', effort: 'M' }); // 0.667
    await createTask(page, { title: 'Score high', priority: 'high', effort: 'S' });  // 1.5

    await page.locator('#boardSortSelect').selectOption('score');

    await expect
      .poll(async () => (await taskTitlesInColumn(page, 'backlog')).slice(0, 3))
      .toEqual(['Score low', 'Score mid', 'Score high']);
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

  test('portfolio board cards can be clicked, edited and auto-save to source handle', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        fileName: 'project-one.board.json',
        hasHandle: true,
        tasks: [
          {
            id: 11,
            title: 'Portfolio editable task',
            description: 'Original description',
            priority: 'high',
            effort: 'S',
            status: 'backlog'
          }
        ]
      }
    ]);

    await expect(page.locator('#portfolioBoardWrap')).toBeVisible();
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card')).toHaveCount(1);

    const card = portfolioBoardCard(page, 'Portfolio editable task');
    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Portfolio editable task');
    await expect(page.locator('#detailDescription')).toHaveText('Original description');
    await page.locator('#taskDetailModal .btn').filter({ hasText: 'Close' }).click();

    await card.locator('button[title="Edit"]').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Portfolio edited title');
    await page.locator('#taskDescription').fill('Updated from portfolio board');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(portfolioBoardCard(page, 'Portfolio edited title')).toBeVisible();

    const result = await page.evaluate(() => {
      const sourceTask = portfolioBoards[0].data.board.tasks.find((t) => t.id === 11);
      return {
        title: sourceTask?.title,
        description: sourceTask?.description,
        writes: (window.__portfolioTestWrites || []).map((w) => ({ boardId: w.boardId, hasTimeline: w.text.includes('"timeline"'), text: w.text }))
      };
    });

    expect(result.title).toBe('Portfolio edited title');
    expect(result.description).toBe('Updated from portfolio board');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).boardId).toBe('p1');
    expect(result.writes.at(-1).hasTimeline).toBe(false);
    expect(result.writes.at(-1).text).toContain('Portfolio edited title');
  });

  test('portfolio board cards are not draggable', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'drag1',
        title: 'Drag Project',
        fileName: 'drag.board.json',
        hasHandle: true,
        tasks: [
          { id: 21, title: 'Move me', priority: 'medium', effort: 'M', status: 'backlog' }
        ]
      }
    ]);

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', false);
  });

  test('portfolio board cards without file handles are read-only but clickable', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'ro1',
        title: 'Read Only Project',
        fileName: 'readonly.board.json',
        hasHandle: false,
        tasks: [
          { id: 31, title: 'Read only task', description: 'Visible but not editable', status: 'backlog' }
        ]
      }
    ]);

    const card = portfolioBoardCard(page, 'Read only task');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Read-only');
    await expect(card.locator('button[title="Read-only (no file handle)"]')).toHaveCount(2);
    await expect(card).toHaveJSProperty('draggable', false);

    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Read only task');
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
