import { readFileSync } from 'node:fs';
import { defaultHierarchyAutomations } from '@/domain/hierarchyAutomations';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-30.board.json', 'utf8'));
async function seed(page: Page, writable = true) {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'auto', title: fixture.board.settings.title, hasHandle: writable, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'auto' });
}
async function settings(page: Page) {
    await page.getByRole('button', { name: /^Settings for / }).click();
    await page.getByRole('tab', { name: 'Automations', exact: true }).click();
    return page.locator('#projectSettingsModal');
}
async function moveItem(page: Page, id: number, status: string) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(`#${id}`);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await page.locator('#commandPaletteInput').fill(status);
    await page.locator('.palette-item').filter({ hasText: `Move to ${status}` }).first().click();
}
const startChild = (page: Page) => moveItem(page, 3, 'In progress');
for (const width of [390, 1280]) for (const theme of ['light', 'dark']) test(`automation controls fit and work by keyboard at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('teamOsKanbanTheme', theme), theme);
    await seed(page); const modal = await settings(page);
    await expect(modal.getByRole('radio', { name: 'On 1', exact: true })).toHaveCount(8);
    await expect(modal.getByRole('heading', { name: 'Work progress', exact: true })).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Exceptions & hierarchy', exact: true })).toBeVisible();
    const group = modal.getByRole('group', { name: 'Start parent work', exact: true });
    await group.getByRole('radio', { name: 'On 1', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: 'On 2', exact: true })).toBeChecked();
    const box = await group.boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const saveBox = await modal.getByRole('button', { name: 'Save', exact: true }).boundingBox(); expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: testInfo.outputPath(`automations-${theme}-${width}.png`), fullPage: true });
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).extensions.hierarchyAutomations.rules.startParent).toBe('automatic');
    await settings(page); await expect(group.getByRole('radio', { name: 'On 2', exact: true })).toBeChecked();
});

test('one review rejects parent cascades while persisting the child status and rejected history', async ({ page }) => {
    await seed(page); await startChild(page);
    await expect(page.locator('#appMessageModal')).toContainText('Review workflow automations');
    await expect(page.locator('#appMessageModal select')).toHaveCount(2);
    await expect(page.locator('.workitem-review-transition').first()).toHaveText('To Do→In progress');
    await expect(page.locator('.workitem-review h3')).toHaveText('Rule: Start parent work');
    await expect(page.locator('#appMessageConfirmBtn')).toHaveText('Apply changes (2)');
    await page.locator('#appMessageModal select').first().selectOption('keep');
    await expect(page.locator('#appMessageConfirmBtn')).toHaveText('Apply changes (1)');
    await answerAppMessage(page, { button: 'Keep all current' });
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 3).status).toBe('doing');
    const saved = await readSavedBoard(page, 'auto');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 2).status).toBe('to-do');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 1).status).toBe('to-do');
    expect(saved.extensions.timeline.events.some((event: { kind: string }) => event.kind === 'task.automation.rejected')).toBe(true);
});

test('On 2 executes the cascade without review and persists rule history', async ({ page }) => {
    await seed(page); const modal = await settings(page);
    await modal.getByRole('group', { name: 'Start parent work', exact: true }).getByRole('radio', { name: 'On 2', exact: true }).check();
    await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal).toHaveCount(0);
    await startChild(page);
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 1).status).toBe('doing');
    await expect(page.locator('#appMessageModal')).toHaveCount(0);
    const events = (await readSavedBoard(page, 'auto')).extensions.timeline.events;
    expect(events.filter((event: { meta?: { automationOutcome?: string } }) => event.meta?.automationOutcome === 'automatic')).toHaveLength(2);
});

test('Off suppresses proposals and read-only projects expose disabled controls', async ({ page }) => {
    await seed(page); const modal = await settings(page);
    await modal.getByRole('group', { name: 'Start parent work', exact: true }).getByRole('radio', { name: 'Off', exact: true }).check();
    await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal).toHaveCount(0);
    await startChild(page);
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 3).status).toBe('doing');
    expect((await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 2).status).toBe('to-do');
    await seedPortfolioBoards(page, [{ id: 'read', title: 'Read-only automations', hasHandle: false, tasks: fixture.board.tasks, extensions: { ...fixture.extensions, project: { ...fixture.extensions.project, id: 'read', acronym: 'READ' } } }], { selectedBoardId: 'read' });
    await page.getByRole('button', { name: 'Settings for Read-only automations', exact: true }).click();
    await page.getByRole('tab', { name: 'Automations', exact: true }).click();
    await expect(page.getByRole('radio').first()).toBeDisabled();
    await expect(page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});

for (const width of [390, 1280]) for (const theme of ['light', 'dark']) test(`compact review separates titles and transitions at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('teamOsKanbanTheme', theme), theme);
    const tasks = structuredClone(fixture.board.tasks);
    tasks.find((task: { id: number }) => task.id === 2).title = 'Testing → Done rollout';
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'auto', title: fixture.board.settings.title, hasHandle: true, tasks, extensions: fixture.extensions }], { selectedBoardId: 'auto' });
    await startChild(page);
    const modal = page.locator('#appMessageModal');
    await expect(modal.locator('.workitem-review-title').first()).toHaveText('Testing → Done rollout');
    await expect(modal.locator('.workitem-review-transition').first()).toHaveText('To Do→In progress');
    await expect(modal.locator('.workitem-type[data-workitem-type="story"]')).toBeVisible();
    await expect(modal.locator('select')).toHaveCount(2);
    await expect(modal.locator('select').first().locator('option')).toHaveText(['Apply change', 'Keep current']);
    await expect(modal.locator('#appMessageConfirmBtn')).toBeInViewport();
    expect(await modal.locator('.modal-content').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`review-${theme}-${width}.png`), fullPage: true });
    await modal.locator('#appMessageConfirmBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 1).status).toBe('doing');
});


for (const mode of ['off', 'confirm', 'automatic'] as const) test(`blocked Testing automation in ${mode} preserves the child and never offers an illegal choice`, async ({ page }, testInfo) => {
    await gotoApp(page);
    const config = defaultHierarchyAutomations();
    config.rules.prepareTesting = mode;
    await seedPortfolioBoards(page, [{ id: 'auto', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks,
        extensions: { ...fixture.extensions, hierarchyAutomations: config } }], { selectedBoardId: 'auto' });
    await moveItem(page, 81, 'Done');
    const modal = page.locator('#appMessageModal');
    if (mode !== 'off') {
        await expect(modal.locator('#appMessageTitle')).toHaveText('Review workflow automations');
        await expect(modal).toContainText('workflow does not allow the transition');
        await expect(modal.locator('.workitem-review-field')).toHaveText('Status');
        await expect(modal.locator('.workitem-review-transition')).toHaveText('To Do→Ready to test');
        await expect(modal.locator('.workitem-type')).toHaveText('User Story');
        await expect(modal.locator('select')).toHaveCount(0);
        await expect(modal.getByRole('button')).toHaveText(['OK']);
        await page.setViewportSize({ width: 390, height: 720 });
        expect(await modal.locator('.modal-content').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`blocked-${mode}.png`) });
        await answerAppMessage(page, { button: 'OK' });
    }
    await expect(modal).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 81).status).toBe('done');
    expect((await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 80).status).toBe('to-do');
});

test('reopening a Task under a completed Story with rules Off saves without any confirmation', async ({ page }) => {
    await gotoApp(page);
    const config = defaultHierarchyAutomations();
    for (const rule of Object.keys(config.rules) as (keyof typeof config.rules)[]) config.rules[rule] = 'off';
    await seedPortfolioBoards(page, [{ id: 'auto', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks,
        extensions: { ...fixture.extensions, hierarchyAutomations: config } }], { selectedBoardId: 'auto' });
    await moveItem(page, 52, 'In progress');
    await expect.poll(async () => (await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 52).status).toBe('doing');
    await expect(page.locator('#appMessageModal')).toHaveCount(0);
    expect((await readSavedBoard(page, 'auto')).board.tasks.find((task: { id: number }) => task.id === 51).status).toBe('done');
});
