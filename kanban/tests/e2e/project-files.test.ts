import { test, expect } from '@playwright/test';

import {
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  portfolioProjectChipButtons,
  openTaskEditor,
  renameTaskViaEditor,
  mockNewProjectFlow,
  mockImportProjectsPicker,
  mutateExternalBoardFile,
  triggerExternalFileCheck,
  installControlledPortfolioWriter,
  appMessage,
  answerAppMessage,
  dragWithMouse
} from '../support/portfolio';

test.describe('project files', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('new project flow creates and selects a project', async ({ page }) => {
    await mockNewProjectFlow(page, { fileName: 'project-alpha.json' });

    await page.locator('#newProjectBtn').click();
    await page.locator('#appMessageInput').fill('Project Alpha');
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'unique acronym', input: 'ALP' });

    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Alpha');
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toBeVisible();

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    const result = await page.evaluate(() => ({
      writes: window.__newProjectWrites || []
    }));

    expect(result.writes.length).toBe(1);

    const saved = JSON.parse(result.writes[0]);
    expect(saved.board.settings.title).toBe('Project Alpha');
    expect(saved.board.tasks).toEqual([]);
  });

  test('new project flow aborts cleanly if name prompt is canceled after file picker', async ({ page }) => {
    await mockNewProjectFlow(page, { fileName: 'canceled.json' });

    await page.locator('#newProjectBtn').click();
    await answerAppMessage(page, { button: 'Cancel' });

    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');

    await expect(portfolioProjectChipButtons(page)).toHaveCount(0);
    const result = await page.evaluate(() => ({
      writes: window.__newProjectWrites || []
    }));

    expect(result.writes).toEqual([]);
  });

  test('import projects appends to current portfolio and projects can be removed from session', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'Task 1', status: 'backlog' }] }
    ]);

    await mockImportProjectsPicker(page, [
      {
        fileName: 'project-two.json',
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

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
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

    await expect(appMessage(page).locator('#appMessageText')).toContainText('invalid.board.json');
    await answerAppMessage(page, { expectText: 'Some projects were not imported' });

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Valid Project');
    await expect(portfolioCard(page, 'Valid task')).toBeVisible();

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    await expect(portfolioProjectChipButtons(page)).toContainText('Valid Project');
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

    await openTaskEditor(page, 'Keep status age');
    await page.locator('#taskName').fill('Keep status age edited');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.s1.text).board.tasks.find((t: any) => t.id === 1);
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
    expect(result.writes.at(-1)!.text).not.toContain('"statusChangedAt"');
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

    // Card drags apply the change and render immediately, then save in the
    // background, so a second change can be made while the first write is held.
    // (The task editor instead stays open until its save completes.)
    const activeChip = page.locator('.portfolio-chip.active');
    const cardIn = (status: string) => page.locator(`#portfolio-${status}-column .portfolio-task-card`).filter({ hasText: 'Queued task' });

    await dragWithMouse(page, cardIn('backlog'), page.locator('#portfolio-doing-column'));
    await expect(cardIn('doing')).toBeVisible();
    // The chip only shows "Saving" from the next status change after a save
    // starts (here, the second drag queueing behind the held write).

    await dragWithMouse(page, cardIn('doing'), page.locator('#portfolio-done-column'));
    await expect(cardIn('done')).toBeVisible();
    await expect(activeChip).toContainText('Saving');

    const interim = await page.evaluate(() => ({
      maxActive: window.__portfolioWriteControl?.maxActive || 0,
      writes: window.__portfolioTestWrites || []
    }));
    expect(interim.maxActive).toBeLessThanOrEqual(1);
    expect(interim.writes).toHaveLength(0);

    await page.evaluate(() => window.__releaseNextPortfolioWrite!());
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);

    // The queued second save starts only after the first completes; release it
    // once its write is actually waiting.
    await expect.poll(() => page.evaluate(() => window.__releaseNextPortfolioWrite!())).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(2);
    await expect(activeChip.locator('.chip-save-state')).toHaveCount(0);

    const result = await page.evaluate(() => {
      const ctl: any = window.__portfolioWriteControl || {};
      const writes = window.__portfolioTestWrites || [];
      return {
        maxActive: ctl.maxActive || 0,
        writesCount: writes.length,
        lastPayloadHasLatestStatus: writes[writes.length - 1]?.text.includes('"status": "done"') || false
      };
    });

    expect(result.maxActive).toBe(1);
    expect(result.writesCount).toBe(2);
    expect(result.lastPayloadHasLatestStatus).toBe(true);
    await expect(cardIn('done')).toBeVisible();
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

    await installControlledPortfolioWriter(page, { boardId: 'r1', holdWrites: false, failWrites: 1 });

    await renameTaskViaEditor(page, 'Retry task', 'Retry task edited');

    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');
    await expect(activeChip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();

    await expect(appMessage(page)).toHaveCount(0);
    const writesBeforeRetry = await page.evaluate(() => window.__portfolioTestWrites || []);
    expect(writesBeforeRetry).toHaveLength(0);

    await activeChip.getByRole('button', { name: 'Retry', exact: true }).click();

    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);
    await expect(activeChip).not.toContainText('Save failed');
    await expect(activeChip).not.toContainText('Unsaved');

    const afterRetry = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      return {
        writesCount: writes.length,
        lastPayloadHasEdit: writes[writes.length - 1]?.text.includes('Retry task edited') || false
      };
    });

    expect(afterRetry.writesCount).toBe(1);
    expect(afterRetry.lastPayloadHasEdit).toBe(true);
    await expect(appMessage(page)).toHaveCount(0);
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

    await portfolioCard(page, 'Original title').locator('.task-title').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await mutateExternalBoardFile(page, {
      boardId: 'e1',
      payload: buildBoardPayload({
        title: 'External One',
        tasks: [{ id: 1, title: 'Changed on disk', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect(page.locator('#taskDetailModal')).toBeHidden();
    await expect(portfolioCard(page, 'Changed on disk')).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('External update');

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Changed on disk' })).toBeVisible();
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
    await renameTaskViaEditor(page, 'Start title', 'Local unsaved edit');
    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');

    await mutateExternalBoardFile(page, {
      boardId: 'c1',
      payload: buildBoardPayload({
        title: 'Conflict Local',
        tasks: [{ id: 1, title: 'Disk title', status: 'done' }]
      })
    });
    await triggerExternalFileCheck(page);
    await answerAppMessage(page, { button: 'Keep local edits', expectText: 'unsaved edits' });

    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Local unsaved edit' })).toBeVisible();
    // No save/watch status label on the chip: saved, and no conflict pending.
    // (Checking the chip's whole text would match the board title "Conflict Local".)
    await expect(activeChip.locator('.chip-save-state')).toHaveCount(0);

    const saved = await readSavedBoard(page, 'c1');
    expect(saved.board.tasks.find((task: any) => task.id === 1)).toMatchObject({ title: 'Local unsaved edit', status: 'backlog' });
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
    await renameTaskViaEditor(page, 'Original title', 'Local edited title');
    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');

    await mutateExternalBoardFile(page, {
      boardId: 'c2',
      payload: buildBoardPayload({
        title: 'Conflict Reload',
        tasks: [{ id: 1, title: 'Disk wins title', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);
    await answerAppMessage(page, { button: 'Reload from disk', expectText: '"Conflict Reload" changed on disk' });

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Disk wins title' })).toBeVisible();
    await expect(portfolioCard(page, 'Local edited title')).toHaveCount(0);
    await expect(activeChip).not.toContainText('Save failed');
    await expect(activeChip).not.toContainText('Unsaved');

    const writes = await page.evaluate(() => (window.__portfolioTestWrites || []).length);
    expect(writes).toBe(0);
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

    await selectPortfolioBoard(page, 'Bravo');
    await expect(page.locator('#portfolio-done-column .portfolio-task-card').filter({ hasText: 'Bravo updated externally' })).toBeVisible();
    await selectPortfolioBoard(page, 'Alpha');
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Alpha task' })).toBeVisible();
  });
});
