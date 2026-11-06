import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, selectPortfolioBoard, installControlledPortfolioWriter, answerAppMessage, mockNewProjectFlow, mockImportProjectsPicker, mutateExternalBoardFile, triggerExternalFileCheck, portfolioBoardChip, openProjectSettingsFromPicker, openProjectPicker } from '../support/portfolio';

function project(id: string, productName?: string) {
    return { version: 1, id, description: '', status: null, members: [], tags: [], ...(productName === undefined ? {} : { productName }) };
}
async function seed(page: Page, readOnlySource = false) {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: !readOnlySource, extensions: { project: project('construction', ' House '), taskRelations: { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] } }, tasks: [{ id: 1, assigneeIds: [], responsibleId: '', title: 'Transfer me', checklist: [{ text: 'Completed item', done: true }], dueDate: '2026-12-01' }, { id: 2, assigneeIds: [], responsibleId: '', title: 'Blocker', status: 'doing' }] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'house') }, tasks: [{ id: 1, assigneeIds: [], responsibleId: '', title: 'Local number collision' }] },
        { id: 'other', title: 'Other product', hasHandle: true, extensions: { project: project('other', 'Garden') } },
        { id: 'independent', title: 'Independent', hasHandle: true, extensions: { project: project('independent') } }
    ], { selectedBoardId: 'source' });
}
async function startTransfer(page: Page, mode: 'Copy' | 'Move') {
    if (await page.locator('#taskDetailModal').count()) await page.keyboard.press('Escape');
    const card = portfolioCard(page, 'Transfer me'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: `${mode} to project…`, exact: true }).click();
    await expect(page.locator('#appMessageSelection')).toBeVisible();
    await expect(page.locator('#appMessageSelection')).toBeFocused();
    await expect(page.locator('#appMessageSelection option')).toHaveText(['Choose', 'Maintenance']);
    await expect(page.locator('#appMessageConfirmBtn')).toBeDisabled();
    await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('[data-field="state"]')).toBeFocused();
    await expect(page.locator('#appMessageConfirmBtn')).toBeEnabled();
    await expect(page.locator('[data-field="state"]')).toHaveValue('backlog');
    await page.locator('[data-field="state"]').selectOption({ label: 'in progress' });
    await expect(page.locator('.transfer-route')).toContainText('Construction');
    await expect(page.locator('.transfer-route')).toContainText('Maintenance');
}

for (const width of [1280, 390]) test(`a tall transfer review opens at the top while keeping keyboard focus on its first mapping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: project('construction', 'House') }, tasks: [
            { id: 1, title: 'Parent story', type: 'story', status: 'backlog', assigneeIds: [], responsibleId: '' },
            ...Array.from({ length: 20 }, (_, index) => ({ id: index + 2, title: `Child ${index}`, parentId: 1, status: 'backlog', assigneeIds: [], responsibleId: '' }))
        ] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'House') } }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    const card = portfolioCard(page, 'Parent story');
    await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…', exact: true }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('[data-field="state"]')).toBeFocused();
    await expect.poll(() => page.locator('#appMessageModal .modal-content').evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.locator('.transfer-route')).toBeInViewport();
    await page.locator('#appMessageCancelBtn').click();
});

test('products regroup when project settings change the product', async ({ page }) => {
    await seed(page);
    await openProjectSettingsFromPicker(page, 'Construction');
    await page.getByLabel('Product', { exact: true }).fill('Garden');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'source')).extensions.project.productName).toBe('Garden');
    expect((await readSavedBoard(page, 'target')).extensions.project.productName).toBe('house');
    await openProjectSettingsFromPicker(page, 'Construction');
    await page.getByLabel('Product', { exact: true }).fill('   ');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'source')).extensions.project.productName).toBeUndefined();
});

test('copy requires a destination, defaults its state, preserves the source and can be cancelled', async ({ page }) => {
    await seed(page);
    await startTransfer(page, 'Copy');
    await page.locator('#appMessageCancelBtn').click();
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(1);
    await startTransfer(page, 'Copy'); await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    const saved = await readSavedBoard(page, 'target');
    expect(saved.board.tasks).toHaveLength(2);
    expect(saved.board.tasks[1]).toMatchObject({ id: 2, title: 'Transfer me', status: 'doing', checklist: [{ text: 'Completed item', done: true }], dueDate: '2026-12-01' });
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(2);
    await selectPortfolioBoard(page, 'Maintenance'); await expect(portfolioCard(page, 'Transfer me')).toBeVisible();
    await selectPortfolioBoard(page, 'Construction');
    await openProjectPicker(page);
    const group = portfolioBoardChip(page, 'Maintenance').locator('xpath=ancestor::details');
    if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator('summary').click();
    await portfolioBoardChip(page, 'Maintenance').getByRole('button', { name: 'Remove project', exact: true }).click();
    await portfolioCard(page, 'Blocker').click();
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await expect(page.locator('.relation-item-archived')).toContainText('Unavailable');
    await expect(page.getByRole('button', { name: 'Open related project', exact: true })).toBeVisible();
});

test('an attachment save error does not reopen a completed transfer', async ({ page }) => {
    await seed(page);
    await startTransfer(page, 'Copy');
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await selectPortfolioBoard(page, 'Maintenance');
    await installControlledPortfolioWriter(page, { boardId: 'target', failWrites: 1 });
    await portfolioCard(page, 'Transfer me').click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    await page.setInputFiles('#taskAttachmentsInput', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('preserved on save failure') });
    await expect(page.locator('#detailAttachments tbody tr')).toHaveCount(1);
    await expect(page.locator('#taskAttachmentsEditor')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toHaveCount(0);
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(portfolioBoardChip(page, 'Maintenance')).toContainText('Save failed');
    await openProjectPicker(page);
    const group = portfolioBoardChip(page, 'Maintenance').locator('xpath=ancestor::details');
    if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator('summary').click();
    await portfolioBoardChip(page, 'Maintenance').getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'target')).board.tasks[1].attachments?.length).toBe(1);
});

for (const mode of ['Copy', 'Move'] as const) test(`${mode} remains recoverable when the final receipt write fails`, async ({ page }) => {
    await seed(page);
    await page.evaluate(async () => {
        const handles = await window.showOpenFilePicker!();
        const target = handles.find((handle) => handle.name === 'target.board.json')!;
        const createWritable = target.createWritable.bind(target);
        let attempts = 0;
        target.createWritable = async () => {
            if (++attempts === 2) throw new Error('Final receipt write failed');
            return createWritable();
        };
    });
    await startTransfer(page, mode);
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer incomplete.' });
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toBeVisible();
    if (await page.locator('#taskDetailModal').count()) await page.locator('#taskDetailModalCloseBtn').click();
    await page.getByRole('button', { name: 'Resume transfer', exact: true }).click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toHaveCount(0);
    const saved = await readSavedBoard(page, 'target');
    expect(saved.board.tasks).toHaveLength(2);
    expect(saved.extensions.projectTransfers.operations[0].status).toBe('complete');
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(mode === 'Move' ? 1 : 2);
});

for (const failure of ['target', 'source']) test(`move recovers a ${failure} write failure without duplicating the task`, async ({ page }) => {
    await seed(page);
    await installControlledPortfolioWriter(page, { boardId: failure, failWrites: 1 });
    await startTransfer(page, 'Move'); await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer incomplete.' });
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(2);
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(failure === 'target' ? 1 : 2);
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toBeVisible();
    if (await page.locator('#taskDetailModal').count()) await page.locator('#taskDetailModalCloseBtn').click();
    await page.getByRole('button', { name: 'Resume transfer', exact: true }).click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toHaveCount(0);
    const source = await readSavedBoard(page, 'source'), target = await readSavedBoard(page, 'target');
    expect(source.board.tasks).toHaveLength(1); expect(target.board.tasks).toHaveLength(2);
    expect(target.extensions.projectTransfers.operations[0].status).toBe('complete');
    expect(target.board.tasks[1].permanentId).toBe(target.extensions.projectTransfers.operations[0].from.permanentId);
});

test('copy is available from a read-only source while moving explains the write restriction', async ({ page }) => {
    await seed(page, true);
    if (await page.locator('#taskDetailModal').count()) await page.keyboard.press('Escape');
    const card = portfolioCard(page, 'Transfer me'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click(); await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await answerAppMessage(page, { expectText: 'moving also requires a writable source' });
    await startTransfer(page, 'Copy'); await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(2);
});

test('US-13 fixtures expose explicit mapping, planning removal, preserved comments and cross-project relation navigation', async ({ page }, testInfo) => {
    await gotoApp(page);
    await mockImportProjectsPicker(page, ['us-13', 'us-13-maintenance', 'us-13-other', 'us-13-independent'].map((name) => ({ fileName: `${name}.board.json`, payload: JSON.parse(readFileSync(`test-board/${name}.board.json`, 'utf8')) })));
    // Supply writable, stateful handles for the manual fixtures through the real Import flow.
    await page.evaluate(async () => {
        const handles = await window.showOpenFilePicker!({ multiple: true });
        const disk = await Promise.all(handles.map(async (handle) => ({ name: handle.name, text: await (await handle.getFile()).text() })));
        window.showOpenFilePicker = async () => disk.map((file) => ({ name: file.name, async getFile() { return { name: file.name, size: file.text.length, lastModified: 1, async text() { return file.text; } }; }, async createWritable() { return { async write(text: string) { file.text = text; }, async close() {} }; } }));
    });
    await page.locator('#importProjectsBtn').click();
    await selectPortfolioBoard(page, 'US-13 · Construção');
    const card = portfolioCard(page, 'Reparar portão'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click(); await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'US-13 · Manutenção' }); await page.locator('#appMessageConfirmBtn').click();
    await page.locator('[data-field="state"]').selectOption({ label: 'Reparação' });
    await expect(page.locator('#appMessageConfirmBtn')).toBeEnabled();
    await expect(page.locator('.transfer-workitem h4')).toContainText('Reparar portão');
    for (const field of await page.locator('select[data-field]:not([data-field="state"])').all()) await expect(field).toHaveValue('__remove__');
    await expect(page.locator('.transfer-workitem')).toContainText('29/10/2026 · 09:00–10:00');
    await expect(page.locator('.transfer-workitem')).toContainText('Exterior');
    await page.locator('[data-field="member-0"]').selectOption({ label: 'Bruno' });
    await page.locator('[data-field="tag-0"]').selectOption({ label: 'maintenance' });
    for (const select of await page.locator('.transfer-mapping-table select[data-field^="association-"]').all()) await select.selectOption('__remove__');
    await page.screenshot({ path: testInfo.outputPath('transfer-review.png'), animations: 'disabled' });
    await page.locator('#appMessageConfirmBtn').click(); await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await selectPortfolioBoard(page, 'US-13 · Manutenção'); await portfolioCard(page, 'Reparar portão').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click(); await expect(page.locator('.comment-text')).toContainText('Confirmar a inspeção');
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await page.getByRole('button', { name: 'CON-TK-1302 Concluir inspeção', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Concluir inspeção');
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Reparar portão');
    await page.locator('#taskDetailModalCloseBtn').click();
    await selectPortfolioBoard(page, 'US-13 · Manutenção');
    await page.screenshot({ path: testInfo.outputPath('product-projects.png'), animations: 'disabled' });
    // Return to a project that still contains this task's historical comment publication.
    const returning = portfolioCard(page, 'Reparar portão'); await returning.hover();
    await returning.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'US-13 · Construção' }); await page.locator('#appMessageConfirmBtn').click();
    await page.locator('[data-field="state"]').selectOption({ label: 'Em curso' });
    await page.locator('[data-field="member-0"]').selectOption({ label: 'Ana' });
    await page.locator('[data-field="tag-0"]').selectOption({ label: 'feature' });
    await page.locator('#appMessageConfirmBtn').click(); await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await selectPortfolioBoard(page, 'US-13 · Construção'); await portfolioCard(page, 'Reparar portão').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('.comment-text')).toHaveCount(1);
    await expect(page.locator('.comment-text')).toContainText('Confirmar a inspeção');
});

test('external product changes regroup projects and prevent transferring to a stale destination', async ({ page }) => {
    await seed(page);
    const updated = await readSavedBoard(page, 'target'); updated.extensions.project.productName = 'Garden';
    await mutateExternalBoardFile(page, { boardId: 'target', payload: updated }); await triggerExternalFileCheck(page);
    if (await page.locator('#taskDetailModal').count()) await page.keyboard.press('Escape');
    const card = portfolioCard(page, 'Transfer me'); await card.hover(); await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Copy to project…' }).click();
    await answerAppMessage(page, { expectText: 'No eligible destination.' });
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(1);
});

test('an external change while transfer confirmation is open rejects the stale draft without saving', async ({ page }) => {
    await seed(page); await startTransfer(page, 'Copy');
    const changed = await readSavedBoard(page, 'target'); changed.extensions.project.productName = 'Garden';
    await mutateExternalBoardFile(page, { boardId: 'target', payload: changed });
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'The project or source task changed.' });
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(1);
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(2);
});

test('task menus support keyboard activation and Escape closes only the menu before cancelling a transfer', async ({ page }) => {
    await seed(page);
    const card = portfolioCard(page, 'Transfer me');
    await card.click();
    const menu = page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true });
    await menu.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
    await expect(page.locator('#taskDetailModal').getByRole('button', { name: 'Copy to project…', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    await expect(page.locator('#taskDetailModal').getByRole('button', { name: 'Copy to project…', exact: true })).not.toBeVisible();
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page.locator('#appMessageSelection')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.locator('#appMessageModal')).toHaveCount(0);
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(1);
});


test('task detail shortcuts survive menu focus and Escape closes the open menu first', async ({ page }) => {
    await seed(page);
    await portfolioCard(page, 'Transfer me').click();
    const detail = page.locator('#taskDetailModal');
    const menu = detail.getByLabel('Task actions', { exact: true });
    await expect(menu).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(detail.getByRole('button', { name: 'Copy to project…' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Copy to project…' })).toBeHidden();
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
});

test('copying a Story to Done requires fresh acceptance and cancellation leaves both projects unchanged', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: project('construction', 'House') }, tasks: [{ id: 1, title: 'Accepted story', type: 'story', status: 'done', assigneeIds: [], responsibleId: '', acceptanceCriteria: 'Works as specified', acceptance: { author: 'Original author', at: '2026-10-01T10:00:00Z', local: true } }] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'House') } }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    for (const cancel of [true, false]) {
        if (await page.locator('#taskDetailModal').count()) await page.keyboard.press('Escape');
        const card = portfolioCard(page, 'Accepted story'); await card.hover();
        await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
        await page.locator('#taskDetailModal').getByRole('button', { name: 'Copy to project…' }).click();
        await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' }); await page.locator('#appMessageConfirmBtn').click();
        await page.locator('[data-field="state"]').selectOption({ label: 'done' });
        await page.locator('#appMessageConfirmBtn').click();
        await expect(page.locator('#appMessageInput')).toBeVisible();
        expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(0);
        if (cancel) await page.locator('#appMessageCancelBtn').click();
        else {
            await expect(page.locator('#appMessageInput')).toHaveAttribute('readonly', '');
            await page.locator('#appMessageConfirmBtn').click();
            await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
        }
    }
    expect((await readSavedBoard(page, 'target')).board.tasks[0].acceptance.author).toBe('Test user');
    expect((await readSavedBoard(page, 'source')).board.tasks[0].acceptance.author).toBe('Original author');
});

test('moving a parent with a started child lists its identity, title and state and rejects the move', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: project('construction', 'House') }, tasks: [{ id: 1, title: 'Parent story', type: 'story', assigneeIds: [], responsibleId: '' }, { id: 2, title: 'Child task', type: 'task', status: 'doing', parentId: 1, assigneeIds: [], responsibleId: '' }, { id: 3, title: 'Completed child', status: 'done', parentId: 1, assigneeIds: [], responsibleId: '' }, { id: 4, title: 'Eligible child', status: 'to-do', parentId: 1, assigneeIds: [], responsibleId: '' }] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'House') } }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    const card = portfolioCard(page, 'Parent story'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await expect(page.locator('.transfer-children')).toContainText('Child task');
    await expect(page.locator('.transfer-children')).toContainText('in progress');
    await expect(page.locator('.transfer-children tbody tr')).toHaveCount(3);
    await expect(page.locator('.transfer-child-blocked')).toHaveCount(2);
    await expect(page.locator('.transfer-child-blocked [role="img"]')).toHaveCount(2);
    await expect(page.locator('.transfer-child-blocked [role="img"]').first()).toHaveAttribute('aria-label', 'Blocks transfer');
    await expect(page.locator('.transfer-error')).toContainText('2 workitem(s)');
    await expect(page.locator('#appMessageText')).toHaveCount(1);
    await expect(page.locator('.transfer-mapping-fields')).toHaveCount(0);
    await expect(page.locator('#appMessageModal .modal-footer button')).toHaveText(['Close']);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    expect((await readSavedBoard(page, 'source')).board.tasks[1].parentId).toBe(1);
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(0);
});

test('moving a parent reviews and moves every eligible descendant with explicit states', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: project('construction', 'House') }, tasks: [
            { id: 1, title: 'Parent story', type: 'story', status: 'to-do', assigneeIds: [], responsibleId: '' },
            ...[2, 3, 4, 5].map((id) => ({ id, title: `Child task ${id}`, type: 'task' as const, status: id === 2 ? 'backlog' : 'to-do', parentId: 1, assigneeIds: [], responsibleId: '' }))
        ] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'House') }, tasks: [{ id: 1, title: 'Collision', assigneeIds: [], responsibleId: '' }] }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    const card = portfolioCard(page, 'Parent story'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('.transfer-children tbody tr')).toHaveCount(4);
    await expect(page.locator('.transfer-children')).toContainText('backlog');
    await expect(page.locator('#appMessageConfirmBtn')).toBeEnabled();
    await expect(page.locator('.transfer-workitem')).toHaveCount(5);
    await expect(page.locator('.transfer-workitem h4')).toHaveText(['#1 · Parent story', '#2 · Child task 2', '#3 · Child task 3', '#4 · Child task 4', '#5 · Child task 5']);
    for (const field of await page.locator('select[data-field]').all()) await expect(field).toHaveValue('backlog');
    for (const field of await page.locator('.transfer-mapping-table select').all()) await field.selectOption('to-do');
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    const target = await readSavedBoard(page, 'target');
    expect(target.board.tasks).toHaveLength(6);
    const parent = target.board.tasks.find((task: { title: string }) => task.title === 'Parent story');
    expect(target.board.tasks.filter((task: { parentId: number }) => task.parentId === parent.id)).toHaveLength(4);
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(0);
});


test('creating within a product opens settings with required name and acronym and optional metadata', async ({ page }) => {
    await seed(page);
    await mockNewProjectFlow(page, { fileName: 'new-house-project.json' });
    await openProjectPicker(page);
    const menu = page.locator('.product-project-menu').filter({ has: page.locator('summary').filter({ hasText: 'House' }) });
    if (!await menu.evaluate(node => (node as HTMLDetailsElement).open)) await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'New Project', exact: true }).click();
    const dialog = page.locator('#projectSettingsModal');
    await expect(page.getByLabel('Product', { exact: true })).toHaveValue('House');
    await expect(page.getByLabel('Project name', { exact: true })).toHaveAttribute('required');
    await expect(page.locator('#projectAcronym')).toHaveAttribute('required');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect(await page.evaluate(() => window.__newProjectWrites || [])).toEqual([]);
    // Wait for the deferred native validation before editing the draft.
    await expect(page.locator('#projectAcronym')).toBeFocused();
    await page.getByLabel('Project name', { exact: true }).fill('Renovation');
    await page.locator('#projectAcronym').fill('REN');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = JSON.parse((await page.evaluate(() => window.__newProjectWrites || []))[0]);
    expect(saved.board.settings.title).toBe('Renovation');
    expect(saved.extensions.project).toMatchObject({ productName: 'House', acronym: 'REN', description: '', members: [] });
    await expect(page.locator('#projectPickerBtn')).toContainText('Renovation');
});


test('the header shows the selected project after changing between products', async ({ page }) => {
    await seed(page);
    for (const name of ['Maintenance', 'Other product', 'Construction']) {
        await selectPortfolioBoard(page, name);
        await expect(page.locator('#projectPickerBtn')).toHaveText(new RegExp(name));
        await expect(page.locator('#portfolioBoardsChips')).toBeHidden();
    }
});

test('one import loads multiple board files and defaults a new product to the last file loaded', async ({ page }) => {
    await gotoApp(page);
    await mockImportProjectsPicker(page, ['us-13-maintenance', 'us-13'].map((name) => ({ fileName: `${name}.board.json`, payload: JSON.parse(readFileSync(`test-board/${name}.board.json`, 'utf8')) })));
    await page.evaluate(() => {
        const picker = window.showOpenFilePicker!;
        window.showOpenFilePicker = async (options) => {
            if (!options?.multiple) throw new Error('Multiple file selection must be enabled');
            return picker(options);
        };
    });
    await page.locator('#importProjectsBtn').click();
    await openProjectPicker(page);
    const house = page.locator('.product-project-menu');
    await expect(house.locator('.portfolio-chip')).toHaveCount(2);
    await house.locator('summary').click();
    await house.getByRole('button', { name: 'US-13 · Construção', exact: true }).click();
    await expect(portfolioCard(page, 'Reparar portão')).toBeVisible();
    await expect(portfolioBoardChip(page, 'US-13 · Construção').locator('[data-action="select-board"]')).toHaveAttribute('aria-pressed', 'true');
});


test('child associations are grouped and submitted independently with removal defaults', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: { ...project('construction', 'House'), tags: ['shared'] } }, tasks: [
            { id: 1, title: 'Parent story', type: 'story', status: 'to-do', assigneeIds: [], responsibleId: '', tags: ['shared'] },
            { id: 2, title: 'Remap child', parentId: 1, status: 'to-do', assigneeIds: [], responsibleId: '', tags: ['shared'] },
            { id: 3, title: 'Remove child', parentId: 1, status: 'backlog', assigneeIds: [], responsibleId: '', tags: ['shared'] }
        ] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: { ...project('maintenance', 'House'), tags: ['mapped'] } } }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional', exact: true }).click();
    const card = portfolioCard(page, 'Parent story'); await card.hover();
    await card.click(); await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('.transfer-workitem')).toHaveCount(3);
    for (const group of await page.locator('.transfer-workitem').all()) {
        await expect(group.getByLabel('Status', { exact: true })).toHaveValue('backlog');
        await expect(group.getByLabel('Tags', { exact: true })).toHaveValue('__remove__');
    }
    await page.getByRole('region', { name: '#2 · Remap child', exact: true }).getByLabel('Tags', { exact: true }).selectOption('mapped');
    await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    const target = await readSavedBoard(page, 'target');
    expect(target.board.tasks.find((task: { title: string }) => task.title === 'Parent story')).toMatchObject({ status: 'backlog', tags: [] });
    expect(target.board.tasks.find((task: { title: string }) => task.title === 'Remap child')).toMatchObject({ status: 'backlog', tags: ['mapped'] });
    expect(target.board.tasks.find((task: { title: string }) => task.title === 'Remove child')).toMatchObject({ status: 'backlog', tags: [] });
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(0);
});
