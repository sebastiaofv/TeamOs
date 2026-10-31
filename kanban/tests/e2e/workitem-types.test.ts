import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage, portfolioCard } from '../support/portfolio';
const fixture = JSON.parse(readFileSync('test-board/us-12.board.json', 'utf8'));
async function seed(page: Page, writable = true) {
    await page.clock.setFixedTime('2026-10-28T12:00:00.000Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'us12', title: fixture.board.settings.title, hasHandle: writable, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'us12' });
}
async function move(page: Page, id: number, state: string) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(`#${id}`);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await page.locator('#commandPaletteInput').fill(state);
    await page.locator('.palette-item').filter({ hasText: new RegExp(`Move to ${state}`, 'i') }).first().click();
}
async function openStory(page: Page) {
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="stories"]').click();
    await page.locator('#workitemsTable tr[data-task-id="1202"]').getByRole('button', { name: 'Pagar com cartão', exact: true }).click();
}

test('separates Technical/Functional Boards, preserves real states and hides old/future child Tasks', async ({ page }) => {
    await seed(page);
    await expect(portfolioCard(page, 'Implementar confirmação')).toBeVisible();
    await expect(portfolioCard(page, 'Validar cartão no Sprint anterior')).toHaveCount(0);
    await expect(portfolioCard(page, 'Task futura oculta no Técnico')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Pagar com cartão', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Checkout acessível', exact: true })).toHaveCount(0);
    await expect(portfolioCard(page, 'Botão de pagamento sem foco')).toHaveAttribute('data-status', 'testing');
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await expect(portfolioCard(page, 'Pagar com cartão')).toBeVisible();
    await expect(portfolioCard(page, 'Story do Sprint futuro')).toBeVisible();
    await expect(portfolioCard(page, 'Implementar confirmação')).toHaveCount(0);
});

test('creates a child with inherited planning and an immutable type, preserving the parent', async ({ page }) => {
    await seed(page); await openStory(page);
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await expect(page.locator('#workitemParent')).toHaveValue('1202');
    await expect(page.locator('#taskPhase')).toHaveValue('@inherit');
    await page.locator('#taskName').fill('Nova Task do Sprint');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'us12')).board.tasks.find((task: { title: string }) => task.title === 'Nova Task do Sprint')?.sprintId).toBe('current');
    await expect(page.locator('#detailTitle')).toHaveText('Nova Task do Sprint');
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Pagar com cartão');
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await page.locator('[data-view-mode="board"]').click();
    await portfolioCard(page, 'Nova Task do Sprint').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#workitemType')).toBeDisabled();
    await expect(page.locator('#workitemType')).toHaveValue('task');
});

test('technical completion advances the Story once and functional acceptance requires local attribution', async ({ page }) => {
    await seed(page);
    await move(page, 1204, 'Done');
    await answerAppMessage(page, { expectText: 'Story #1202 will advance to Ready to test' });
    await expect.poll(async () => (await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1202).status).toBe('ready-to-test');
    await move(page, 1202, 'Testing');
    await move(page, 1202, 'Done');
    await answerAppMessage(page, { expectText: 'local author name', input: 'Ana QA' });
    await expect.poll(async () => (await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1202).acceptance?.author).toBe('Ana QA');
    expect((await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1201).status).toBe('doing');
});

test('blocks Story acceptance with pending Tasks and cancellation leaves the project unchanged', async ({ page }) => {
    await seed(page);
    await move(page, 1207, 'Done');
    await answerAppMessage(page, { button: 'Cancel', expectText: 'Accept #1207' });
    expect((await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1207).status).toBe('testing');
    await move(page, 1202, 'Ready to test'); await move(page, 1202, 'Testing'); await move(page, 1202, 'Done');
    await answerAppMessage(page, { expectText: 'pending Tasks' });
    expect((await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1202).status).toBe('testing');
});

test('quick creation selects Bug and preserves its optional reproduction fields', async ({ page }) => {
    await seed(page);
    await page.keyboard.press('ControlOrMeta+k'); await page.locator('#commandPaletteInput').fill('+ New defect');
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('bug');
    await page.locator('#commandPaletteInput').press('Enter');
    await expect.poll(async () => (await readSavedBoard(page, 'us12')).board.tasks.find((task: { title: string }) => task.title === 'New defect')?.type).toBe('bug');
    expect((await readSavedBoard(page, 'us12')).board.tasks.find((task: { title: string }) => task.title === 'New defect').status).toBe('backlog');
});

for (const theme of ['light', 'dark']) test(`detail and confirmations use the existing ${theme} theme`, async ({ page }) => {
    await seed(page);
    if (theme === 'dark') await page.locator('#themeToggleBtn').click();
    await openStory(page);
    await expect(page.getByRole('button', { name: 'Create Task', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#taskDetailModalFooterCloseBtn').click();
    await move(page, 1207, 'Done');
    await expect(page.locator('#appMessageConfirmBtn')).toBeDisabled();
    await expect(page.locator('#appMessageInput')).toHaveAttribute('required', '');
    await answerAppMessage(page, { button: 'Cancel' });
});

test('parent changes preview their impact and Cancel preserves the existing hierarchy', async ({ page }) => {
    await seed(page);
    await portfolioCard(page, 'Implementar confirmação').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#workitemParent').selectOption('1201');
    await page.locator('#taskModalSaveBtn').click();
    await answerAppMessage(page, { button: 'Cancel', expectText: '#1202 Pagar com cartão → #1201 Checkout acessível' });
    expect((await readSavedBoard(page, 'us12')).board.tasks.find((task: { id: number }) => task.id === 1204).parentId).toBe(1202);
    await page.locator('#taskModalSaveBtn').click();
    await answerAppMessage(page, { expectText: 'Parent workitem' });
    await expect(page.locator('#taskModal')).toHaveCount(0);
    const saved = await readSavedBoard(page, 'us12');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 1204)).toMatchObject({ parentId: 1201, sprintId: 'current' });
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 1202).status).toBe('doing');
});

test('Epics hide execution-only fields and preserve their business fields', async ({ page }) => {
    await seed(page);
    await page.locator('[data-view-mode="table"]').click(); await page.locator('[data-table-view="epics"]').click();
    await page.locator('#workitemsTable tr[data-task-id="1201"]').getByRole('button', { name: 'Checkout acessível', exact: true }).click();
    await expect(page.locator('#task-tab-pullRequests')).toHaveCount(0); await expect(page.locator('#detailEffort')).toHaveCount(0);
    await expect(page.locator('.workitem-hierarchy')).toContainText('Permitir compras sem barreiras');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
    await expect(page.locator('#workitemType')).toHaveValue('epic'); await expect(page.locator('#taskEffort')).toHaveCount(0);
    await page.locator('#taskName').fill('Novo objetivo'); await page.locator('#workitem-objective').fill('Entrega de negócio');
    await page.locator('#taskModalSaveBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'us12')).board.tasks.find((task: { title: string }) => task.title === 'Novo objetivo')?.objective).toBe('Entrega de negócio');
});

test('read-only workitems retain navigation but cannot create children', async ({ page }) => {
    await seed(page, false); await openStory(page);
    await expect(page.getByRole('button', { name: 'Create Task', exact: true })).toHaveCount(0);
    await expect(page.locator('#task-tab-comments')).toBeVisible(); await expect(page.locator('#task-tab-history')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Story automation', exact: true })).toHaveCount(0);
});

test('Day Planner includes Stories and Epics only when requested', async ({ page }) => {
    await seed(page); await page.locator('[data-view-mode="planner"]').click();
    await expect(page.locator('.planner-tray-card').filter({ hasText: 'Pagar com cartão' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Include Stories and Epics', exact: true }).check();
    await expect(page.locator('.planner-tray-card').filter({ hasText: 'Pagar com cartão' })).toBeVisible();
    await expect(page.locator('.planner-tray-card').filter({ hasText: 'Checkout acessível' })).toBeVisible();
});

test('Table filters type, Epic and Story before pagination and export', async ({ page }) => {
    await seed(page); await page.locator('[data-view-mode="table"]').click();
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(8);
    await expect(page.locator('#workitemsTable tr[data-task-id="1206"] [data-column="story"] button')).toHaveCount(0);
    await expect(page.locator('#workitemsTable tr[data-task-id="1206"] [data-column="epic"] button')).toHaveText('#1201 Checkout acessível');
    await page.locator('.table-hierarchy-options summary').click();
    await page.locator('#tableHierarchy-epic').selectOption('1201');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(5);
    await page.locator('#tableHierarchy-story').selectOption('1202');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(3);
    await page.locator('#tableTypeFilter').selectOption('bug');
    await expect(page.locator('#workitemsTable')).toHaveCount(0);
    await page.locator('#tableHierarchy-epic').selectOption(''); await page.locator('#tableHierarchy-story').selectOption('');
    await expect(page.locator('#workitemsTable tbody tr')).toHaveCount(2);
});

test('Sprint expansion shows only participating child Tasks beneath their Story', async ({ page }) => {
    await seed(page); await page.locator('[data-view-mode="table"]').click(); await page.locator('[data-table-view="sprints"]').click();
    const sprint = page.locator('[data-table-sprint="current"]');
    await sprint.locator(':scope > summary').click();
    const table = sprint.locator('table');
    await expect(sprint.locator('.workitem-tree')).toHaveCount(0);
    await expect(table).toContainText('Pagar com cartão');
    await expect(table.locator('tr[data-task-id="1204"]')).toHaveCount(0);
    await table.getByRole('button', { name: 'Expand Pagar com cartão', exact: true }).click();
    await expect(table.locator('tr[data-task-id="1204"]')).toBeVisible();
    await expect(table.locator('tr[data-task-id="1203"]')).toHaveCount(0);
    await table.getByRole('button', { name: 'Implementar confirmação', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Implementar confirmação');
});

for (const ended of [true, false]) {
test(`Sprint table and Roadmap retain recorded work and read-only details after the parent is deleted (ended=${ended})`, async ({ page }) => {
    await page.clock.setFixedTime('2026-10-28T12:00:00.000Z');
    await gotoApp(page);
    const story = { ...fixture.board.tasks.find((task: { id: number }) => task.id === 1202), title: 'Recorded story', sprintId: 'past', status: 'doing', archived: false };
    const child = { ...fixture.board.tasks.find((task: { id: number }) => task.id === 1204), title: 'Recorded child', parentId: 1202, sprintId: 'past', status: 'done', archived: false };
    const extensions = structuredClone(fixture.extensions);
    delete extensions.timeline;
    extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
        { id: 'past', title: 'Previous Sprint', startDate: '2020-01-01', endDate: ended ? '2020-01-31' : '2099-12-31' },
        { id: 'current', title: 'Current Sprint', startDate: '2020-02-01', endDate: '2099-12-31' }
    ] };
    extensions.sprintParticipation = { version: 1, entries: [story, child].map((task) => ({ sprintId: 'past', task, at: '2020-01-30T12:00:00Z' })) };
    await seedPortfolioBoards(page, [{ id: 'history', title: 'Participation', hasHandle: true,
        tasks: [{ ...child, title: 'Live child', parentId: null, sprintId: 'current', status: 'doing' }], extensions
    }], { selectedBoardId: 'history' });
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await page.locator('[data-table-view="sprints"]').click();
    const sprint = page.locator('[data-table-sprint="past"]');
    await sprint.locator(':scope > summary').click();
    const table = sprint.locator('table');
    await table.getByRole('button', { name: 'Expand Recorded story', exact: true }).click();
    await table.getByRole('button', { name: 'Recorded child', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Recorded child');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Show tasks for Previous Sprint', exact: true }).click();
    const scope = page.locator('[data-roadmap-task-list="sprint:past"]');
    await scope.getByRole('button', { name: 'Expand Recorded story', exact: true }).click();
    await expect(scope.locator('tr[data-task-id="1204"]')).toContainText('Recorded child');
    await scope.locator('tr[data-task-id="1204"]').getByRole('button', { name: 'Recorded child', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Recorded child');
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeHidden();
    expect((await readSavedBoard(page, 'history')).board.tasks[0].title).toBe('Live child');
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
});
}
