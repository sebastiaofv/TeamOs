import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, portfolioCard, answerAppMessage } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-12.board.json', 'utf8'));
async function seed(page: Page, writable = true) {
    await page.clock.setFixedTime('2026-10-28T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'feedback', title: fixture.board.settings.title, hasHandle: writable,
        tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'feedback' });
}
async function story(page: Page) {
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await portfolioCard(page, 'Pagar com cartão').click();
}

test('Board creation uses one toolbar button and terminal exception columns default to hidden in both modes', async ({ page }) => {
    await seed(page);
    for (const mode of ['Technical Board', 'Functional Board']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(page.locator('.add-task-card')).toHaveCount(0);
        await expect(page.locator('.portfolio-column[data-status="cancelled"]')).toHaveCount(0);
        await expect(page.locator('.portfolio-column[data-status="duplication"]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Board columns', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Cancelled', exact: true }).check();
        await expect(page.locator('.portfolio-column[data-status="cancelled"]')).toBeVisible();
        await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
    await expect(page.locator('#workitemType')).toHaveValue('story');
});

test('Epic and Story editors hide checklists, all editors leave Pull Requests in its tab', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await page.locator('[data-table-view="epics"]').click();
    await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
    for (const type of ['epic', 'story', 'task', 'bug']) {
        await page.locator('#workitemType').selectOption(type);
        await expect(page.locator('#taskTodoListLabel')).toHaveCount(['task', 'bug'].includes(type) ? 1 : 0);
        await expect(page.locator('#taskModal .pull-request-links')).toHaveCount(0);
    }
});

test('saving and cancelling child creation returns to its parent detail', async ({ page }) => {
    await seed(page); await story(page);
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await page.locator('#taskName').fill('Child feedback');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Pagar com cartão');
    await expect(page.locator('.workitem-hierarchy')).toContainText('Child feedback');
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    await page.locator('#taskModalCancelBtn').click();
    await expect(page.locator('#detailTitle')).toHaveText('Pagar com cartão');
});

test('detail properties and allowed status transitions save immediately with history, while content requires Edit', async ({ page }) => {
    await seed(page);
    await portfolioCard(page, 'Implementar confirmação').click();
    await expect(page.locator('#detailDescription')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('low');
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).board.tasks.find((task: { id: number }) => task.id === 1204).priority).toBe('low');
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('done');
    const choice = page.getByRole('combobox', { name: '#1202 Pagar com cartão', exact: true });
    await expect(choice).toBeVisible();
    await choice.selectOption('keep');
    await answerAppMessage(page, { expectText: 'Review' });
    const saved = await readSavedBoard(page, 'feedback');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 1202).status).toBe('doing');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 1204).status).toBe('done');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('#task-panel-history')).toContainText('Priority');
    await expect(page.locator('#task-panel-history')).toContainText('Status');
});

test('read-only detail keeps properties and workflow immutable', async ({ page }) => {
    await seed(page, false); await portfolioCard(page, 'Implementar confirmação').click();
    await expect(page.locator('.workitem-sidebar select, .workitem-sidebar input, .workitem-sidebar textarea')).toHaveCount(0);
    await expect(page.locator('#detailStatus')).toBeVisible();
});


for (const width of [1440, 390]) test(`sidebar edits stay usable and types have distinct colors in both themes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page); await story(page);
    await page.getByRole('combobox', { name: 'Responsible', exact: true }).selectOption('Rui');
    await expect(page.locator('#taskAssigneeItems')).toContainText('Rui');
    await page.getByRole('combobox', { name: 'Effort', exact: true }).selectOption('XL');
    await page.locator('#taskDetailModal').getByLabel('Due', { exact: true }).fill('2026-11-10');
    await page.locator('#detailBlockedInput').check();
    await page.locator('#detailBlockerInput').fill('Awaiting review');
    await page.locator('#detailBlockerInput').press('Tab');
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).board.tasks.find((task: { id: number }) => task.id === 1202)).toMatchObject({
        responsible: 'Rui', effort: 'XL', dueDate: '2026-11-10', blocked: true, blockerReason: 'Awaiting review'
    });
    await page.locator('#taskTagNewItem').selectOption('documentação'); await page.locator('#taskTagAddBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'feedback')).board.tasks.find((task: { id: number }) => task.id === 1202).tags).toContain('documentação');
    await page.locator('#taskDetailModal .modal-body').evaluate((element) => { element.scrollTop = 0; });
    await page.locator('.workitem-sidebar').evaluate((element) => { element.scrollTop = 0; });
    if (width === 390) await page.locator('.workitem-sidebar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`sidebar-light-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.locator('#themeToggleBtn').click();
    await story(page);
    if (width === 390) await page.locator('.workitem-sidebar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`sidebar-dark-${width}.png`) });
    const sidebar = await page.locator('.workitem-sidebar').boundingBox();
    expect(sidebar!.x).toBeGreaterThanOrEqual(0); expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    for (let theme = 0; theme < 2; theme++) {
        const colors: Record<string, string> = {};
        for (const perspective of ['epics', 'stories', 'all']) {
            await page.locator(`[data-table-view="${perspective}"]`).click();
            Object.assign(colors, await page.locator('#workitemsTable [data-workitem-type]').evaluateAll((badges) => Object.fromEntries(badges.map((badge) => [badge.getAttribute('data-workitem-type'), getComputedStyle(badge).color]))));
        }
        expect(Object.keys(colors).sort()).toEqual(['bug', 'epic', 'story', 'task']);
        expect(new Set(Object.values(colors)).size).toBe(4);
        if (!theme) await page.locator('#themeToggleBtn').click();
    }
});
