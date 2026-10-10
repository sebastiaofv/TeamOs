import { test, expect, type Locator, type Page } from '@playwright/test';

import { createBoardStateSnapshot } from '../../src/domain/serialize';
import { normalizeTask } from '../../src/domain/task';
import { ensureBoardTimelineBaseline, recordTaskTimelineEvent } from '../../src/domain/timeline';
import {
  answerAppMessage,
  buildBoardPayload,
  FIXED_TIMESTAMP,
  gotoApp,
  installControlledPortfolioWriter,
  openTaskEditor,
  portfolioBoardChip,
  portfolioCard,
  readSavedBoard,
  renameTaskViaEditor,
  seedPortfolioBoards,
  setTimelineSlider,
  waitForBoardWrites,
  type SeedBoard,
  type SeedTask
} from '../support/portfolio';

const history = (page: Page) => page.locator('#taskDetailModal details#taskHistory');
const entries = (page: Page) => history(page).locator('.task-history-entry');

async function openDetail(page: Page, title: string) {
  await portfolioCard(page, title).click();
  await expect(page.locator('#taskDetailModal')).toBeVisible();
  await expect(page.locator('#detailTitle')).toHaveText(title);
}

async function expandHistory(page: Page, label = 'History') {
  const section = history(page);
  await expect(section).toBeVisible();
  const summary = section.locator(':scope > summary');
  await expect(summary).toHaveAccessibleName(label);
  if (!(await section.evaluate((node) => node.hasAttribute('open')))) await summary.click();
  await expect(section).toHaveAttribute('open', '');
}

async function expandEntry(entry: Locator, language: 'en' | 'pt' = 'en') {
  const summary = entry.locator('summary').first();
  await expect(summary).toBeVisible();
  await expect(summary).not.toHaveText('');
  await summary.click();
  await expect(entry.getByText(language === 'pt' ? 'Antes' : 'Before', { exact: true }).first()).toBeVisible();
  await expect(entry.getByText(language === 'pt' ? 'Depois' : 'After', { exact: true }).first()).toBeVisible();
}

// Establish the initial known state before measuring action-only increments.
// Otherwise the first mutation adds both that state and the action to history.
function withBaseline(board: SeedBoard): SeedBoard {
  const data = createBoardStateSnapshot(buildBoardPayload({
    title: board.title,
    tasks: board.tasks,
    extensions: board.extensions
  }));
  ensureBoardTimelineBaseline(data);
  return { ...board, tasks: data.board.tasks, extensions: data.extensions };
}

// Build a real project timeline through the domain's public recording API. Its
// empty baseline proves creation; an imported task's createdAt alone does not.
function projectWithHistory(id: string, title: string, taskTitle: string, hasHandle = true): SeedBoard {
  const data = createBoardStateSnapshot(buildBoardPayload({ title }));
  const created = normalizeTask({
    id: 1,
    title: taskTitle,
    description: `${taskTitle} first description`,
    status: 'to-do',
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    checklist: [{ text: 'Review evidence', done: false }]
  });
  recordTaskTimelineEvent(data, null, created);
  data.board.tasks.push(created);
  const updated = { ...created, description: `${taskTitle} revised description` };
  recordTaskTimelineEvent(data, created, updated);
  data.board.tasks = [updated];
  return { id, title, hasHandle, tasks: data.board.tasks, extensions: data.extensions };
}

async function diskSnapshot(page: Page) {
  return page.evaluate(() => ({
    files: Object.fromEntries(Object.entries(window.__portfolioDiskByBoardId || {}).map(([id, disk]) => [id, disk.text])),
    writes: window.__portfolioTestWrites || []
  }));
}

test.describe('task history', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('one real edit groups title, description and priority into one expandable entry', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ id: 1, title: 'Original task', description: 'Original description', priority: 'low', status: 'to-do' }]
    }], { selectedBoardId: 'alpha' });

    await openTaskEditor(page, 'Original task');
    await page.locator('#taskName').fill('Revised task');
    await page.locator('#taskDescription').fill('Revised description');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await waitForBoardWrites(page);

    await openDetail(page, 'Revised task');
    await expandHistory(page);
    const edit = entries(page).first();
    await expandEntry(edit);
    await expect(entries(page).filter({ hasText: 'Revised description' })).toHaveCount(1);
    for (const value of ['Original task', 'Revised task', 'Original description', 'Revised description']) {
      await expect(edit).toContainText(value);
    }
    await expect(edit).toContainText(/low/i);
    await expect(edit).toContainText(/high/i);
    await expect(edit).toContainText(/\d{1,2}:\d{2}/);
    await expect(page.locator('#detailDescription')).toHaveText('Revised description');

    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.timeline.events.map((event: { kind: string }) => event.kind))
      .toEqual(['board.baseline', 'task.updated']);
    expect(saved.extensions.timeline.events[1].changes).toMatchObject({
      title: { before: 'Original task', after: 'Revised task' },
      description: { before: 'Original description', after: 'Revised description' },
      priority: { before: 'low', after: 'high' }
    });
  });

  test('history stays non-empty after successive normal edits and reopening the task', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'history-regression', title: 'History regression', hasHandle: true,
      tasks: [{ id: 1, title: 'History regression task', status: 'to-do' }],
      extensions: { roadmap: {
        version: 1, sprints: [],
        phases: [{ id: 'delivery', title: 'Delivery', startDate: '2026-10-01', endDate: '2026-10-31' }],
        milestones: [{ id: 'release', title: 'Release', dueDate: '2026-10-20' }]
      } }
    }], { selectedBoardId: 'history-regression' });

    const changes = [
      async () => { await page.locator('#taskDescription').fill('Description changed'); },
      async () => { await page.locator('#taskPriority').selectOption('high'); },
      async () => {
        await page.locator('#taskBlocked').check();
        await page.locator('#taskBlockerReason').fill('Waiting for review');
      },
      async () => { await page.locator('#taskBlocked').uncheck(); },
      async () => {
        await page.locator('#taskAssigneeNewItem').fill('Ana');
        await page.locator('#taskAssigneeNewItem').press('Enter');
      },
      async () => { await page.locator('#taskDueDate').fill('2026-10-20'); },
      async () => {
        await page.locator('#taskPhase').selectOption('delivery');
        await page.locator('#taskMilestone').selectOption('release');
      }
    ];
    for (const [index, edit] of changes.entries()) {
      await openTaskEditor(page, 'History regression task');
      await edit();
      await page.locator('#taskModal .btn-primary').click();
      await expect(page.locator('#taskModal')).toBeHidden();
      await waitForBoardWrites(page, index + 1);
      const saved = await readSavedBoard(page, 'history-regression');
      expect(saved.extensions.timeline.events.length).toBeGreaterThan(1);
      await openDetail(page, 'History regression task');
      await expandHistory(page);
      await expect(history(page), `history disappeared after edit ${index + 1}`).not.toContainText('No changes recorded');
      await expect(entries(page)).toHaveCount(index + 2);
      await page.locator('#taskDetailModalCloseBtn').click();
    }
  });

  const olderFieldCases: { name: string; fields: Pick<SeedTask, 'tags' | 'assignees' | 'blocked' | 'blockerReason'> }[] = [
    { name: 'tags', fields: { tags: [' Bug '] } },
    { name: 'canonical tags', fields: { tags: ['bug'] } },
    { name: 'assignees', fields: { assignees: [' Ana '] } },
    { name: 'blocker', fields: { blocked: true, blockerReason: ' Waiting for review ' } }
  ];
  for (const { name, fields } of olderFieldCases) {
    test(`a new edit remains visible with an imported timeline containing older ${name} values`, async ({ page }) => {
      const task = { id: 1, title: 'Imported task', status: 'to-do', ...fields };
      const snapshot = buildBoardPayload({ title: 'Imported history', tasks: [task] });
      await seedPortfolioBoards(page, [{
        id: 'legacy-history', title: 'Imported history', hasHandle: true, tasks: [task],
        extensions: { timeline: {
          version: 1, baselineEventId: 'legacy-baseline', events: [{
            id: 'legacy-baseline', at: FIXED_TIMESTAMP, kind: 'board.baseline',
            entityType: 'board', entityId: 'board', summary: 'Initial state', snapshot
          }]
        } }
      }], { selectedBoardId: 'legacy-history' });
      await renameTaskViaEditor(page, 'Imported task', 'Edited imported task');
      await waitForBoardWrites(page);
      const saved = await readSavedBoard(page, 'legacy-history');
      expect(saved.extensions.timeline.events.at(-1).changes.title)
        .toEqual({ before: 'Imported task', after: 'Edited imported task' });
      await page.locator('#languageToggleBtn').click();
      await openDetail(page, 'Edited imported task');
      await expandHistory(page, 'Histórico');
      await expect(history(page)).not.toContainText('Sem alterações registadas no histórico disponível');
      await expect(entries(page), 'recorded changes must not produce an empty history').toHaveCount(2);
      await expandEntry(entries(page).first(), 'pt');
      await expect(entries(page).first()).toContainText('Imported task');
      await expect(entries(page).first()).toContainText('Edited imported task');
    });
  }

  test('a command-palette status move and undo remain two changes in newest-first order', async ({ page }) => {
    await seedPortfolioBoards(page, [withBaseline({
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ id: 1, title: 'Review release', status: 'to-do' }]
    })], { selectedBoardId: 'alpha' });
    await openDetail(page, 'Review release');
    await expandHistory(page);
    const initialCount = await entries(page).count();
    await page.locator('#taskDetailModalCloseBtn').click();

    await page.locator('#portfolioSearchBtn').click();
    await page.locator('#commandPaletteInput').fill('review release');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#commandPalette .palette-item.active')).toContainText('Review release');
    await page.keyboard.press('Tab');
    await page.locator('#commandPaletteInput').fill('done');
    await expect(page.locator('#commandPalette .palette-item.active')).toContainText('Move to Done');
    await page.keyboard.press('Enter');
    await expect(page.locator('#portfolio-done-column')).toContainText('Review release');
    await waitForBoardWrites(page);
    await page.locator('#undoBtn').click();
    await expect(page.locator('#portfolio-to-do-column')).toContainText('Review release');
    await waitForBoardWrites(page, 2);

    await openDetail(page, 'Review release');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(initialCount + 2);
    await expandEntry(entries(page).nth(0));
    await expandEntry(entries(page).nth(1));
    await expect(entries(page).nth(0)).toContainText(/done[\s\S]*to[ -]?do/i);
    await expect(entries(page).nth(1)).toContainText(/to[ -]?do[\s\S]*done/i);
    await expect(page.locator('#detailStatus')).toHaveText('to-do');
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.timeline.events.slice(-2).map((event: { changes: unknown }) => event.changes)).toEqual([
      { status: { before: 'to-do', after: 'done' } },
      { status: { before: 'done', after: 'to-do' } }
    ]);
  });

  test('keyboard consultation preserves the selected project and every file without appending events', async ({ page }) => {
    await seedPortfolioBoards(page, [
      projectWithHistory('alpha', 'Alpha', 'Alpha task'),
      projectWithHistory('bravo', 'Bravo', 'Other project task')
    ], { selectedBoardId: 'alpha' });
    const before = await diskSnapshot(page);
    const selectedUrl = page.url();

    await openDetail(page, 'Alpha task');
    const section = history(page);
    await expect(section).not.toHaveAttribute('open', '');
    const summary = section.locator(':scope > summary');
    await expect(summary).toHaveAccessibleName('History');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(section).toHaveAttribute('open', '');
    await expect(entries(page)).toHaveCount(2);
    const eventSummary = entries(page).first().locator('summary').first();
    await eventSummary.focus();
    await page.keyboard.press('Space');
    await expect(entries(page).first().getByText('Before', { exact: true }).first()).toBeVisible();
    await expect(section).toContainText('Alpha task first description');
    await expect(section).toContainText('Alpha task revised description');
    await expect(section).not.toContainText('Other project task');
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(section).not.toHaveAttribute('open', '');
    await expect(page.locator('#detailTitle')).toHaveText('Alpha task');
    await page.locator('#taskDetailModalCloseBtn').click();

    await expect(portfolioBoardChip(page, 'Alpha')).toHaveClass(/\bactive\b/);
    expect(page.url()).toBe(selectedUrl);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel .timeline-event-item')).toHaveCount(3);
    expect(await diskSnapshot(page)).toEqual(before);
  });

  test('an imported task without a timeline has empty history and unavailable earlier information without writes', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'imported', title: 'Imported project', hasHandle: true,
      tasks: [{ id: 1, title: 'Imported task', status: 'to-do', createdAt: FIXED_TIMESTAMP }]
    }], { selectedBoardId: 'imported' });
    const before = await diskSnapshot(page);
    const selectedUrl = page.url();

    await openDetail(page, 'Imported task');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(0);
    await expect(history(page)).toContainText(/no changes.*recorded|no recorded changes/i);
    await expect(history(page)).toContainText(/earlier.*unavailable|previous.*unavailable/i);
    await expect(page.locator('#detailTitle')).toHaveText('Imported task');
    await page.locator('#taskDetailModalCloseBtn').click();

    await expect(portfolioBoardChip(page, 'Imported project')).toHaveClass(/\bactive\b/);
    expect(page.url()).toBe(selectedUrl);
    expect(await diskSnapshot(page)).toEqual(before);
    expect((await readSavedBoard(page, 'imported')).extensions.timeline).toBeUndefined();
  });

  test('checklist changes update an already-open history before the project finishes saving', async ({ page }) => {
    await seedPortfolioBoards(page, [withBaseline({
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ id: 1, title: 'Checklist task', status: 'to-do', checklist: [{ text: 'Review evidence', done: false }] }]
    })], { selectedBoardId: 'alpha' });
    await installControlledPortfolioWriter(page, { boardId: 'alpha', holdWrites: true });
    const originalFile = await readSavedBoard(page, 'alpha');
    await openDetail(page, 'Checklist task');
    await expandHistory(page);
    const initialCount = await entries(page).count();
    const checkbox = page.locator('#detailChecklist input[type="checkbox"]');

    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(entries(page)).toHaveCount(initialCount + 1);
    await expect.poll(() => page.evaluate(() => window.__portfolioWriteControl?.active)).toBe(1);
    await checkbox.uncheck();
    await expect(entries(page)).toHaveCount(initialCount + 2);
    await expect(portfolioBoardChip(page, 'Alpha')).toContainText('Saving');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(history(page)).toHaveAttribute('open', '');
    await expandEntry(entries(page).first());
    await expect(entries(page).first()).toContainText('Review evidence');
    await expect(entries(page).first()).not.toContainText('"done":');
    expect(await readSavedBoard(page, 'alpha')).toEqual(originalFile);
    expect((await diskSnapshot(page)).writes).toEqual([]);

    await expect.poll(() => page.evaluate(() => window.__releaseNextPortfolioWrite!())).toBe(true);
    await waitForBoardWrites(page);
    await expect.poll(() => page.evaluate(() => window.__releaseNextPortfolioWrite!())).toBe(true);
    await waitForBoardWrites(page, 2);
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(entries(page)).toHaveCount(initialCount + 2);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.tasks[0].checklist).toEqual([{ text: 'Review evidence', done: false }]);
    expect(saved.extensions.timeline.events.map((event: { kind: string }) => event.kind))
      .toEqual(['board.baseline', 'task.updated', 'task.updated']);
  });

  test('calendar opens historical details with only the selected timeline prefix and retains that selection', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ id: 1, title: 'Initial title', status: 'to-do', dueDate: '2026-04-03' }]
    }], { selectedBoardId: 'alpha' });
    await renameTaskViaEditor(page, 'Initial title', 'Earlier title');
    await renameTaskViaEditor(page, 'Earlier title', 'Future title');
    await waitForBoardWrites(page, 2);
    await openDetail(page, 'Future title');
    await expandHistory(page);
    const currentCount = await entries(page).count();
    await expect(history(page)).toContainText('Future title');
    await page.locator('#taskDetailModalCloseBtn').click();

    const panel = page.locator('#portfolioTimelinePanel');
    await panel.locator('.timeline-toggle-btn').click();
    await setTimelineSlider(page, 1);
    await expect(panel.locator('.timeline-event-item.active')).toHaveAttribute('data-event-index', '1');
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Open April 2026' }).click();
    const before = await diskSnapshot(page);
    const selectedUrl = page.url();
    // Historical board cards only select; the calendar is a real detail opener.
    await page.locator('[data-calendar-item-title="Earlier title"]').click();
    await expect(page.locator('#detailTitle')).toHaveText('Earlier title');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(currentCount - 1);
    await expandEntry(entries(page).first());
    await expect(history(page)).toContainText('Initial title');
    await expect(history(page)).toContainText('Earlier title');
    await expect(history(page)).not.toContainText('Future title');
    await expect(history(page)).toContainText(/historical|as of|up to/i);
    await expect(page.locator('#detailChecklist input')).toHaveCount(0);
    await page.locator('#taskDetailModalCloseBtn').click();

    await expect(panel.locator('.timeline-preview-banner.active')).toBeVisible();
    await expect(panel.locator('.timeline-event-item.active')).toHaveAttribute('data-event-index', '1');
    await expect(portfolioBoardChip(page, 'Alpha')).toHaveClass(/\bactive\b/);
    expect(page.url()).toBe(selectedUrl);
    expect(await diskSnapshot(page)).toEqual(before);
    await panel.locator('[data-action="timeline-latest"]').click();
    await page.locator('[data-calendar-item-title="Future title"]').click();
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(currentCount);
  });

  test('read-only imported history is consultable in EN and PT with localized summaries and retained project', async ({ page }) => {
    await seedPortfolioBoards(page, [projectWithHistory('readonly', 'Reference project', 'Reference task', false)], {
      selectedBoardId: 'readonly'
    });
    const selectedUrl = page.url();
    await openDetail(page, 'Reference task');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(2);
    const englishSummary = await entries(page).first().locator('summary').first().innerText();
    await expandEntry(entries(page).first());
    await expect(page.locator('#detailChecklist input[type="checkbox"]')).toBeDisabled();
    await page.locator('#taskDetailModalCloseBtn').click();
    await page.locator('#languageToggleBtn').click();

    await openDetail(page, 'Reference task');
    await expect(history(page)).not.toHaveAttribute('open', '');
    await expandHistory(page, 'Histórico');
    await expect(entries(page)).toHaveCount(2);
    const summary = entries(page).first().locator('summary').first();
    await expect(summary).not.toHaveText(englishSummary);
    await summary.click();
    await expect(entries(page).first().getByText('Antes', { exact: true }).first()).toBeVisible();
    await expect(entries(page).first().getByText('Depois', { exact: true }).first()).toBeVisible();
    await expect(entries(page).first()).toContainText('Reference task first description');
    await expect(entries(page).first()).toContainText('Reference task revised description');
    await expect(page.locator('#taskDetailModal .detail-label').filter({ hasText: /^Descrição$/ })).toBeVisible();
    // Project-defined column names remain data, even when dialog labels change.
    await expect(page.locator('#detailStatus')).toHaveText('to-do');
    await expect(page.locator('#detailChecklist input[type="checkbox"]')).toBeDisabled();
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(portfolioBoardChip(page, 'Reference project')).toHaveClass(/\bactive\b/);
    expect(page.url()).toBe(selectedUrl);
    expect((await diskSnapshot(page)).writes).toEqual([]);
  });

  test('bulk sprint assignment and phase deletion appear while changes to other tasks are excluded', async ({ page }) => {
    await seedPortfolioBoards(page, [withBaseline({
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [
        { id: 1, title: 'Task A', status: 'to-do', phaseId: 'foundation' },
        { id: 2, title: 'Task B', status: 'to-do', phaseId: 'other-phase' }
      ],
      extensions: { roadmap: {
        version: 1, milestones: [], sprints: [], phases: [
          { id: 'foundation', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' },
          { id: 'other-phase', title: 'Other phase', startDate: '2026-05-01', endDate: '2026-05-30' }
        ]
      } }
    })], { selectedBoardId: 'alpha' });
    await openDetail(page, 'Task A');
    await expandHistory(page);
    const initialCount = await entries(page).count();
    await page.locator('#taskDetailModalCloseBtn').click();
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.locator('#roadmapEntityTitle').fill('Release sprint');
    await page.locator('#roadmapEntityStartDate').fill('2026-04-01');
    await page.locator('#roadmapEntityEndDate').fill('2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Delete Foundation', exact: true }).click();
    await answerAppMessage(page, { button: 'Delete' });
    await page.getByRole('button', { name: 'Delete Other phase', exact: true }).click();
    await answerAppMessage(page, { button: 'Delete' });
    await waitForBoardWrites(page, 3);
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await openDetail(page, 'Task A');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(initialCount + 2);
    await expandEntry(entries(page).nth(0));
    await expandEntry(entries(page).nth(1));
    await expect(entries(page).nth(0)).toContainText('Foundation');
    await expect(entries(page).nth(1)).toContainText('Release sprint');
    await expect(history(page)).not.toContainText('Other phase');
    await expect(page.locator('#detailPhase')).toHaveText('-');
    await expect(page.locator('#detailSprint')).toContainText('Release sprint');
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.timeline.events.map((event: { kind: string }) => event.kind))
      .toEqual(['board.baseline', 'roadmap.bulk-assigned', 'roadmap.updated', 'roadmap.updated']);
  });

  test('real Planner creation, movement, resizing and removal are readable task history entries', async ({ page }) => {
    await seedPortfolioBoards(page, [withBaseline({
      id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ id: 1, title: 'Plan release', status: 'to-do' }]
    })], { selectedBoardId: 'alpha' });
    await openDetail(page, 'Plan release');
    await expandHistory(page);
    const initialCount = await entries(page).count();
    await page.locator('#taskDetailModalCloseBtn').click();
    await page.locator('#portfolioSearchBtn').click();
    await page.locator('#commandPaletteInput').fill('plan release 14:00');
    await expect(page.locator('#commandPalette .palette-item.active')).toContainText('Plan release');
    await page.keyboard.press('Enter');
    await waitForBoardWrites(page);
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    const block = page.locator('#portfolioPlannerView .planner-block');
    await expect(block).toHaveCount(1);
    await block.focus();
    await page.keyboard.press('ArrowDown');
    await expect(block).toHaveAccessibleName(/14:15 to 14:30/);
    await page.keyboard.press('Shift+ArrowDown');
    await expect(block).toHaveAccessibleName(/14:15 to 14:45/);
    await page.keyboard.press('Delete');
    await expect(block).toHaveCount(0);
    await waitForBoardWrites(page, 4);
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await openDetail(page, 'Plan release');
    await expandHistory(page);
    await expect(entries(page)).toHaveCount(initialCount + 4);
    for (let index = 0; index < 4; index += 1) {
      await expandEntry(entries(page).nth(index));
      await expect(entries(page).nth(index)).not.toContainText('"taskId":');
    }
    await expect(entries(page).nth(0)).toContainText('14:45');
    await expect(entries(page).nth(1)).toContainText('14:30');
    await expect(entries(page).nth(1)).toContainText('14:45');
    await expect(entries(page).nth(2)).toContainText('14:00');
    await expect(entries(page).nth(2)).toContainText('14:15');
    await expect(entries(page).nth(3)).toContainText('14:00');
    await expect(entries(page).nth(3)).toContainText('14:15');
    await expect(page.locator('#detailStatus')).toHaveText('to-do');
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.dayPlanner?.blocks ?? []).toEqual([]);
    expect(saved.extensions.timeline.events.slice(1).map((event: { kind: string }) => event.kind))
      .toEqual(['planner.block.added', 'planner.block.moved', 'planner.block.resized', 'planner.block.removed']);
  });
});
