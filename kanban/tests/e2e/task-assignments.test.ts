import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, answerAppMessage, appMessage, waitForBoardWrites, openFiltersPanel } from '../support/portfolio';

test('responsibility and participation stay coherent through editing, confirmation, saving and history', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Assignments', hasHandle: true, tasks: [
    { id: 1, title: 'Plan', status: 'doing', assignees: ['Ana', 'Rui'] },
    { id: 2, title: 'Other', status: 'doing', assignees: ['Ana'] }
  ] }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.locator('#taskResponsible').selectOption('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page, 1);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: 'Ana', status: 'doing' });

  await page.getByRole('button', { name: 'Settings for Assignments', exact: true }).click();
  await page.getByLabel('Member 1 name', { exact: true }).fill('Ana Silva');
  await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#projectSettingsModal')).toBeHidden();
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await expect(page.locator('#taskResponsible')).toHaveValue('Ana Silva');
  await page.getByRole('button', { name: 'Remove participant', exact: true }).first().click();
  await expect(appMessage(page)).toContainText('without a responsible person');
  await answerAppMessage(page, { button: 'Cancel' });
  await expect(page.locator('#taskResponsible')).toHaveValue('Ana Silva');
  await page.getByRole('button', { name: 'Remove participant', exact: true }).first().click();
  await answerAppMessage(page);
  await expect(page.locator('#taskResponsible')).toHaveValue('');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page, 3);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.board.tasks[0]).toMatchObject({ assignees: ['Rui'], responsible: '', status: 'doing' });
  expect(saved.board.tasks[1]).toMatchObject({ assignees: ['Ana Silva'], responsible: '' });
  expect(saved.extensions.timeline.events.at(-1).changes).toMatchObject({
    assignees: { before: ['Ana Silva', 'Rui'], after: ['Rui'] }, responsible: { before: 'Ana Silva', after: '' }
  });
});

test('responsible and participant filters combine across all views, including empty allocations', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Assignments', hasHandle: true, tasks: [
    { id: 1, title: 'Matching item', status: 'doing', assignees: ['Ana', 'Rui'], dueDate: '2026-01-05', phaseId: 'build' },
    { id: 2, title: 'Ana only', assignees: ['Ana'], dueDate: '2026-01-05' },
    { id: 3, title: 'Empty item', dueDate: '2026-01-05' }
  ], extensions: { roadmap: { version: 1, phases: [{ id: 'build', title: 'Build', startDate: '2026-01-01', endDate: '2026-01-30' }], milestones: [], sprints: [] } } }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Matching item').locator('[data-action="edit-task"]').click();
  await page.locator('#taskResponsible').selectOption('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await openFiltersPanel(page);
  await page.locator('#portfolioResponsibleFilter').selectOption('Ana');
  await page.getByLabel('Participant', { exact: true }).selectOption('Rui');
  await page.keyboard.press('Escape');
  expect(new URL(page.url()).searchParams.get('pr')).toBe('Ana');
  for (const view of ['board', 'table', 'roadmap', 'calendar', 'planner']) {
    await page.locator(`[data-view-mode="${view}"]`).click();
    await openFiltersPanel(page);
    await expect(page.locator('#portfolioResponsibleFilter')).toHaveValue('Ana');
    await expect(page.getByLabel('Participant', { exact: true })).toHaveValue('Rui');
    await page.keyboard.press('Escape');
    if (view === 'board') await expect(page.locator('#portfolioBoard .task-title')).toHaveText(['Matching item']);
    if (view === 'table') await expect(page.locator('#workitemsTable tbody tr')).toContainText('Matching item');
    if (view === 'roadmap') {
      await page.getByRole('button', { name: 'Show tasks for Build', exact: true }).click();
      await expect(page.locator('#portfolioRoadmapView .task-title')).toHaveText(['Matching item']);
    }
    if (view === 'calendar') {
      await page.locator('[data-action="open-calendar-month"][data-month="0"]').click();
      const overflow = page.locator('[data-calendar-day="2026-01-05"] .portfolio-calendar-item-overflow');
      if (await overflow.isVisible()) await overflow.click();
      await expect(page.locator('#portfolioCalendarView [data-action="open-calendar-task"]')).toHaveCount(1);
    }
    if (view === 'planner') await expect(page.locator('#portfolioPlannerView .planner-tray-card-title')).toHaveText(['Matching item']);
  }
  await page.locator('[data-view-mode="table"]').click();
  await openFiltersPanel(page);
  await page.locator('#portfolioResponsibleFilter').selectOption('__none__');
  await page.getByLabel('Participant', { exact: true }).selectOption('__none__');
  await page.keyboard.press('Escape');
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#workitemsTable tbody tr')).toContainText('Empty item');
});

test('responsible and participant filters combine in planning and sprint tables without changing sprint totals', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Assignment planning', hasHandle: true, tasks: [
    { id: 1, title: 'Matching unplanned', responsible: 'Ana', assignees: ['Ana', 'Rui'] },
    { id: 2, title: 'Other unplanned', responsible: 'Ana', assignees: ['Ana'] },
    { id: 3, title: 'Matching sprint item', responsible: 'Ana', assignees: ['Ana', 'Rui'], sprintId: 's1' },
    { id: 4, title: 'Other sprint item', responsible: 'Rui', assignees: ['Rui'], sprintId: 's1', status: 'done' }
  ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
    { id: 's1', title: 'Delivery', startDate: '2026-10-01', endDate: '2026-10-14' }
  ] } } }], { selectedBoardId: 'p' });
  await page.locator('[data-view-mode="table"]').click();
  await openFiltersPanel(page);
  await page.locator('#portfolioResponsibleFilter').selectOption('Ana');
  await page.getByLabel('Participant', { exact: true }).selectOption('Rui');
  await page.keyboard.press('Escape');
  await page.locator('[data-table-view="unplanned"]').click();
  await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#workitemsTable tbody tr')).toContainText('Matching unplanned');
  await page.locator('[data-table-view="sprints"]').click();
  const sprint = page.locator('[data-table-sprint="s1"]');
  await expect(sprint.locator(':scope > summary')).toContainText('50% complete (1/2)');
  await sprint.locator(':scope > summary').click();
  await expect(sprint.locator('tbody tr')).toHaveCount(1);
  await expect(sprint.locator('tbody tr')).toContainText('Matching sprint item');
});

test('palette can select and clear responsibility and confirms removing that participant', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Palette assignments', hasHandle: true, members: ['Ana', 'Marta'], tasks: [{ id: 1, title: 'Plan', status: 'doing', assignees: ['Ana'] }] }]);
  await portfolioCard(page, 'Plan').click();
  await page.keyboard.press('Control+k');
  await page.locator('#commandPaletteInput').fill('responsible');
  await page.locator('#commandPalette .palette-item').filter({ hasText: 'Set responsible' }).click();
  await page.locator('#commandPaletteInput').fill('Marta');
  await page.keyboard.press('Enter');
  await waitForBoardWrites(page, 1);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Marta'], responsible: 'Marta', status: 'doing' });
  await portfolioCard(page, 'Plan').click();
  await page.keyboard.press('Control+k');
  await page.locator('#commandPaletteInput').fill('assign');
  await page.locator('#commandPalette .palette-item').filter({ hasText: 'Assign…' }).click();
  await page.locator('#commandPaletteInput').fill('Marta');
  await page.keyboard.press('Enter');
  await answerAppMessage(page, { button: 'Cancel' });
  await portfolioCard(page, 'Plan').click();
  await page.keyboard.press('Control+k');
  await page.locator('#commandPaletteInput').fill('responsible');
  await page.locator('#commandPalette .palette-item').filter({ hasText: 'Set responsible' }).click();
  await page.locator('#commandPalette .palette-item').filter({ hasText: 'No responsible person' }).click();
  await waitForBoardWrites(page, 2);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Marta'], responsible: '' });
});

test('keyboard saving commits a project member correction without requiring a blur', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Keyboard', hasHandle: true, tasks: [{ id: 1, title: 'Plan', assignees: ['Ana'] }] }]);
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.locator('#taskResponsible').selectOption('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await page.getByRole('button', { name: 'Settings for Keyboard', exact: true }).click();
  await page.getByLabel('Member 1 name', { exact: true }).fill('Ana Silva');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#projectSettingsModal')).toBeHidden();
  await waitForBoardWrites(page, 2);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana Silva'], responsible: 'Ana Silva' });
});

test('new workitems support responsibility, reopen read-only, and can progress without allocations', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Create assignments', hasHandle: true, members: ['Marta'], tasks: [] }], { selectedBoardId: 'p' });
  await page.locator('#portfolio-to-do-column .add-task-card').click();
  await page.locator('#taskName').fill('New item');
  await page.locator('#taskResponsible').selectOption('Marta');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page, 1);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.board.tasks[0]).toMatchObject({ assignees: ['Marta'], responsible: 'Marta', status: 'to-do' });
  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'reopened', title: saved.board.settings.title, hasHandle: false,
    tasks: saved.board.tasks, extensions: saved.extensions }]);
  await portfolioCard(page, 'New item').click();
  await expect(page.locator('#detailResponsible')).toHaveText('Marta');
  await expect(page.locator('#detailAssignees')).toHaveText('Marta');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#commandPalette .palette-item').first()).toContainText('Open details');
  await expect(page.locator('#commandPalette .palette-item').filter({ hasText: 'Set responsible' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'empty', title: 'Empty allocations', hasHandle: true, tasks: [{ id: 1, title: 'Unallocated', status: 'to-do' }] }]);
  await portfolioCard(page, 'Unallocated').click();
  await expect(page.locator('#detailResponsible')).toHaveText('No responsible person');
  await expect(page.locator('#detailAssignees')).toHaveText('No participants');
  await page.keyboard.press('Escape');
  await portfolioCard(page, 'Unallocated').hover();
  await page.keyboard.press('4');
  await expect(page.locator('#portfolio-done-column')).toContainText('Unallocated');
  await waitForBoardWrites(page, 1);
  expect((await readSavedBoard(page, 'empty')).board.tasks[0]).toMatchObject({ assignees: [], responsible: '', status: 'done' });
});
