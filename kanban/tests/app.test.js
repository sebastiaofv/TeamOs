const { test, expect } = require('@playwright/test');

function buildBoardPayload({ title, tasks = [] }) {
  return {
    meta: {
      schemaVersion: 1,
      appId: 'teamos-kanban',
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
      tasks: tasks.map((task, index) => ({
        id: task.id ?? index + 1,
        title: task.title,
        description: task.description || '',
        assignee: task.assignee || '',
        blocked: Boolean(task.blocked),
        blockerReason: task.blocked ? (task.blockerReason || '') : '',
        checklist: task.checklist || [],
        archived: Boolean(task.archived),
        createdAt: task.createdAt || '2026-02-26T00:00:00.000Z',
        updatedAt: task.updatedAt || '2026-02-26T00:00:00.000Z',
        ...(task.statusChangedAt ? { statusChangedAt: task.statusChangedAt } : {}),
        dueDate: task.dueDate || '',
        priority: Object.prototype.hasOwnProperty.call(task, 'priority') ? task.priority : null,
        effort: Object.prototype.hasOwnProperty.call(task, 'effort') ? task.effort : null,
        status: task.status || 'backlog'
      })),
      settings: {
        title,
        sortMode: 'manual',
        showArchivedOnly: false,
        archiveFilter: 'active'
      }
    },
    extensions: {}
  };
}

async function gotoApp(page) {
  await page.goto('/kanban.html');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('#boardView')).toHaveCount(0);
}

async function seedPortfolioBoards(page, boards, { selectedBoardId = '', sortKey = 'priority', sortDir = 'asc' } = {}) {
  await page.evaluate(({ boards, selectedBoardId, sortKey, sortDir }) => {
    window.__portfolioTestWrites = [];

    portfolioBoards = boards.map((board) => {
      const handle = board.hasHandle
        ? {
            name: board.fileName || `${board.id}.board.json`,
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
            schemaVersion: 1,
            appId: 'teamos-kanban',
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
            tasks: (board.tasks || []).map((task, index) => ({
              id: task.id ?? index + 1,
              title: task.title,
              description: task.description || '',
              assignee: task.assignee || '',
              blocked: Boolean(task.blocked),
              blockerReason: task.blocked ? (task.blockerReason || '') : '',
              checklist: task.checklist || [],
              archived: Boolean(task.archived),
              createdAt: task.createdAt || '2026-02-26T00:00:00.000Z',
              updatedAt: task.updatedAt || '2026-02-26T00:00:00.000Z',
              ...(task.statusChangedAt ? { statusChangedAt: task.statusChangedAt } : {}),
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

    selectedPortfolioBoardId = selectedBoardId || '';
    portfolioSortKey = sortKey;
    portfolioSortDir = sortDir;
    buildPortfolioTasks();
    renderPortfolio();
  }, { boards, selectedBoardId, sortKey, sortDir });
}

async function mockNewProjectFlow(page, { promptValue = 'New Project', fileName = 'new-project.board.json' } = {}) {
  await page.evaluate(({ promptValue, fileName }) => {
    window.__newProjectWrites = [];
    window.prompt = () => promptValue;
    window.showSaveFilePicker = async () => ({
      name: fileName,
      async createWritable() {
        return {
          async write(text) {
            window.__newProjectWrites.push(String(text));
          },
          async close() {}
        };
      }
    });
  }, { promptValue, fileName });
}

async function mockImportProjectsPicker(page, payloads) {
  await page.evaluate((payloads) => {
    window.showOpenFilePicker = async () => payloads.map((entry) => ({
      name: entry.fileName,
      async getFile() {
        return {
          name: entry.fileName,
          async text() {
            return JSON.stringify(entry.payload);
          }
        };
      }
    }));
  }, payloads);
}

function portfolioCard(page, title) {
  return page.locator('.portfolio-task-card').filter({ hasText: title }).first();
}

async function portfolioTitlesInColumn(page, status = 'backlog') {
  const titles = await page.locator(`#portfolio-${status}-column .portfolio-task-card .task-title`).allTextContents();
  return titles.map((t) => t.trim());
}

test.describe('portfolio-only app', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads portfolio-only minimalist UI', async ({ page }) => {
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toHaveCount(0);
    await expect(page.locator('#portfolioToggleBtn')).toHaveCount(0);
    await expect(page.locator('#newProjectBtn')).toBeVisible();
    await expect(page.locator('#importProjectsBtn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(page.locator('#portfolioDisplayMode-table')).toHaveCount(0);
    await expect(page.locator('#portfolioBoardWrap')).toBeVisible();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
  });

  test('new project flow creates and selects a project', async ({ page }) => {
    await mockNewProjectFlow(page, { promptValue: 'Project Alpha', fileName: 'project-alpha.board.json' });

    await page.locator('#newProjectBtn').click();

    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Alpha');
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toBeVisible();

    const result = await page.evaluate(() => ({
      projectCount: portfolioBoards.length,
      selectedProjectId: selectedPortfolioBoardId,
      selectedProjectTitle: portfolioBoards.find((p) => p.id === selectedPortfolioBoardId)?.title,
      writes: window.__newProjectWrites || []
    }));

    expect(result.projectCount).toBe(1);
    expect(result.selectedProjectTitle).toBe('Project Alpha');
    expect(result.writes.length).toBe(1);

    const saved = JSON.parse(result.writes[0]);
    expect(saved.board.settings.title).toBe('Project Alpha');
    expect(saved.board.tasks).toEqual([]);
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
        fileName: 'imported.board.json',
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

  test('import projects appends to current portfolio and projects can be removed from session', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'Task 1', status: 'backlog' }] }
    ]);

    await mockImportProjectsPicker(page, [
      {
        fileName: 'project-two.board.json',
        payload: buildBoardPayload({
          title: 'Project Two',
          tasks: [{ id: 2, title: 'Task 2', status: 'doing', priority: 'high', effort: 'S' }]
        })
      }
    ]);

    await page.locator('#importProjectsBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project One');
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project Two');
    await expect(portfolioCard(page, 'Task 1')).toBeVisible();
    await expect(portfolioCard(page, 'Task 2')).toBeVisible();

    await page.locator('.portfolio-chip').filter({ hasText: 'Project Two' }).getByRole('button', { name: 'Remove project' }).click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project One');
    await expect(page.locator('#portfolioBoardsChips')).not.toContainText('Project Two');
    await expect(portfolioCard(page, 'Task 2')).toHaveCount(0);

    const count = await page.evaluate(() => portfolioBoards.length);
    expect(count).toBe(1);
  });

  test('selected mutable project can create tasks directly from portfolio columns and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Portfolio-created task');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskEffort').selectOption('S');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(portfolioCard(page, 'Portfolio-created task')).toBeVisible();

    const result = await page.evaluate(() => ({
      taskTitles: portfolioBoards[0].data.board.tasks.map((t) => t.title),
      writes: (window.__portfolioTestWrites || []).map((w) => ({ boardId: w.boardId, text: w.text }))
    }));

    expect(result.taskTitles).toContain('Portfolio-created task');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('Portfolio-created task');
  });

  test('blocked tasks require a blocker reason before save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    await expect(page.locator('#taskModal')).toBeVisible();

    const result = await page.evaluate(() => ({
      alert: window.__lastAlert,
      taskCount: portfolioBoards[0].data.board.tasks.length
    }));

    expect(result.alert).toContain('Blocked tasks require a blocker reason');
    expect(result.taskCount).toBe(0);
  });

  test('assignee and blocked fields save and render as card badges', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Investigate deploy issue');
    await page.locator('#taskAssignee').fill('Alex');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskBlockerReason').fill('Waiting for staging access');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Investigate deploy issue');
    await expect(card).toContainText('Alex');
    await expect(card).toContainText('Blocked');

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((t) => t.title === 'Investigate deploy issue');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Investigate deploy issue');
      return {
        task: task ? { assignee: task.assignee, blocked: task.blocked, blockerReason: task.blockerReason } : null,
        savedTask: savedTask ? { assignee: savedTask.assignee, blocked: savedTask.blocked, blockerReason: savedTask.blockerReason } : null
      };
    });

    expect(result.task).toEqual({
      assignee: 'Alex',
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
    expect(result.savedTask).toEqual({
      assignee: 'Alex',
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
  });

  test('portfolio assignee and blocked filters work', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alex blocked', status: 'backlog', assignee: 'Alex', blocked: true, blockerReason: 'Vendor response' },
          { id: 2, title: 'Alex active', status: 'backlog', assignee: 'Alex', blocked: false },
          { id: 3, title: 'Sam active', status: 'backlog', assignee: 'Sam', blocked: false }
        ]
      }
    ], { selectedBoardId: 'p1' });

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

  test('task attachments save on the task and show in task details', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => editPortfolioTask('p1', 1));
    await expect(page.locator('#taskModal')).toBeVisible();

    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello attachment')
    });

    await expect(page.locator('#taskAttachmentsList')).toContainText('note.txt');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const saved = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      const payload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const attachments = payload?.board?.tasks?.find((t) => t.id === 1)?.attachments || [];
      return {
        writeCount: writes.length,
        attachmentCount: attachments.length,
        attachmentName: attachments[0]?.name,
        attachmentMime: attachments[0]?.mime,
        legacyAttachmentMapPresent: Boolean(payload?.extensions?.teamOsKanban?.taskAttachments)
      };
    });

    expect(saved.writeCount).toBeGreaterThan(0);
    expect(saved.attachmentCount).toBe(1);
    expect(saved.attachmentName).toBe('note.txt');
    expect(saved.attachmentMime).toBe('text/plain');
    expect(saved.legacyAttachmentMapPresent).toBe(false);

    await portfolioCard(page, 'Task with file').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailAttachments')).toContainText('note.txt');
    await expect(page.locator('#detailAttachments .detail-attachment-download')).toHaveCount(1);
  });

  test('all-projects view hides add-task cards and read-only selected project also hides them', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'm1', title: 'Mutable A', hasHandle: true, tasks: [] },
      { id: 'm2', title: 'Mutable B', hasHandle: true, tasks: [] }
    ], { selectedBoardId: '' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);

    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);
    await expect(page.locator('.portfolio-chip.active')).toContainText('Read Only (Read-only)');
    await expect(portfolioCard(page, 'RO Task').locator('button[title=\"Read-only (no file handle)\"]')).toHaveCount(2);
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

    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('L');
    await page.locator('#portfolioSearchInput').fill('beta');
    await page.evaluate(() => setPortfolioSort('score'));

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Beta target')).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('pp')).toBe('high');
    expect(url.searchParams.get('pe')).toBe('L');
    expect(url.searchParams.get('pq')).toBe('beta');
    expect(url.searchParams.get('ps')).toBe('score');
    expect(url.searchParams.get('view')).toBeNull();
  });

  test('keyboard shortcuts focus sort, reset filters, and cycle project chips', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'One task', status: 'backlog' }] },
      { id: 'p2', title: 'Project Two', hasHandle: true, tasks: [{ title: 'Two task', status: 'doing' }] }
    ], { selectedBoardId: '' });

    await page.locator('#portfolioSearchInput').fill('one');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.evaluate(() => setPortfolioSort('score'));
    await page.locator('body').click();

    await page.keyboard.press('s');
    await expect(page.locator('#portfolioSortSelect')).toBeFocused();

    await page.locator('body').click();
    await page.keyboard.press('r');
    await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('priority');

    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Two');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
  });

  test('portfolio score sort orders cards in board columns', async ({ page }) => {
    await seedPortfolioBoards(page, [
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
    ]);

    await page.evaluate(() => setPortfolioSort('score'));
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'Low XL',
      'Med M',
      'High S'
    ]);

    await page.evaluate(() => setPortfolioSort('score'));
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'High S',
      'Med M',
      'Low XL'
    ]);
  });

  test('card keyboard shortcuts support selection, move, open details, and edit/save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k1',
        title: 'Keyboard Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k1', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(1);

    const selectedBefore = page.locator('.portfolio-task-card.selected');
    await expect(selectedBefore).toContainText('Task A');

    await page.keyboard.press('3');
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card.selected')).toContainText('Task A');

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Task A Edited');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Task A Edited' })).toBeVisible();
  });

  test('dragging a task across portfolio columns updates status and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Drag Project',
        hasHandle: true,
        tasks: [
          {
            id: 11,
            title: 'Move me',
            status: 'backlog',
            priority: 'medium',
            effort: 'M',
            statusChangedAt: '2026-02-20T00:00:00.000Z'
          }
        ]
      }
    ], { selectedBoardId: 'd1' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);
    await expect(card.locator('.task-tag-age')).toContainText('Age');

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Move me' })).toBeVisible();
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' })).toHaveCount(0);

    const result = await page.evaluate(() => ({
      status: portfolioBoards[0].data.board.tasks.find((t) => t.id === 11)?.status,
      statusChangedAt: portfolioBoards[0].data.board.tasks.find((t) => t.id === 11)?.statusChangedAt,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.status).toBe('doing');
    expect(result.statusChangedAt).toBeTruthy();
    expect(result.statusChangedAt).not.toBe('2026-02-20T00:00:00.000Z');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"status": "doing"');
    expect(result.writes.at(-1).text).toContain('"statusChangedAt"');
  });

  test('dragging works in all-projects view for mutable cards', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a1',
        title: 'Alpha',
        hasHandle: true,
        tasks: [{ id: 21, title: 'Drag in all view', status: 'backlog', priority: 'low', effort: 'M' }]
      },
      {
        id: 'b1',
        title: 'Bravo',
        hasHandle: true,
        tasks: [{ id: 22, title: 'Other task', status: 'done', priority: 'medium', effort: 'S' }]
      }
    ], { selectedBoardId: '' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Drag in all view' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Drag in all view' })).toBeVisible();

    const result = await page.evaluate(() => ({
      alphaStatus: portfolioBoards.find((p) => p.id === 'a1')?.data.board.tasks.find((t) => t.id === 21)?.status,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.alphaStatus).toBe('doing');
    expect(result.writes.some((w) => w.boardId === 'a1')).toBe(true);
  });
});
