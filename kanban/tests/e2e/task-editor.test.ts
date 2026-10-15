import { test, expect, type Page } from '@playwright/test';

import {
  gotoApp,
  seedPortfolioBoards,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  closeDialogBy,
  portfolioProjectChipButtons,
  openTaskEditor,
  answerAppMessage,
  dragWithMouse
} from '../support/portfolio';

test.describe('task editor', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('task form enforces blocker reason and attachment hard size', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    await answerAppMessage(page, { expectText: 'Blocked tasks require a blocker reason.' });
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskBlockerReason')).toBeFocused();

    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'huge.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc((10 * 1024 * 1024) + 1)
    });

    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(0);
  });

  test('blocked tasks require a blocker reason before save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    await answerAppMessage(page, { expectText: 'Blocked tasks require a blocker reason' });
    await expect(page.locator('#taskModal')).toBeVisible();

    const taskCount = await page.evaluate(() => JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.length);
    expect(taskCount).toBe(0);
  });

  test('task modal places blocked fields immediately after description', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();

    const fieldOrder = await page.evaluate(() => (
      [...document.querySelectorAll('#taskForm > .form-group')]
        .map((group) => {
          if (group.querySelector('#taskName')) return 'taskName';
          if (group.querySelector('#taskDescription')) return 'taskDescription';
          if (group.querySelector('#taskBlocked')) return 'taskBlocked';
          if (group.querySelector('#taskBlockerReason')) return 'taskBlockerReason';
          if (group.querySelector('#taskResponsible')) return 'taskAssigneeEditor';
          return null;
        })
        .filter(Boolean)
    ));

    expect(fieldOrder).toEqual(expect.arrayContaining([
      'taskDescription',
      'taskBlocked',
      'taskBlockerReason',
      'taskAssigneeEditor'
    ]));
    expect(fieldOrder.indexOf('taskDescription')).toBeLessThan(fieldOrder.indexOf('taskBlocked'));
    expect(fieldOrder.indexOf('taskBlocked')).toBeLessThan(fieldOrder.indexOf('taskBlockerReason'));
    expect(fieldOrder.indexOf('taskBlockerReason')).toBeLessThan(fieldOrder.indexOf('taskAssigneeEditor'));
  });

  test('assignees and blocked fields save and render as card badges', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Team reference', assignees: ['Alex', 'Sam'] }] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Investigate deploy issue');
    await page.locator('#taskResponsible').selectOption({ label: 'Alex' });
    await page.locator('#taskBlocked').check();
    await page.locator('#taskBlockerReason').fill('Waiting for staging access');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const backlogColumn = page.locator('#portfolio-backlog-column');
    await expect(backlogColumn).toContainText('Investigate deploy issue');
    await expect(backlogColumn).toContainText('Alex');
    await expect(portfolioCard(page, 'Investigate deploy issue').locator('.task-tag-assignee')).toHaveText(['Alex']);
    await expect(backlogColumn).toContainText('Blocked');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t: any) => t.title === 'Investigate deploy issue');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t: any) => t.title === 'Investigate deploy issue');
      return {
        task: task ? { assignees: task.assignees, blocked: task.blocked, blockerReason: task.blockerReason } : null,
        savedTask: savedTask ? { assignees: savedTask.assignees, blocked: savedTask.blocked, blockerReason: savedTask.blockerReason } : null
      };
    });

    expect(result.task).toEqual({
      assignees: ['Alex'],
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
    expect(result.savedTask).toEqual({
      assignees: ['Alex'],
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
  });

  test('responsible selector offers the project team and allows only one choice', async ({ page }) => {
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

    await expect(page.locator('#taskResponsible option')).toHaveText(['None', 'Alex', 'Sam']);
    await page.locator('#taskResponsible').selectOption({ label: 'Alex' });
    await page.locator('#taskResponsible').selectOption({ label: 'Sam' });
    await expect(page.locator('#taskResponsible option:checked')).toHaveText('Sam');
    await expect(page.locator('#taskResponsible')).not.toHaveAttribute('multiple');
  });

  test('responsible selector resolves legacy multiple names without losing them', async ({ page }) => {
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

    await openTaskEditor(page, 'Task A');

    await expect(page.locator('#taskResponsible option:checked')).toContainText('Assignment needs review');
    await page.locator('#taskResponsible').selectOption({ label: 'Alex' });

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry: any) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry: any) => entry.id === 1);
      return {
        taskAssignees: task?.assignees || [],
        savedAssignees: savedTask?.assignees || []
      };
    });

    expect(result.taskAssignees).toEqual(['Alex']);
    expect(result.savedAssignees).toEqual(['Alex']);
    expect((await readSavedBoard(page, 'p1')).board.tasks[0].legacyAssignees).toEqual(['Alex', 'Sam']);
    await expect(portfolioCard(page, 'Task A')).toContainText('Alex');
    await expect(portfolioCard(page, 'Task A')).not.toContainText('Sam');
  });

  test('tags can be added on task create and display on cards and detail modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Tagged task');
    await page.locator('#taskTagNewItem').fill('bug');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskTagNewItem').fill('urgent');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Tagged task');
    await expect(card).toContainText('bug');
    await expect(card).toContainText('urgent');

    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTags')).toHaveText('bug, urgent');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t: any) => t.title === 'Tagged task');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t: any) => t.title === 'Tagged task');
      return {
        taskTags: task?.tags || [],
        savedTags: savedTask?.tags || []
      };
    });

    expect(result.taskTags).toEqual(['bug', 'urgent']);
    expect(result.savedTags).toEqual(['bug', 'urgent']);
  });

  test('tag editor deduplicates and lowercases tags', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Dedup task');
    await page.locator('#taskTagNewItem').fill('Bug');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskTagNewItem').fill('bug');
    await page.locator('#taskTagAddBtn').click();
    await answerAppMessage(page, { expectText: 'This tag is already added.' });
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t: any) => t.title === 'Dedup task');
      return { tags: task?.tags || [] };
    });

    expect(result.tags).toEqual(['bug']);
  });

  test('tag editor enforces max count and max length', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Limit task');

    for (let i = 0; i < 11; i++) {
      await page.locator('#taskTagNewItem').fill(`tag${i}`);
      await page.locator('#taskTagAddBtn').click();
    }

    await answerAppMessage(page, { expectText: 'at most 10 tags' });

    await page.locator('#taskTagNewItem').fill('a'.repeat(31));
    await page.locator('#taskTagAddBtn').click();

    await answerAppMessage(page, { expectText: '30 characters' });
  });

  test('editing a task preloads and updates tags', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Edit tags task', status: 'backlog', tags: ['old'] }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Edit tags task');

    await expect(page.locator('#taskTagItems')).toContainText('old');

    await page.locator('#taskTagItems .tag-editor-remove').click();
    await page.locator('#taskTagNewItem').fill('new');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t: any) => t.id === 1);
      return { tags: task?.tags || [] };
    });

    expect(result.tags).toEqual(['new']);
  });

  test('due date input uses native date picker and saves ISO to JSON', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
    await page.locator('#taskName').fill('Date formatting task');
    await page.locator('#taskDueDate').fill('2026-03-05');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Date formatting task');
    await expect(card).toContainText('05/03/2026');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t: any) => t.title === 'Date formatting task');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t: any) => t.title === 'Date formatting task');
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

  test('editing a task preloads the native due date picker with the saved ISO value', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Bad date task', status: 'backlog', dueDate: '2026-03-05' }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Bad date task');
    await expect(page.locator('#modalTitle')).toHaveText('Edit Task');
    await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
    await expect(page.locator('#taskDueDate')).toHaveValue('2026-03-05');
  });

  test('checklist items can be reordered in the task modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Checklist task',
          status: 'backlog',
          checklist: [
            { text: 'First', done: false },
            { text: 'Second', done: false },
            { text: 'Third', done: true }
          ]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Checklist task');

    const checklistTexts = async () => page.locator('#taskChecklistItems .checklist-editor-row input[type="text"]').evaluateAll((nodes) => (
      nodes.map((node) => (node as HTMLInputElement).value)
    ));

    await expect.poll(checklistTexts).toEqual(['First', 'Second', 'Third']);

    await dragWithMouse(
      page,
      page.locator('#taskChecklistItems .checklist-editor-row').nth(2).locator('.checklist-editor-drag-handle'),
      page.locator('#taskChecklistItems .checklist-editor-row').nth(0),
      { targetPosition: { x: 10, y: 2 } }
    );

    await expect.poll(checklistTexts).toEqual(['Third', 'First', 'Second']);

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const persistedChecklist = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry: any) => entry.id === 1);
      return (task?.checklist || []).map((item: any) => item.text);
    });

    expect(persistedChecklist).toEqual(['Third', 'First', 'Second']);
  });

  test.describe('checklist keyboard reordering', () => {
    test.beforeEach(async ({ page }) => {
      await seedPortfolioBoards(page, [
        {
          id: 'p1',
          title: 'Project One',
          hasHandle: true,
          tasks: [{
            id: 1,
            title: 'Checklist task',
            status: 'backlog',
            checklist: [
              { text: 'First', done: false },
              { text: 'Second', done: false },
              { text: 'Third', done: false }
            ]
          }]
        }
      ], { selectedBoardId: 'p1' });
      await openTaskEditor(page, 'Checklist task');
    });

    const checklistTexts = (page: Page) => page.locator('#taskChecklistItems .checklist-editor-row input[type="text"]').evaluateAll((nodes) => (
      nodes.map((node) => (node as HTMLInputElement).value)
    ));
    const handle = (page: Page, index: number) => page.locator('#taskChecklistItems .checklist-editor-row').nth(index).locator('.checklist-editor-drag-handle');
    // Waits for each keyboard step to land before the next key.
    const announced = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeAttached();

    test('Space picks an item up, arrow keys move it and Space drops it', async ({ page }) => {
      await handle(page, 2).focus();
      await page.keyboard.press('Space');
      // Picked up. (The pick-up announcement is replaced at once by an "over" one.)
      await expect(handle(page, 2)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowUp');
      await announced(page, 'Todo item 3 is over position 2.');
      await page.keyboard.press('ArrowUp');
      await announced(page, 'Todo item 3 is over position 1.');
      await page.keyboard.press('Space');

      await expect.poll(() => checklistTexts(page)).toEqual(['Third', 'First', 'Second']);
    });

    test('Escape cancels the move and leaves the task editor open', async ({ page }) => {
      await handle(page, 2).focus();
      await page.keyboard.press('Space');
      // Picked up. (The pick-up announcement is replaced at once by an "over" one.)
      await expect(handle(page, 2)).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowUp');
      await announced(page, 'Todo item 3 is over position 2.');
      await page.keyboard.press('Escape');

      await announced(page, 'Moving Todo item 3 was cancelled.');
      await expect(page.locator('#taskModal')).toBeVisible();
      await expect.poll(() => checklistTexts(page)).toEqual(['First', 'Second', 'Third']);
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

    await waitForBoardWrites(page);
    const task = (await readSavedBoard(page, 'alpha')).board.tasks[0];
    expect(task.phaseId).toBe('p1');
    expect(task.milestoneId).toBe('m1');
  });

  test('task attachments save on the task and show in task details', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');

    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello attachment')
    });

    await expect(page.locator('#taskAttachmentsList')).toContainText('note.txt');
    await expect(page.locator('#taskAttachmentsList .attachment-editor-download')).toHaveCount(1);
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      const payload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const attachments = payload?.board?.tasks?.find((t: any) => t.id === 1)?.attachments || [];
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

  test('attachment picker caps attachments per task and saves the accepted ones', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Attachment limits');

    await page.setInputFiles('#taskAttachmentsInput', Array.from({ length: 11 }, (_, i) => ({
      name: `f${i + 1}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`file ${i + 1}`)
    })));

    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(10);
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('Attachment limit reached (10 per task).');

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p1');
    const task = saved.board.tasks.find((entry: any) => entry.title === 'Attachment limits');
    expect(task?.attachments).toHaveLength(10);
  });

  test('duplicate attachment uploads are skipped in the task modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');

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

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry: any) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry: any) => entry.id === 1);
      return {
        taskAttachmentCount: task?.attachments?.length || 0,
        savedAttachmentCount: savedTask?.attachments?.length || 0
      };
    });

    expect(result.taskAttachmentCount).toBe(1);
    expect(result.savedAttachmentCount).toBe(1);
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
      importCalls: window.__shortcutImportCalls || 0
    }));
    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    expect(result.importCalls).toBe(0);
  });

  for (const method of ['Escape', 'close button', 'cancel button', 'overlay click']) {
    test(`task editor closes by ${method}, leaves the DOM and reopens empty`, async ({ page }) => {
      await seedPortfolioBoards(page, [
        { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
      ], { selectedBoardId: 'p1' });

      await page.locator('#portfolio-backlog-column .add-task-card').click();
      await expect(page.locator('#taskModal')).toBeVisible();
      await page.locator('#taskName').fill('Draft title');
      await page.locator('#taskChecklistNewItem').fill('Draft item');
      await page.locator('#taskChecklistNewItem').press('Enter');
      await expect(page.locator('#taskChecklistItems .checklist-editor-row')).toHaveCount(1);

      await closeDialogBy(page, 'taskModal', method);
      await expect(page.locator('#taskModal')).toHaveCount(0);

      await page.locator('#portfolio-backlog-column .add-task-card').click();
      await expect(page.locator('#modalTitle')).toHaveText('New Task');
      await expect(page.locator('#taskName')).toHaveValue('');
      await expect(page.locator('#taskChecklistItems .checklist-editor-row')).toHaveCount(0);
    });
  }

  test('Ctrl+Enter in the task editor saves while typing in the description', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Saved by keyboard');
    await page.locator('#taskDescription').click();
    await page.keyboard.type('Typed description');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const tasks = await page.evaluate(() => JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks);
    expect(tasks.map((task: any) => task.title)).toEqual(['Saved by keyboard']);
    expect(tasks[0].description).toBe('Typed description');
  });

  test('checking Blocked focuses the blocker reason and unchecking clears it', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskBlocked').check();
    await expect(page.locator('#taskBlockerReason')).toBeFocused();
    await page.locator('#taskBlockerReason').fill('Waiting on API');

    await page.locator('#taskBlocked').uncheck();
    await expect(page.locator('#taskBlockerReasonWrap')).toBeHidden();
    await page.locator('#taskBlocked').check();
    await expect(page.locator('#taskBlockerReason')).toHaveValue('');
  });

  test('checklist editor removes the clicked row after another row was cleared', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Checklist task',
          status: 'backlog',
          checklist: [
            { text: 'First', done: false },
            { text: 'Second', done: false },
            { text: 'Third', done: false }
          ]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Checklist task');
    const rows = page.locator('#taskChecklistItems .checklist-editor-row');
    await rows.nth(0).locator('input[type="text"]').fill('');
    await rows.nth(1).getByRole('button', { name: 'Remove todo item' }).click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const texts = await page.evaluate(() => (
      JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks[0].checklist.map((item: any) => item.text)
    ));
    expect(texts).toEqual(['Third']);
  });

  test('responsible selector supports explicit unassignment without free-text identities', async ({ page }) => {
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

    await openTaskEditor(page, 'Task A');
    await expect(page.locator('#taskResponsible option:checked')).toHaveText('Alex');
    await page.locator('#taskResponsible').selectOption('');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks[0].assignees).toEqual([]);
  });

  test('removing an attachment clears the attachment picker error', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Task with file',
          status: 'backlog',
          attachments: [{
            id: 'att_txt',
            name: 'notes.txt',
            mime: 'text/plain',
            sizeBytes: 16,
            kind: 'file',
            dataUrl: 'data:text/plain;base64,aGVsbG8gYXR0YWNobWVudA==',
            createdAt: '2026-02-26T00:00:00.000Z'
          }]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');
    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'huge.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc((10 * 1024 * 1024) + 1)
    });
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');

    await page.getByRole('button', { name: 'Remove attachment notes.txt' }).click();
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(0);
    await expect(page.locator('#taskAttachmentsWarnings')).toHaveText('');
  });

  test('Escape answers only the app message and leaves the task editor open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    const message = page.locator('#appMessageModal');
    await expect(message).toBeVisible();
    await expect(page.locator('#appMessageConfirmBtn')).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(message).toHaveCount(0);
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskBlockerReason')).toBeFocused();
  });

  test('clicking Undo while the task editor is open keeps the editor open', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Archive me', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Archive me');
    await card.hover();
    await card.locator('button[title="Archive"]').click();
    await answerAppMessage(page, { button: 'Archive' });
    await expect(page.locator('#undoToast')).toBeVisible();

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#undoBtn').click();

    await expect(page.locator('#undoToast')).toHaveCount(0);
    await expect(page.locator('#taskModal')).toBeVisible();
  });

  test('a new task lists the board tags as suggestions before any tag is added', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Tagged', status: 'backlog', tags: ['bug', 'ui'] }] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      Array.from(document.querySelectorAll<HTMLOptionElement>('#taskTagSuggestions option')).map((option) => option.value)
    ))).toEqual(['bug', 'ui']);
  });
});
