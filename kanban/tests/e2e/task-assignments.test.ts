import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, answerAppMessage, appMessage, waitForBoardWrites, openFiltersPanel } from '../support/portfolio';

test('responsibility and participation stay coherent through editing, confirmation, saving and history', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Assignments', hasHandle: true, tasks: [
    { id: 1, title: 'Plan', status: 'doing', assignees: ['Ana', 'Rui'] },
    { id: 2, title: 'Other', status: 'doing', assignees: ['Ana'] }
  ] }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.locator('#taskResponsible').fill('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page, 1);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: 'Ana', status: 'doing' });

  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.getByLabel('Participant name', { exact: true }).first().fill('Ana Silva');
  await page.locator('#taskResponsible').click();
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
  await waitForBoardWrites(page, 2);
  const saved = await readSavedBoard(page, 'p');
  expect(saved.board.tasks[0]).toMatchObject({ assignees: ['Rui'], responsible: '', status: 'doing' });
  expect(saved.board.tasks[1]).toMatchObject({ assignees: ['Ana'], responsible: '' });
  expect(saved.extensions.timeline.events.at(-1).changes).toMatchObject({
    assignees: { before: ['Ana', 'Rui'], after: ['Rui'] }, responsible: { before: 'Ana', after: '' }
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
  await page.locator('#taskResponsible').fill('Ana');
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

test('palette can select and clear responsibility and confirms removing that participant', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Palette assignments', hasHandle: true, tasks: [{ id: 1, title: 'Plan', status: 'doing', assignees: ['Ana'] }] }]);
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

test('keyboard saving commits a corrected responsible participant without requiring a blur', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Keyboard', hasHandle: true, tasks: [{ id: 1, title: 'Plan', assignees: ['Ana'] }] }]);
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.locator('#taskResponsible').fill('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await portfolioCard(page, 'Plan').locator('[data-action="edit-task"]').click();
  await page.getByLabel('Participant name', { exact: true }).fill('Ana Silva');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page, 2);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana Silva'], responsible: 'Ana Silva' });
});
