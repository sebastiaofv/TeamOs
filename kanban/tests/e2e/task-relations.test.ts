import { confirmWorkitemChanges } from '../support/portfolio';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, answerAppMessage, openTaskEditor } from '../support/portfolio';

test('compact relation groups show current status and responsible first names, not participants, after editing and reopening', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, members: ['Rui Manuel Silva'],
    tasks: [
      { id: 1, title: 'Source' },
      { id: 2, title: 'Blocker', status: 'doing', assignees: ['Ana', 'Marta Sofia Costa'], responsible: 'Marta Sofia Costa' },
      { id: 3, title: 'Archived dependent', status: 'done', archived: true, assignees: ['José Manuel Silva'], responsible: 'José Manuel Silva' },
      { id: 4, title: 'Unassigned item', status: 'to-do', assignees: ['Ana'], responsible: '' }
    ],
    extensions: { taskRelations: { version: 1, relations: [
      { sourceId: 2, targetId: 1, kind: 'blocks' },
      { sourceId: 1, targetId: 3, kind: 'blocks' },
      { sourceId: 1, targetId: 4, kind: 'related' }
    ] } }
  }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  const blocker = relations.getByRole('group', { name: 'Blocked by', exact: true });
  await expect(relations.locator('dt, th')).toHaveCount(0);
  await expect(blocker.getByLabel('Status', { exact: true })).toHaveText('in progress');
  await expect(blocker.getByLabel('Responsible', { exact: true })).toHaveText('Marta');
  const dependent = relations.getByRole('group', { name: 'Blocks', exact: true });
  await expect(dependent.getByLabel('Status', { exact: true })).toHaveText('done');
  await expect(dependent.getByLabel('Responsible', { exact: true })).toHaveText('José');
  await expect(dependent.getByRole('button', { name: '#3 Archived dependent · Archived', exact: true })).toBeVisible();
  await expect(relations.getByRole('group', { name: 'Related to', exact: true }).getByLabel('Responsible', { exact: true })).toHaveText('—');

  await page.locator('#taskDetailModalCloseBtn').click();
  await openTaskEditor(page, 'Blocker');
  await page.locator('#taskModal').getByLabel('Responsible', { exact: true }).selectOption('Rui Manuel Silva');
  await page.locator('#taskModalSaveBtn').click();
  await portfolioCard(page, 'Blocker').hover();
  await page.keyboard.press('4');
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks[1].status).toBe('done');
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  await expect(blocker.getByLabel('Status', { exact: true })).toHaveText('done');
  await expect(blocker.getByLabel('Responsible', { exact: true })).toHaveText('Rui');

  await page.locator('#taskDetailModalCloseBtn').click();
  await page.locator('#languageToggleBtn').click();
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const ptBlocker = page.getByRole('region', { name: 'Relações', exact: true }).getByRole('group', { name: 'É bloqueado por', exact: true });
  await expect(ptBlocker.getByLabel('Estado', { exact: true })).toHaveText('done');
  await expect(ptBlocker.getByLabel('Responsável', { exact: true })).toHaveText('Rui');
});

for (const width of [1280, 390]) {
  test(`relation columns stay aligned and titles truncate within the responsive modal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
      { id: 1, title: 'Source' },
      { id: 2, title: 'A blocker with a long title that must truncate instead of wrapping', status: 'doing', responsible: 'Ana Maria Silva', assignees: ['Ana Maria Silva'] },
      { id: 3, title: 'Dependent', status: 'to-do' },
      { id: 4, title: 'Related archived item with a very long title that must also truncate', archived: true }
    ], extensions: { taskRelations: { version: 1, relations: [
      { sourceId: 2, targetId: 1, kind: 'blocks' }, { sourceId: 1, targetId: 3, kind: 'blocks' }, { sourceId: 1, targetId: 4, kind: 'related' }
    ] } } }], { selectedBoardId: 'p1' });
    await portfolioCard(page, 'Source').click();
    await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
    const relations = page.getByRole('region', { name: 'Relations', exact: true });
    await relations.scrollIntoViewIfNeeded();
    const rows = relations.locator('.relation-row');
    await expect(rows).toHaveCount(3);
    const columns = await rows.evaluateAll((elements) => elements.map((row) => Array.from(row.children).map((cell) => cell.getBoundingClientRect().x)));
    expect(columns[1]).toEqual(columns[0]);
    expect(columns[2]).toEqual(columns[0]);
    await expect(relations.getByRole('button', { name: 'Edit relation' })).toHaveCount(3);
    await expect(relations.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(3);
    for (const action of await relations.locator('.relation-row-actions button').all()) await expect(action).toBeVisible();
    expect(await relations.locator('.relation-item-title').first().evaluate((element) =>
      getComputedStyle(element).whiteSpace === 'nowrap' && getComputedStyle(element).textOverflow === 'ellipsis')).toBe(true);
    expect(await rows.first().evaluate((row) => getComputedStyle(row).borderBottomWidth)).toBe('0px');
    const modal = page.locator('#taskDetailModal .modal-content');
    expect((await modal.boundingBox())!.width).toBeLessThanOrEqual(Math.min(1120, width - 20));
    expect(await page.locator('#taskDetailModal .modal-body').evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
  });
}

test('inline editing and removal require confirmation, cancel safely, regroup items and preserve their data', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
    { id: 1, title: 'Source', blocked: true, blockerReason: 'Manual block remains' },
    { id: 2, title: 'Blocker', status: 'doing' }
  ], extensions: { taskRelations: { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] } } }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  const blockedBy = relations.getByRole('group', { name: 'Blocked by', exact: true });
  const related = relations.getByRole('group', { name: 'Related to', exact: true });
  const original = await readSavedBoard(page, 'p1');
  await blockedBy.getByRole('button', { name: 'Edit relation' }).click();
  const editor = blockedBy.locator('li .relation-inline-editor');
  await expect(editor).toBeVisible();
  expect(await editor.locator('option').evaluateAll((options) => options.map((option) => option.getAttribute('value')))).toEqual(['', 'blocks', 'related']);
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await editor.getByLabel('Relation of the selected workitem').selectOption('related');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await readSavedBoard(page, 'p1')).toEqual(original);

  await blockedBy.getByRole('button', { name: 'Edit relation' }).click();
  await editor.getByLabel('Relation of the selected workitem').selectOption('related');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await answerAppMessage(page, { button: 'Cancel', expectText: 'Workitem #1 is related to #2.' });
  await expect(editor).toBeVisible();
  expect(await readSavedBoard(page, 'p1')).toEqual(original);
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);

  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await answerAppMessage(page, { button: 'Save', expectText: 'Both workitems will be preserved' });
  await expect(blockedBy.locator('.relation-row')).toHaveCount(0);
  await expect(related.locator('.relation-row')).toHaveCount(1);
  await expect(page.locator('#detailBlocked')).toHaveText('Yes');
  await expect(page.locator('#detailBlockerInput')).toHaveValue('Manual block remains');
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).extensions.taskRelations.relations).toEqual([{ sourceId: 1, targetId: 2, kind: 'related' }]);
  const replaced = await readSavedBoard(page, 'p1');
  expect(replaced.board.tasks).toMatchObject(original.board.tasks);

  await related.getByRole('button', { name: 'Remove', exact: true }).click();
  await answerAppMessage(page, { button: 'Cancel', expectText: 'Both workitems will be preserved' });
  expect(await readSavedBoard(page, 'p1')).toEqual(replaced);
  await related.getByRole('button', { name: 'Remove', exact: true }).click();
  await answerAppMessage(page, { button: 'Remove' });
  await expect(related.locator('.relation-row')).toHaveCount(0);
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).extensions.taskRelations).toBeUndefined();
  expect((await readSavedBoard(page, 'p1')).board.tasks).toEqual(replaced.board.tasks);
});

test('links archived workitems by ID, previews direction, navigates both ways, replaces and removes without losing items', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
    { id: 1, title: 'Current item' }, { id: 2, title: 'Archived blocker', archived: true }, { id: 3, title: 'Other item', status: 'done' }
  ] }, { id: 'p2', title: 'Other project', hasHandle: true, tasks: [{ id: 4, title: 'Outside project' }] }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Current item').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await relations.getByRole('button', { name: 'Link workitem', exact: true }).click();
  const picker = relations.getByRole('combobox', { name: 'Search this project by ID or title' });
  await expect(relations.locator('input')).toHaveCount(1);
  await expect(relations.locator('select')).toHaveCount(1);
  await picker.click();
  await expect(relations.getByRole('listbox').getByRole('option')).toHaveText([
    '#2 Archived blocker · backlog · Archived', '#3 Other item · done'
  ]);
  await picker.fill('#2');
  await expect(relations.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await relations.getByRole('option', { name: /#2 Archived blocker/ }).click();
  await expect(picker).toHaveValue('#2 Archived blocker · backlog · Archived');
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await relations.getByLabel('Relation of the selected workitem').selectOption('blockedBy');
  await expect(relations.getByRole('status')).toHaveText('Workitem #1 is blocked by #2.');
  await relations.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('#detailBlocked')).toHaveText('Yes');
  const blockedBy = relations.getByRole('group', { name: 'Blocked by', exact: true });
  await expect(blockedBy).toContainText('Archived');
  await blockedBy.getByRole('button', { name: /#2 Archived blocker/ }).click();
  await expect(page.locator('#detailTitle')).toHaveText('Archived blocker');
  await relations.getByRole('group', { name: 'Blocks', exact: true }).getByRole('button', { name: /#1 Current item/ }).click();
  await blockedBy.getByRole('button', { name: 'Edit relation' }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('related');
  await relations.getByRole('button', { name: 'Save', exact: true }).click();
  await answerAppMessage(page, { button: 'Save' });
  await expect(page.locator('#detailBlocked')).toHaveText('No');
  await relations.getByRole('group', { name: 'Related to', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  await answerAppMessage(page, { button: 'Remove' });
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).extensions.taskRelations).toBeUndefined();
  expect((await readSavedBoard(page, 'p1')).board.tasks).toHaveLength(3);
});

test('unified workitem picker filters immediately, supports keyboard selection and clears stale selections', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
    { id: 1, title: 'Source' },
    ...Array.from({ length: 20 }, (_, index) => ({ id: index + 2, title: `Candidate ${index + 2}` }))
  ] }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await relations.getByRole('button', { name: 'Link workitem', exact: true }).click();
  const picker = relations.getByRole('combobox', { name: 'Search this project by ID or title' });
  const options = relations.getByRole('listbox').getByRole('option');
  const confirm = relations.getByRole('button', { name: 'Confirm', exact: true });
  await picker.focus();
  await expect(options).toHaveCount(20);
  await picker.press('ArrowUp');
  await expect(picker).toHaveAttribute('aria-activedescendant', 'relation-option-21');
  await expect(options.last()).toBeInViewport();
  await picker.press('ArrowDown');
  await expect(picker).toHaveAttribute('aria-activedescendant', 'relation-option-2');
  await picker.fill('cAnDiDaTe 20');
  await expect(options).toHaveText(['#20 Candidate 20 · backlog']);
  await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(picker).toHaveValue('#20 Candidate 20 · backlog');
  await expect(picker).toBeFocused();
  await expect(relations.getByRole('listbox')).toHaveCount(0);
  await relations.getByLabel('Relation of the selected workitem').selectOption('related');
  await expect(confirm).toBeEnabled();
  await picker.fill('does not exist');
  await expect(relations.getByText('No workitems match your search.')).toBeVisible();
  await expect(options).toHaveCount(0);
  await expect(confirm).toBeDisabled();
  await expect(relations.getByRole('status')).toHaveCount(0);
  await picker.press('Enter');
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);
  await picker.fill('');
  await expect(options).toHaveCount(20);
  await picker.press('Escape');
  await expect(relations.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('#detailTitle')).toHaveText('Source');
  await picker.click();
  await expect(options).toHaveCount(20);
  await picker.press('Tab');
  await expect(relations.getByRole('listbox')).toHaveCount(0);
  await expect(relations.getByLabel('Relation of the selected workitem')).toBeFocused();
});

test('unified workitem picker allows direct selection on mobile and handles projects without other items', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
    { id: 1, title: 'Source' }, { id: 2, title: 'Another workitem with a long title that should wrap within the dropdown' }
  ] }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await relations.getByRole('button', { name: 'Link workitem', exact: true }).click();
  await relations.getByRole('combobox', { name: 'Search this project by ID or title' }).click();
  await relations.getByRole('option', { name: /#2 Another workitem/ }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('related');
  await relations.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).extensions.taskRelations.relations).toEqual([
    { sourceId: 1, targetId: 2, kind: 'related' }
  ]);
  const body = page.locator('#taskDetailModal .modal-body');
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'p2', title: 'Empty choices', hasHandle: true, tasks: [{ id: 1, title: 'Only item' }] }], { selectedBoardId: 'p2' });
  await portfolioCard(page, 'Only item').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  await relations.getByRole('button', { name: 'Link workitem', exact: true }).click();
  await relations.getByRole('combobox', { name: 'Search this project by ID or title' }).click();
  await expect(relations.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await expect(relations.getByText('No workitems match your search.')).toBeVisible();
  await expect(relations.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
});

test('creates a related item with editable inherited planning only, cancelling first leaves no partial item', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true,
    extensions: { roadmap: { version: 1, phases: [{ id: 'phase', title: 'Phase', startDate: '2026-01-01', endDate: '2026-02-01' }, { id: 'other', title: 'Other phase', startDate: '2026-02-01', endDate: '2026-03-01' }], milestones: [{ id: 'mile', title: 'Milestone', dueDate: '2026-03-01' }], sprints: [] } },
    tasks: [{ id: 1, title: 'Source', description: 'Do not inherit', assignees: ['Ana'], priority: 'high', tags: ['original'], phaseId: 'phase', milestoneId: 'mile' }]
  }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Source').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
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
  await expect(page.locator('#detailTitle')).toHaveText('Source');
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  await relations.getByRole('button', { name: 'Create related', exact: true }).click();
  await relations.getByLabel('Relation of the selected workitem').selectOption('blockedBy');
  await relations.locator('button[type="submit"]').click();
  await page.locator('#taskName').fill('New blocker');
  await page.locator('#taskDescription').fill('Own description');
  await page.locator('#taskPhase').selectOption('other');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#detailTitle')).toHaveText('New blocker');
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks.length).toBe(2);
  const saved = await readSavedBoard(page, 'p1');
  expect(saved.board.tasks[1]).toMatchObject({ title: 'New blocker', description: 'Own description', status: 'backlog', phaseId: 'other', milestoneId: 'mile', assignees: [], tags: [], priority: null });
  expect(saved.extensions.taskRelations).toEqual({ version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] });
});

test('read-only relations remain navigable on mobile without mutation controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Read only', hasHandle: false, tasks: [{ id: 1, title: 'Dependent' }, { id: 2, title: 'Done blocker with a long title that wraps on mobile', status: 'done', archived: true, assignees: ['Ana Maria com um nome de responsável bastante longo', 'Marta'] }],
    extensions: { taskRelations: { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] } }
  }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Dependent').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relations', exact: true });
  await expect(relations.getByRole('button', { name: 'Link workitem' })).toHaveCount(0);
  await expect(relations.getByRole('button', { name: 'Create related' })).toHaveCount(0);
  await expect(relations.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(relations.getByRole('button', { name: 'Edit relation' })).toHaveCount(0);
  await expect(page.locator('#detailBlocked')).toHaveText('No');
  await expect(relations.getByLabel('Status', { exact: true })).toHaveText('done');
  await expect(relations.getByLabel('Responsible', { exact: true })).toHaveText('—');
  const body = page.locator('#taskDetailModal .modal-body');
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await relations.getByRole('button', { name: /#2 Done blocker/ }).click();
  await expect(page.locator('#detailTitle')).toHaveText('Done blocker with a long title that wraps on mobile');
  await expect(relations.getByRole('button', { name: '#1 Dependent', exact: true })).toBeVisible();
  await expect(relations.getByLabel('Status', { exact: true })).toHaveText('backlog');
  await expect(relations.getByLabel('Responsible', { exact: true })).toHaveText('—');
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);
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
  await confirmWorkitemChanges(page);
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toBeVisible();
  await expect.poll(async () => (await readSavedBoard(page, 'p1')).board.tasks[1].status).toBe('to-do');
  const saved = await readSavedBoard(page, 'p1');
  expect(saved.board.tasks[0].blocked).toBe(false);
  expect(saved.board.tasks[2].blockerReason).toBe('Own reason');
  await page.reload();
  await seedPortfolioBoards(page, [{ id: 'reopened', title: 'Project', hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopened' });
  await expect(portfolioCard(page, 'Dependent').locator('.task-tag-blocked')).toBeVisible();
  await portfolioCard(page, 'Dependent').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  await expect(page.getByRole('region', { name: 'Relations', exact: true }).getByRole('button', { name: '#2 Blocker', exact: true })).toBeVisible();
});

test('rejects a circular dependency with a clear Portuguese message and leaves the saved graph unchanged', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true,
    tasks: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }, { id: 3, title: 'Third' }],
    extensions: { taskRelations: { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 2, targetId: 3, kind: 'blocks' }] } }
  }], { selectedBoardId: 'p1' });
  await page.locator('#languageToggleBtn').click();
  await portfolioCard(page, 'Third').click();
  await page.getByRole('tab', { name: /^(Relations|Relações)$/ }).click();
  const relations = page.getByRole('region', { name: 'Relações', exact: true });
  await relations.getByRole('button', { name: 'Associar workitem', exact: true }).click();
  await relations.getByRole('combobox', { name: 'Pesquisar neste projeto por ID ou título' }).fill('First');
  await relations.getByRole('option', { name: /#1 First/ }).click();
  await relations.getByLabel('Relação do workitem selecionado').selectOption('blocks');
  await expect(relations.getByRole('status')).toHaveText('O workitem #3 bloqueia #1.');
  await relations.locator('button[type="submit"]').click();
  await expect(page.getByRole('alertdialog')).toContainText('Esta dependência criaria uma dependência circular.');
  await answerAppMessage(page);
  expect((await readSavedBoard(page, 'p1')).extensions.taskRelations.relations).toHaveLength(2);
  expect(await page.evaluate(() => window.__portfolioTestWrites || [])).toEqual([]);
});
