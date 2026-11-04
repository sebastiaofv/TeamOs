import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites, showTimeline } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-20.board.json', 'utf8'));
async function seed(page: Page, writable = true) {
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'control', title: 'Atlas control', hasHandle: writable, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'control' });
    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
}
const dialog = (page: Page) => page.locator('.control-modal').getByRole('dialog');

for (const [kind, title] of [
    ['Risks', 'Supplier availability'],
    ['Decisions', 'Choose supported runtime'],
    ['Deliverables', 'Release package']
]) test(`${kind} sidebar starts at the top of the details panel on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1703, height: 857 });
    await seed(page);
    await page.getByRole('tab', { name: kind, exact: true }).click();
    await page.getByRole('button', { name: title, exact: true }).click();
    const panel = dialog(page).locator('#control-panel-details');
    const sidebar = panel.locator('.workitem-sidebar');
    const expectAligned = async () => {
        const panelBox = await panel.boundingBox();
        const sidebarBox = await sidebar.boundingBox();
        expect(panelBox).not.toBeNull();
        expect(sidebarBox).not.toBeNull();
        expect(Math.abs(sidebarBox!.y - panelBox!.y)).toBeLessThanOrEqual(1);
    };
    await expectAligned();
    await dialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await expectAligned();
    await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await expectAligned();
});

for (const language of ['en', 'pt']) for (const [kind, tab, title] of [
    ['risks', 'Risks', 'Supplier availability'],
    ['decisions', 'Decisions', 'Choose supported runtime'],
    ['deliverables', 'Deliverables', 'Release package']
]) test(`${tab} Type appears only in the sidebar form and stays immutable after creation (${language})`, async ({ page }) => {
    await seed(page);
    await page.getByRole('tab', { name: tab, exact: true }).click();
    if (language === 'pt') await page.locator('#languageToggleBtn').click();
    const typeLabel = language === 'pt' ? 'Tipo' : 'Type';
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(dialog(page).getByLabel(typeLabel, { exact: true })).toHaveCount(0);
    await expect(dialog(page).locator('.workitem-eyebrow .control-type')).toHaveAttribute('data-control-kind', kind);
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Editar' : 'Edit', exact: true }).click();
    const editType = dialog(page).locator('.workitem-sidebar').getByLabel(typeLabel, { exact: true });
    await expect(editType).toBeVisible();
    await expect(editType).toBeDisabled();
    await expect(editType).toHaveValue(kind);
    await expect(dialog(page).locator('.modal-header select')).toHaveCount(0);
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Guardar' : 'Save', exact: true }).click();
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(dialog(page).getByLabel(typeLabel, { exact: true })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Fechar' : 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: language === 'pt' ? 'Novo registo' : 'New record', exact: true }).click();
    const createType = dialog(page).locator('.workitem-sidebar').getByLabel(typeLabel, { exact: true });
    await expect(createType).toBeVisible();
    await expect(createType).toBeEnabled();
    await expect(createType).toHaveValue(kind);
    await expect(dialog(page).locator('.modal-header select')).toHaveCount(0);
    await dialog(page).getByLabel(language === 'pt' ? 'Título' : 'Title', { exact: true }).fill('Type draft');
    for (const nextKind of ['risks', 'decisions', 'deliverables']) {
        await createType.selectOption(nextKind);
        await expect(dialog(page).locator('.workitem-eyebrow .control-type')).toHaveAttribute('data-control-kind', nextKind);
        await expect(dialog(page).getByLabel(language === 'pt' ? 'Título' : 'Title', { exact: true })).toHaveValue('Type draft');
    }
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Cancelar' : 'Cancel', exact: true }).click();
});

test('existing control records require Edit for main fields but save sidebar changes directly', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await expect(dialog(page).locator('.workitem-main input, .workitem-main textarea, .workitem-main select')).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await dialog(page).getByLabel('Recorded by (local author)', { exact: true }).fill('Ana Silva');
    await dialog(page).getByLabel('Status', { exact: true }).selectOption('in-mitigation');
    await expect(dialog(page).getByLabel('Status', { exact: true })).toBeEnabled();
    await dialog(page).getByLabel('Responsible', { exact: true }).selectOption('Bruno Costa');
    await dialog(page).getByLabel('Responsible', { exact: true }).press('Tab');
    await expect(dialog(page).getByLabel('Responsible', { exact: true })).toBeEnabled();
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await waitForBoardWrites(page);
    let saved = await readSavedBoard(page, 'control');
    let record = saved.extensions.projectControl.records.find((item: any) => item.id === 'ATL-RK-1');
    expect(record.status).toBe('in-mitigation'); expect(record.owner).toBe('Bruno Costa');
    expect(record.title).toBe('Supplier availability');
    expect(record.history.at(-1).author).toBe('Ana Silva');
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog(page).getByLabel('Title', { exact: true })).toBeFocused();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Discarded title');
    await dialog(page).locator('#taskAssigneeNewItem').selectOption('Rui Costa');
    await dialog(page).locator('#taskAssigneeAddBtn').click();
    await dialog(page).locator('#taskTagNewItem').selectOption('documentation');
    await dialog(page).locator('#taskTagAddBtn').click();
    await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog(page).locator('.assignee-editor-list')).not.toContainText('Rui Costa');
    await expect(dialog(page).locator('.tag-editor-list')).not.toContainText('documentation');
    await dialog(page).locator('#taskAssigneeNewItem').selectOption('Rui Costa');
    await dialog(page).locator('#taskAssigneeAddBtn').click();
    await dialog(page).locator('#taskTagNewItem').selectOption('documentation');
    await dialog(page).locator('#taskTagAddBtn').click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Supplier confirmed');
    await dialog(page).getByLabel('build · Build', { exact: true }).uncheck();
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    saved = await readSavedBoard(page, 'control');
    record = saved.extensions.projectControl.records.find((item: any) => item.id === 'ATL-RK-1');
    expect(record.title).toBe('Supplier confirmed'); expect(record.related.phaseIds).not.toContain('build');
    expect(record.assignees).toContain('Rui Costa'); expect(record.tags).toContain('documentation');
    expect(record.status).toBe('in-mitigation'); expect(record.owner).toBe('Bruno Costa');
});

for (const language of ['en', 'pt']) for (const [kind, title, id] of [
    ['Risks', 'Supplier availability', 'ATL-RK-1'],
    ['Decisions', 'Choose supported runtime', 'ATL-DC-4'],
    ['Deliverables', 'Release package', 'ATL-DL-6']
]) test(`${kind} sidebar shares Work Item controls and saves people/tags directly (${language})`, async ({ page }) => {
    await seed(page);
    await page.getByRole('tab', { name: kind, exact: true }).click();
    if (language === 'pt') await page.locator('#languageToggleBtn').click();
    await page.getByRole('button', { name: title, exact: true }).click();
    const sidebar = dialog(page).locator('.workitem-sidebar');
    await expect(sidebar.getByLabel(language === 'pt' ? 'Tipo' : 'Type', { exact: true })).toHaveCount(0);
    await expect(sidebar.locator('.detail-status-control .table-status-badge')).toHaveCount(1);
    await expect(sidebar.locator('.detail-status-control select')).toBeEnabled();
    const arrow = await sidebar.locator('.detail-status-control').evaluate((element) => getComputedStyle(element, '::after').content);
    expect(arrow).toContain('▾');
    if (kind === 'Risks') {
        const labels = await sidebar.locator('.workitem-property-group').first().locator('.form-group > label').allTextContents();
        expect(labels).toEqual(language === 'pt' ? ['Estado', 'Probabilidade', 'Impacto', 'Nível de risco', 'Prazo', 'Data de materialização'] : ['Status', 'Probability', 'Impact', 'Risk level', 'Due date', 'Materialized date']);
        expect(await sidebar.locator('input[type=date]').evaluateAll((fields) => fields.map((field) => field.id))).toEqual(['control-dueDate', 'control-materializedDate']);
    }
    await sidebar.locator('#control-owner').selectOption('Bruno Costa');
    await expect(sidebar.locator('.assignee-editor-list')).toContainText('Bruno Costa');
    await sidebar.locator('#taskAssigneeNewItem').selectOption(kind === 'Risks' ? 'Rui Costa' : 'Ana Silva');
    await sidebar.locator('#taskAssigneeAddBtn').click();
    await sidebar.locator('#taskTagNewItem').selectOption('documentation');
    await sidebar.locator('#taskTagAddBtn').click();
    await waitForBoardWrites(page);
    let record = (await readSavedBoard(page, 'control')).extensions.projectControl.records.find((item: any) => item.id === id);
    expect(record.owner).toBe('Bruno Costa');
    expect(record.assignees).toEqual(expect.arrayContaining(['Ana Silva', 'Rui Costa', 'Bruno Costa']));
    expect(record.tags).toContain('documentation');
    const participant = sidebar.locator('.assignee-editor-row').filter({ hasText: 'Bruno Costa' });
    await participant.getByRole('button').click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: language === 'pt' ? 'Cancelar' : 'Cancel', exact: true }).click();
    await expect(sidebar.locator('#control-owner')).toHaveValue('Bruno Costa');
    await participant.getByRole('button').click();
    await confirmation.getByRole('button', { name: language === 'pt' ? 'Remover' : 'Remove', exact: true }).click();
    await expect(sidebar.locator('#control-owner')).toHaveValue('');
    await sidebar.locator('.tag-editor-row').filter({ hasText: 'documentation' }).getByRole('button').click();
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Fechar' : 'Close', exact: true }).last().click();
    await waitForBoardWrites(page);
    record = (await readSavedBoard(page, 'control')).extensions.projectControl.records.find((item: any) => item.id === id);
    expect(record.owner).toBe(''); expect(record.assignees).not.toContain('Bruno Costa'); expect(record.tags).not.toContain('documentation');
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(dialog(page).locator('.assignee-editor-list')).toContainText('Rui Costa');
    await dialog(page).getByRole('tab', { name: language === 'pt' ? 'Histórico' : 'History', exact: true }).click();
    const history = dialog(page).getByRole('tabpanel');
    await history.locator('.history-entry summary').first().click();
    await expect(history.locator('.history-change dt').first()).toHaveText(language === 'pt' ? 'Etiquetas' : 'Tags');
});

for (const language of ['en', 'pt']) for (const [kind, title, id] of [
    ['Risks', 'Supplier availability', 'ATL-RK-1'],
    ['Decisions', 'Choose supported runtime', 'ATL-DC-4'],
    ['Deliverables', 'Release package', 'ATL-DL-6']
]) test(`${kind} detail and edit actions match Work Items (${language})`, async ({ page }) => {
    await seed(page);
    await page.getByRole('tab', { name: kind, exact: true }).click();
    if (language === 'pt') await page.locator('#languageToggleBtn').click();
    await page.getByRole('button', { name: title, exact: true }).click();
    const main = dialog(page).locator('.workitem-main');
    await expect(main).toContainText(title);
    await expect(main.locator('input, textarea, select')).toHaveCount(0);
    if (kind === 'Risks') {
        await dialog(page).getByRole('tab', { name: language === 'pt' ? 'Resposta' : 'Response', exact: true }).click();
        await expect(dialog(page).getByRole('tabpanel').locator('textarea')).toHaveCount(0);
        await dialog(page).getByRole('tab', { name: language === 'pt' ? 'Detalhes' : 'Details', exact: true }).click();
    }
    await dialog(page).getByLabel(language === 'pt' ? 'Prazo' : 'Due date', { exact: true }).fill('2026-11-15');
    // Clicking Edit commits the sidebar value before opening the main-field draft.
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Editar' : 'Edit', exact: true }).click();
    await dialog(page).getByLabel(language === 'pt' ? 'Título' : 'Title', { exact: true }).fill(`${title} updated`);
    await dialog(page).getByLabel(language === 'pt' ? 'Descrição' : 'Description', { exact: true }).fill('Edited detail');
    if (kind === 'Risks') {
        await dialog(page).getByRole('tab', { name: language === 'pt' ? 'Resposta' : 'Response', exact: true }).click();
        await dialog(page).getByLabel(language === 'pt' ? 'Plano de mitigação' : 'Mitigation plan', { exact: true }).fill('Edited response');
    }
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Guardar' : 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    const record = (await readSavedBoard(page, 'control')).extensions.projectControl.records.find((item: any) => item.id === id);
    expect(record.title).toBe(`${title} updated`); expect(record.description).toBe('Edited detail');
    expect(record.dueDate).toBe('2026-11-15');
    if (kind === 'Risks') expect(record.mitigationPlan).toBe('Edited response');
});

for (const [kind, title] of [['Risks', 'Supplier availability'], ['Decisions', 'Choose supported runtime'], ['Deliverables', 'Release package']]) {
    test(`${kind} history uses the workitem layout and category filter in read-only mode`, async ({ page }) => {
        await seed(page, false);
        await page.getByRole('tab', { name: kind, exact: true }).click();
        await page.getByRole('button', { name: title, exact: true }).click();
        await expect(dialog(page).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await expect(dialog(page).getByLabel('Responsible', { exact: true })).toBeDisabled();
        await dialog(page).getByRole('tab', { name: 'History', exact: true }).click();
        const history = dialog(page).getByRole('tabpanel');
        await expect(history.locator('.history-note')).toHaveCount(1);
        await expect(history.locator('.history-operation')).toHaveText('Status');
        await expect(history.locator('.history-author')).toHaveText('Ana Silva · local / unverified');
        await history.locator('.history-entry summary').focus();
        await page.keyboard.press('Enter');
        await expect(history.locator('.history-change dt')).toHaveText('Status');
        await expect(history.locator('.history-change dd > div > span')).toHaveText(['Before', 'After']);
        await expect(history.locator('.history-change pre').last()).not.toBeEmpty();
        await expect(history.locator('.history-event-ids')).toContainText('history-');
        await history.getByLabel('Category', { exact: true }).selectOption('people');
        await expect(history.locator('.history-empty')).toContainText('No events match');
        await history.getByRole('button', { name: 'All', exact: true }).click();
        await expect(history.locator('.history-entry')).toHaveCount(1);
        await history.getByLabel('Category', { exact: true }).selectOption('status');
        await expect(history.locator('.history-operation')).toHaveText('Status');
        await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    });
}

for (const language of ['en', 'pt']) test(`control history preserves complete operations and saved values while filtering (${language})`, async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Supplier confirmed');
    await dialog(page).getByLabel('Status', { exact: true }).selectOption('in-mitigation');
    await dialog(page).getByLabel('Responsible', { exact: true }).selectOption('Bruno Costa');
    await dialog(page).getByLabel('Recorded by (local author)', { exact: true }).fill('Ana Silva');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'control');
    if (language === 'pt') await page.locator('#languageToggleBtn').click();
    await page.getByRole('button', { name: 'Supplier confirmed', exact: true }).click();
    await dialog(page).getByRole('tab', { name: language === 'pt' ? 'Histórico' : 'History', exact: true }).click();
    const history = dialog(page).getByRole('tabpanel');
    const entry = history.locator('.history-entry').first();
    await expect(entry.locator('.history-operation')).toHaveText(language === 'pt' ? '3 categorias · 4 alterações' : '3 categories · 4 changes');
    await entry.locator('summary').click();
    await expect(entry.locator('.history-change')).toHaveCount(4);
    await expect(entry).toContainText(language === 'pt' ? 'Em mitigação' : 'In mitigation');
    await expect(entry).toContainText('Supplier availability');
    await expect(entry).toContainText('Supplier confirmed');
    for (const category of ['fields', 'people', 'status']) {
        await history.getByLabel(language === 'pt' ? 'Categoria' : 'Category', { exact: true }).selectOption(category);
        await expect(entry.locator('.history-change')).toHaveCount(4);
    }
    await dialog(page).getByRole('button', { name: language === 'pt' ? 'Fechar' : 'Close', exact: true }).last().click();
    expect(await readSavedBoard(page, 'control')).toEqual(saved);
});

test('creation offers all three item types with project IDs, singular badges and colored table values', async ({ page }) => {
    await seed(page);
    const riskRow = page.locator('.control-table tbody tr').filter({ hasText: 'Supplier availability' });
    await expect(riskRow.locator('.table-status-badge')).toHaveCount(4);
    await expect(riskRow.locator('.table-status-badge').first()).toHaveAttribute('data-state-color', '#60a5fa');
    for (const [kind, label, code, number] of [['risks', 'Risk', 'RK', 9], ['decisions', 'Decision', 'DC', 10], ['deliverables', 'Deliverable', 'DL', 11]] as const) {
        await page.getByRole('button', { name: 'New record', exact: true }).click();
        await dialog(page).getByLabel('Title', { exact: true }).fill(`New ${label}`);
        await dialog(page).getByLabel('Responsible', { exact: true }).selectOption('Bruno Costa');
        await dialog(page).locator('#taskTagNewItem').selectOption('documentation');
        await dialog(page).locator('#taskTagAddBtn').click();
        await dialog(page).getByLabel('Type', { exact: true }).selectOption(kind);
        await expect(dialog(page).locator('.control-type')).toHaveText(label);
        await expect(dialog(page).getByLabel('Title', { exact: true })).toHaveValue(`New ${label}`);
        await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
        await expect(dialog(page)).toHaveCount(0);
        await waitForBoardWrites(page);
        const saved = await readSavedBoard(page, 'control');
        const created = saved.extensions.projectControl.records.find((record: any) => record.title === `New ${label}`);
        expect(created.id).toBe(`ATL-${code}-${number}`);
        expect(created.kind).toBe(kind);
        expect(created.owner).toBe('Bruno Costa');
        expect(created.assignees).toEqual(['Bruno Costa']);
        expect(created.tags).toEqual(['documentation']);
        expect(created.related).toEqual({ phaseIds: [], milestoneIds: [] });
    }
});

test('legacy projects configure their acronym when creating the first control record', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'legacy', title: 'Legacy', hasHandle: true, acronym: null }], { selectedBoardId: 'legacy' });
    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Legacy risk');
    await dialog(page).getByLabel('Project Acronym', { exact: true }).fill('LEG');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'legacy');
    expect(saved.extensions.project.acronym).toBe('LEG');
    expect(saved.extensions.projectControl.records[0].id).toBe('LEG-RK-1');
});

for (const width of [1280, 390]) test(`milestones show child rows and can associate existing records at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'release · Release approval', exact: true }).click();
    const milestone = page.locator('#roadmapEntityModal');
    const row = milestone.locator('.control-record-list li').filter({ hasText: 'Release package' });
    await expect(row.locator('.workitem-child-id')).toHaveText('ATL-DL-6');
    await expect(row.getByRole('button')).toHaveText('Release package');
    await expect(row.locator('.table-status-badge')).toHaveText('Delivered');
    await expect(row.locator('.table-status-badge')).toHaveAttribute('data-state-color', '#a78bfa');
    expect(await milestone.getByRole('dialog').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await milestone.locator('.control-associations').screenshot({ path: testInfo.outputPath(`milestone-control-${width}.png`) });
    await milestone.getByRole('button', { name: 'Associate existing records', exact: true }).click();
    await milestone.getByLabel('Search by ID or title', { exact: true }).fill('Documentation delay');
    await milestone.getByLabel('ATL-RK-3 · Documentation delay', { exact: true }).check();
    await milestone.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect(milestone).toHaveCount(0);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'control');
    expect(saved.extensions.projectControl.records.find((record: any) => record.id === 'ATL-RK-3').related).toEqual({ phaseIds: [], milestoneIds: ['release'] });
});

test('risk CRUD, materialization, shared links, comments and history persist without creating workitems', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Capacity limit');
    await dialog(page).getByLabel('Probability', { exact: true }).selectOption('high');
    await dialog(page).getByLabel('Impact', { exact: true }).selectOption('high');
    await expect(dialog(page).getByLabel('Risk level', { exact: true })).toContainText('High');
    await dialog(page).getByLabel('Status', { exact: true }).selectOption('materialized');
    await expect(dialog(page).getByLabel('Materialized date', { exact: true })).toHaveValue('2026-10-31');
    await dialog(page).getByRole('tab', { name: 'Response', exact: true }).click();
    await dialog(page).getByLabel('Actual impact', { exact: true }).fill('Two days');
    await dialog(page).getByRole('tab', { name: 'Details', exact: true }).click();
    await dialog(page).getByLabel('build · Build', { exact: true }).check();
    await dialog(page).getByLabel('release · Release approval', { exact: true }).check();
    await expect(dialog(page).getByRole('group', { name: 'Workitems', exact: true })).toHaveCount(0);
    await expect(dialog(page).getByLabel('ATL-TK-1 · Build complete', { exact: true })).toHaveCount(0);
    await dialog(page).getByLabel('Recorded by (local author)', { exact: true }).fill('Ana Silva');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    let saved = await readSavedBoard(page, 'control');
    const record = saved.extensions.projectControl.records.find((item: any) => item.title === 'Capacity limit');
    expect(record.id).toBe('ATL-RK-9'); expect(saved.board.tasks).toHaveLength(3);
    expect(record.related).toEqual({ phaseIds: ['build'], milestoneIds: ['release'] });
    await page.getByRole('button', { name: 'Capacity limit', exact: true }).click();
    await dialog(page).getByRole('tab', { name: 'Comments', exact: true }).click();
    await dialog(page).getByLabel('Comment text', { exact: true }).fill('Evidence https://example.com/incident');
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
    await dialog(page).locator('.comment-composer input[type=file]').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(dialog(page).locator('.comment-composer .comment-image img')).toHaveCount(1);
    await dialog(page).getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(dialog(page).locator('.comment-publication')).toContainText('Evidence');
    await expect(dialog(page).locator('.comment-publication img')).toHaveCount(1);
    await dialog(page).getByRole('tab', { name: 'History', exact: true }).click();
    await expect(dialog(page).locator('.history-entries')).toContainText('Ana Silva');
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await waitForBoardWrites(page);
    saved = await readSavedBoard(page, 'control');
    expect(saved.extensions.projectControl.records.find((item: any) => item.id === 'ATL-RK-9').comments[0].text).toContain('Evidence');
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Build', exact: true }).click();
    const roadmap = page.locator('#roadmapEntityModal');
    await expect(roadmap.getByLabel('Objective', { exact: true })).toHaveValue('Complete and validate implementation');
    await expect(roadmap.getByLabel('ATL-RK-9 · Capacity limit', { exact: true })).toBeChecked();
    const childRow = roadmap.locator('.control-record-list li').filter({ hasText: 'Capacity limit' });
    await expect(childRow.locator('.workitem-child-id')).toHaveText('ATL-RK-9');
    await expect(childRow.getByRole('button')).toHaveText('Capacity limit');
    await expect(childRow.locator('.table-status-badge')).toHaveText('Materialized');
    await expect(childRow.locator('.table-status-badge')).toHaveAttribute('data-state-color', '#f87171');
    await roadmap.getByLabel('ATL-RK-9 · Capacity limit', { exact: true }).click();
    await expect(childRow).toHaveCount(0);
    await roadmap.getByRole('button', { name: 'Save Item', exact: true }).click();
    await waitForBoardWrites(page);
    saved = await readSavedBoard(page, 'control');
    const unlinked = saved.extensions.projectControl.records.find((item: any) => item.id === 'ATL-RK-9');
    expect(unlinked.related.phaseIds).toEqual([]); expect(unlinked.related.milestoneIds).toEqual(['release']);
    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
    await page.getByRole('button', { name: 'Capacity limit', exact: true }).click();
    await expect(dialog(page).getByRole('group', { name: 'Workitems', exact: true })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.locator('.portfolio-task-card[data-task-id="1"] .task-title').click();
    const workitem = page.locator('#taskDetailModal');
    await workitem.getByRole('tab', { name: 'Relations', exact: true }).click();
    await expect(workitem.locator('.control-associations')).toHaveCount(0);

});

test('acceptance gates parent, subphase and milestone progress while unrelated progress stays unchanged', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    for (const id of ['launch', 'build', 'review']) await expect(page.locator(`[data-roadmap-kind="phase"][data-roadmap-id="${id}"] .roadmap-row-timeline-bar`)).toHaveAttribute('data-progress', '99');
    await expect(page.locator('[data-roadmap-id="release"].milestone-annotation')).toHaveAttribute('aria-label', /99%/);
    await expect(page.locator('[data-roadmap-id="independent"].milestone-annotation')).toHaveAttribute('aria-label', /100%/);
    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
    await page.getByRole('tab', { name: 'Deliverables', exact: true }).click();
    await page.getByRole('button', { name: 'Release package', exact: true }).click();
    await dialog(page).getByLabel('Status', { exact: true }).selectOption('accepted');
    await expect(dialog(page).getByLabel('Accepted date', { exact: true })).toHaveValue('2026-10-31');
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    for (const id of ['launch', 'build', 'review']) await expect(page.locator(`[data-roadmap-kind="phase"][data-roadmap-id="${id}"] .roadmap-row-timeline-bar`)).toHaveAttribute('data-progress', '100');
    await expect(page.locator('[data-roadmap-id="release"].milestone-annotation')).toHaveAttribute('aria-label', /100%/);
});

test('records can be created and associated during phase creation, without losing the phase draft', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('New phase');
    await page.locator('#roadmapEntityStartDate').fill('2026-11-01');
    await page.locator('#roadmapEntityEndDate').fill('2026-11-30');
    await page.locator('#roadmapEntityObjective').fill('Retained objective');
    await page.locator('#roadmapEntityModal').getByRole('button', { name: 'New record · Decision', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Nested decision');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('#roadmapEntityTitle')).toHaveValue('New phase');
    await expect(page.locator('#roadmapEntityModal').getByLabel('ATL-DC-9 · Nested decision', { exact: true })).toBeChecked();
    await page.locator('#roadmapEntityModal').getByRole('button', { name: 'Nested decision', exact: true }).click();
    await expect(dialog(page).locator('.workitem-main input, .workitem-main textarea')).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Discarded nested edit');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('#roadmapEntityTitle')).toHaveValue('New phase');
    await page.locator('#roadmapEntityModal').getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect(page.locator('#roadmapEntityModal')).toHaveCount(0);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'control');
    expect(saved.extensions.roadmap.phases.find((item: any) => item.title === 'New phase').objective).toBe('Retained objective');
    expect(saved.extensions.projectControl.records.find((item: any) => item.title === 'Nested decision').related.phaseIds).toEqual(['new-phase']);
});

test('table search, filters, sorting, overdue and empty states work in both languages', async ({ page }) => {
    await seed(page);
    await page.getByLabel('Search by ID or title', { exact: true }).fill('ATL-RK-1');
    await expect(page.locator('.control-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByLabel('Risk level', { exact: true }).selectOption('low');
    await expect(page.getByRole('button', { name: 'Documentation delay', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('tab', { name: 'Decisions', exact: true }).click();
    await page.getByLabel('Decision maker', { exact: true }).selectOption('Rui Costa');
    await expect(page.locator('.control-table tbody tr')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Deliverables', exact: true }).click();
    await page.getByLabel('Overdue', { exact: true }).check();
    await page.getByLabel('Pending acceptance', { exact: true }).check();
    await expect(page.locator('.control-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Title', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: /Title/ })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByLabel('Search by ID or title', { exact: true }).fill('missing');
    await expect(page.getByRole('status')).toContainText('No records match');
    await page.locator('#languageToggleBtn').click();
    await expect(page.getByRole('heading', { name: 'Controlo do projeto', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Nenhum registo encontrado');
});

test('read-only projects permit consultation and navigation while blocking writes', async ({ page }) => {
    await seed(page, false);
    await expect(page.getByRole('button', { name: 'New record', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Supplier availability', exact: true }).click();
    await expect(dialog(page).locator('.workitem-main input, .workitem-main textarea')).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(dialog(page).getByLabel('Status', { exact: true })).toBeDisabled();
    await expect(dialog(page).locator('#taskAssigneeNewItem')).toBeDisabled();
    await expect(dialog(page).locator('#taskTagNewItem')).toBeDisabled();
    await expect(dialog(page).locator('.assignee-editor-remove')).toBeDisabled();
    await expect(dialog(page).locator('.tag-editor-remove')).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await dialog(page).getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(dialog(page).getByRole('button', { name: 'Post comment', exact: true })).toHaveCount(0);
    await dialog(page).getByRole('tab', { name: 'Details', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'build · Build', exact: true }).click();
    await expect(page.locator('#roadmapEntityTitle')).toBeDisabled();
    await expect(page.locator('#roadmapEntityModalSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
});

test('historical timeline selections show only records and comments available at that point', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Latest only');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await showTimeline(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await page.locator('.timeline-event-item[data-event-index="0"]').click();
    await expect(page.getByRole('button', { name: 'Latest only', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New record', exact: true })).toBeDisabled();
});

for (const width of [1280, 390]) for (const dark of [false, true]) {
    test(`Project Control keyboard and dialog layout at ${width}px (${dark ? 'dark' : 'light'})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seed(page);
        if (dark) await page.locator('#themeToggleBtn').click();
        const risks = page.getByRole('tab', { name: 'Risks', exact: true });
        await risks.focus(); await risks.press('ArrowRight');
        await expect(page.getByRole('tab', { name: 'Decisions', exact: true })).toBeFocused();
        await page.getByRole('tab', { name: 'Decisions', exact: true }).press('End');
        await expect(page.getByRole('tab', { name: 'Deliverables', exact: true })).toHaveAttribute('aria-selected', 'true');
        await page.getByRole('button', { name: 'Release package', exact: true }).click();
        await page.screenshot({ path: `test-results/project-control-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
        const box = await dialog(page).boundingBox();
        expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const main = await dialog(page).locator('.workitem-main').boundingBox();
        const sidebar = await dialog(page).locator('.workitem-sidebar').boundingBox();
        if (width > 760) {
            expect(box!.width).toBeGreaterThanOrEqual(1000);
            expect(sidebar!.x).toBeGreaterThanOrEqual(main!.x + main!.width - 1);
        } else expect(sidebar!.y).toBeGreaterThanOrEqual(main!.y + main!.height - 1);
        const save = await dialog(page).getByRole('button', { name: 'Edit', exact: true }).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(save!.y + save!.height).toBeLessThanOrEqual(800);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Release package', exact: true })).toBeFocused();
    });
}
