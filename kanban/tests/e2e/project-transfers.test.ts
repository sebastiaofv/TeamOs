import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, selectPortfolioBoard, installControlledPortfolioWriter, answerAppMessage, mockImportProjectsPicker, mutateExternalBoardFile, triggerExternalFileCheck, portfolioBoardChip } from '../support/portfolio';

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
    const card = portfolioCard(page, 'Transfer me'); await card.hover();
    await card.getByLabel('Task actions', { exact: true }).click();
    await card.getByRole('button', { name: `${mode} to project…`, exact: true }).click();
    await expect(page.locator('#appMessageSelection')).toBeVisible();
    await expect(page.locator('#appMessageSelection')).toBeFocused();
    await expect(page.locator('#appMessageSelection option')).toHaveText(['Choose', 'Maintenance']);
    await expect(page.locator('#appMessageConfirmBtn')).toBeDisabled();
    await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('#appMessageText')).toHaveText('Choose the destination workflow state explicitly.');
    await expect(page.locator('#appMessageSelection')).toBeFocused();
    await expect(page.locator('#appMessageConfirmBtn')).toBeDisabled();
    await page.locator('#appMessageSelection').selectOption({ label: 'in progress' });
    await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('.transfer-state-value')).toHaveText('in progress');
    await expect(page.locator('.transfer-route')).toContainText('Construction');
    await expect(page.locator('.transfer-route')).toContainText('Maintenance');
}

test('products group projects, collapse with the keyboard and update only the edited project', async ({ page }) => {
    await seed(page);
    const groups = page.locator('.product-group'); await expect(groups).toHaveCount(2);
    const house = groups.filter({ has: page.locator('summary > span:not(.product-count)', { hasText: /^House$/ }) });
    await expect(house.locator('.portfolio-chip')).toHaveCount(2);
    await house.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(house.getByRole('button', { name: 'Construction', exact: true })).not.toBeVisible();
    await expect(portfolioCard(page, 'Transfer me')).toBeVisible();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Settings for Construction', exact: true }).click();
    await page.getByLabel('Product', { exact: true }).fill('Garden');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'source')).extensions.project.productName).toBe('Garden');
    await expect(page.locator('.product-group').filter({ has: page.locator('summary > span:not(.product-count)', { hasText: /^Garden$/ }) }).locator('.portfolio-chip')).toHaveCount(2);
    expect((await readSavedBoard(page, 'target')).extensions.project.productName).toBe('house');
    await page.getByRole('button', { name: 'Settings for Construction', exact: true }).click();
    await page.getByLabel('Product', { exact: true }).fill('   ');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'source')).extensions.project.productName).toBeUndefined();
    await expect(page.locator('#portfolioBoardsChips > .portfolio-chip').filter({ hasText: 'Construction' })).toBeVisible();
});

test('copy requires explicit project and state, preserves the source and can be cancelled', async ({ page }) => {
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
    await portfolioBoardChip(page, 'Maintenance').getByRole('button', { name: 'Remove project', exact: true }).click();
    await portfolioCard(page, 'Blocker').click();
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await expect(page.locator('.relation-item-archived')).toContainText('Unavailable');
    await expect(page.getByRole('button', { name: 'Open related project', exact: true })).toBeVisible();
});

for (const failure of ['target', 'source']) test(`move recovers a ${failure} write failure without duplicating the task`, async ({ page }) => {
    await seed(page);
    await installControlledPortfolioWriter(page, { boardId: failure, failWrites: 1 });
    await startTransfer(page, 'Move'); await page.locator('#appMessageConfirmBtn').click();
    await answerAppMessage(page, { expectText: 'Transfer incomplete.' });
    expect((await readSavedBoard(page, 'source')).board.tasks).toHaveLength(2);
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(failure === 'target' ? 1 : 2);
    await expect(page.getByRole('region', { name: 'Pending transfers', exact: true })).toBeVisible();
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
    const card = portfolioCard(page, 'Transfer me'); await card.hover();
    await card.getByLabel('Task actions', { exact: true }).click(); await card.getByRole('button', { name: 'Move to project…' }).click();
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
    await card.getByLabel('Task actions', { exact: true }).click(); await card.getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'US-13 · Manutenção' }); await page.locator('#appMessageConfirmBtn').click();
    await page.locator('#appMessageSelection').selectOption({ label: 'Reparação' }); await page.locator('#appMessageConfirmBtn').click();
    await expect(page.locator('#appMessageConfirmBtn')).toBeDisabled();
    await expect(page.locator('.transfer-removals')).toContainText('2026-10-29 · 09:00–10:00');
    await expect(page.locator('.transfer-removals')).toContainText('Exterior');
    await page.locator('#appMessageSelection-0').selectOption({ label: 'Bruno' });
    await page.locator('#appMessageSelection-1').selectOption({ label: 'maintenance' });
    await page.screenshot({ path: testInfo.outputPath('transfer-review.png'), animations: 'disabled' });
    await page.locator('#appMessageConfirmBtn').click(); await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
    await selectPortfolioBoard(page, 'US-13 · Manutenção'); await portfolioCard(page, 'Reparar portão').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click(); await expect(page.locator('.comment-text')).toContainText('Confirmar a inspeção');
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await page.getByRole('button', { name: 'CON-TK-1302 Concluir inspeção', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Concluir inspeção');
    await page.locator('#taskDetailModalCloseBtn').click();
    await selectPortfolioBoard(page, 'US-13 · Manutenção');
    await page.screenshot({ path: testInfo.outputPath('product-projects.png'), animations: 'disabled' });
    // Return to a project that still contains this task's historical comment publication.
    const returning = portfolioCard(page, 'Reparar portão'); await returning.hover();
    await returning.getByLabel('Task actions', { exact: true }).click();
    await returning.getByRole('button', { name: 'Move to project…' }).click();
    await page.locator('#appMessageSelection').selectOption({ label: 'US-13 · Construção' }); await page.locator('#appMessageConfirmBtn').click();
    await page.locator('#appMessageSelection').selectOption({ label: 'Em curso' }); await page.locator('#appMessageConfirmBtn').click();
    await page.locator('#appMessageSelection-0').selectOption({ label: 'Ana' });
    await page.locator('#appMessageSelection-1').selectOption({ label: 'feature' });
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
    const card = portfolioCard(page, 'Transfer me'); await card.hover(); await card.getByLabel('Task actions', { exact: true }).click();
    await card.getByRole('button', { name: 'Copy to project…' }).click();
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
    const menu = card.getByLabel('Task actions', { exact: true });
    await menu.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
    await expect(card.getByRole('button', { name: 'Copy to project…', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    await expect(card.getByRole('button', { name: 'Copy to project…', exact: true })).not.toBeVisible();
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
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    for (const cancel of [true, false]) {
        const card = portfolioCard(page, 'Accepted story'); await card.hover();
        await card.getByLabel('Task actions', { exact: true }).click();
        await card.getByRole('button', { name: 'Copy to project…' }).click();
        await page.locator('#appMessageSelection').selectOption({ label: 'Maintenance' }); await page.locator('#appMessageConfirmBtn').click();
        await page.locator('#appMessageSelection').selectOption({ label: 'done' }); await page.locator('#appMessageConfirmBtn').click();
        await page.locator('#appMessageConfirmBtn').click();
        await expect(page.locator('#appMessageInput')).toBeVisible();
        expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(0);
        if (cancel) await page.locator('#appMessageCancelBtn').click();
        else {
            await page.locator('#appMessageInput').fill('New reviewer');
            await page.locator('#appMessageConfirmBtn').click();
            await answerAppMessage(page, { expectText: 'Transfer saved successfully.' });
        }
    }
    expect((await readSavedBoard(page, 'target')).board.tasks[0].acceptance.author).toBe('New reviewer');
    expect((await readSavedBoard(page, 'source')).board.tasks[0].acceptance.author).toBe('Original author');
});

test('moving a parent explains that its children must first be detached', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'source', title: 'Construction', hasHandle: true, extensions: { project: project('construction', 'House') }, tasks: [{ id: 1, title: 'Parent story', type: 'story', assigneeIds: [], responsibleId: '' }, { id: 2, title: 'Child task', type: 'task', parentId: 1, assigneeIds: [], responsibleId: '' }] },
        { id: 'target', title: 'Maintenance', hasHandle: true, extensions: { project: project('maintenance', 'House') } }
    ], { selectedBoardId: 'source' });
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    const card = portfolioCard(page, 'Parent story'); await card.hover();
    await card.getByLabel('Task actions', { exact: true }).click();
    await card.getByRole('button', { name: 'Move to project…' }).click();
    await answerAppMessage(page, { expectText: 'Move or detach all children' });
    expect((await readSavedBoard(page, 'source')).board.tasks[1].parentId).toBe(1);
    expect((await readSavedBoard(page, 'target')).board.tasks).toHaveLength(0);
});
