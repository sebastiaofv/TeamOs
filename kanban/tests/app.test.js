'use strict';

const { test, expect } = require('@playwright/test');

const FIXED_TIMESTAMP = '2026-02-26T00:00:00.000Z';
const BOARD_APP_ID = 'teamos-kanban';
const BOARD_SCHEMA_VERSION = 1;
const DEFAULT_COLUMNS = [
  { status: 'backlog', title: 'backlog' },
  { status: 'to-do', title: 'to-do' },
  { status: 'doing', title: 'in progress' },
  { status: 'done', title: 'done' }
];

function buildDefaultColumns() {
  return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

function buildTaskPayload(task, index) {
  const assignees = Array.isArray(task.assignees)
    ? task.assignees.filter((name) => typeof name === 'string' && name.trim())
    : (typeof task.assignee === 'string' && task.assignee.trim())
      ? [task.assignee.trim()]
      : [];
  return {
    id: task.id ?? index + 1,
    title: task.title,
    description: task.description || '',
    assignees,
    blocked: Boolean(task.blocked),
    blockerReason: task.blocked ? (task.blockerReason || '') : '',
    checklist: task.checklist || [],
    archived: Boolean(task.archived),
    createdAt: task.createdAt || FIXED_TIMESTAMP,
    updatedAt: task.updatedAt || FIXED_TIMESTAMP,
    dueDate: task.dueDate || '',
    priority: Object.hasOwn(task, 'priority') ? task.priority : null,
    effort: Object.hasOwn(task, 'effort') ? task.effort : null,
    phaseId: Object.hasOwn(task, 'phaseId') ? task.phaseId : undefined,
    milestoneId: Object.hasOwn(task, 'milestoneId') ? task.milestoneId : undefined,
    sprintId: Object.hasOwn(task, 'sprintId') ? task.sprintId : undefined,
    status: task.status || 'backlog'
  };
}

function buildBoardPayload({ title, tasks = [], extensions = {} }) {
  return {
    meta: {
      schemaVersion: BOARD_SCHEMA_VERSION,
      appId: BOARD_APP_ID,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP
    },
    board: {
      columns: buildDefaultColumns(),
      tasks: tasks.map(buildTaskPayload),
      settings: {
        title,
        sortMode: 'manual',
        showArchivedOnly: false,
        archiveFilter: 'active'
      }
    },
    extensions: JSON.parse(JSON.stringify(extensions))
  };
}

async function gotoApp(page) {
  await page.goto('/kanban.html');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('#boardView')).toHaveCount(0);
}

async function seedPortfolioBoards(
  page,
  boards,
  { selectedBoardId = '', sortKey = 'priority', sortDir = 'asc' } = {}
) {
  const seededBoards = boards.map((board) => ({
    id: board.id,
    hasHandle: Boolean(board.hasHandle),
    fileName: board.fileName || '',
      title: board.title,
      data: buildBoardPayload({
        title: board.title,
        tasks: board.tasks || [],
        extensions: board.extensions || {}
      })
    }));

  await page.evaluate(async ({ boards, selectedBoardId, sortKey, sortDir }) => {
    window.__portfolioTestWrites = [];
    window.__portfolioDiskByBoardId = {};

    portfolioBoards = boards.map((board) => {
      const boardData = board.data;

      const diskText = JSON.stringify(boardData, null, 2);
      window.__portfolioDiskByBoardId[board.id] = {
        text: diskText,
        lastModified: Date.now()
      };

      const handle = board.hasHandle
        ? {
            name: board.fileName || `${board.id}.board.json`,
            async getFile() {
              const disk = window.__portfolioDiskByBoardId[board.id];
              const text = String(disk?.text || diskText);
              const lastModified = Number(disk?.lastModified) || Date.now();
              return {
                name: board.fileName || `${board.id}.board.json`,
                size: new Blob([text]).size,
                lastModified,
                async text() {
                  return text;
                }
              };
            },
            async createWritable() {
              return {
                async write(text) {
                  const serialized = String(text);
                  window.__portfolioTestWrites.push({ boardId: board.id, text: serialized });
                  const disk = window.__portfolioDiskByBoardId[board.id];
                  if (disk) {
                    disk.text = serialized;
                    disk.lastModified = Date.now();
                  }
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
        data: boardData
      };
    });

    selectedPortfolioBoardId = selectedBoardId || '';
    portfolioSortKey = sortKey;
    portfolioSortDir = sortDir;
    buildPortfolioTasks();
    renderPortfolio();
    await checkProjectFilesNow();
  }, { boards: seededBoards, selectedBoardId, sortKey, sortDir });
}

async function mockNewProjectFlow(page, { promptValue = 'New Project', fileName = 'new-project.board.json' } = {}) {
  await page.evaluate(({ promptValue, fileName }) => {
    window.__newProjectWrites = [];
    const disk = {
      text: '',
      lastModified: Date.now()
    };
    window.prompt = () => promptValue;
    window.showSaveFilePicker = async () => ({
      name: fileName,
      async getFile() {
        const text = String(disk.text || '');
        const lastModified = Number(disk.lastModified) || Date.now();
        return {
          name: fileName,
          size: new Blob([text]).size,
          lastModified,
          async text() {
            return text;
          }
        };
      },
      async createWritable() {
        return {
          async write(text) {
            const serialized = String(text);
            window.__newProjectWrites.push(serialized);
            disk.text = serialized;
            disk.lastModified = Date.now();
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

async function mutateExternalBoardFile(page, { boardId, payload, invalidText = null }) {
  await page.evaluate(({ boardId, payload, invalidText }) => {
    if (!window.__portfolioDiskByBoardId || !window.__portfolioDiskByBoardId[boardId]) {
      throw new Error(`Disk state not found for board: ${boardId}`);
    }
    const disk = window.__portfolioDiskByBoardId[boardId];
    const nextText = typeof invalidText === 'string' ? invalidText : JSON.stringify(payload, null, 2);
    disk.text = nextText;
    disk.lastModified = (Number(disk.lastModified) || Date.now()) + 1000;
  }, { boardId, payload, invalidText });
}

async function triggerExternalFileCheck(page) {
  await page.evaluate(async () => {
    await checkProjectFilesNow();
  });
}

function portfolioCard(page, title) {
  return page.locator('.portfolio-task-card').filter({ hasText: title }).first();
}

async function portfolioTitlesInColumn(page, status = 'backlog') {
  const titles = await page.locator(`#portfolio-${status}-column .portfolio-task-card .task-title`).allTextContents();
  return titles.map((t) => t.trim());
}

async function installControlledPortfolioWriter(page, { boardId, holdWrites = false, failWrites = 0 } = {}) {
  await page.evaluate(({ boardId, holdWrites, failWrites }) => {
    window.__portfolioTestWrites = [];
    window.__portfolioWriteControl = {
      boardId,
      holdWrites: Boolean(holdWrites),
      failRemaining: Math.max(0, Number(failWrites) || 0),
      attempts: 0,
      active: 0,
      maxActive: 0,
      pendingResolvers: []
    };
    window.__releaseNextPortfolioWrite = () => {
      const next = window.__portfolioWriteControl?.pendingResolvers?.shift();
      if (typeof next === 'function') {
        next();
        return true;
      }
      return false;
    };

    const board = portfolioBoards.find((p) => p.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    if (!window.__portfolioDiskByBoardId) {
      window.__portfolioDiskByBoardId = {};
    }
    if (!window.__portfolioDiskByBoardId[boardId]) {
      window.__portfolioDiskByBoardId[boardId] = {
        text: JSON.stringify(board.data, null, 2),
        lastModified: Date.now()
      };
    }

    board.handle = {
      name: board.fileName || `${boardId}.board.json`,
      async getFile() {
        const disk = window.__portfolioDiskByBoardId[boardId];
        const text = String(disk?.text || JSON.stringify(board.data, null, 2));
        const lastModified = Number(disk?.lastModified) || Date.now();
        return {
          name: board.fileName || `${boardId}.board.json`,
          size: new Blob([text]).size,
          lastModified,
          async text() {
            return text;
          }
        };
      },
      async createWritable() {
        return {
          async write(text) {
            const ctl = window.__portfolioWriteControl;
            ctl.attempts += 1;
            const attempt = ctl.attempts;
            ctl.active += 1;
            ctl.maxActive = Math.max(ctl.maxActive, ctl.active);
            try {
              if (ctl.failRemaining > 0) {
                ctl.failRemaining -= 1;
                throw new Error(`Simulated save failure #${attempt}`);
              }
              if (ctl.holdWrites) {
                await new Promise((resolve) => ctl.pendingResolvers.push(resolve));
              }
              const serialized = String(text);
              window.__portfolioTestWrites.push({ boardId, text: serialized, attempt });
              const disk = window.__portfolioDiskByBoardId[boardId];
              if (disk) {
                disk.text = serialized;
                disk.lastModified = Date.now();
              }
            } finally {
              ctl.active -= 1;
            }
          },
          async close() {}
        };
      }
    };
  }, { boardId, holdWrites, failWrites });
}

test.describe('portfolio-only app', () => {
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

  test('app shell does not create a page scrollbar on load', async ({ page }) => {
    const metrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight
    }));

    expect(metrics.docScrollHeight).toBe(metrics.viewportHeight);
    expect(metrics.bodyScrollHeight).toBe(metrics.viewportHeight);
  });

  test('selected project shows a board roadmap toggle and persists roadmap mode', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'alpha' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await page.getByRole('button', { name: 'Roadmap' }).click();

    await expect(page.locator('#portfolioRoadmapView')).toBeVisible();
    await expect(page).toHaveURL(/pv=roadmap/);
  });

  test('invalid selected board query resets roadmap mode and clears URL state', async ({ page }) => {
    await page.goto('/kanban.html?pb=ghost&pv=roadmap');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'ghost' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeHidden();
    await expect(page.locator('#portfolioBoard')).toBeVisible();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/kanban\.html$/);
  });

  test('stale selected board query resets roadmap mode on empty startup portfolio', async ({ page }) => {
    await page.goto('/kanban.html?pb=ghost&pv=roadmap');

    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#portfolioViewModeToggle')).toBeHidden();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/kanban\.html$/);
    const state = await page.evaluate(() => ({
      selectedPortfolioBoardId,
      selectedPortfolioViewMode,
      boardCount: portfolioBoards.length
    }));
    expect(state).toEqual({
      selectedPortfolioBoardId: '',
      selectedPortfolioViewMode: 'board',
      boardCount: 0
    });
  });

  test('normalizeColumns keeps valid canonical columns and removes duplicates', async ({ page }) => {
    const columns = await page.evaluate(() => normalizeColumns([
      { status: 'Backlog', title: 'Ideas' },
      { status: 'todo', title: 'Ready' },
      { status: 'to-do', title: 'Duplicate todo' },
      { status: 'in-progress', title: 'Working' },
      { status: 'done', title: '' },
      { status: 'custom', title: 'Ignored custom' }
    ]));

    expect(columns).toEqual([
      { status: 'backlog', title: 'Ideas' },
      { status: 'to-do', title: 'Ready' },
      { status: 'doing', title: 'Working' },
      { status: 'done', title: 'done' }
    ]);
  });

  test('normalizeColumns falls back to defaults when no valid columns are provided', async ({ page }) => {
    const columns = await page.evaluate(() => normalizeColumns([null, {}, { status: '', title: '' }]));

    expect(columns).toEqual([
      { status: 'backlog', title: 'backlog' },
      { status: 'to-do', title: 'to-do' },
      { status: 'doing', title: 'in progress' },
      { status: 'done', title: 'done' }
    ]);
  });

  test('TaskFormValidator enforces blocker reason and attachment hard size', async ({ page }) => {
    const result = await page.evaluate(() => {
      const blockedWithoutReason = TaskFormValidator.validate({
        title: 'Blocked task',
        blocked: true,
        blockerReason: '',
        attachments: []
      });
      const oversizedAttachment = TaskFormValidator.validate({
        title: 'Attachment task',
        blocked: false,
        blockerReason: '',
        attachments: [{ sizeBytes: ATTACHMENT_HARD_MAX_BYTES + 1 }]
      });
      return { blockedWithoutReason, oversizedAttachment };
    });

    expect(result.blockedWithoutReason.ok).toBe(false);
    expect(result.blockedWithoutReason.message).toBe('Blocked tasks require a blocker reason.');
    expect(result.blockedWithoutReason.focusFieldId).toBe('taskBlockerReason');

    expect(result.oversizedAttachment.ok).toBe(false);
    expect(result.oversizedAttachment.message).toContain('Attachments must be');
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

  test('new project flow aborts cleanly if name prompt is canceled after file picker', async ({ page }) => {
    await mockNewProjectFlow(page, { promptValue: null, fileName: 'canceled.board.json' });

    await page.locator('#newProjectBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');

    const result = await page.evaluate(() => ({
      projectCount: portfolioBoards.length,
      writes: window.__newProjectWrites || []
    }));

    expect(result.projectCount).toBe(0);
    expect(result.writes).toEqual([]);
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

  test('imported project chips always receive distinct colors', async ({ page }) => {
    await mockImportProjectsPicker(page, Array.from({ length: 9 }, (_, index) => ({
      fileName: `project-${index + 1}.board.json`,
      payload: buildBoardPayload({
        title: `Project ${index + 1}`,
        tasks: [{ id: index + 1, title: `Task ${index + 1}`, status: 'backlog' }]
      })
    })));

    await page.locator('#importProjectsBtn').click();

    const projectChipStyles = await page.locator('.portfolio-chip').evaluateAll((nodes) => (
      nodes
        .map((node) => {
          const button = node.querySelector('[data-action="select-board"]');
          const boardId = button?.getAttribute('data-board-id') || '';
          return boardId ? (node.getAttribute('style') || '').trim() : null;
        })
        .filter(Boolean)
    ));

    expect(projectChipStyles).toHaveLength(9);
    expect(new Set(projectChipStyles).size).toBe(projectChipStyles.length);
  });

  test('import projects partially succeeds and reports invalid files', async ({ page }) => {
    await page.evaluate(() => {
      window.__alerts = [];
      window.alert = (msg) => { window.__alerts.push(String(msg)); };
    });

    await mockImportProjectsPicker(page, [
      {
        fileName: 'valid.board.json',
        payload: buildBoardPayload({
          title: 'Valid Project',
          tasks: [{ id: 1, title: 'Valid task', status: 'backlog' }]
        })
      },
      {
        fileName: 'invalid.board.json',
        payload: {
          meta: {
            schemaVersion: 1,
            appId: 'wrong-app-id',
            createdAt: '2026-02-26T00:00:00.000Z',
            updatedAt: '2026-02-26T00:00:00.000Z'
          },
          board: {
            columns: [{ status: 'backlog', title: 'backlog' }],
            tasks: [],
            settings: { title: 'Broken', sortMode: 'manual', showArchivedOnly: false, archiveFilter: 'active' }
          },
          extensions: {}
        }
      }
    ]);

    await page.locator('#importProjectsBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Valid Project');
    await expect(portfolioCard(page, 'Valid task')).toBeVisible();

    const result = await page.evaluate(() => ({
      projectCount: portfolioBoards.length,
      titles: portfolioBoards.map((p) => p.title),
      alerts: window.__alerts || []
    }));

    expect(result.projectCount).toBe(1);
    expect(result.titles).toEqual(['Valid Project']);
    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0]).toContain('Some projects were not imported');
    expect(result.alerts[0]).toContain('invalid.board.json');
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

  test('assignees and blocked fields save and render as card badges', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    const assigneeAddButton = page.locator('#taskAssigneeEditor').getByRole('button', { name: 'Add' });
    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Investigate deploy issue');
    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await assigneeAddButton.click();
    await page.locator('#taskAssigneeNewItem').fill('Sam');
    await assigneeAddButton.click();
    await page.locator('#taskBlocked').check();
    await page.locator('#taskBlockerReason').fill('Waiting for staging access');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const backlogColumn = page.locator('#portfolio-backlog-column');
    await expect(backlogColumn).toContainText('Investigate deploy issue');
    await expect(backlogColumn).toContainText('Alex');
    await expect(backlogColumn).toContainText('Sam');
    await expect(backlogColumn).toContainText('Blocked');

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((t) => t.title === 'Investigate deploy issue');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Investigate deploy issue');
      return {
        task: task ? { assignees: task.assignees, blocked: task.blocked, blockerReason: task.blockerReason } : null,
        savedTask: savedTask ? { assignees: savedTask.assignees, blocked: savedTask.blocked, blockerReason: savedTask.blockerReason } : null
      };
    });

    expect(result.task).toEqual({
      assignees: ['Alex', 'Sam'],
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
    expect(result.savedTask).toEqual({
      assignees: ['Alex', 'Sam'],
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
          { id: 1, title: 'Alex blocked', status: 'backlog', assignees: ['Alex', 'Sam'], blocked: true, blockerReason: 'Vendor response' },
          { id: 2, title: 'Alex active', status: 'backlog', assignees: ['Alex'], blocked: false },
          { id: 3, title: 'Sam active', status: 'backlog', assignees: ['Sam'], blocked: false }
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

  test('assignee editor suggests board assignees and excludes ones already added', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', assignees: ['Alex'] },
          { id: 2, title: 'Task B', status: 'backlog', assignees: ['Sam'] }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();

    let options = await page.evaluate(() => Array.from(document.querySelectorAll('#taskAssigneeSuggestions option')).map((option) => option.value));
    expect(options).toEqual(['Alex', 'Sam']);

    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await page.locator('#taskAssigneeNewItem').press('Enter');
    await expect(page.locator('#taskAssigneeItems .assignee-editor-row')).toHaveCount(1);

    options = await page.evaluate(() => Array.from(document.querySelectorAll('#taskAssigneeSuggestions option')).map((option) => option.value));
    expect(options).toEqual(['Sam']);

    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await page.locator('#taskAssigneeNewItem').press('Enter');
    await expect(page.locator('#taskAssigneeItems .assignee-editor-row')).toHaveCount(1);
  });

  test('assignee editor can edit and remove existing assignees before save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', assignees: ['Alex', 'Sam'] }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => editPortfolioTask('p1', 1));
    await expect(page.locator('#taskModal')).toBeVisible();

    const rows = page.locator('#taskAssigneeItems .assignee-editor-row');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).locator('input[type="text"]').fill('Jamie');
    await rows.nth(1).getByRole('button', { name: 'Remove assignee' }).click();

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((entry) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry) => entry.id === 1);
      return {
        taskAssignees: task?.assignees || [],
        savedAssignees: savedTask?.assignees || []
      };
    });

    expect(result.taskAssignees).toEqual(['Jamie']);
    expect(result.savedAssignees).toEqual(['Jamie']);
    await expect(portfolioCard(page, 'Task A')).toContainText('Jamie');
    await expect(portfolioCard(page, 'Task A')).not.toContainText('Sam');
  });

  test('due date input uses dd/mm/yyyy in the UI and saves ISO to JSON', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Date formatting task');
    await page.locator('#taskDueDate').fill('05/03/2026');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Date formatting task');
    await expect(card).toContainText('05/03/2026');

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((t) => t.title === 'Date formatting task');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Date formatting task');
      return {
        taskDueDate: task?.dueDate || '',
        savedDueDate: savedTask?.dueDate || ''
      };
    });

    expect(result.taskDueDate).toBe('2026-03-05');
    expect(result.savedDueDate).toBe('2026-03-05');

    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailDueDate')).toHaveText('05/03/2026');
  });

  test('invalid due date keeps the modal open and focuses the due date field', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Bad date task');
    await page.locator('#taskDueDate').fill('2026-03-05');
    await page.locator('#taskModal .btn-primary').click();

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskDueDate')).toBeFocused();

    const result = await page.evaluate(() => ({
      alert: window.__lastAlert,
      taskCount: portfolioBoards[0].data.board.tasks.length
    }));

    expect(result.alert).toContain('Due date must use dd/mm/yyyy');
    expect(result.taskCount).toBe(0);
  });

  test('legacy assignee strings are accepted and serialize as assignee lists', async ({ page }) => {
    const legacy = {
      meta: {
        schemaVersion: 1,
        appId: BOARD_APP_ID,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP
      },
      board: {
        columns: buildDefaultColumns(),
        tasks: [{
          id: 1,
          title: 'Legacy task',
          description: '',
          assignee: 'Alex',
          blocked: false,
          blockerReason: '',
          checklist: [],
          archived: false,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          dueDate: '',
          priority: null,
          effort: null,
          status: 'backlog'
        }],
        settings: {
          title: 'Legacy Project',
          sortMode: 'manual',
          showArchivedOnly: false,
          archiveFilter: 'active'
        }
      },
      extensions: {}
    };

    const result = await page.evaluate((legacyPayload) => {
      const legacy = legacyPayload;
      validateBoardData(legacy);
      const serialized = serializeBoardDataFromObject(legacy);
      return {
        schemaVersion: serialized.meta.schemaVersion,
        task: serialized.board.tasks[0],
        hasLegacyAssigneeKey: Object.prototype.hasOwnProperty.call(serialized.board.tasks[0], 'assignee')
      };
    }, legacy);

    expect(result.schemaVersion).toBe(1);
    expect(result.task.assignees).toEqual(['Alex']);
    expect(result.hasLegacyAssigneeKey).toBe(false);
  });

  test('roadmap schema normalizes roadmap entities and task assignment ids', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{
        id: 1,
        title: 'Mapped task',
        status: 'to-do',
        phaseId: 'phase_foundation',
        milestoneId: 'milestone_alpha',
        sprintId: 'sprint_12'
      }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'milestone_alpha', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [{ id: 'phase_foundation', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: [{ id: 'sprint_12', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    const snapshot = await page.evaluate(() => {
      const source = structuredClone(getPortfolioBoardRecord('alpha').data);
      validateBoardData(source);
      const serialized = serializeBoardDataFromObject(source);
      return structuredClone(serialized);
    });

    expect(snapshot.extensions.roadmap.version).toBe(1);
    expect(snapshot.extensions.roadmap.milestones).toEqual([{
      id: 'milestone_alpha',
      title: 'Alpha',
      dueDate: '2026-04-15'
    }]);
    expect(snapshot.extensions.roadmap.phases).toEqual([{
      id: 'phase_foundation',
      title: 'Foundation',
      startDate: '2026-04-01',
      endDate: '2026-04-30'
    }]);
    expect(snapshot.extensions.roadmap.sprints).toEqual([{
      id: 'sprint_12',
      title: 'Sprint 12',
      startDate: '2026-04-01',
      endDate: '2026-04-14'
    }]);
    expect(snapshot.board.tasks[0]).toMatchObject({
      phaseId: 'phase_foundation',
      milestoneId: 'milestone_alpha',
      sprintId: 'sprint_12'
    });
  });

  test('task modal assigns phase and milestone from roadmap selectors', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('[data-action="edit-task"]').click();
    await page.selectOption('#taskPhase', 'p1');
    await page.selectOption('#taskMilestone', 'm1');
    await page.getByRole('button', { name: 'Save Task' }).click();

    const task = await page.evaluate(() => structuredClone(getPortfolioBoardRecord('alpha').data.board.tasks[0]));
    expect(task.phaseId).toBe('p1');
    expect(task.milestoneId).toBe('m1');
  });

  test('checked board tasks can be grouped into a new sprint', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog' },
        { id: 2, title: 'Task B', status: 'to-do' }
      ]
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    const board = await page.evaluate(() => structuredClone(getPortfolioBoardRecord('alpha').data));
    expect(board.extensions.roadmap.sprints).toHaveLength(1);
    expect(board.board.tasks.every((task) => task.sprintId === board.extensions.roadmap.sprints[0].id)).toBeTruthy();
  });

  test('bulk sprint creation clears selection and board changes clear stale bulk selection', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
      {
        id: 'alpha',
        hasHandle: true,
        title: 'Alpha',
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'to-do' }
        ]
      },
      {
        id: 'beta',
        hasHandle: true,
        title: 'Beta',
        tasks: [{ id: 3, title: 'Task C', status: 'backlog' }]
      }
    ], { selectedBoardId: 'alpha' });

    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await expect(page.locator('#portfolioBulkActions')).toBeVisible();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('1 task selected');

    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('0 tasks selected');
    await expect(portfolioCard(page, 'Task A').locator('input[type="checkbox"]')).not.toBeChecked();

    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await expect(page.locator('#portfolioBulkActions')).toBeVisible();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('1 task selected');

    await page.evaluate(() => {
      history.replaceState({}, '', `${location.pathname}?pb=beta`);
      applyUrlState();
    });
    await expect(portfolioCard(page, 'Task C')).toBeVisible();

    await page.evaluate(() => {
      history.replaceState({}, '', `${location.pathname}?pb=alpha`);
      applyUrlState();
    });
    await expect(portfolioCard(page, 'Task A')).toBeVisible();
    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('0 tasks selected');
    await expect(portfolioCard(page, 'Task B').locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('bulk sprint timeline event reconstructs sprint assignments in timeline preview', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog' },
        { id: 2, title: 'Task B', status: 'to-do' }
      ]
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node) => {
      node.value = '1';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const preview = await page.evaluate(() => {
      const projected = getSelectedBoardTimelineViewState()?.projectedBoard || null;
      return {
        sprintTitles: projected?.extensions?.roadmap?.sprints?.map((entry) => entry.title) || [],
        sprintIds: projected?.board?.tasks?.map((task) => task.sprintId || '') || []
      };
    });

    expect(preview.sprintTitles).toEqual(['Sprint 12']);
    expect(preview.sprintIds.every((value) => value === 'sprint-12')).toBeTruthy();
  });

  test('roadmap rows can create and delete milestones while clearing task refs', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do', milestoneId: 'm1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await page.locator('#roadmapEntityTitle').fill('Beta');
    await page.locator('#roadmapEntityDate').fill('2026-05-01');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await expect(page.locator('#portfolioRoadmapView')).toContainText('Beta');

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: 'Delete Alpha' }).click();

    const result = await page.evaluate(() => {
      const board = getPortfolioBoardRecord('alpha').data;
      const roadmap = structuredClone(getRoadmapExtension(board));
      const timeline = board.extensions?.timeline;
      return {
        task: structuredClone(board.board.tasks[0]),
        roadmap,
        lastTimelineKind: timeline?.events?.at(-1)?.kind || '',
        lastTimelineSummary: timeline?.events?.at(-1)?.summary || ''
      };
    });

    expect(result.roadmap.milestones).toEqual([{
      id: 'beta',
      title: 'Beta',
      dueDate: '2026-05-01'
    }]);
    expect(result.task.milestoneId).toBe('');
    expect(result.lastTimelineKind).toBe('roadmap.updated');
    expect(result.lastTimelineSummary).toContain('Milestone deleted');
  });

  test('editing an existing roadmap item preserves its ID', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do', milestoneId: 'm1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Edit Alpha' }).click();
    await page.locator('#roadmapEntityTitle').fill('Alpha Renamed');
    await page.getByRole('button', { name: 'Save Item' }).click();

    const result = await page.evaluate(() => {
      const board = getPortfolioBoardRecord('alpha').data;
      return {
        milestone: structuredClone(getRoadmapExtension(board).milestones[0]),
        task: structuredClone(board.board.tasks[0])
      };
    });

    expect(result.milestone).toEqual({
      id: 'm1',
      title: 'Alpha Renamed',
      dueDate: '2026-04-15'
    });
    expect(result.task.milestoneId).toBe('m1');
  });

  test('roadmap timeline replays CRUD changes and cleared refs in historical preview state', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do', milestoneId: 'm1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await page.locator('#roadmapEntityTitle').fill('Beta');
    await page.locator('#roadmapEntityDate').fill('2026-05-01');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await page.getByRole('button', { name: 'Edit Beta' }).click();
    await page.locator('#roadmapEntityTitle').fill('Beta Renamed');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: 'Delete Alpha' }).click();

    const previewStates = await page.evaluate(() => {
      const board = getPortfolioBoardRecord('alpha').data;
      const timeline = board.extensions?.timeline;
      return {
        eventKinds: timeline?.events?.map((event) => event.kind) || [],
        afterCreate: reconstructBoardStateFromTimeline(board, 1),
        afterEdit: reconstructBoardStateFromTimeline(board, 2),
        afterDelete: reconstructBoardStateFromTimeline(board, 3)
      };
    });

    expect(previewStates.eventKinds).toEqual(['board.baseline', 'roadmap.updated', 'roadmap.updated', 'roadmap.updated']);
    expect(previewStates.afterCreate.extensions.roadmap.milestones.map((item) => item.title)).toEqual(['Alpha', 'Beta']);
    expect(previewStates.afterCreate.board.tasks[0].milestoneId).toBe('m1');
    expect(previewStates.afterEdit.extensions.roadmap.milestones.map((item) => item.title)).toEqual(['Alpha', 'Beta Renamed']);
    expect(previewStates.afterDelete.extensions.roadmap.milestones.map((item) => item.title)).toEqual(['Beta Renamed']);
    expect(previewStates.afterDelete.board.tasks[0].milestoneId).toBe('');
  });

  test('roadmap view renders milestones phases and sprints with assigned task rows', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1', sprintId: 's1' },
        { id: 2, title: 'Task B', status: 'to-do', milestoneId: 'm1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha Release', dueDate: '2026-04-15' }],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await expect(page.locator('#portfolioRoadmapView')).toContainText('Milestones');
    await expect(page.locator('#portfolioRoadmapView > .portfolio-roadmap-timeline')).toHaveCount(1);
    await expect(page.locator('#portfolioRoadmapView .portfolio-roadmap-header')).toHaveCount(0);
    await expect(page.locator('[data-roadmap-axis="shared"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="milestone"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="phase"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="sprint"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="phase"] .roadmap-row-labels > .roadmap-row-actions')).toHaveCount(1);
    const sharedGeometry = await page.evaluate(() => {
      const axis = document.querySelector('.roadmap-axis-shell');
      const row = document.querySelector('.roadmap-row-main');
      if (!(axis instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
      const axisStyles = getComputedStyle(axis);
      const rowStyles = getComputedStyle(row);
      return {
        axisColumns: axisStyles.gridTemplateColumns,
        rowColumns: rowStyles.gridTemplateColumns,
        axisGap: axisStyles.columnGap,
        rowGap: rowStyles.columnGap
      };
    });
    expect(sharedGeometry).not.toBeNull();
    expect(sharedGeometry.axisColumns).toBe(sharedGeometry.rowColumns);
    expect(sharedGeometry.axisGap).toBe(sharedGeometry.rowGap);

    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');
    const taskListLayout = await page.locator('[data-roadmap-task-list="phase:p1"]').evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        columns: styles.gridTemplateColumns.split(' ').filter(Boolean).length,
        paddingLeft: styles.paddingLeft
      };
    });
    expect(taskListLayout.columns).toBe(2);
    expect(taskListLayout.paddingLeft).toBe('0px');
    const taskGridColumns = await page.locator('[data-roadmap-task-list="phase:p1"] .roadmap-task-list-track').evaluate((node) => {
      const columns = getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean);
      return columns.length;
    });
    expect(taskGridColumns).toBeGreaterThan(1);
  });

  test('roadmap timeline bars stay contained within the track at edge dates', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [
            { id: 'p1', title: 'Full Range', startDate: '2026-04-01', endDate: '2026-04-30' }
          ],
          sprints: [
            { id: 's1', title: 'Closing Sprint', startDate: '2026-04-30', endDate: '2026-04-30' }
          ]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const placements = await page.locator('.roadmap-row-timeline-bar').evaluateAll((bars) => {
      return bars.map((bar) => {
        const track = bar.closest('.roadmap-row-track');
        if (!track) return null;
        const barRect = bar.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        return {
          leftInside: barRect.left >= trackRect.left,
          rightInside: barRect.right <= trackRect.right,
          width: barRect.width,
          trackWidth: trackRect.width
        };
      });
    });

    for (const placement of placements) {
      expect(placement).not.toBeNull();
      expect(placement.leftInside).toBeTruthy();
      expect(placement.rightInside).toBeTruthy();
      expect(placement.width).toBeLessThanOrEqual(placement.trackWidth);
    }
  });

  test('roadmap rows support keyboard disclosure for task expansion', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    const disclosure = page.getByRole('button', { name: 'Show tasks for Foundation' });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');

    await page.getByRole('button', { name: 'Hide tasks for Foundation' }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toHaveCount(0);
  });

  test('historical roadmap task rows open the detail modal with projected read-only data', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.evaluate(() => editPortfolioTask('alpha', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Task A Updated');
    await page.locator('#taskDescription').fill('Latest description');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node) => {
      node.value = '0';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card').click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    const result = await page.evaluate(() => ({
      readOnly: portfolioDetailContext?.readOnly || false,
      selectedTaskId: portfolioDetailContext?.taskId || null,
      liveTitle: getPortfolioBoardRecord('alpha')?.data?.board?.tasks?.find((task) => task.id === 1)?.title || ''
    }));

    expect(result.readOnly).toBe(true);
    expect(result.selectedTaskId).toBe(1);
    expect(result.liveTitle).toBe('Task A Updated');
  });

  test('roadmap entity modal traps shortcut context and Escape closes it', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();

    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeHidden();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await expect(page.locator('#helpModal')).toBeHidden();
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
    await expect(page.locator('#taskAttachmentsList .attachment-editor-download')).toHaveCount(1);
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

  test('task detail modal scrolls when content exceeds the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });

    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Oversized detail task',
          status: 'backlog',
          description: Array.from({ length: 18 }, (_, index) => `Detail line ${index + 1}`).join('\n'),
          checklist: Array.from({ length: 28 }, (_, index) => ({
            text: `Checklist item ${index + 1}`,
            done: index % 2 === 0
          }))
        }]
      }
    ], { selectedBoardId: 'p1' });

    await portfolioCard(page, 'Oversized detail task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const content = document.querySelector('#taskDetailModal .modal-content');
      const body = document.querySelector('#taskDetailModal .modal-body');
      if (!content || !body) {
        return null;
      }
      const rect = content.getBoundingClientRect();
      return {
        bodyScrolls: body.scrollHeight > body.clientHeight,
        bodyOverflowY: getComputedStyle(body).overflowY,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics.bodyScrolls).toBe(true);
    expect(['auto', 'scroll']).toContain(metrics.bodyOverflowY);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  });

  test('attachment validation blocks save for too many attachments and oversized attachments', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Attachment limits');

    await page.evaluate(() => {
      const makeAtt = (id, sizeBytes) => ({
        id: `att_${id}`,
        name: `f${id}.txt`,
        mime: 'text/plain',
        sizeBytes,
        kind: 'file',
        dataUrl: 'data:text/plain;base64,QQ==',
        createdAt: '2026-02-26T00:00:00.000Z'
      });
      setTaskModalAttachmentDraft(Array.from({ length: 11 }, (_, i) => makeAtt(i + 1, 1)), { messages: [] });
    });

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeVisible();

    let result = await page.evaluate(() => ({
      alert: window.__lastAlert,
      taskCount: portfolioBoards[0].data.board.tasks.length
    }));
    expect(result.alert).toContain('up to 10 attachments');
    expect(result.taskCount).toBe(0);

    await page.evaluate(() => {
      window.__lastAlert = '';
      setTaskModalAttachmentDraft([{
        id: 'att_big',
        name: 'big.bin',
        mime: 'application/octet-stream',
        sizeBytes: (10 * 1024 * 1024) + 1,
        kind: 'file',
        dataUrl: 'data:application/octet-stream;base64,QQ==',
        createdAt: '2026-02-26T00:00:00.000Z'
      }], { messages: [] });
    });

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeVisible();

    result = await page.evaluate(() => ({
      alert: window.__lastAlert,
      taskCount: portfolioBoards[0].data.board.tasks.length
    }));
    expect(result.alert).toContain('10 MB or smaller');
    expect(result.taskCount).toBe(0);
  });

  test('duplicate attachment uploads are skipped in the task modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => editPortfolioTask('p1', 1));
    await expect(page.locator('#taskModal')).toBeVisible();

    const filePayload = {
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello attachment')
    };

    await page.setInputFiles('#taskAttachmentsInput', filePayload);
    await page.setInputFiles('#taskAttachmentsInput', filePayload);

    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(1);
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('already attached');

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((entry) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry) => entry.id === 1);
      return {
        taskAttachmentCount: task?.attachments?.length || 0,
        savedAttachmentCount: savedTask?.attachments?.length || 0
      };
    });

    expect(result.taskAttachmentCount).toBe(1);
    expect(result.savedAttachmentCount).toBe(1);
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
    await expect(portfolioCard(page, 'RO Task').locator('button[title=\"Read-only (no file handle)\"]')).toHaveCount(3);
  });

  test('read-only task detail keyboard shortcuts do not open edit or mutate', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ id: 1, title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await portfolioCard(page, 'RO Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.keyboard.press('x');
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    const result = await page.evaluate(() => ({
      archived: portfolioBoards[0].data.board.tasks.find((t) => t.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));
    expect(result.archived).toBe(false);
    expect(result.writes).toEqual([]);
  });

  test('task card delete removes the task and persists the board', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Delete Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Delete me', status: 'backlog' }]
      }
    ], { selectedBoardId: 'd1' });

    const card = portfolioCard(page, 'Delete me');
    await card.hover();

    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Delete me')).toHaveCount(0);

    const result = await page.evaluate(() => ({
      taskCount: portfolioBoards[0].data.board.tasks.length,
      timelineKinds: portfolioBoards[0].data.extensions.timeline?.events?.map((event) => event.kind) || [],
      writes: window.__portfolioTestWrites || []
    }));
    expect(result.taskCount).toBe(0);
    expect(result.timelineKinds).toEqual(['board.baseline', 'task.deleted']);
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"tasks": []');
  });

  test('delete cancel leaves the task untouched', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Keep me', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.confirm = () => false;
    });

    const card = portfolioCard(page, 'Keep me');
    await card.hover();
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Keep me')).toBeVisible();

    const result = await page.evaluate(() => ({
      taskCount: portfolioBoards[0].data.board.tasks.length,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.taskCount).toBe(1);
    expect(result.writes).toEqual([]);
  });

  test('archiving a task can be undone from the toast', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undo me', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Undo me');
    await card.hover();
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Undo me')).toHaveCount(0);
    await expect(page.locator('#undoToast')).toHaveClass(/active/);

    await page.locator('#undoBtn').click();
    await expect(portfolioCard(page, 'Undo me')).toBeVisible();

    const result = await page.evaluate(() => ({
      archived: portfolioBoards[0].data.board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.archived).toBe(false);
    expect(result.writes.length).toBeGreaterThan(0);
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

  test('reset filters button clears top filters and restores default sort', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'rf1',
        title: 'Reset Filters Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alpha low', status: 'backlog', priority: 'low', effort: 'L', assignees: ['Ana'] },
          { id: 2, title: 'Beta target', status: 'doing', priority: 'high', effort: 'S', assignees: ['Bruno'], blocked: true }
        ]
      }
    ]);

    await page.locator('#portfolioSearchInput').fill('beta');
    await page.locator('#portfolioArchiveFilter').selectOption('all');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    await page.locator('#portfolioAssigneeFilter').selectOption('Bruno');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('S');
    await page.locator('#portfolioSortSelect').selectOption('score');

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await page.locator('#resetPortfolioFiltersBtn').click();

    await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioBlockedFilter')).toHaveValue('all');
    await expect(page.locator('#portfolioAssigneeFilter')).toHaveValue('');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('priority');
    await expect(page.locator('.portfolio-task-card')).toHaveCount(2);

    const url = new URL(page.url());
    expect(url.searchParams.get('pq')).toBeNull();
    expect(url.searchParams.get('pa')).toBeNull();
    expect(url.searchParams.get('pbk')).toBeNull();
    expect(url.searchParams.get('pu')).toBeNull();
    expect(url.searchParams.get('pp')).toBeNull();
    expect(url.searchParams.get('pe')).toBeNull();
    expect(url.searchParams.get('ps')).toBeNull();
  });

  test('drag and drop import loads project files and clears the overlay state', async ({ page }) => {
    const payload = buildBoardPayload({
      title: 'Dropped Project',
      tasks: [{ id: 1, title: 'Dropped task', status: 'backlog' }]
    });

    await page.evaluate((boardPayload) => {
      const dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify(boardPayload)], 'dropped.board.json', { type: 'application/json' }));
      window.__dropTestDataTransfer = dt;
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, payload);

    await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);

    await page.evaluate(() => {
      const dt = window.__dropTestDataTransfer;
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });

    await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Dropped Project');
    await expect(portfolioCard(page, 'Dropped task')).toBeVisible();
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

  test('hovered card shortcuts take priority over the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k2',
        title: 'Hover Priority Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k2', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    const hoveredCard = portfolioCard(page, 'Task B');
    await hoveredCard.hover();

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await hoveredCard.hover();
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveValue('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskModal')).toBeHidden();
  });

  test('clicking outside cards clears the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k3',
        title: 'Selection Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'backlog' }
        ]
      }
    ], { selectedBoardId: 'k3' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    await page.locator('.header').click();
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(0);
  });

  test('opening edit from task detail closes the detail modal (no modal stacking)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'm1',
        title: 'Modal Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Modal Task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'm1' });

    await portfolioCard(page, 'Modal Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
  });

  test('single-key shortcuts do not fire while typing in task modal inputs', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__shortcutImportCalls = 0;
      window.showOpenFilePicker = async () => {
        window.__shortcutImportCalls += 1;
        return [];
      };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();

    const name = page.locator('#taskName');
    await name.click();
    await page.keyboard.type('nix/');

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(name).toHaveValue('nix/');

    const result = await page.evaluate(() => ({
      projectCount: portfolioBoards.length,
      importCalls: window.__shortcutImportCalls || 0
    }));
    expect(result.projectCount).toBe(1);
    expect(result.importCalls).toBe(0);
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
            effort: 'M'
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
    expect(result.statusChangedAt).toBeUndefined();
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"status": "doing"');
    expect(result.writes.at(-1).text).not.toContain('"statusChangedAt"');
  });

  test('editing a task does not add statusChangedAt to saved payloads', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 's1',
        title: 'Status Age Project',
        hasHandle: true,
        tasks: [
          {
            id: 1,
            title: 'Keep status age',
            status: 'backlog'
          }
        ]
      }
    ], { selectedBoardId: 's1' });

    await page.evaluate(() => editPortfolioTask('s1', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Keep status age edited');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const result = await page.evaluate(() => {
      const task = portfolioBoards[0].data.board.tasks.find((t) => t.id === 1);
      return {
        title: task?.title,
        status: task?.status,
        statusChangedAt: task?.statusChangedAt,
        writes: window.__portfolioTestWrites || []
      };
    });

    expect(result.title).toBe('Keep status age edited');
    expect(result.status).toBe('backlog');
    expect(result.statusChangedAt).toBeUndefined();
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).not.toContain('"statusChangedAt"');
  });

  test('task edits create timeline events in extensions.timeline', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl1',
        title: 'Timeline Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl1' });

    await expect(page.locator('#portfolioTimelinePanel')).toHaveClass(/collapsed/);

    await page.evaluate(() => editPortfolioTask('tl1', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Updated title');
    await page.locator('#taskDescription').fill('Updated description');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const result = await page.evaluate(() => {
      const board = portfolioBoards.find((entry) => entry.id === 'tl1');
      return {
        timeline: board?.data?.extensions?.timeline || null,
        writes: window.__portfolioTestWrites || []
      };
    });

    expect(result.timeline).toBeTruthy();
    expect(result.timeline.version).toBe(1);
    expect(result.timeline.events.map((event) => event.kind)).toEqual(['board.baseline', 'task.updated']);
    expect(result.timeline.events[1].changes.title.before).toBe('Original title');
    expect(result.timeline.events[1].changes.title.after).toBe('Updated title');
    expect(result.timeline.events[1].changes.description.after).toBe('Updated description');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"timeline"');
    expect(result.writes.at(-1).text).toContain('"task.updated"');
  });

  test('task saves keep timeline pinned to latest state', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl3',
        title: 'Timeline Latest Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl3' });

    await page.evaluate(() => editPortfolioTask('tl3', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Phase 1');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.evaluate(() => setPortfolioTimelineSelection('tl3', 1));
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);

    await page.evaluate(() => editPortfolioTask('tl3', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Phase 2');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Created from latest');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Created from latest')).toBeVisible();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel .timeline-slider-row').getByRole('button', { name: 'Latest' })).toBeVisible();
    await expect(page.locator('#portfolioTimelinePanel .timeline-slider-row').getByRole('button', { name: 'Restore this state' })).toBeVisible();

    const result = await page.evaluate(() => {
      const board = portfolioBoards.find((entry) => entry.id === 'tl3');
      const timeline = board?.data?.extensions?.timeline || null;
      return {
        eventCount: timeline?.events?.length || 0,
        selection: portfolioTimelineSelection,
        isPreview: isHistoricalPreviewActiveForBoard('tl3')
      };
    });

    expect(result.eventCount).toBe(4);
    expect(result.selection.boardId).toBe('tl3');
    expect(result.selection.eventIndex).toBe(result.eventCount - 1);
    expect(result.isPreview).toBe(false);
  });

  test('timeline slider previews historical state and restore persists it', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl2',
        title: 'Timeline Restore Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl2' });

    await expect(page.locator('#portfolioTimelinePanel')).toHaveClass(/collapsed/);

    await page.evaluate(() => editPortfolioTask('tl2', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Phase 1');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.evaluate(() => editPortfolioTask('tl2', 1));
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Phase 2');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node) => {
      node.value = '0';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');
    await expect(portfolioCard(page, 'Original title')).toBeVisible();
    await expect(portfolioCard(page, 'Phase 2')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(0);

    await page.locator('#portfolioTimelinePanel .btn-primary').click();

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(portfolioCard(page, 'Original title')).toBeVisible();
    await expect(portfolioCard(page, 'Phase 2')).toHaveCount(0);

    const result = await page.evaluate(() => {
      const board = portfolioBoards.find((entry) => entry.id === 'tl2');
      const timeline = board?.data?.extensions?.timeline || null;
      return {
        taskTitle: board?.data?.board?.tasks?.find((task) => task.id === 1)?.title || '',
        timelineKinds: timeline?.events?.map((event) => event.kind) || [],
        lastEventKind: timeline?.events?.at(-1)?.kind || '',
        writes: window.__portfolioTestWrites || []
      };
    });

    expect(result.taskTitle).toBe('Original title');
    expect(result.timelineKinds).toEqual(['board.baseline', 'task.updated', 'task.updated', 'board.restored']);
    expect(result.lastEventKind).toBe('board.restored');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"board.restored"');
  });

  test('clicking a timeline event preserves the event list scroll position', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl4',
        title: 'Timeline Scroll Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl4' });

    await page.evaluate(() => {
      const board = portfolioBoards.find((entry) => entry.id === 'tl4');
      const task = board?.data?.board?.tasks?.find((entry) => entry.id === 1);
      if (!board || !task) {
        throw new Error('Seeded board not found.');
      }

      ensureBoardTimelineBaseline(board.data);
      for (let index = 1; index <= 24; index += 1) {
        const beforeTask = captureTaskTimelineSnapshot(board.data, task.id);
        task.title = `Phase ${index}`;
        touchTask(task);
        recordTaskTimelineEvent(board.data, beforeTask, captureTaskTimelineSnapshot(board.data, task.id));
      }

      syncPortfolioTimelineSelectionToLatest('tl4', board.data);
      buildPortfolioTasks();
      renderPortfolio();
    });

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    const result = await page.evaluate(() => {
      const list = document.querySelector('#portfolioTimelinePanel .timeline-event-list');
      if (!list) {
        throw new Error('Timeline event list not found.');
      }

      list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - 48);
      const target = Array.from(list.querySelectorAll('.timeline-event-item')).find((button) => (
        button.offsetTop >= list.scrollTop
        && button.offsetTop + button.offsetHeight <= list.scrollTop + list.clientHeight
        && !button.classList.contains('active')
      ));

      if (!target) {
        throw new Error('No visible timeline event item available for click.');
      }

      const beforeScrollTop = list.scrollTop;
      const targetIndex = Number(target.dataset.eventIndex);
      target.click();

      const nextList = document.querySelector('#portfolioTimelinePanel .timeline-event-list');
      return {
        beforeScrollTop,
        afterScrollTop: nextList ? nextList.scrollTop : null,
        targetIndex,
        selectedIndex: portfolioTimelineSelection.eventIndex
      };
    });

    expect(result.selectedIndex).toBe(result.targetIndex);
    expect(Math.abs((result.afterScrollTop ?? 0) - result.beforeScrollTop)).toBeLessThanOrEqual(1);
  });

  test('overdue calculation uses local date instead of UTC ISO date', async ({ page }) => {
    const result = await page.evaluate(() => {
      const RealDate = window.Date;
      function FakeDate(...args) {
        if (!(this instanceof FakeDate)) {
          return new RealDate(...args);
        }
        if (args.length > 0) {
          return new RealDate(...args);
        }
        this.getTime = () => 1;
        this.getFullYear = () => 2026;
        this.getMonth = () => 1; // February (0-based)
        this.getDate = () => 26;
        this.toISOString = () => '2026-02-27T00:30:00.000Z';
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      FakeDate.now = () => RealDate.parse('2026-02-27T00:30:00.000Z');
      FakeDate.prototype = RealDate.prototype;

      window.Date = FakeDate;
      try {
        return {
          todayLocal: todayLocalIsoDate(),
          sameDayOverdue: isTaskOverdue({ dueDate: '2026-02-26', status: 'backlog', archived: false }),
          previousDayOverdue: isTaskOverdue({ dueDate: '2026-02-25', status: 'backlog', archived: false })
        };
      } finally {
        window.Date = RealDate;
      }
    });

    expect(result.todayLocal).toBe('2026-02-26');
    expect(result.sameDayOverdue).toBe(false);
    expect(result.previousDayOverdue).toBe(true);
  });

  test('auto-save queue serializes writes per project and persists latest mutation', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'q1',
        title: 'Queued Save Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Queued task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'q1' });

    await installControlledPortfolioWriter(page, { boardId: 'q1', holdWrites: true, failWrites: 0 });

    await page.evaluate(() => {
      runPortfolioTaskMutation('q1', 1, (task) => {
        task.title = 'Queued task v1';
        return true;
      });
      runPortfolioTaskMutation('q1', 1, (task) => {
        task.title = 'Queued task v2';
        return true;
      });
    });

    await expect(page.locator('.portfolio-chip.active')).toContainText('Saving');

    let interim = await page.evaluate(() => ({
      status: getProjectSaveState('q1')?.status,
      revision: getProjectSaveState('q1')?.revision,
      savedRevision: getProjectSaveState('q1')?.savedRevision,
      maxActive: window.__portfolioWriteControl?.maxActive || 0,
      writes: window.__portfolioTestWrites || []
    }));
    expect(interim.status).toBe('saving');
    expect(interim.revision).toBe(2);
    expect(interim.savedRevision).toBe(0);
    expect(interim.maxActive).toBeLessThanOrEqual(1);
    expect(interim.writes).toHaveLength(0);

    await page.evaluate(() => window.__releaseNextPortfolioWrite());
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);

    await page.evaluate(() => window.__releaseNextPortfolioWrite());
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(2);
    await expect(page.locator('.portfolio-chip.active')).not.toContainText('Saving');

    const result = await page.evaluate(() => {
      const ctl = window.__portfolioWriteControl || {};
      const writes = window.__portfolioTestWrites || [];
      const state = getProjectSaveState('q1');
      return {
        maxActive: ctl.maxActive || 0,
        writesCount: writes.length,
        lastPayloadHasLatestTitle: writes[writes.length - 1]?.text.includes('Queued task v2') || false,
        inMemoryTitle: portfolioBoards.find((b) => b.id === 'q1')?.data?.board?.tasks?.find((t) => t.id === 1)?.title,
        saveStatus: state?.status,
        revision: state?.revision,
        savedRevision: state?.savedRevision
      };
    });

    expect(result.maxActive).toBe(1);
    expect(result.writesCount).toBe(2);
    expect(result.lastPayloadHasLatestTitle).toBe(true);
    expect(result.inMemoryTitle).toBe('Queued task v2');
    expect(result.saveStatus).toBe('idle');
    expect(result.revision).toBe(result.savedRevision);
  });

  test('auto-save failure shows retry in chip and retry persists without alert', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'r1',
        title: 'Retry Save Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Retry task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'r1' });

    await page.evaluate(() => {
      window.__alerts = [];
      window.alert = (msg) => window.__alerts.push(String(msg));
    });
    await installControlledPortfolioWriter(page, { boardId: 'r1', holdWrites: false, failWrites: 1 });

    await page.evaluate(() => {
      runPortfolioTaskMutation('r1', 1, (task) => {
        task.title = 'Retry task edited';
        return true;
      });
    });

    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');
    await expect(activeChip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();

    let beforeRetry = await page.evaluate(() => ({
      alerts: window.__alerts || [],
      writes: window.__portfolioTestWrites || [],
      saveState: getProjectSaveState('r1')
    }));
    expect(beforeRetry.alerts).toEqual([]);
    expect(beforeRetry.writes).toHaveLength(0);
    expect(beforeRetry.saveState.status).toBe('error');
    expect(beforeRetry.saveState.revision).toBeGreaterThan(beforeRetry.saveState.savedRevision);

    await activeChip.getByRole('button', { name: 'Retry', exact: true }).click();

    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);
    await expect(activeChip).not.toContainText('Save failed');

    const afterRetry = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      const state = getProjectSaveState('r1');
      return {
        writesCount: writes.length,
        lastPayloadHasEdit: writes[writes.length - 1]?.text.includes('Retry task edited') || false,
        status: state?.status,
        revision: state?.revision,
        savedRevision: state?.savedRevision,
        alerts: window.__alerts || []
      };
    });

    expect(afterRetry.writesCount).toBe(1);
    expect(afterRetry.lastPayloadHasEdit).toBe(true);
    expect(afterRetry.status).toBe('idle');
    expect(afterRetry.revision).toBe(afterRetry.savedRevision);
    expect(afterRetry.alerts).toEqual([]);
  });

  test('external disk change reloads board when there are no unsaved local edits', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'e1',
        title: 'External One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'e1' });

    await mutateExternalBoardFile(page, {
      boardId: 'e1',
      payload: buildBoardPayload({
        title: 'External One',
        tasks: [{ id: 1, title: 'Changed on disk', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect(portfolioCard(page, 'Changed on disk')).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('External update');

    const result = await page.evaluate(() => ({
      title: portfolioBoards.find((b) => b.id === 'e1')?.data?.board?.tasks?.find((t) => t.id === 1)?.title,
      status: portfolioBoards.find((b) => b.id === 'e1')?.data?.board?.tasks?.find((t) => t.id === 1)?.status
    }));
    expect(result.title).toBe('Changed on disk');
    expect(result.status).toBe('doing');
  });

  test('external change conflict can keep local edits and save them', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'c1',
        title: 'Conflict Local',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Start title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'c1' });

    await installControlledPortfolioWriter(page, { boardId: 'c1', holdWrites: false, failWrites: 1 });
    await page.evaluate(() => {
      runPortfolioTaskMutation('c1', 1, (task) => {
        task.title = 'Local unsaved edit';
        return true;
      });
    });
    await expect(page.locator('.portfolio-chip.active')).toContainText('Save failed');

    await page.evaluate(() => {
      window.__conflictPrompts = [];
      window.prompt = (message, initialValue) => {
        window.__conflictPrompts.push({ message: String(message), initialValue: String(initialValue || '') });
        return 'local';
      };
    });

    await mutateExternalBoardFile(page, {
      boardId: 'c1',
      payload: buildBoardPayload({
        title: 'Conflict Local',
        tasks: [{ id: 1, title: 'Disk title', status: 'done' }]
      })
    });
    await triggerExternalFileCheck(page);

    const result = await page.evaluate(() => {
      const board = portfolioBoards.find((b) => b.id === 'c1');
      const task = board?.data?.board?.tasks?.find((t) => t.id === 1);
      return {
        title: task?.title,
        status: task?.status,
        promptCount: (window.__conflictPrompts || []).length,
        writes: (window.__portfolioTestWrites || []).length,
        saveState: getProjectSaveState('c1')
      };
    });

    expect(result.promptCount).toBeGreaterThan(0);
    expect(result.title).toBe('Local unsaved edit');
    expect(result.status).toBe('backlog');
    expect(result.writes).toBe(1);
    expect(result.saveState.status).toBe('idle');
    expect(result.saveState.revision).toBe(result.saveState.savedRevision);
  });

  test('external change conflict can reload from disk and discard unsaved local edits', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'c2',
        title: 'Conflict Reload',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'c2' });

    await installControlledPortfolioWriter(page, { boardId: 'c2', holdWrites: false, failWrites: 1 });
    await page.evaluate(() => {
      runPortfolioTaskMutation('c2', 1, (task) => {
        task.title = 'Local edited title';
        return true;
      });
    });
    await expect(page.locator('.portfolio-chip.active')).toContainText('Save failed');

    await page.evaluate(() => {
      window.prompt = () => 'reload';
    });

    await mutateExternalBoardFile(page, {
      boardId: 'c2',
      payload: buildBoardPayload({
        title: 'Conflict Reload',
        tasks: [{ id: 1, title: 'Disk wins title', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect(portfolioCard(page, 'Disk wins title')).toBeVisible();

    const result = await page.evaluate(() => {
      const board = portfolioBoards.find((b) => b.id === 'c2');
      const task = board?.data?.board?.tasks?.find((t) => t.id === 1);
      const state = getProjectSaveState('c2');
      return {
        title: task?.title,
        status: task?.status,
        writes: (window.__portfolioTestWrites || []).length,
        statusFlag: state?.status,
        revision: state?.revision,
        savedRevision: state?.savedRevision
      };
    });

    expect(result.title).toBe('Disk wins title');
    expect(result.status).toBe('doing');
    expect(result.writes).toBe(0);
    expect(result.statusFlag).toBe('idle');
    expect(result.revision).toBe(result.savedRevision);
  });

  test('invalid external file does not replace in-memory board and reports watch error', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'w1',
        title: 'Watch Errors',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Safe title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'w1' });

    await mutateExternalBoardFile(page, { boardId: 'w1', payload: null, invalidText: '{ invalid json' });
    await triggerExternalFileCheck(page);

    await expect(portfolioCard(page, 'Safe title')).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Watch error');

    const title = await page.evaluate(() => portfolioBoards.find((b) => b.id === 'w1')?.data?.board?.tasks?.find((t) => t.id === 1)?.title);
    expect(title).toBe('Safe title');
  });

  test('external checks cover writable boards that are not selected', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a1',
        title: 'Alpha',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Alpha task', status: 'backlog' }]
      },
      {
        id: 'b1',
        title: 'Bravo',
        hasHandle: true,
        tasks: [{ id: 2, title: 'Bravo task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'a1' });

    await mutateExternalBoardFile(page, {
      boardId: 'b1',
      payload: buildBoardPayload({
        title: 'Bravo',
        tasks: [{ id: 2, title: 'Bravo updated externally', status: 'done' }]
      })
    });
    await triggerExternalFileCheck(page);

    const result = await page.evaluate(() => ({
      alphaTitle: portfolioBoards.find((b) => b.id === 'a1')?.data?.board?.tasks?.find((t) => t.id === 1)?.title,
      bravoTitle: portfolioBoards.find((b) => b.id === 'b1')?.data?.board?.tasks?.find((t) => t.id === 2)?.title,
      bravoStatus: portfolioBoards.find((b) => b.id === 'b1')?.data?.board?.tasks?.find((t) => t.id === 2)?.status
    }));

    expect(result.alphaTitle).toBe('Alpha task');
    expect(result.bravoTitle).toBe('Bravo updated externally');
    expect(result.bravoStatus).toBe('done');
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
