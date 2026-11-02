import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, answerAppMessage } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-16.board.json', 'utf8'));

test.beforeEach(async ({ page }) => { await gotoApp(page); });

test('creation shows details only and saved workitems accept attachments directly', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [] }], { selectedBoardId: 'p1' });
  await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
  await expect(page.locator('#taskAttachmentsEditor')).toHaveCount(0);
  await page.locator('#taskName').fill('New workitem');
  await page.locator('#taskModalSaveBtn').click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await page.getByLabel('Uploaded by', { exact: true }).fill('Ana');
  await page.setInputFiles('#taskAttachmentsInput', { name: 'new.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(1);
  await expect(page.locator('#detailAttachments')).toContainText('Ana');
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments[0].uploadedBy).toBe('Ana');
  await page.getByRole('button', { name: 'Remove attachment new.txt' }).click();
  await answerAppMessage(page, { button: 'Cancel' });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove attachment new.txt' }).click();
  await answerAppMessage(page, { button: 'Remove' });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(0);
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments).toEqual([]);
});

test('attachments sort by upload date and remain downloadable in read-only projects', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: fixture.board.settings.title, hasHandle: false, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Files and todo').click();
  await expect(page.locator('#detailChecklist input').first()).toBeDisabled();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(page.locator('#detailAttachments .detail-attachment-name')).toHaveText(['new.txt', 'middle.txt', 'old.txt']);
  await expect(page.locator('#taskAttachmentsAddBtn')).toHaveCount(0);
  await expect(page.locator('#detailAttachments button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download new.txt' })).toBeVisible();
});

test('todo completion saves directly while adding entries still requires Edit', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [{ id: 1, title: 'Todo task', checklist: [{ text: 'Step', done: false }] }] }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Todo task').click();
  const checkbox = page.locator('#detailChecklist input');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(page.locator('.workitem-supporting-content')).toContainText('1/1');
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].checklist[0].done).toBe(true);
  await checkbox.uncheck();
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].checklist[0].done).toBe(false);
  await expect(page.locator('#taskChecklistNewItem')).toHaveCount(0);
  await page.locator('#taskDetailEditBtn').click();
  await expect(page.locator('#taskChecklistNewItem')).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`Relations IDs fit and tab headings are not repeated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [
      { id: 1, title: 'Source' }, { id: 123456, title: 'Related', displayId: 'ABC-TK-123456' }
    ], extensions: { taskRelations: { version: 1, relations: [{ sourceId: 1, targetId: 123456, kind: 'related' }] } } }], { selectedBoardId: 'p1' });
    await portfolioCard(page, 'Source').click();
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await expect(page.locator('#task-panel-relations h3')).toHaveCount(0);
    const link = page.locator('.relation-item-link');
    await expect(link).toHaveText('ABC-TK-123456');
    expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.locator('#taskDetailModal .modal-body').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('tab', { name: 'Pull Requests', exact: true }).click();
    await expect(page.locator('#task-panel-pullRequests h3')).toHaveCount(0);
  });
}
