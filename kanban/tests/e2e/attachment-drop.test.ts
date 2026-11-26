import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import {
  answerAppMessage,
  expectProjectCount,
  gotoApp,
  installControlledPortfolioWriter,
  portfolioCard,
  readSavedBoard,
  seedPortfolioBoards,
  showTimeline,
  toggleLanguage,
  toggleTheme,
  waitForBoardWrites
} from '../support/portfolio';

type DropFileSpec = { name: string; type: string; text?: string; base64?: string; sizeBytes?: number };

const controlFixture = JSON.parse(readFileSync('tests/fixtures/manual/us-20.board.json', 'utf8'));
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const editor = '#taskAttachmentsEditor';
const area = '#detailAttachments';
const rows = '#detailAttachments .detail-attachment-item';
const controlDialog = (page: Page) => page.locator('.control-modal').getByRole('dialog');

async function prepareTransfer(page: Page, files: DropFileSpec[], extraData: Record<string, string> = {}) {
  await page.evaluate(({ files, extraData }) => {
    const dt = new DataTransfer();
    for (const spec of files) {
      let bytes: Uint8Array;
      if (spec.base64) {
        const raw = atob(spec.base64);
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      } else if (spec.sizeBytes) {
        bytes = new Uint8Array(spec.sizeBytes);
      } else {
        bytes = new TextEncoder().encode(spec.text ?? '');
      }
      dt.items.add(new File([bytes.buffer as ArrayBuffer], spec.name, { type: spec.type }));
    }
    for (const [format, value] of Object.entries(extraData)) {
      dt.setData(format, value);
    }
    (window as unknown as { __dropTestDataTransfer?: DataTransfer }).__dropTestDataTransfer = dt;
  }, { files, extraData });
}

async function dispatchDrag(page: Page, type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', selector: string, relatedSelector?: string) {
  return page.evaluate(({ type, selector, relatedSelector }) => {
    const target = selector === 'window' ? window : document.querySelector(selector);
    if (!target) throw new Error(`Missing drag target: ${selector}`);
    const dt = (window as unknown as { __dropTestDataTransfer?: DataTransfer }).__dropTestDataTransfer;
    const relatedTarget = relatedSelector ? document.querySelector(relatedSelector) : null;
    const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, relatedTarget });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, selector, relatedSelector });
}

async function dropOn(page: Page, selector: string, files: DropFileSpec[]) {
  await prepareTransfer(page, files);
  await dispatchDrag(page, 'dragenter', selector);
  await dispatchDrag(page, 'dragover', selector);
  return dispatchDrag(page, 'drop', selector);
}

async function openWorkitemAttachments(page: Page, title: string) {
  await portfolioCard(page, title).click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(page.locator(area)).toBeVisible();
}

test('workitem attachments accept dropped files on the upload box and table area while preserving window project drop', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'p1',
    title: 'Project One',
    hasHandle: true,
    tasks: [{ id: 1, title: 'Drop target', status: 'backlog' }]
  }], { selectedBoardId: 'p1' });

  await openWorkitemAttachments(page, 'Drop target');
  await expect(page.locator('#taskAttachmentsDropHint')).toHaveText('Or drop files here.');

  // Dragging over the editor highlights it and hides the window project drop overlay.
  await prepareTransfer(page, [
    { name: 'notes.txt', type: 'text/plain', text: 'hello drop' },
    { name: 'pixel.png', type: 'image/png', base64: ONE_PIXEL_PNG }
  ]);
  await dispatchDrag(page, 'dragenter', 'window');
  await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);
  await dispatchDrag(page, 'dragenter', editor);
  await dispatchDrag(page, 'dragover', editor);
  await expect(page.locator(editor)).toHaveClass(/is-drop-active/);
  await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);

  expect(await dispatchDrag(page, 'drop', editor)).toBe(true);
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  await expect(page.locator(rows)).toHaveCount(2);
  await expect(page.locator(area)).toContainText('notes.txt');
  await expect(page.locator(area)).toContainText('pixel.png');
  await expect(page.locator(area)).toContainText('Test user');

  // Dropping onto the attachments table below the upload box also attaches files.
  await dropOn(page, '#detailAttachments .attachment-table', [{ name: 'table-drop.txt', type: 'text/plain', text: 'on table' }]);
  await expect(page.locator(rows)).toHaveCount(3);
  await waitForBoardWrites(page);

  const saved = await readSavedBoard(page, 'p1');
  expect(saved.board.tasks[0].attachments.map((item: { name: string }) => item.name).sort()).toEqual(['notes.txt', 'pixel.png', 'table-drop.txt']);
  await expectProjectCount(page, 1);

  // Close, reopen, and verify persistence.
  await page.locator('#taskDetailModalCloseBtn').click();
  await openWorkitemAttachments(page, 'Drop target');
  await expect(page.locator(rows)).toHaveCount(3);

  // Dropping a .board.json outside the attachment area still opens a read-only project.
  await page.locator('#taskDetailModalCloseBtn').click();
  const droppedBoard = JSON.stringify({
    meta: { schemaVersion: 1, appId: 'teamos-kanban', createdAt: '2026-02-26T00:00:00.000Z', updatedAt: '2026-02-26T00:00:00.000Z' },
    board: {
      columns: [{ status: 'backlog', title: 'backlog' }, { status: 'to-do', title: 'to-do' }, { status: 'doing', title: 'in progress' }, { status: 'done', title: 'done' }],
      tasks: [{ id: 1, title: 'Imported task', description: '', checklist: [], archived: false, createdAt: '2026-02-26T00:00:00.000Z', updatedAt: '2026-02-26T00:00:00.000Z', dueDate: '', priority: null, status: 'backlog' }],
      settings: { title: 'Dropped Project' }
    },
    extensions: {}
  });
  await dropOn(page, 'window', [{ name: 'dropped.board.json', type: 'application/json', text: droppedBoard }]);
  await expectProjectCount(page, 2);
});

test('dropped files enforce limits, duplicate warnings, non-file ignores, child transitions and busy guards', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'p1',
    title: 'Project One',
    hasHandle: true,
    tasks: [{ id: 1, title: 'Drop guards', status: 'backlog' }]
  }], { selectedBoardId: 'p1' });

  await openWorkitemAttachments(page, 'Drop guards');

  // Non-file transfers do not highlight or preventDefault.
  await prepareTransfer(page, [], { 'text/plain': 'plain text', 'text/uri-list': 'https://example.com' });
  await dispatchDrag(page, 'dragenter', editor);
  expect(await dispatchDrag(page, 'dragover', editor)).toBe(false);
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);
  expect(await dispatchDrag(page, 'drop', editor)).toBe(false);

  // Moving across child controls keeps highlight until leaving the zone.
  await prepareTransfer(page, [{ name: 'moving.txt', type: 'text/plain', text: 'm' }]);
  await dispatchDrag(page, 'dragenter', editor);
  await expect(page.locator(editor)).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'dragenter', '#taskAttachmentsAddBtn');
  await dispatchDrag(page, 'dragleave', editor, '#taskAttachmentsAddBtn');
  await expect(page.locator(editor)).toHaveClass(/is-drop-active/);
  await dispatchDrag(page, 'dragleave', '#taskAttachmentsAddBtn');
  await expect(page.locator(editor)).not.toHaveClass(/is-drop-active/);

  // Oversized file and duplicate file produce the same errors/warnings as the picker.
  await dropOn(page, editor, [{ name: 'huge.bin', type: 'application/octet-stream', sizeBytes: 10 * 1024 * 1024 + 1 }]);
  await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');
  await expect(page.locator(rows)).toHaveCount(0);

  await dropOn(page, editor, [{ name: 'dup.txt', type: 'text/plain', text: 'same' }]);
  await expect(page.locator(rows)).toHaveCount(1);
  await dropOn(page, editor, [{ name: 'dup.txt', type: 'text/plain', text: 'same' }]);
  await expect(page.locator('#taskAttachmentsWarnings')).toContainText('already attached');
  await expect(page.locator(rows)).toHaveCount(1);

  // A drop while a previous drop is still saving is discarded without importing a project.
  await installControlledPortfolioWriter(page, { boardId: 'p1', holdWrites: true });
  await dropOn(page, editor, [{ name: 'saving.txt', type: 'text/plain', text: 'saving' }]);
  await expect.poll(() => page.evaluate(() => window.__portfolioWriteControl!.pendingResolvers.length)).toBe(1);
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'true');
  await dropOn(page, editor, [{ name: 'ignored-while-busy.txt', type: 'text/plain', text: 'ignored' }]);
  await page.evaluate(() => {
    window.__portfolioWriteControl!.holdWrites = false;
    while (window.__releaseNextPortfolioWrite!()) { /* release */ }
  });
  await expect(page.locator(editor)).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator(rows)).toHaveCount(2);
  expect((await readSavedBoard(page, 'p1')).board.tasks[0].attachments.map((item: { name: string }) => item.name).sort()).toEqual(['dup.txt', 'saving.txt']);
  await expectProjectCount(page, 1);

  // PT localization for the drop hint.
  await page.locator('#taskDetailModalCloseBtn').click();
  await toggleLanguage(page);
  await portfolioCard(page, 'Drop guards').click();
  await page.getByRole('tab', { name: 'Anexos', exact: true }).click();
  await expect(page.locator('#taskAttachmentsDropHint')).toHaveText('Ou largue ficheiros aqui.');
});

for (const [kindLabel, recordTitle, recordId] of [
  ['Risks', 'Supplier availability', 'ATL-RK-1'],
  ['Decisions', 'Choose supported runtime', 'ATL-DC-4'],
  ['Deliverables', 'Release package', 'ATL-DL-6']
] as const) {
  test(`Project Control ${kindLabel}: supports drag-and-drop attachments, history, edits and removal`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'control',
      title: 'Atlas control',
      hasHandle: true,
      tasks: controlFixture.board.tasks,
      extensions: controlFixture.extensions
    }], { selectedBoardId: 'control' });

    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
    await page.getByRole('tab', { name: kindLabel, exact: true }).click();

    // New unsaved record keeps Attachments disabled until saved.
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await expect(controlDialog(page).getByRole('tab', { name: 'Attachments', exact: true })).toBeDisabled();
    await controlDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();

    // Open an existing record and drop files onto its Attachments tab.
    await page.getByRole('button', { name: recordTitle, exact: true }).click();
    await controlDialog(page).getByRole('tab', { name: 'Attachments', exact: true }).click();
    await expect(controlDialog(page).locator('#taskAttachmentsDropHint')).toHaveText('Or drop files here.');

    await prepareTransfer(page, [
      { name: 'evidence.txt', type: 'text/plain', text: `Evidence for ${recordId}` },
      { name: 'diagram.png', type: 'image/png', base64: ONE_PIXEL_PNG }
    ]);
    await dispatchDrag(page, 'dragenter', '.control-modal #taskAttachmentsEditor');
    await dispatchDrag(page, 'dragover', '.control-modal #taskAttachmentsEditor');
    await expect(controlDialog(page).locator(editor)).toHaveClass(/is-drop-active/);
    await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
    expect(await dispatchDrag(page, 'drop', '.control-modal #taskAttachmentsEditor')).toBe(true);

    await expect(controlDialog(page).locator(rows)).toHaveCount(2);
    await expect(controlDialog(page).locator(area)).toContainText('evidence.txt');
    await expect(controlDialog(page).locator(area)).toContainText('diagram.png');
    await expect(controlDialog(page).locator(area)).toContainText('Ana Silva');
    await expect(controlDialog(page).locator('#detailAttachments .attachment-open')).toHaveCount(2);

    // Check History tab records the attachments change without raw dataUrl payloads.
    await controlDialog(page).getByRole('tab', { name: 'History', exact: true }).click();
    const historyEntry = controlDialog(page).locator('.history-entry').first();
    await historyEntry.locator('summary').click();
    await expect(historyEntry.locator('.history-change dt')).toHaveText('Attachments');
    await expect(historyEntry).toContainText('evidence.txt');
    await expect(historyEntry).toContainText('diagram.png');

    // Switching back to Details and editing metadata succeeds without stale errors and preserves attachments.
    await controlDialog(page).getByRole('tab', { name: 'Details', exact: true }).click();
    await controlDialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await controlDialog(page).getByLabel('Title', { exact: true }).fill(`${recordTitle} with files`);
    await controlDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(controlDialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);

    let saved = await readSavedBoard(page, 'control');
    let savedRecord = saved.extensions.projectControl.records.find((item: { id: string }) => item.id === recordId);
    expect(savedRecord.title).toBe(`${recordTitle} with files`);
    expect(savedRecord.attachments.map((item: { name: string }) => item.name).sort()).toEqual(['diagram.png', 'evidence.txt']);

    // Reopen and remove one attachment with confirmation.
    await page.getByRole('button', { name: `${recordTitle} with files`, exact: true }).click();
    await controlDialog(page).getByRole('tab', { name: 'Attachments', exact: true }).click();
    await expect(controlDialog(page).locator(rows)).toHaveCount(2);
    await controlDialog(page).getByRole('button', { name: 'Remove attachment evidence.txt', exact: true }).click();
    await answerAppMessage(page, { button: 'Remove' });
    await expect(controlDialog(page).locator(rows)).toHaveCount(1);
    await expect(controlDialog(page).locator(area)).not.toContainText('evidence.txt');
    await waitForBoardWrites(page);

    saved = await readSavedBoard(page, 'control');
    savedRecord = saved.extensions.projectControl.records.find((item: { id: string }) => item.id === recordId);
    expect(savedRecord.attachments.map((item: { name: string }) => item.name)).toEqual(['diagram.png']);
    await expectProjectCount(page, 1);
  });
}

test('Project Control attachments respect read-only, historical timeline, PT language, dark theme and mobile layout', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
  await gotoApp(page);
  await seedPortfolioBoards(page, [{
    id: 'control',
    title: 'Atlas control',
    hasHandle: true,
    tasks: controlFixture.board.tasks,
    extensions: controlFixture.extensions
  }], { selectedBoardId: 'control' });

  await page.getByRole('button', { name: 'Project Control', exact: true }).click();
  await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
  await controlDialog(page).getByRole('tab', { name: 'Attachments', exact: true }).click();
  await dropOn(page, '.control-modal #taskAttachmentsEditor', [{ name: 'plan.txt', type: 'text/plain', text: 'mitigation' }]);
  await expect(controlDialog(page).locator(rows)).toHaveCount(1);
  await controlDialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();

  // Check PT + dark + mobile viewport (390px) has no horizontal dialog overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await toggleTheme(page);
  await toggleLanguage(page);
  await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
  await controlDialog(page).getByRole('tab', { name: 'Anexos', exact: true }).click();
  await expect(controlDialog(page).locator('#taskAttachmentsDropHint')).toHaveText('Ou largue ficheiros aqui.');
  await expect(controlDialog(page).locator(rows)).toHaveCount(1);
  const bounds = await controlDialog(page).locator(area).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await controlDialog(page).getByRole('button', { name: 'Fechar', exact: true }).last().click();

  // Historical preview before the upload hides editor/remove and shows no attachments at baseline.
  await page.setViewportSize({ width: 1280, height: 800 });
  await toggleLanguage(page);
  await showTimeline(page);
  await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
  await page.locator('.timeline-event-item[data-event-index="0"]').click();
  await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
  await controlDialog(page).getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(controlDialog(page).locator(editor)).toHaveCount(0);
  await expect(controlDialog(page).locator(rows)).toHaveCount(0);
  await expect(controlDialog(page).locator(area)).toContainText('No attachments yet.');
});

test('dropping onto attachments requests write permission and aborts cleanly when denied', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    const win = window as unknown as {
      __dropPermissionMode?: 'granted' | 'denied';
      __dropPermissionCalls?: number;
      showOpenFilePicker?: () => Promise<unknown[]>;
    };
    win.__dropPermissionMode = 'granted';
    win.__dropPermissionCalls = 0;
    let text = JSON.stringify({
      meta: { schemaVersion: 1, appId: 'teamos-kanban', createdAt: '2026-02-26T00:00:00.000Z', updatedAt: '2026-02-26T00:00:00.000Z' },
      board: {
        columns: [{ status: 'backlog', title: 'backlog' }, { status: 'to-do', title: 'to-do' }, { status: 'doing', title: 'in progress' }, { status: 'done', title: 'done' }],
        tasks: [{ id: 1, title: 'Permission task', description: '', assignees: [], assigneeIds: [], responsible: '', responsibleId: '', tags: [], checklist: [], archived: false, createdAt: '2026-02-26T00:00:00.000Z', updatedAt: '2026-02-26T00:00:00.000Z', dueDate: '', priority: null, status: 'backlog' }],
        settings: { title: 'Permission Project' }
      },
      extensions: {
        project: { version: 1, id: 'proj-perm', acronym: 'PRM', description: '', status: null, members: [{ id: 'm1', name: 'Test user' }], tags: [] }
      }
    }, null, 2);
    let lastModified = Date.now();
    const handle = {
      name: 'perm.board.json',
      async requestPermission() {
        win.__dropPermissionCalls = (win.__dropPermissionCalls || 0) + 1;
        return win.__dropPermissionMode || 'denied';
      },
      async getFile() {
        return { name: 'perm.board.json', size: new Blob([text]).size, lastModified, async text() { return text; } };
      },
      async createWritable() {
        return { async write(next: string) { text = String(next); lastModified = Date.now(); }, async close() {} };
      }
    };
    win.showOpenFilePicker = async () => [handle];
  });

  await page.locator('#importProjectsBtn').click();
  await expect(page.locator('#projectIdentityModal')).toBeVisible();
  await page.locator('#projectIdentityModal select').selectOption('m1');
  await page.locator('#projectIdentityModal .modal-footer button').click();
  await expect(page.locator('#projectIdentityModal')).toHaveCount(0);
  if (await page.locator('.board-active-sprints input').count()) await page.locator('.board-active-sprints input').uncheck();

  await openWorkitemAttachments(page, 'Permission task');
  await page.evaluate(() => {
    const win = window as unknown as { __dropPermissionMode: 'granted' | 'denied'; __dropPermissionCalls: number };
    win.__dropPermissionMode = 'denied';
    win.__dropPermissionCalls = 0;
  });
  await dropOn(page, editor, [{ name: 'denied.txt', type: 'text/plain', text: 'blocked' }]);
  await answerAppMessage(page, { expectText: /Allow changes to the project JSON file to add attachments/ });
  await expect(page.locator(rows)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __dropPermissionCalls: number }).__dropPermissionCalls)).toBeGreaterThanOrEqual(1);

  await page.evaluate(() => {
    (window as unknown as { __dropPermissionMode: 'granted' | 'denied' }).__dropPermissionMode = 'granted';
  });
  await dropOn(page, editor, [{ name: 'granted.txt', type: 'text/plain', text: 'allowed' }]);
  await expect(page.locator(rows)).toHaveCount(1);
  await expect(page.locator(area)).toContainText('granted.txt');
  await expectProjectCount(page, 1);
});

