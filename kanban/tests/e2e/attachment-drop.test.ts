import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, expectProjectCount, mockImportProjectsPicker, answerAppMessage, installControlledPortfolioWriter, toggleLanguage } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('tests/fixtures/manual/us-16.board.json', 'utf8'));

type DropFile = { name: string; type?: string; text?: string; size?: number };

// Builds a native DataTransfer in the page so drag events carry real File objects.
async function prepareTransfer(page: Page, files: DropFile[], extra: Record<string, string> = {}) {
  await page.evaluate(({ files, extra }) => {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(new File([file.size === undefined ? (file.text ?? '') : new Uint8Array(file.size)], file.name, { type: file.type ?? '' }));
    for (const [type, value] of Object.entries(extra)) dt.setData(type, value);
    window.__dropTestDataTransfer = dt;
  }, { files, extra });
}

async function dispatchDrag(page: Page, type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', selector: string | null, relatedSelector?: string) {
  return page.evaluate(({ type, selector, relatedSelector }) => {
    const target = selector ? document.querySelector(selector)! : window;
    const relatedTarget = relatedSelector ? document.querySelector(relatedSelector) : null;
    const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: window.__dropTestDataTransfer, relatedTarget });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, selector, relatedSelector });
}

async function dropOn(page: Page, selector: string, files: DropFile[]) {
  await prepareTransfer(page, files);
  await dispatchDrag(page, 'dragenter', selector);
  await dispatchDrag(page, 'dragover', selector);
  return dispatchDrag(page, 'drop', selector);
}

async function openAttachments(page: Page, title: string) {
  await portfolioCard(page, title).click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(page.locator('#taskAttachmentsEditor')).toBeVisible();
}

const editor = '#taskAttachmentsEditor';
const rows = '#detailAttachments tbody tr';

// Browser-boundary stand-in for FileReader: records reads, can hold them
// until released, and can fail one named file.
async function controlFileReads(page: Page, { hold = false, failName = '' } = {}) {
  await page.evaluate(({ hold, failName }) => {
    const state = window as unknown as { __readNames: string[]; __heldReads: (() => void)[]; __holdReads: boolean };
    state.__readNames = [];
    state.__heldReads = [];
    state.__holdReads = hold;
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file: Blob) {
      const name = (file as File).name;
      state.__readNames.push(name);
      if (name === failName) {
        setTimeout(() => { Object.defineProperty(this, 'error', { value: new DOMException('Unreadable file', 'NotReadableError') }); this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>); });
        return;
      }
      if (state.__holdReads) { state.__heldReads.push(() => read.call(this, file)); return; }
      read.call(this, file);
    };
  }, { hold, failName });
}

const readNames = (page: Page) => page.evaluate(() => (window as unknown as { __readNames: string[] }).__readNames);
const heldReadCount = (page: Page) => page.evaluate(() => (window as unknown as { __heldReads: unknown[] }).__heldReads.length);
async function releaseReads(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { __heldReads: (() => void)[]; __holdReads: boolean };
    state.__holdReads = false;
    state.__heldReads.splice(0).forEach((release) => release());
  });
}

// Imports the fixture through an in-memory file handle whose write permission
// is decided by `permission`; 'held' waits for window.__grantPermission().
async function importWithPermission(page: Page, permission: 'denied' | 'error' | 'held') {
  await mockImportProjectsPicker(page, [{ fileName: 'imported.board.json', payload: fixture }]);
  await page.evaluate(async (permission) => {
    const [original] = await window.showOpenFilePicker!();
    let text = await (await original.getFile()).text();
    const state = window as unknown as { __permissionRequests: number; __grantPermission?: () => void };
    state.__permissionRequests = 0;
    window.showOpenFilePicker = async () => [{
      name: original.name,
      async getFile() { return { name: original.name, size: new Blob([text]).size, lastModified: 1, async text() { return text; } }; },
      async requestPermission() {
        state.__permissionRequests += 1;
        if (permission === 'error') throw new DOMException('Permission unavailable', 'SecurityError');
        if (permission === 'denied') return 'denied';
        await new Promise<void>((resolve) => { state.__grantPermission = resolve; });
        return 'granted';
      },
      async createWritable() {
        if (permission !== 'held') throw new Error('Must not write without permission');
        return { async write(value: string) { text = value; }, async close() {} };
      }
    }];
  }, permission);
  await page.locator('#importProjectsBtn').click();
  await openAttachments(page, 'Files and todo');
}

const savedImport = (page: Page) => page.evaluate(async () => {
  const [handle] = await window.showOpenFilePicker!();
  return JSON.parse(await (await handle.getFile()).text());
});

test.beforeEach(async ({ page }) => { await gotoApp(page); });

test('dropping two files on the attachment editor attaches them with the uploader and persists them', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await prepareTransfer(page, [{ name: 'one.txt', type: 'text/plain', text: 'first file' }, { name: 'two.txt', type: 'text/plain', text: 'second file' }]);
  await dispatchDrag(page, 'dragenter', null);
  await dispatchDrag(page, 'dragenter', editor);
  await dispatchDrag(page, 'dragover', '#taskAttachmentsAddBtn');
  expect(await dispatchDrag(page, 'drop', '#taskAttachmentsAddBtn')).toBe(true);

  await expect(page.locator(rows)).toHaveCount(2);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  await expect(page.locator('#appMessageModal')).toBeHidden();
  await expectProjectCount(page, 1);
  await waitForBoardWrites(page);
  const saved = (await readSavedBoard(page, 'p1')).board.tasks[0].attachments;
  expect(saved.map((item: { name: string; uploadedBy: string; dataUrl: string; sizeBytes: number }) => [item.name, item.uploadedBy, item.dataUrl, item.sizeBytes])).toEqual([
    ['one.txt', 'Test user', `data:text/plain;base64,${Buffer.from('first file').toString('base64')}`, 10],
    ['two.txt', 'Test user', `data:text/plain;base64,${Buffer.from('second file').toString('base64')}`, 11]
  ]);

  await page.locator('#taskDetailModalCloseBtn').click();
  await openAttachments(page, 'Drop target');
  await expect(page.locator(rows)).toHaveCount(2);
  await expect(page.locator('#detailAttachments')).toContainText('one.txt');
  await expect(page.locator('#detailAttachments')).toContainText('two.txt');
});

const validationBatch: DropFile[] = [
  { name: 'same.txt', type: 'text/plain', text: 'same' },
  { name: 'same.txt', type: 'text/plain', text: 'same' },
  { name: 'huge.bin', type: 'application/octet-stream', size: 11 * 1024 * 1024 },
  { name: 'model.xyz', type: 'application/x-unknown-model', text: 'opaque' },
  ...Array.from({ length: 9 }, (_, index) => ({ name: `f${index + 1}.txt`, type: 'text/plain', text: `file ${index + 1}` }))
];

test('drops follow the picker rules for duplicates, size, count and unpreviewable formats', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Picked', status: 'backlog' }, { id: 2, title: 'Dropped', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Picked');
  await page.setInputFiles('#taskAttachmentsInput', validationBatch.map((file) => ({ name: file.name, mimeType: file.type!, buffer: file.size === undefined ? Buffer.from(file.text!) : Buffer.alloc(file.size) })));
  await expect(page.locator(rows)).toHaveCount(10);
  await expect(page.locator('#taskAttachmentsWarnings > div')).toHaveCount(3);
  const pickedMessages = await page.locator('#taskAttachmentsWarnings > div').allTextContents();
  await page.locator('#taskDetailModalCloseBtn').click();

  await openAttachments(page, 'Dropped');
  await dropOn(page, editor, validationBatch);
  await expect(page.locator(rows)).toHaveCount(10);
  await expect(page.locator('#taskAttachmentsWarnings > div')).toHaveCount(3);
  const droppedMessages = await page.locator('#taskAttachmentsWarnings > div').allTextContents();
  expect(droppedMessages).toEqual([
    'same.txt is already attached and was skipped.',
    'huge.bin exceeds the 10 MB limit.',
    'Attachment limit reached (10 per task).'
  ]);
  expect(droppedMessages).toEqual(pickedMessages);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download model.xyz', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('model.xyz');

  await waitForBoardWrites(page);
  const tasks = (await readSavedBoard(page, 'p1')).board.tasks;
  const outcome = (index: number) => tasks[index].attachments.map((item: Record<string, unknown>) => [item.name, item.sizeBytes, item.kind, item.mime, item.uploadedBy, item.dataUrl]);
  expect(outcome(1).map((item: unknown[]) => item[0])).toEqual(['same.txt', 'model.xyz', 'f1.txt', 'f2.txt', 'f3.txt', 'f4.txt', 'f5.txt', 'f6.txt', 'f7.txt', 'f8.txt']);
  expect(outcome(1)).toEqual(outcome(0));
});

test('a file that cannot be read is reported while the rest of the drop is attached', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await controlFileReads(page, { failName: 'broken.txt' });
  await dropOn(page, editor, [{ name: 'broken.txt', type: 'text/plain', text: 'x' }, { name: 'good.txt', type: 'text/plain', text: 'ok' }]);
  await expect(page.locator(rows)).toHaveCount(1);
  await expect(page.locator('#detailAttachments tbody')).toContainText('good.txt');
  await expect(page.locator('#taskAttachmentsWarnings')).toHaveText('broken.txt: Unreadable file');
  expect(await readNames(page)).toEqual(['broken.txt', 'good.txt']);
});

test('a dropped project file inside the editor is attached and never opened as a project', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  const project = { name: 'other.board.json', type: 'application/json', text: JSON.stringify({ ...fixture, board: { ...fixture.board, settings: { ...fixture.board.settings, title: 'Other Project' } } }) };
  await prepareTransfer(page, [project]);
  await dispatchDrag(page, 'dragenter', null);
  await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);
  await dispatchDrag(page, 'dragenter', editor);
  await dispatchDrag(page, 'dragover', editor);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  await expect(page.locator(editor)).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'drop', editor);
  await expect(page.locator(rows)).toHaveCount(1);
  await expect(page.locator('#detailAttachments tbody')).toContainText('other.board.json');
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  await expectProjectCount(page, 1);

  // Into the editor and back out: outside it, project-opening feedback returns.
  await prepareTransfer(page, [project]);
  await dispatchDrag(page, 'dragenter', editor);
  await dispatchDrag(page, 'dragover', editor);
  await dispatchDrag(page, 'dragenter', '#detailAttachments tbody');
  await dispatchDrag(page, 'dragleave', editor, '#detailAttachments tbody');
  await dispatchDrag(page, 'dragover', '#detailAttachments tbody');
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);
  await dispatchDrag(page, 'dragleave', '#detailAttachments tbody');
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);

  // The next drop on the window opens the project read-only as before.
  await page.locator('#taskDetailModalCloseBtn').click();
  await prepareTransfer(page, [project]);
  await dispatchDrag(page, 'dragenter', null);
  await dispatchDrag(page, 'dragover', null);
  await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);
  await dispatchDrag(page, 'drop', null);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  await expectProjectCount(page, 2);
});

for (const permission of ['denied', 'error'] as const) {
  test(`a drop reads and writes nothing when write permission is ${permission}`, async ({ page }) => {
    await importWithPermission(page, permission);
    await controlFileReads(page);
    await dropOn(page, editor, [{ name: 'refused.txt', type: 'text/plain', text: 'no' }]);
    await answerAppMessage(page, { expectText: permission === 'denied' ? 'Allow changes to the project JSON' : 'Permission unavailable' });
    await expect(page.locator(rows)).toHaveCount(3);
    expect(await readNames(page)).toEqual([]);
    expect(await savedImport(page)).toEqual(fixture);
    await expectProjectCount(page, 1);
    await expect(page.locator('#taskAttachmentsAddBtn')).toBeEnabled();
  });
}

test('drops while preparing, reading or saving are discarded without importing', async ({ page }) => {
  await importWithPermission(page, 'held');
  await controlFileReads(page, { hold: true });
  await dropOn(page, editor, [{ name: 'first.txt', type: 'text/plain', text: 'first' }]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __permissionRequests: number }).__permissionRequests)).toBe(1);
  // Preparing: no accepting highlight, a second drop is claimed and discarded.
  await prepareTransfer(page, [{ name: 'during-permission.txt', type: 'text/plain', text: 'x' }]);
  await dispatchDrag(page, 'dragenter', editor);
  await dispatchDrag(page, 'dragover', editor);
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  expect(await dispatchDrag(page, 'drop', editor)).toBe(true);
  await page.evaluate(() => (window as unknown as { __grantPermission: () => void }).__grantPermission());

  // Reading: busy indicators are on and another drop is discarded.
  await expect.poll(() => heldReadCount(page)).toBe(1);
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#taskAttachmentsAddBtn')).toBeDisabled();
  await dropOn(page, editor, [{ name: 'during-read.txt', type: 'text/plain', text: 'y' }]);
  await releaseReads(page);
  await expect(page.locator(rows)).toHaveCount(4);
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#taskAttachmentsAddBtn')).toBeEnabled();
  expect(await readNames(page)).toEqual(['first.txt']);
  await expect.poll(async () => (await savedImport(page)).board.tasks[0].attachments.map((item: { name: string }) => item.name)).toEqual([...fixture.board.tasks[0].attachments.map((item: { name: string }) => item.name), 'first.txt']);
  expect(await page.evaluate(() => (window as unknown as { __permissionRequests: number }).__permissionRequests)).toBe(1);
  await expectProjectCount(page, 1);
});

test('closing the details while a dropped file is read applies no late attachment', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await controlFileReads(page, { hold: true });
  await dropOn(page, editor, [{ name: 'late.txt', type: 'text/plain', text: 'late' }]);
  await expect.poll(() => heldReadCount(page)).toBe(1);
  await page.locator('#taskDetailModalCloseBtn').click();
  await expect(page.locator('#taskDetailModal')).toBeHidden();
  await releaseReads(page);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments ?? []).toEqual([]);
  await openAttachments(page, 'Drop target');
  await expect(page.locator(rows)).toHaveCount(0);
});

test('a disabled editor claims file drops without highlighting, uploading or importing', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog', attachments: [{ id: 'a1', name: 'keep.txt', mime: 'text/plain', sizeBytes: 4, kind: 'file', dataUrl: 'data:text/plain;base64,a2VlcA==', createdAt: '2026-02-26T00:00:00.000Z' }] }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await controlFileReads(page);
  // The removal confirmation disables the editor while it is open.
  await page.getByRole('button', { name: 'Remove attachment keep.txt' }).click();
  await expect(page.locator('#taskAttachmentsAddBtn')).toBeDisabled();
  await prepareTransfer(page, [{ name: 'blocked.txt', type: 'text/plain', text: 'no' }]);
  await page.evaluate(() => {
    const target = document.querySelector('#taskAttachmentsEditor')!;
    for (const type of ['dragenter', 'dragover']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: window.__dropTestDataTransfer }));
  });
  await expect(page.locator('#taskAttachmentsEditor')).not.toHaveClass(/is-drop-active/);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  expect(await dispatchDrag(page, 'drop', editor)).toBe(true);
  await answerAppMessage(page, { button: 'Cancel' });
  await expect(page.locator(rows)).toHaveCount(1);
  expect(await readNames(page)).toEqual([]);
  await expectProjectCount(page, 1);
});

test('a drop while the previous drop is still saving is discarded', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await installControlledPortfolioWriter(page, { boardId: 'p1', holdWrites: true });
  await dropOn(page, editor, [{ name: 'saving.txt', type: 'text/plain', text: 'saving' }]);
  await expect.poll(() => page.evaluate(() => window.__portfolioWriteControl!.pendingResolvers.length)).toBe(1);
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'true');
  await dropOn(page, editor, [{ name: 'while-saving.txt', type: 'text/plain', text: 'x' }]);
  await page.evaluate(() => window.__releaseNextPortfolioWrite!());
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator(rows)).toHaveCount(1);
  await page.evaluate(() => { window.__portfolioWriteControl!.holdWrites = false; while (window.__releaseNextPortfolioWrite!()); });
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments.map((item: { name: string }) => item.name)).toEqual(['saving.txt']);
  await expectProjectCount(page, 1);
});

test('drop feedback follows file drags across the editor children and ignores non-file transfers', async ({ page }) => {
  await seedPortfolioBoards(page, [{ id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }] }], { selectedBoardId: 'p1' });
  await openAttachments(page, 'Drop target');
  await expect(page.locator('#taskAttachmentsDropHint')).toHaveText('Or drop files here.');
  const active = page.locator(editor);
  await controlFileReads(page);

  // Text and link drags neither highlight nor upload, and are not claimed.
  await prepareTransfer(page, [], { 'text/plain': 'just text', 'text/uri-list': 'https://example.com' });
  await dispatchDrag(page, 'dragenter', editor);
  expect(await dispatchDrag(page, 'dragover', editor)).toBe(false);
  await expect(active).not.toHaveClass(/is-drop-active/);
  expect(await dispatchDrag(page, 'drop', editor)).toBe(false);

  // File drags: entering a child before leaving the parent keeps the highlight.
  await prepareTransfer(page, [{ name: 'moving.txt', type: 'text/plain', text: 'm' }]);
  await dispatchDrag(page, 'dragenter', editor);
  await expect(active).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'dragenter', '#taskAttachmentsAddBtn');
  await dispatchDrag(page, 'dragleave', editor, '#taskAttachmentsAddBtn');
  await expect(active).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'dragenter', '#taskAttachmentUploader');
  await dispatchDrag(page, 'dragleave', '#taskAttachmentsAddBtn', '#taskAttachmentUploader');
  await expect(active).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'dragleave', '#taskAttachmentUploader');
  await expect(active).not.toHaveClass(/is-drop-active/);

  // A transfer that advertises files but carries none is cleared and ignored.
  await prepareTransfer(page, []);
  await page.evaluate(() => {
    const empty = new DataTransfer();
    Object.defineProperty(empty, 'types', { value: ['Files'] });
    const target = document.querySelector('#taskAttachmentsEditor')!;
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: empty }));
  });
  await expect(active).not.toHaveClass(/is-drop-active/);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
  await expect(page.locator(rows)).toHaveCount(0);
  expect(await readNames(page)).toEqual([]);
  await expectProjectCount(page, 1);

  await page.locator('#taskDetailModalCloseBtn').click();
  await toggleLanguage(page);
  await portfolioCard(page, 'Drop target').click();
  await page.getByRole('tab', { name: 'Anexos', exact: true }).click();
  await expect(page.locator('#taskAttachmentsDropHint')).toHaveText('Ou largue ficheiros aqui.');
});
