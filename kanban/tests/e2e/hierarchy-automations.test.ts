import { readFileSync } from 'node:fs';
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
async function startChild(page: Page) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill('#3');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await page.locator('#commandPaletteInput').fill('In progress');
    await page.locator('.palette-item').filter({ hasText: /Move to In progress/i }).first().click();
}
for (const width of [390, 1280]) for (const theme of ['light', 'dark']) test(`automation controls fit and work by keyboard at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('teamOsKanbanTheme', theme), theme);
    await seed(page); const modal = await settings(page);
    await expect(modal.getByRole('radio', { name: 'On 1', exact: true })).toHaveCount(7);
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
    await expect(page.locator('#appMessageModal')).toContainText('Review hierarchy automations');
    await expect(page.locator('#appMessageModal select')).toHaveCount(2);
    await expect(page.locator('#appMessageModal')).toContainText('To Do → In progress');
    await answerAppMessage(page, { button: 'Cancel' });
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
