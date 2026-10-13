import { test, expect, type Page } from '@playwright/test';

import {
  answerAppMessage,
  appMessage,
  buildBoardPayload,
  focusIsInside,
  gotoApp,
  installControlledPortfolioWriter,
  mockNewProjectFlow,
  mutateExternalBoardFile,
  readSavedBoard,
  seedPortfolioBoards,
  selectPortfolioBoard,
  setTimelineSlider,
  triggerExternalFileCheck,
  waitForBoardWrites,
  type SeedTask
} from '../support/portfolio';

const DEFAULT_COLUMNS = ['ID', 'Title', 'Status', 'Assignees', 'Priority', 'Phase', 'Updated'];

function tableRows(page: Page) {
  return page.locator('#workitemsTable tbody tr[data-task-id]');
}

function tableRow(page: Page, id: number) {
  return page.locator(`#workitemsTable tbody tr[data-task-id="${id}"]`);
}

function tableHeader(page: Page, label: string) {
  return page.locator('#workitemsTable').getByRole('columnheader', {
    name: new RegExp(`^${label}\\b`)
  });
}

async function openTable(page: Page) {
  await page.locator('[data-view-mode="table"]').click();
  await expect(page.locator('#portfolioTable')).toBeVisible();
}

async function expectRowIds(page: Page, ids: number[]) {
  await expect.poll(() => tableRows(page).evaluateAll((rows) => (
    rows.map((row) => Number(row.getAttribute('data-task-id')))
  ))).toEqual(ids);
}

async function editTableTitle(page: Page, id: number, title: string) {
  await tableRow(page, id).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#taskModal')).toBeVisible();
  await page.locator('#taskName').fill(title);
  await page.locator('#taskModal .btn-primary').click();
  await expect(page.locator('#taskModal')).toBeHidden();
}

async function openColumnOptions(page: Page) {
  const options = page.locator('#tableColumns');
  if ((await options.getAttribute('open')) === null) await options.locator('summary').click();
  await expect(options).toHaveAttribute('open', '');
}

async function expectColumnOrder(page: Page, labels: string[]) {
  // Selection/action headers are deliberately excluded from the data-column order.
  const positions: number[] = [];
  for (const label of labels) {
    const header = tableHeader(page, label);
    await expect(header).toBeVisible();
    positions.push(await header.evaluate((node) => Array.from(node.parentElement!.children).indexOf(node)));
  }
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

async function moveColumnBefore(page: Page, label: string, before: string) {
  // Hidden columns may retain their positions in preferences. Exercise the UI
  // until the visible order is reached without assuming how they are stored.
  for (let moves = 0; moves < 20; moves += 1) {
    const position = await tableHeader(page, label).evaluate((node) => (
      Array.from(node.parentElement!.children).indexOf(node)
    ));
    const target = await tableHeader(page, before).evaluate((node) => (
      Array.from(node.parentElement!.children).indexOf(node)
    ));
    if (position < target) return;
    await page.locator('#tableColumns').getByRole('button', { name: `Move ${label} left`, exact: true }).click();
  }
  throw new Error(`Could not move ${label} before ${before}`);
}

async function exportCsv(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#tableExportCsv').click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('CSV download did not provide a readable stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// Parse the downloaded bytes independently of the application. In particular,
// splitting on lines/separators would miss regressions in quoted multiline cells.
function parseCsv(text: string, separator: ',' | ';') {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === separator) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  expect(quoted, 'CSV must close every quoted cell').toBe(false);
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

function numberedTasks(count: number): SeedTask[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Workitem ${String(index + 1).padStart(5, '0')}`,
    status: 'doing'
  }));
}

test.describe('workitems table', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('is project-scoped and distinguishes active, all and archived items with counts', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [
        { id: 1, title: 'Backlog item' },
        { id: 2, title: 'Doing item', status: 'doing' },
        { id: 3, title: 'Completed but active', status: 'done' },
        { id: 4, title: 'Archived backlog', archived: true },
        { id: 5, title: 'Archived done', status: 'done', archived: true }
      ]
    }, {
      id: 'beta', title: 'Beta', hasHandle: true,
      tasks: [{ id: 1, title: 'Other project item' }]
    }]);

    await expect(page.locator('[data-view-mode="table"]')).toBeHidden();
    await selectPortfolioBoard(page, 'Alpha');
    await expect(page.locator('[data-view-mode="table"]')).toHaveAccessibleName('Table');
    await openTable(page);

    await expect(page.locator('#tableArchive')).toHaveValue('active');
    await expectRowIds(page, [1, 2, 3]);
    await expect(page.locator('#portfolioTable')).toContainText('3 of 5 workitems · 3 active · 2 archived');
    await expectColumnOrder(page, DEFAULT_COLUMNS);
    await expect(page.locator('#portfolioTable')).not.toContainText('Other project item');

    await page.locator('#tableArchive').selectOption('all');
    await expectRowIds(page, [1, 2, 3, 4, 5]);
    await expect(page.locator('#portfolioTable')).toContainText('5 of 5 workitems · 3 active · 2 archived');

    await page.locator('#tableArchive').selectOption('archived');
    await expectRowIds(page, [4, 5]);
    await expect(page.locator('#portfolioTable')).toContainText('2 of 5 workitems · 3 active · 2 archived');
  });

  test('combines multi-status, assignee and text filters and searches descriptions and numeric IDs', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'filters', title: 'Filters', hasHandle: true,
      tasks: [
        { id: 11, title: 'Ana doing', status: 'doing', assignees: ['Ana'], description: 'Unique NEEDLE in description' },
        { id: 12, title: 'Ana planned', status: 'to-do', assignees: ['Ana', 'Bruno'] },
        { id: 13, title: 'Bruno doing', status: 'doing', assignees: ['Bruno'] },
        { id: 14, title: 'Ana done', status: 'done', assignees: ['Ana'] },
        { id: 15, title: 'Archived Ana', status: 'doing', assignees: ['Ana'], archived: true }
      ]
    }], { selectedBoardId: 'filters' });
    await openTable(page);

    await page.locator('#tableStatuses').selectOption(['doing', 'to-do']);
    await expectRowIds(page, [11, 12, 13]);
    await page.locator('#tableAssignee').selectOption({ label: 'Ana' });
    await expectRowIds(page, [11, 12]);
    await page.locator('#tableSearch').fill('needle');
    await expectRowIds(page, [11]);
    await page.locator('#tableSearch').fill('12');
    await expectRowIds(page, [12]);
    await page.locator('#tableSearch').fill('unmatched-text');
    await expect(tableRows(page)).toHaveCount(0);
    await expect(page.locator('#tableClearFilters')).toBeVisible();

    await page.locator('#tableClearFilters').click();
    await expect(page.locator('#tableSearch')).toHaveValue('');
    await expect(page.locator('#tableArchive')).toHaveValue('active');
    await expectRowIds(page, [11, 12, 13, 14]);
  });

  test('combines roadmap, priority and blocked filters using real entity IDs', async ({ page }) => {
    const match = {
      status: 'doing', phaseId: 'p1', milestoneId: 'm1', sprintId: 's1',
      priority: 'high', blocked: true, blockerReason: 'Waiting for supplier'
    };
    await seedPortfolioBoards(page, [{
      id: 'roadmap', title: 'Roadmap filters', hasHandle: true,
      tasks: [
        { id: 1, title: 'Exact match', ...match },
        { id: 2, title: 'Other phase', ...match, phaseId: 'p2' },
        { id: 3, title: 'No milestone', ...match, milestoneId: '' },
        { id: 4, title: 'No sprint', ...match, sprintId: '' },
        { id: 5, title: 'Low priority', ...match, priority: 'low' },
        { id: 6, title: 'Unblocked', ...match, blocked: false }
      ],
      extensions: {
        roadmap: {
          version: 1,
          phases: [
            { id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' },
            { id: 'p2', title: 'Delivery', startDate: '2026-05-01', endDate: '2026-05-31' }
          ],
          milestones: [{ id: 'm1', title: 'Release', dueDate: '2026-04-30' }],
          sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'roadmap' });
    await openTable(page);

    await page.locator('#tablePhase').selectOption('p1');
    await expectRowIds(page, [1, 3, 4, 5, 6]);
    await page.locator('#tableMilestone').selectOption('m1');
    await expectRowIds(page, [1, 4, 5, 6]);
    await page.locator('#tableSprint').selectOption('s1');
    await expectRowIds(page, [1, 5, 6]);
    await page.locator('#tablePriority').selectOption('high');
    await expectRowIds(page, [1, 6]);
    await page.locator('#tableBlocked').selectOption('blocked');
    await expectRowIds(page, [1]);
    await page.locator('#tableClearFilters').click();
    await expect(tableRows(page)).toHaveCount(6);
  });

  test('sorts ascending and descending with stable numeric-ID ties', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'sort', title: 'Sort', hasHandle: true,
      tasks: [
        { id: 10, title: 'Same title', dueDate: '2026-05-01' },
        { id: 2, title: 'Same title', dueDate: '2026-05-01' },
        { id: 3, title: 'Alpha', dueDate: '2026-04-01' },
        { id: 4, title: 'Zulu' }
      ]
    }], { selectedBoardId: 'sort' });
    await openTable(page);

    await tableHeader(page, 'Title').getByRole('button').click();
    await expect(tableHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
    await expectRowIds(page, [3, 2, 10, 4]);
    await tableHeader(page, 'Title').getByRole('button').click();
    await expect(tableHeader(page, 'Title')).toHaveAttribute('aria-sort', 'descending');
    await expectRowIds(page, [4, 2, 10, 3]);

    await openColumnOptions(page);
    await page.locator('#tableColumn-dueDate').check();
    await tableHeader(page, 'Due').getByRole('button').click();
    await expect(tableHeader(page, 'Due')).toHaveAttribute('aria-sort', 'ascending');
    const ascendingIds = await tableRows(page).evaluateAll((rows) => (
      rows.map((row) => Number(row.getAttribute('data-task-id')))
    ));
    expect(ascendingIds.filter((id) => id !== 4)).toEqual([3, 2, 10]);
    expect(ascendingIds.filter((id) => id === 4)).toHaveLength(1);
    await tableHeader(page, 'Due').getByRole('button').click();
    await expect(tableHeader(page, 'Due')).toHaveAttribute('aria-sort', 'descending');
    const descendingIds = await tableRows(page).evaluateAll((rows) => (
      rows.map((row) => Number(row.getAttribute('data-task-id')))
    ));
    expect(descendingIds.filter((id) => id !== 4)).toEqual([2, 10, 3]);
    expect(descendingIds.filter((id) => id === 4)).toHaveLength(1);
    await tableHeader(page, 'Due').getByRole('button').click();
    await expectRowIds(page, ascendingIds);
  });

  test('duplicate numeric IDs in different projects open the correct detail and edit only that project', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [{ id: 7, title: 'Alpha seven', description: 'Alpha description' }] },
      { id: 'beta', title: 'Beta', hasHandle: true, tasks: [{ id: 7, title: 'Beta seven', description: 'Beta description' }] }
    ], { selectedBoardId: 'alpha' });
    await openTable(page);
    const alphaBoardId = await tableRow(page, 7).getAttribute('data-board-id');
    expect(alphaBoardId).toBeTruthy();
    await tableRow(page, 7).getByRole('button', { name: 'Alpha seven', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Alpha seven');
    await expect(page.locator('#taskDetailModal')).toContainText('Alpha description');
    await page.keyboard.press('Escape');

    await selectPortfolioBoard(page, 'Beta');
    await openTable(page);
    const betaBoardId = await tableRow(page, 7).getAttribute('data-board-id');
    expect(betaBoardId).toBeTruthy();
    expect(betaBoardId).not.toBe(alphaBoardId);
    await tableRow(page, 7).getByRole('button', { name: /^#?7$/ }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Beta seven');
    await expect(page.locator('#taskDetailModal')).toContainText('Beta description');
    await page.keyboard.press('Escape');

    await editTableTitle(page, 7, 'Beta edited');
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'beta')).board.tasks[0].title).toBe('Beta edited');
    expect((await readSavedBoard(page, 'alpha')).board.tasks[0].title).toBe('Alpha seven');
    const writtenProjects = await page.evaluate(() => window.__portfolioTestWrites.map((write) => write.boardId));
    expect(new Set(writtenProjects)).toEqual(new Set(['beta']));
  });

  test('keyboard detail preserves filters, sort, page and returns focus to its trigger', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'keyboard', title: 'Keyboard', hasHandle: true, tasks: numberedTasks(100)
    }], { selectedBoardId: 'keyboard' });
    await openTable(page);
    await page.locator('#tableSearch').fill('Workitem');
    await tableHeader(page, 'Title').getByRole('button').click();
    await page.locator('#tableNextPage').click();
    await expect(page.locator('#portfolioTable')).toContainText('Page 2 of 2');

    const trigger = tableRow(page, 51).getByRole('button', { name: 'Workitem 00051', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Workitem 00051');
    await expect.poll(() => focusIsInside(page, '#taskDetailModal')).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusIsInside(page, '#taskDetailModal')).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusIsInside(page, '#taskDetailModal')).toBe(true);
    await page.keyboard.press('Escape');

    await expect(page.locator('#taskDetailModal')).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('#tableSearch')).toHaveValue('Workitem');
    await expect(tableHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('#portfolioTable')).toContainText('Page 2 of 2');
    await expectRowIds(page, Array.from({ length: 50 }, (_, index) => index + 51));
  });

  test('edits through the existing dialog, refreshes the table and survives JSON reimport', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'edit', title: 'Editable', hasHandle: true, tasks: numberedTasks(100)
    }], { selectedBoardId: 'edit' });
    await openTable(page);
    await page.locator('#tableSearch').fill('Workitem');
    await tableHeader(page, 'Title').getByRole('button').click();
    await page.locator('#tableNextPage').click();

    await editTableTitle(page, 51, 'Workitem 00051 edited');
    await expect(tableRow(page, 51)).toContainText('Workitem 00051 edited');
    await expect(page.locator('#tableSearch')).toHaveValue('Workitem');
    await expect(tableHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('#portfolioTable')).toContainText('Page 2 of 2');
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'edit');
    expect(saved.board.tasks.find((task: SeedTask) => task.id === 51)).toMatchObject({
      title: 'Workitem 00051 edited', status: 'doing'
    });

    // A fresh page/store consumes the serialized file, rather than trusting the
    // in-memory row or introducing a second fake application state.
    await page.reload();
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{
      id: 'reopened', title: saved.board.settings.title, hasHandle: true,
      tasks: saved.board.tasks, extensions: saved.extensions
    }], { selectedBoardId: 'reopened' });
    await openTable(page);
    await page.locator('#tableSearch').fill('00051 edited');
    await expectRowIds(page, [51]);
    await tableRow(page, 51).getByRole('button', { name: 'Workitem 00051 edited', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Workitem 00051 edited');
  });

  test('clicking a status cell returns focus to its own item and preserves table scroll on close', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'cell-focus', title: 'Cell focus', hasHandle: true, tasks: numberedTasks(100)
    }], { selectedBoardId: 'cell-focus' });
    await openTable(page);
    await page.locator('#tableSearch').fill('Workitem');
    await tableHeader(page, 'Title').getByRole('button').click();
    await page.locator('#tableNextPage').click();
    const row = tableRow(page, 80);
    const status = row.locator('[data-column="status"]');
    await status.scrollIntoViewIfNeeded();
    const scroll = page.locator('#portfolioTable .table-scroll');
    const before = await scroll.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }));
    expect(before.top).toBeGreaterThan(0);
    await status.click();
    await expect(page.locator('#detailTitle')).toHaveText('Workitem 00080');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();
    await expect(row.locator('button.table-item-link').first()).toBeFocused();
    await expect.poll(() => scroll.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }))).toEqual(before);
    await expect(page.locator('#tableSearch')).toHaveValue('Workitem');
    await expect(tableHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('#portfolioTable')).toContainText('Page 2 of 2');
  });

  test('historical table previews show replayed detail and export without changing the writable live project', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'history', title: 'Historical table', hasHandle: true,
      tasks: [{ id: 1, title: 'Original historical item', status: 'doing', description: 'Original description' }]
    }], { selectedBoardId: 'history' });
    await openTable(page);
    await editTableTitle(page, 1, 'Live edited item');
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'history');
    const writes = await page.evaluate(() => window.__portfolioTestWrites.length);

    // Reuse the timeline's real edit/baseline flow and slider helper.
    await page.locator('[data-view-mode="board"]').click();
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');
    await openTable(page);
    await expect(tableRow(page, 1)).toContainText('Original historical item');
    await expect(tableRow(page, 1)).not.toContainText('Live edited item');
    await expect(tableRow(page, 1).getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await page.locator('#tableSearch').fill('historical');
    await tableRow(page, 1).locator('[data-column="status"]').click();
    await expect(page.locator('#detailTitle')).toHaveText('Original historical item');
    await expect(page.locator('#taskDetailModal')).toContainText('Original description');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeHidden();
    await page.keyboard.press('x');
    await expect(appMessage(page)).toBeHidden();
    await page.keyboard.press('Escape');
    const csv = parseCsv(await exportCsv(page), ',');
    expect(csv).toHaveLength(2);
    expect(csv[1][csv[0].indexOf('Title')]).toBe('Original historical item');
    expect(await readSavedBoard(page, 'history')).toEqual(saved);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(writes);

    await page.locator('[data-view-mode="board"]').click();
    await page.locator('#portfolioTimelinePanel [data-action="timeline-latest"]').click();
    await openTable(page);
    await expect(page.locator('#tableSearch')).toHaveValue('historical');
    await expect(tableRows(page)).toHaveCount(0);
    await page.locator('#tableClearFilters').click();
    await expect(tableRow(page, 1)).toContainText('Live edited item');
    await expect(tableRow(page, 1).getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
  });

  test('read-only imports allow filtering, detail, selection and export without edits or writes', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'readonly', title: 'Read only', hasHandle: false,
      tasks: [
        { id: 1, title: 'Visible read-only item', status: 'doing', assignees: ['Ana'] },
        { id: 2, title: 'Other item', status: 'done' }
      ]
    }], { selectedBoardId: 'readonly' });
    await openTable(page);
    await expect(tableRow(page, 1).getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await page.locator('#tableStatuses').selectOption('doing');
    await page.locator('#tableAssignee').selectOption({ label: 'Ana' });
    await page.locator('#tableSearch').fill('read-only');
    await expectRowIds(page, [1]);
    await tableRow(page, 1).getByRole('button', { name: 'Visible read-only item', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Visible read-only item');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeHidden();
    await page.keyboard.press('x');
    await expect(appMessage(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expectRowIds(page, [1]);
    await tableRow(page, 1).getByRole('checkbox', { name: 'Select Visible read-only item', exact: true }).check();

    const csv = parseCsv(await exportCsv(page), ',');
    expect(csv).toHaveLength(2);
    expect(csv[1][csv[0].indexOf('Title')]).toBe('Visible read-only item');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
  });

  for (const separator of [',', ';'] as const) {
    test(`CSV uses ${separator} and visible ordered columns, safely exports every filtered row beyond the page and selection`, async ({ page }) => {
      const specialTitles = ['=SUM(1,2)', '+1+2', '-1+2', '@SUM(A1)', 'Vírgula, ponto; "aspas"\nsegunda linha'];
      const tasks: SeedTask[] = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        title: specialTitles[index] ?? `Export ${index + 1}`,
        status: 'doing', assignees: ['Ana'], dueDate: '2026-04-30'
      }));
      await seedPortfolioBoards(page, [{
        id: 'csv', title: 'CSV', hasHandle: true,
        tasks: [...tasks,
          { id: 101, title: 'Excluded status', status: 'done', assignees: ['Ana'] },
          { id: 102, title: 'Excluded assignee', status: 'doing', assignees: ['Bruno'] },
          { id: 103, title: 'Excluded archive', status: 'doing', assignees: ['Ana'], archived: true }
        ]
      }], { selectedBoardId: 'csv' });
      await openTable(page);
      await page.locator('#tableStatuses').selectOption('doing');
      await page.locator('#tableAssignee').selectOption({ label: 'Ana' });
      await page.locator('#tablePageSize').selectOption('25');
      await expect(tableRows(page)).toHaveCount(25);
      await tableHeader(page, 'ID').getByRole('button').click();
      await expect(tableHeader(page, 'ID')).toHaveAttribute('aria-sort', 'descending');
      await tableRow(page, 100).getByRole('checkbox', { name: 'Select Export 100', exact: true }).check();
      await expect(page.locator('#portfolioTable .table-summary > span[role="status"]')).toHaveText('1 selected');

      await openColumnOptions(page);
      for (const column of ['status', 'assignees', 'priority', 'phase', 'updatedAt']) {
        await page.locator(`#tableColumn-${column}`).uncheck();
      }
      await page.locator('#tableColumn-dueDate').check();
      await moveColumnBefore(page, 'Due', 'Title');
      await expectColumnOrder(page, ['ID', 'Due', 'Title']);
      await page.locator('#tableCsvSeparator').selectOption(separator);

      const csv = parseCsv(await exportCsv(page), separator);
      expect(csv[0]).toEqual(['ID', 'Due', 'Title']);
      expect(csv).toHaveLength(101);
      expect(csv.slice(1).map((row) => Number(row[0]))).toEqual(
        Array.from({ length: 100 }, (_, index) => 100 - index)
      );
      expect(csv.slice(1).every((row) => row.length === 3 && row[1] === '2026-04-30')).toBe(true);
      for (let index = 0; index < 4; index += 1) {
        expect(csv.find((row) => row[0] === String(index + 1))?.[2]).toBe(`'${specialTitles[index]}`);
      }
      expect(csv.find((row) => row[0] === '5')?.[2]).toBe(specialTitles[4]);
      expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    });
  }

  test('column visibility and ordering survive reload without modifying the project JSON', async ({ page }) => {
    const board = { id: 'prefs', title: 'Preferences', hasHandle: true, tasks: [{ id: 1, title: 'Preferences item' }] };
    await seedPortfolioBoards(page, [board], { selectedBoardId: 'prefs' });
    const original = await readSavedBoard(page, 'prefs');
    await openTable(page);
    await openColumnOptions(page);
    await page.locator('#tableColumn-priority').uncheck();
    await page.locator('#tableColumn-dueDate').check();
    await moveColumnBefore(page, 'Due', 'Phase');
    await page.locator('#tableColumns').getByRole('button', { name: 'Move Due right', exact: true }).click();
    await moveColumnBefore(page, 'Due', 'Phase');
    await expect(tableHeader(page, 'Priority')).toHaveCount(0);
    await expectColumnOrder(page, ['ID', 'Title', 'Status', 'Assignees', 'Due', 'Phase', 'Updated']);
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    expect(await readSavedBoard(page, 'prefs')).toEqual(original);

    await page.reload();
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [board], { selectedBoardId: 'prefs' });
    await openTable(page);
    await expect(tableHeader(page, 'Priority')).toHaveCount(0);
    await expectColumnOrder(page, ['ID', 'Title', 'Status', 'Assignees', 'Due', 'Phase', 'Updated']);
    await openColumnOptions(page);
    await expect(page.locator('#tableColumn-priority')).not.toBeChecked();
    await expect(page.locator('#tableColumn-dueDate')).toBeChecked();
    await expect(tableHeader(page, 'ID')).toBeVisible();
    await expect(tableHeader(page, 'Title')).toBeVisible();
    for (const column of ['id', 'title']) {
      const toggle = page.locator(`#tableColumn-${column}`);
      if (await toggle.count()) await expect(toggle).toBeDisabled();
    }
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
  });

  test('paginates 10,000 items with bounded DOM rows and resets an out-of-range page after filtering', async ({ page }) => {
    test.setTimeout(60_000);
    await seedPortfolioBoards(page, [{
      id: 'large', title: 'Large project', hasHandle: true, tasks: numberedTasks(10_000)
    }], { selectedBoardId: 'large' });
    await openTable(page);
    await expect(page.locator('#tablePageSize')).toHaveValue('50');
    await expectRowIds(page, Array.from({ length: 50 }, (_, index) => index + 1));
    await expect(page.locator('#portfolioTable')).toContainText('Page 1 of 200');
    await expect(page.locator('#portfolioTable')).toContainText('10000 active');
    await expect(page.locator('#tablePreviousPage')).toBeDisabled();
    await page.locator('#tableNextPage').click();
    await expectRowIds(page, Array.from({ length: 50 }, (_, index) => index + 51));
    await expect(page.locator('#portfolioTable')).toContainText('Page 2 of 200');
    await page.locator('#tablePreviousPage').click();
    await expectRowIds(page, Array.from({ length: 50 }, (_, index) => index + 1));

    await page.locator('#tablePageSize').selectOption('100');
    await expect(tableRows(page)).toHaveCount(100);
    await expect(page.locator('#portfolioTable')).toContainText('Page 1 of 100');
    await page.locator('#tablePageSize').selectOption('25');
    await expect(tableRows(page)).toHaveCount(25);
    await expect(page.locator('#portfolioTable')).toContainText('Page 1 of 400');
    await page.locator('#portfolioTable').getByRole('checkbox', { name: 'Select this page', exact: true }).check();
    await expect(tableRows(page).getByRole('checkbox', { checked: true })).toHaveCount(25);
    await expect(page.locator('#portfolioTable .table-summary > span[role="status"]')).toHaveText('25 selected');
    await page.locator('#tableNextPage').click();
    await expect(tableRows(page).getByRole('checkbox', { checked: true })).toHaveCount(0);

    await page.locator('#tableSearch').fill('Workitem 10000');
    await expectRowIds(page, [10_000]);
    await expect(page.locator('#portfolioTable')).toContainText('Page 1 of 1');
    await expect(page.locator('#tableNextPage')).toBeDisabled();
    await expect(page.locator('#tablePreviousPage')).toBeDisabled();
  });

  test('Portuguese empty, no-match and missing-value states are distinct and translated', async ({ page }) => {
    await page.locator('#languageToggleBtn').click();
    await seedPortfolioBoards(page, [
      { id: 'empty', title: 'Vazio', hasHandle: false, tasks: [] },
      { id: 'legacy', title: 'Legado', hasHandle: false, tasks: [{ id: 1, title: 'Sem atributos' }] }
    ], { selectedBoardId: 'empty' });
    await expect(page.locator('[data-view-mode="table"]')).toHaveAccessibleName('Tabela');
    await openTable(page);
    await expect(page.locator('#portfolioTable')).toContainText('Este projeto ainda não tem workitems.');
    await expect(page.locator('#tableCreateTask')).toBeHidden();

    await selectPortfolioBoard(page, 'Legado');
    await openTable(page);
    await expect(tableRow(page, 1)).toContainText('Não definido');
    await expect(tableRow(page, 1).getByRole('button', { name: 'Editar', exact: true })).toBeDisabled();
    await page.locator('#tableSearch').fill('inexistente');
    await expect(tableRows(page)).toHaveCount(0);
    await expect(page.locator('#portfolioTable')).toContainText('Nenhum workitem corresponde aos filtros.');
    await expect(page.locator('#portfolioTable')).not.toContainText('Este projeto ainda não tem workitems.');
    await page.locator('#tableClearFilters').click();
    await expectRowIds(page, [1]);
  });

  test('a new writable project offers create-workitem in the empty table and persists the created item', async ({ page }) => {
    await mockNewProjectFlow(page, { fileName: 'empty-table.json' });
    await page.locator('#newProjectBtn').click();
    await answerAppMessage(page, { expectText: 'Project name:', input: 'New table project' });
    await openTable(page);
    await expect(tableRows(page)).toHaveCount(0);
    await page.locator('#tableCreateTask').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('First workitem');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(tableRows(page)).toHaveCount(1);
    await expect(tableRows(page)).toContainText('First workitem');
    await expect.poll(() => page.evaluate(() => {
      const latest = window.__newProjectWrites.at(-1);
      return latest ? JSON.parse(latest).board.tasks.map((task: SeedTask) => task.title) : [];
    })).toEqual(['First workitem']);
  });

  test('a table edit that fails to save can retry through the existing project chip', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'retry', title: 'Retry table', hasHandle: true, tasks: [{ id: 1, title: 'Before edit' }]
    }], { selectedBoardId: 'retry' });
    await openTable(page);
    await installControlledPortfolioWriter(page, { boardId: 'retry', failWrites: 1 });
    await editTableTitle(page, 1, 'Unsaved edit');
    await expect(tableRow(page, 1)).toContainText('Unsaved edit');
    const chip = page.locator('.portfolio-chip.active');
    await expect(chip).toContainText('Save failed');
    expect((await readSavedBoard(page, 'retry')).board.tasks[0].title).toBe('Before edit');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    await expect(appMessage(page)).toBeHidden();

    await chip.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitForBoardWrites(page);
    await expect(chip.locator('.chip-save-state')).toHaveCount(0);
    expect((await readSavedBoard(page, 'retry')).board.tasks[0].title).toBe('Unsaved edit');
    await expect(tableRow(page, 1)).toContainText('Unsaved edit');
  });

  test('external conflicts do not overwrite disk silently and reload refreshes the filtered table', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'conflict', title: 'Table conflict', hasHandle: true,
      tasks: [{ id: 1, title: 'Original item', status: 'doing' }]
    }], { selectedBoardId: 'conflict' });
    await openTable(page);
    await page.locator('#tableStatuses').selectOption('doing');
    await installControlledPortfolioWriter(page, { boardId: 'conflict', failWrites: 1 });
    await editTableTitle(page, 1, 'Local unsaved item');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Save failed');

    await mutateExternalBoardFile(page, {
      boardId: 'conflict',
      payload: buildBoardPayload({
        title: 'Table conflict', tasks: [{ id: 1, title: 'External item', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);
    await expect(appMessage(page)).toBeVisible();
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    expect((await readSavedBoard(page, 'conflict')).board.tasks[0].title).toBe('External item');
    await answerAppMessage(page, { button: 'Reload from disk', expectText: 'changed on disk' });

    await expect(tableRow(page, 1)).toContainText('External item');
    await expect(tableRow(page, 1)).not.toContainText('Local unsaved item');
    await expect(page.locator('#tableStatuses')).toHaveValues(['doing']);
    await expect(page.locator('.portfolio-chip.active')).not.toContainText('Save failed');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
  });

  test('invalid external JSON preserves the current table and reports a watch error without writing', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'invalid', title: 'Invalid external file', hasHandle: true,
      tasks: [{ id: 1, title: 'Safe in-memory item', status: 'doing' }]
    }], { selectedBoardId: 'invalid' });
    await openTable(page);
    await page.locator('#tableSearch').fill('Safe');
    await mutateExternalBoardFile(page, { boardId: 'invalid', invalidText: '{ invalid json' });
    await triggerExternalFileCheck(page);

    await expect(page.locator('.portfolio-chip.active')).toContainText('Watch error');
    await expectRowIds(page, [1]);
    await expect(tableRow(page, 1)).toContainText('Safe in-memory item');
    await expect(page.locator('#tableSearch')).toHaveValue('Safe');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
    expect(await page.evaluate(() => window.__portfolioDiskByBoardId.invalid.text)).toBe('{ invalid json');
  });
});
