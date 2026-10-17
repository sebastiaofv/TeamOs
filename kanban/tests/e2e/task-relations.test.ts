import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, answerAppMessage } from '../support/portfolio';

test('links archived workitems by ID, previews direction, navigates both ways, replaces and removes without losing items', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
    { id: 1, title: 'Current item' }, { id: 2, title: 'Archived blocker', archived: true }, { id: 3, title: 'Other item', status: 'done' }
  ] }, { id: 'p2', title: 'Other project', hasHandle: true, tasks: [{ id: 4, title: 'Outside project' }] }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Current item').click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await relations.getByRole('button', { name: 'Link workitem', exact: true }).click();
  await relations.getByLabel('Search this project by ID or title').fill('#2');
  await relations.getByLabel('Select workitem').selectOption('2');
  await relations.getByLabel('Relation of the selected workitem').selectOption('blockedBy');
  await expect(relations.getByRole('status')).toHaveText('Workitem #1 is blocked by #2.');
  await relations.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#detailBlocked')).toHaveText('Yes');
  const blockedBy = relations.getByRole('group', { name: 'Blocked by', exact: true });
  await expect(blockedBy).toContainText('Archived');
  await blockedBy.getByRole('button', { name: /#2 Archived blocker/ }).click();
  await expect(page.locator('#detailTitle')).toHaveText('Archived blocker');
  await relations.getByRole('group', { name: 'Blocks', exact: true }).getByRole('button', { name: /#1 Current item/ }).click();
  await blockedBy.getByRole('button', { name: 'Replace relation' }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('related');
  await relations.getByRole('button', { name: 'Replace relation', exact: true }).last().click();
  await expect(page.locator('#detailBlocked')).toHaveText('No');
  await relations.getByRole('group', { name: 'Related to', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  await answerAppMessage(page, { button: 'Remove' });
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).extensions.taskRelations).toBeUndefined();
  expect((await readSavedBoard(page, 'p1')).board.tasks).toHaveLength(3);
});

test('creates a related item with editable inherited planning only, cancelling first leaves no partial item', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true,
    extensions: { roadmap: { version: 1, phases: [{ id: 'phase', title: 'Phase', startDate: '2026-01-01', endDate: '2026-02-01' }, { id: 'other', title: 'Other phase', startDate: '2026-02-01', endDate: '2026-03-01' }], milestones: [{ id: 'mile', title: 'Milestone', dueDate: '2026-03-01' }], sprints: [] } },
    tasks: [{ id: 1, title: 'Source', description: 'Do not inherit', assignees: ['Ana'], priority: 'high', tags: ['original'], phaseId: 'phase', milestoneId: 'mile' }]
  }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await relations.getByRole('button', { name: 'Create related', exact: true }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('blockedBy');
  await relations.locator('button[type="submit"]').click();
  await expect(page.locator('#taskName')).toHaveValue('');
  await expect(page.locator('#taskDescription')).toHaveValue('');
  await expect(page.locator('#taskPhase')).toHaveValue('phase');
  await expect(page.locator('#taskMilestone')).toHaveValue('mile');
  await expect(page.locator('#taskPriority')).toHaveValue('');
  await page.locator('#taskModalCancelBtn').click();
  await expect(portfolioCard(page, 'Source')).toBeVisible();
  await portfolioCard(page, 'Source').click();
  await relations.getByRole('button', { name: 'Create related', exact: true }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('blockedBy');
  await relations.locator('button[type="submit"]').click();
  await page.locator('#taskName').fill('New blocker');
  await page.locator('#taskDescription').fill('Own description');
  await page.locator('#taskPhase').selectOption('other');
  await page.locator('#taskModalSaveBtn').click();
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks.length).toBe(2);
  const saved = await readSavedBoard(page, 'p1');
  expect(saved.board.tasks[1]).toMatchObject({ title: 'New blocker', description: 'Own description', status: 'backlog', phaseId: 'other', milestoneId: 'mile', assignees: [], tags: [], priority: null });
  expect(saved.extensions.taskRelations).toEqual({ version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] });
});

test('read-only relations remain navigable on mobile without mutation controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Read only', hasHandle: false, tasks: [{ id: 1, title: 'Dependent' }, { id: 2, title: 'Done blocker', status: 'done', archived: true }],
    extensions: { taskRelations: { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] } }
  }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Dependent').click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await expect(relations.getByRole('button', { name: 'Link workitem' })).toHaveCount(0);
  await expect(relations.getByRole('button', { name: 'Create related' })).toHaveCount(0);
  await expect(relations.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(page.locator('#detailBlocked')).toHaveText('No');
  await relations.getByRole('button', { name: /#2 Done blocker/ }).click();
  await expect(page.locator('#detailTitle')).toHaveText('Done blocker');
  await expect(relations).toContainText('#1 Dependent');
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);
  const body = page.locator('#taskDetailModal .modal-body');
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('dependency badges track completion and reopening without preventing status changes, preserving manual blocks after reimport', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true,
    tasks: [{ id: 1, title: 'Dependent' }, { id: 2, title: 'Blocker', status: 'to-do' }, { id: 3, title: 'Manual', blocked: true, blockerReason: 'Own reason' }],
    extensions: { taskRelations: { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }, { sourceId: 2, targetId: 3, kind: 'blocks' }] } }
  }], { selectedBoardId: 'p1' });
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toBeVisible();
  await portfolioCard(page, 'Dependent').hover();
  await page.keyboard.press('3');
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks[0].status).toBe('doing');
  await portfolioCard(page, 'Blocker').hover();
  await page.keyboard.press('4');
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toHaveCount(0);
  await expect(portfolioCard(page, 'Manual').locator('.task-tag-blocked')).toBeVisible();
  await portfolioCard(page, 'Blocker').hover();
  await page.keyboard.press('2');
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toBeVisible();
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks[1].status).toBe('to-do');
  const saved = await readSavedBoard(page, 'p1');
  expect(saved.board.tasks[0].blocked).toBe(false);
  expect(saved.board.tasks[2].blockerReason).toBe('Own reason');
  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'reopened', title: 'Project', hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopened' });
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toBeVisible();
  await portfolioCard(page, 'Dependent').click();
  await expect(page.getByRole('region', { name: 'Relations', exact: true })).toContainText('#2 Blocker');
});

test('rejects a circular dependency with a clear Portuguese message and leaves the saved graph unchanged', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true,
    tasks: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }, { id: 3, title: 'Third' }],
    extensions: { taskRelations: { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 2, targetId: 3, kind: 'blocks' }] } }
  }], { selectedBoardId: 'p1' });
  await page.locator('#languageToggleBtn').click();
  await portfolioCard(page, 'Third').click();
  const relations = page.getByRole('region', { name: 'Relações', exact: true });
  await relations.getByRole('button', { name: 'Associar workitem', exact: true }).click();
  await relations.getByLabel('Pesquisar neste projeto por ID ou título').fill('First');
  await relations.getByLabel('Selecionar workitem').selectOption('1');
  await relations.getByLabel('Relação do workitem selecionado').selectOption('blocks');
  await expect(relations.getByRole('status')).toHaveText('O workitem #3 bloqueia #1.');
  await relations.locator('button[type="submit"]').click();
  await expect(page.getByRole('alertdialog')).toContainText('Esta dependência criaria uma dependência circular.');
  await answerAppMessage(page);
  expect((await readSavedBoard(page, 'p1')).extensions.taskRelations.relations).toHaveLength(2);
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);
});
