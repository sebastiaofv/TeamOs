import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, answerAppMessage, mockImportProjectsPicker } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-16.board.json', 'utf8'));

test.beforeEach(async ({ page }) => { await gotoApp(page); });

test('an attachment can be the first change to an imported legacy project', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Imported project', acronym: null, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p1' });
  await portfolioCard(page, 'Files and todo').click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await page.setInputFiles('#taskAttachmentsInput', { name: 'first-change.txt', mimeType: 'text/plain', buffer: Buffer.from('first change after import') });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(4);
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments).toHaveLength(4);
});

test('first attachment requests write permission before reading files consumes user activation', async ({ page }) => {
  await mockImportProjectsPicker(page, [{ fileName: 'imported.board.json', payload: fixture }]);
  await page.evaluate(async () => {
    const [original] = await window.showOpenFilePicker!();
    let text = await (await original.getFile()).text();
    let granted = false;
    let readStarted = false;
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) { readStarted = true; read.call(this, file); };
    window.showOpenFilePicker = async () => [{
      name: original.name,
      async getFile() { return { name: original.name, size: new Blob([text]).size, lastModified: 1, async text() { return text; } }; },
      async requestPermission(options) {
        if (options.mode !== 'readwrite' || readStarted || !navigator.userActivation.isActive) throw new DOMException('Write permission requires user activation before reading', 'SecurityError');
        granted = true;
        return 'granted';
      },
      async createWritable() {
        // Model the browser's first-write prompt after FileReader has lost activation.
        if (!granted) throw new DOMException('Write permission requires user activation', 'SecurityError');
        return { async write(value: string) { text = value; }, async close() {} };
      }
    }];
  });
  await page.locator('#importProjectsBtn').click();
  await portfolioCard(page, 'Files and todo').click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#taskAttachmentsAddBtn').click();
  await (await chooser).setFiles({ name: 'first-change.txt', mimeType: 'text/plain', buffer: Buffer.from('first change after import') });
  await expect(page.locator('#taskAttachmentsEditor')).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
  const saved = await page.evaluate(async () => {
    const [handle] = await window.showOpenFilePicker!();
    return JSON.parse(await (await handle.getFile()).text());
  });
  expect(saved.board.tasks[0].attachments).toHaveLength(4);
  expect(saved.board.tasks[0].attachments[3].dataUrl).toBe(`data:text/plain;base64,${Buffer.from('first change after import').toString('base64')}`);
  expect(saved.extensions.timeline.events.some((event: { changes?: { attachments?: unknown } }) => event.changes?.attachments)).toBe(true);
});

for (const permission of ['denied', 'error'] as const) {
  test(`first attachment leaves the project unchanged when write permission is ${permission}`, async ({ page }) => {
    await mockImportProjectsPicker(page, [{ fileName: 'imported.board.json', payload: fixture }]);
    await page.evaluate(async (permission) => {
      const [original] = await window.showOpenFilePicker!();
      window.showOpenFilePicker = async () => [{
        ...original,
        async requestPermission() {
          if (permission === 'error') throw new DOMException('Permission unavailable', 'SecurityError');
          return 'denied';
        },
        async createWritable() { throw new Error('Must not write without permission'); }
      }];
    }, permission);
    await page.locator('#importProjectsBtn').click();
    await portfolioCard(page, 'Files and todo').click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    let pickerOpened = false;
    page.on('filechooser', () => { pickerOpened = true; });
    await page.locator('#taskAttachmentsAddBtn').click();
    await answerAppMessage(page, { expectText: permission === 'denied' ? 'Allow changes to the project JSON' : 'Permission unavailable' });
    expect(pickerOpened).toBe(false);
    await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(3);
    const saved = await page.evaluate(async () => {
      const [handle] = await window.showOpenFilePicker!();
      return JSON.parse(await (await handle.getFile()).text());
    });
    expect(saved).toEqual(fixture);
  });
}

test('creation shows details only and saved workitems accept attachments directly', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project', hasHandle: true, tasks: [] }], { selectedBoardId: 'p1' });
  await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
  await expect(page.locator('#taskAttachmentsEditor')).toHaveCount(0);
  await page.locator('#taskName').fill('New workitem');
  await page.locator('#taskModalSaveBtn').click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(page.getByLabel('Uploaded by', { exact: true })).toHaveValue('Test user');
  await page.setInputFiles('#taskAttachmentsInput', { name: 'new.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(1);
  await expect(page.locator('#detailAttachments')).toContainText('Test user');
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments[0].uploadedBy).toBe('Test user');
  await page.getByRole('button', { name: 'Remove attachment new.txt' }).click();
  await answerAppMessage(page, { button: 'Cancel' });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove attachment new.txt' }).click();
  await answerAppMessage(page, { button: 'Remove' });
  await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(0);
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments).toEqual([]);
});

for (const entryPoint of ['details', 'card']) {
  test(`editing from ${entryPoint} keeps attachments exclusively in their tab`, async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p1', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p1' });
    const originalAttachments = (await readSavedBoard(page, 'p1')).board.tasks[0].attachments;
    const card = portfolioCard(page, 'Files and todo');
    if (entryPoint === 'details') {
      await card.click();
      await page.locator('#taskDetailEditBtn').click();
    } else {
      await card.click(); await page.locator('#taskDetailEditBtn').click();
    }
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskModal #taskAttachmentsEditor')).toHaveCount(0);
    await expect(page.locator('#taskModal input[type="file"]')).toHaveCount(0);
    await page.locator('#taskName').fill('Edited workitem');
    await page.locator('#taskModalSaveBtn').click();
    await waitForBoardWrites(page);
    const saved = (await readSavedBoard(page, 'p1')).board.tasks[0];
    expect(saved.title).toBe('Edited workitem');
    expect(saved.attachments).toEqual(originalAttachments);
    await portfolioCard(page, 'Edited workitem').click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    await expect(page.locator('#detailAttachments .detail-attachment-name')).toHaveText(['new.txt', 'middle.txt', 'old.txt']);
    await page.setInputFiles('#taskAttachmentsInput', { name: 'after-edit.txt', mimeType: 'text/plain', buffer: Buffer.from('after edit') });
    await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(4);
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments).toHaveLength(4);
    await page.getByRole('button', { name: 'Remove attachment after-edit.txt' }).click();
    await answerAppMessage(page, { button: 'Remove' });
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments).toEqual(originalAttachments);
  });
}

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
