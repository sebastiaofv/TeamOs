import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

async function seed(page: Page, writable = true, many = false) {
    await page.clock.setFixedTime('2026-10-29T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sprints', title: 'Sprint tables', hasHandle: writable, tasks: [
        { id: 1, title: 'Story Zeta', type: 'story', status: 'doing', sprintId: 's1' },
        { id: 2, title: 'Child Zulu', type: 'task', parentId: 1, status: 'done', sprintId: 's1' },
        { id: 3, title: 'Child Alpha', type: 'task', parentId: 1, status: 'doing', sprintId: 's1' },
        { id: 4, title: 'Standalone Task', type: 'task', status: 'done', sprintId: 's1' },
        { id: 5, title: 'Independent Bug', type: 'bug', status: 'doing', sprintId: 's1' },
        { id: 6, title: 'Other sprint child', type: 'task', parentId: 1, status: 'done', sprintId: 's2' },
        { id: 7, title: 'Archived child', type: 'task', parentId: 1, status: 'done', sprintId: 's1', archived: true },
        { id: 8, title: 'Story without children', type: 'story', status: 'doing', sprintId: 's2' },
        ...(many ? Array.from({ length: 25 }, (_, index) => ({ id: index + 10, title: `Extra ${index}`, type: 'task' as const, status: 'doing', sprintId: 's1' })) : [])
    ], extensions: { roadmap: { version: 1, phases: [], milestones: [], sprints: [
        { id: 's1', title: 'Current sprint', startDate: '2026-10-19', endDate: '2026-11-01' },
        { id: 's2', title: 'Other sprint', startDate: '2026-11-02', endDate: '2026-11-15' }
    ] } } }], { selectedBoardId: 'sprints' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
}

const sprint = (page: Page, id = 's1') => page.locator(`[data-table-sprint="${id}"]`);
const ids = (page: Page, id = 's1') => sprint(page, id).locator('tbody tr').evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-task-id'))));

test('expands Story children within each Sprint table and preserves detail navigation, selection and keyboard collapse', async ({ page }) => {
    await seed(page);
    await expect(sprint(page).locator('table')).toHaveCount(0);
    await sprint(page).locator(':scope > summary').click();
    const table = sprint(page).locator('table');
    await expect(sprint(page).locator('.workitem-tree')).toHaveCount(0);
    await expect(sprint(page).locator(':scope > summary')).toContainText('33.3% complete (1/3)');
    await expect.poll(() => ids(page)).toEqual([1, 4, 5]);
    await table.getByRole('button', { name: 'Expand Story Zeta', exact: true }).click();
    await expect.poll(() => ids(page)).toEqual([1, 2, 3, 4, 5]);
    await expect(table.locator('tr[data-task-id="2"]')).toHaveAttribute('data-depth', '1');
    await expect(table.locator('tr[data-task-id="2"] td')).toHaveCount(await table.locator('th').count());
    await table.getByRole('checkbox', { name: 'Select Child Alpha', exact: true }).check();
    await expect(sprint(page).locator('.table-summary')).toContainText('1 selected');
    await table.getByRole('button', { name: 'Child Alpha', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Child Alpha');
    await page.keyboard.press('Escape');
    await expect(table.getByRole('button', { name: 'Child Alpha', exact: true })).toBeFocused();
    const toggle = table.getByRole('button', { name: 'Collapse Story Zeta', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => ids(page)).toEqual([1, 4, 5]);
    await expect(table.getByRole('button', { name: 'Expand Story Zeta', exact: true })).toBeFocused();
    await sprint(page, 's2').locator(':scope > summary').click();
    await expect.poll(() => ids(page, 's2')).toEqual([6, 8]);
    await expect(sprint(page, 's2').locator('.table-tree-toggle')).toHaveCount(0);
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
});

test('filters and exports participating children even while collapsed and sorts siblings beneath their Story', async ({ page }) => {
    await seed(page);
    const section = sprint(page);
    await section.locator(':scope > summary').click();
    const downloadPromise = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error('Missing CSV stream');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('Child Alpha');
    expect(csv).toContain('Child Zulu');
    expect(csv).not.toContain('Other sprint child');
    expect(csv).not.toContain('Archived child');
    await section.locator('th[data-column="title"] button').click();
    await section.getByRole('button', { name: 'Expand Story Zeta', exact: true }).click();
    await expect.poll(() => ids(page)).toEqual([5, 4, 1, 3, 2]);
    await section.locator('.table-hierarchy-options summary').click();
    await section.locator('#tableTypeFilter-sprint-s1').selectOption('task');
    await expect.poll(() => ids(page)).toEqual([3, 2, 4]);
    await expect(section.locator('.table-tree-toggle')).toHaveCount(0);
    await section.locator('#tableTypeFilter-sprint-s1').selectOption('');
    await page.keyboard.press('Escape');
    await page.locator('#portfolioFiltersBtn').click();
    await page.locator('#portfolioArchiveFilter').selectOption('all');
    await page.locator('#portfolioFiltersPanel').getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => ids(page)).toEqual([5, 4, 1, 7, 3, 2]);
    await expect(section.locator(':scope > summary')).toContainText('33.3% complete (1/3)');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
});

test('paginates whole Story groups so expanding a row never separates children onto another page', async ({ page }) => {
    await seed(page, true, true);
    const section = sprint(page);
    await section.locator(':scope > summary').click();
    await section.locator('#tablePageSize-sprint-s1').selectOption('25');
    await expect(section.locator('tbody tr')).toHaveCount(25);
    await section.getByRole('button', { name: 'Expand Story Zeta', exact: true }).click();
    await expect(section.locator('tbody tr')).toHaveCount(27);
    await section.getByRole('checkbox', { name: 'Select this page', exact: true }).check();
    await expect(section.locator('.table-summary')).toContainText('27 selected');
    await section.locator('#tableNextPage-sprint-s1').click();
    await expect(section.locator('tbody tr')).toHaveCount(3);
    await expect(section.locator('tr[data-task-id="2"]')).toHaveCount(0);
    await section.locator('#tablePreviousPage-sprint-s1').click();
    await expect(section.locator('tr[data-task-id="2"]')).toBeVisible();
});

test('supports read-only Sprint drilldown in Portuguese on a narrow screen', async ({ page }) => {
    await seed(page, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#languageToggleBtn').click();
    await sprint(page).locator(':scope > summary').click();
    await sprint(page).getByRole('button', { name: 'Expandir Story Zeta', exact: true }).click();
    await sprint(page).getByRole('button', { name: 'Child Alpha', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Child Alpha');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(sprint(page).getByRole('button', { name: 'Recolher Story Zeta', exact: true })).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => window.__portfolioTestWrites)).toEqual([]);
});
