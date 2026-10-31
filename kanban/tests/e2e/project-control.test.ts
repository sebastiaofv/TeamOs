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

test('risk CRUD, materialization, shared links, comments and history persist without creating workitems', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'New record', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Capacity limit');
    await dialog(page).getByLabel('Probability', { exact: true }).selectOption('high');
    await dialog(page).getByLabel('Impact', { exact: true }).selectOption('high');
    await expect(dialog(page).locator('.control-risk')).toContainText('High');
    await dialog(page).getByLabel('Status', { exact: true }).selectOption('materialized');
    await expect(dialog(page).getByLabel('Materialized date', { exact: true })).toHaveValue('2026-10-31');
    await dialog(page).getByLabel('Actual impact', { exact: true }).fill('Two days');
    await dialog(page).getByLabel('build · Build', { exact: true }).check();
    await dialog(page).getByLabel('release · Release approval', { exact: true }).check();
    await dialog(page).getByLabel('ATL-TK-1 · Build complete', { exact: true }).check();
    await dialog(page).getByLabel('Recorded by (local author)', { exact: true }).fill('Ana Silva');
    await dialog(page).getByRole('button', { name: 'Save record', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await waitForBoardWrites(page);
    let saved = await readSavedBoard(page, 'control');
    const record = saved.extensions.projectControl.records.find((item: any) => item.title === 'Capacity limit');
    expect(record.id).toBe('PC-9'); expect(saved.board.tasks).toHaveLength(3);
    expect(record.related).toEqual({ phaseIds: ['build'], milestoneIds: ['release'], workitemIds: [1] });
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
    expect(saved.extensions.projectControl.records.find((item: any) => item.id === 'PC-9').comments[0].text).toContain('Evidence');
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Build', exact: true }).click();
    const roadmap = page.locator('#roadmapEntityModal');
    await expect(roadmap.getByLabel('Objective', { exact: true })).toHaveValue('Complete and validate implementation');
    await expect(roadmap.getByLabel('PC-9 · Capacity limit', { exact: true })).toBeChecked();
    await roadmap.getByLabel('PC-9 · Capacity limit', { exact: true }).uncheck();
    await roadmap.getByRole('button', { name: 'Save Item', exact: true }).click();
    await waitForBoardWrites(page);
    saved = await readSavedBoard(page, 'control');
    const unlinked = saved.extensions.projectControl.records.find((item: any) => item.id === 'PC-9');
    expect(unlinked.related.phaseIds).toEqual([]); expect(unlinked.related.milestoneIds).toEqual(['release']);
    await page.getByRole('button', { name: 'Project Control', exact: true }).click();
    await page.getByRole('button', { name: 'Capacity limit', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ATL-TK-1 · Build complete', exact: true }).click();
    const workitem = page.locator('#taskDetailModal');
    await workitem.getByRole('tab', { name: 'Relations', exact: true }).click();
    await expect(workitem.getByLabel('PC-9 · Capacity limit', { exact: true })).toBeChecked();
    await workitem.getByLabel('PC-9 · Capacity limit', { exact: true }).uncheck();
    await expect.poll(async () => (await readSavedBoard(page, 'control')).extensions.projectControl.records.find((item: any) => item.id === 'PC-9').related.workitemIds).toEqual([]);
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
    await dialog(page).getByRole('button', { name: 'Save record', exact: true }).click();
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
    await page.locator('#roadmapEntityModal').getByRole('button', { name: 'New record · Decisions', exact: true }).click();
    await dialog(page).getByLabel('Title', { exact: true }).fill('Nested decision');
    await dialog(page).getByRole('button', { name: 'Save record', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('#roadmapEntityTitle')).toHaveValue('New phase');
    await expect(page.locator('#roadmapEntityModal').getByLabel('PC-9 · Nested decision', { exact: true })).toBeChecked();
    await page.locator('#roadmapEntityModal').getByRole('button', { name: 'PC-9 · Nested decision · Proposed', exact: true }).click();
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
    await page.getByLabel('Search by ID or title', { exact: true }).fill('PC-1');
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
    await expect(dialog(page).getByLabel('Title', { exact: true })).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Save record', exact: true })).toHaveCount(0);
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
    await dialog(page).getByRole('button', { name: 'Save record', exact: true }).click();
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
        const save = await dialog(page).getByRole('button', { name: 'Save record', exact: true }).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(save!.y + save!.height).toBeLessThanOrEqual(800);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Release package', exact: true })).toBeFocused();
    });
}
