'use strict';

// Shared Playwright harness for the black-box suites (app.test.js and
// visual.test.js). Board payload builders, seeding through the real Import and
// drop flows with a fake File System Access disk, and page queries. Not a test
// file: Playwright only collects *.test.js.

const { expect } = require('@playwright/test');

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
    tags: Array.isArray(task.tags) ? task.tags : [],
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
  await page.goto('/');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('#boardView')).toHaveCount(0);
}

// Seeds boards the way a user loads them: writable boards through the Import
// button (with a fake File System Access picker), read-only boards by dropping
// files on the window. The fake disk below is a double for the browser's file
// system, not for the app: tests may read it, the app only sees file handles.
//
// `board.id` is a test label. The app assigns its own random ids, so the label
// only keys the fake disk (`window.__portfolioDiskByBoardId[label]`) and write
// records; the UI is addressed by board title.
async function seedPortfolioBoards(
  page,
  boards,
  { selectedBoardId = '', sortKey = '' } = {}
) {
  const seededBoards = boards.map((board) => ({
    label: board.id,
    title: board.title,
    hasHandle: Boolean(board.hasHandle),
    fileName: board.fileName || `${board.id}.board.json`,
    text: JSON.stringify(buildBoardPayload({
      title: board.title,
      tasks: board.tasks || [],
      extensions: board.extensions || {}
    }), null, 2)
  }));
  const writableBoards = seededBoards.filter((board) => board.hasHandle);
  const readOnlyBoards = seededBoards.filter((board) => !board.hasHandle);

  await page.evaluate((writableBoards) => {
    window.__portfolioTestWrites = [];
    window.__portfolioDiskByBoardId = window.__portfolioDiskByBoardId || {};
    window.__portfolioFileOpensByBoardId = window.__portfolioFileOpensByBoardId || {};
    window.__portfolioFileReadsByBoardId = window.__portfolioFileReadsByBoardId || {};

    const handles = writableBoards.map((board) => {
      const label = board.label;
      window.__portfolioDiskByBoardId[label] = { text: board.text, lastModified: Date.now() };
      window.__portfolioFileOpensByBoardId[label] = 0;
      window.__portfolioFileReadsByBoardId[label] = 0;

      async function recordWrite(text) {
        const serialized = String(text);
        const ctl = window.__portfolioWriteControl;
        const controlled = ctl && ctl.boardId === label;
        let attempt;
        if (controlled) {
          ctl.attempts += 1;
          attempt = ctl.attempts;
          ctl.active += 1;
          ctl.maxActive = Math.max(ctl.maxActive, ctl.active);
        }
        try {
          if (controlled && ctl.failRemaining > 0) {
            ctl.failRemaining -= 1;
            throw new Error(`Simulated save failure #${attempt}`);
          }
          if (controlled && ctl.holdWrites) {
            await new Promise((resolve) => ctl.pendingResolvers.push(resolve));
          }
          window.__portfolioTestWrites.push(controlled
            ? { boardId: label, text: serialized, attempt }
            : { boardId: label, text: serialized });
          const disk = window.__portfolioDiskByBoardId[label];
          disk.text = serialized;
          disk.lastModified = Date.now();
        } finally {
          if (controlled) ctl.active -= 1;
        }
      }

      return {
        name: board.fileName,
        async getFile() {
          window.__portfolioFileOpensByBoardId[label] += 1;
          const disk = window.__portfolioDiskByBoardId[label];
          const text = String(disk.text);
          return {
            name: board.fileName,
            size: new Blob([text]).size,
            lastModified: Number(disk.lastModified) || Date.now(),
            async text() {
              window.__portfolioFileReadsByBoardId[label] += 1;
              return text;
            }
          };
        },
        async createWritable() {
          return {
            write: recordWrite,
            async close() {}
          };
        }
      };
    });

    window.showOpenFilePicker = async () => handles;
  }, writableBoards);

  const chips = page.locator('#portfolioBoardsChips');

  if (writableBoards.length > 0) {
    await page.locator('#importProjectsBtn').click();
    for (const board of writableBoards) {
      await expect(chips).toContainText(board.title);
    }
    // Import reads each file once to build the record, then the app reads it
    // again to take its external-change baseline. Wait for that second read so
    // a test's later disk mutation is detected as a change, not taken as baseline.
    await expect.poll(() => page.evaluate((labels) => (
      labels.every((label) => window.__portfolioFileReadsByBoardId[label] >= 2)
    ), writableBoards.map((board) => board.label))).toBe(true);
  }

  if (readOnlyBoards.length > 0) {
    await page.evaluate((readOnlyBoards) => {
      const dt = new DataTransfer();
      readOnlyBoards.forEach((board) => {
        dt.items.add(new File([board.text], board.fileName, { type: 'application/json' }));
      });
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, readOnlyBoards);
    for (const board of readOnlyBoards) {
      await expect(chips).toContainText(board.title);
    }
  }

  const selectedBoard = seededBoards.find((board) => board.label === selectedBoardId);
  if (selectedBoard) {
    await selectPortfolioBoard(page, selectedBoard.title);
  } else {
    await page.locator('#portfolioBoardsChips [data-action="select-board"][data-board-id=""]').click();
  }

  if (sortKey === 'task') {
    await page.locator('#portfolioSortSelect').selectOption('name');
  } else if (sortKey) {
    await page.locator('#portfolioSortSelect').selectOption(sortKey);
  }
}

function escapeForRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function portfolioBoardChip(page, title) {
  return page.locator('#portfolioBoardsChips .portfolio-chip').filter({
    has: page.locator('[data-action="select-board"]', { hasText: new RegExp(`^\\s*${escapeForRegExp(title)}(\\s|$)`) })
  });
}

async function selectPortfolioBoard(page, title) {
  const chip = portfolioBoardChip(page, title);
  if (!(await chip.evaluate((node) => node.classList.contains('active')))) {
    await chip.locator('[data-action="select-board"]').click();
  }
  await expect(chip).toHaveClass(/\bactive\b/);
}

// Parsed contents of a seeded board's file on the fake disk: the last write, or
// the seeded text if the app has not saved yet.
async function readSavedBoard(page, boardLabel) {
  const text = await page.evaluate((label) => {
    const disk = window.__portfolioDiskByBoardId && window.__portfolioDiskByBoardId[label];
    if (!disk) throw new Error(`Disk state not found for board: ${label}`);
    return disk.text;
  }, boardLabel);
  return JSON.parse(text);
}

// Waits until the app has written to the fake disk at least `minCount` times
// since the boards were seeded (or the write control was installed).
async function waitForBoardWrites(page, minCount = 1) {
  await expect.poll(() => page.evaluate(() => (window.__portfolioTestWrites || []).length)).toBeGreaterThanOrEqual(minCount);
}

function portfolioCard(page, title) {
  return page.locator('.portfolio-task-card').filter({ hasText: title }).first();
}

async function focusIsInside(page, selector) {
  return page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);
}

async function closeDialogBy(page, dialogId, method) {
  if (method === 'Escape') {
    await page.keyboard.press('Escape');
  } else if (method === 'close button') {
    await page.locator(`#${dialogId}CloseBtn`).click();
  } else if (method === 'footer button') {
    await page.locator(`#${dialogId}FooterCloseBtn`).click();
  } else if (method === 'cancel button') {
    await page.locator(`#${dialogId}CancelBtn`).click();
  } else if (method === 'overlay click') {
    await page.locator(`#${dialogId}`).click({ position: { x: 5, y: 5 } });
  } else {
    throw new Error(`Unknown dialog close method: ${method}`);
  }
}

module.exports = {
  FIXED_TIMESTAMP,
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  portfolioBoardChip,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy
};
