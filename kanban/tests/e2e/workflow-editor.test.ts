import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage } from '../support/portfolio';

async function openWorkflow(page: Page, readOnly = false) {
    await gotoApp(page);
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: !readOnly, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    return page.locator('.workflow-dialog');
}

test('state navigation keeps draft edits and Cancel discards every section', async ({ page }) => {
    const dialog = await openWorkflow(page);
    await dialog.locator('[data-state-choice="testing"]').click();
    await dialog.getByRole('textbox', { name: /^Title/ }).fill('Business testing');
    await dialog.getByRole('checkbox', { name: 'Done', exact: true }).uncheck();
    await dialog.locator('[data-state-choice="doing"]').click();
    await dialog.locator('[data-state-choice="testing"]').click();
    await expect(dialog.getByRole('textbox', { name: /^Title/ })).toHaveValue('Business testing');
    await expect(dialog.getByRole('checkbox', { name: 'Done', exact: true })).not.toBeChecked();
    await dialog.getByRole('tab', { name: 'Entry & references', exact: true }).click();
    await dialog.getByLabel('Reference state · In progress', { exact: true }).selectOption('testing');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await dialog.locator('[data-state-choice="testing"]').click();
    await expect(dialog.getByRole('textbox', { name: /^Title/ })).toHaveValue('Testing');
    await expect(dialog.getByRole('checkbox', { name: 'Done', exact: true })).toBeChecked();
    expect((await readSavedBoard(page, 'p')).extensions.timeline).toBeUndefined();
});

test('adding, configuring and reordering a state saves the same stable identity and directional links', async ({ page }) => {
    const dialog = await openWorkflow(page);
    await dialog.getByRole('button', { name: 'Add state', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: /^Title/ })).toBeFocused();
    await dialog.getByRole('textbox', { name: /^Title/ }).fill('Review');
    await dialog.getByLabel('Category', { exact: true }).selectOption('in-progress');
    await dialog.getByLabel('Color', { exact: true }).fill('#bb22aa');
    await dialog.getByRole('checkbox', { name: 'Done', exact: true }).check();
    const stateId = await dialog.locator('[data-workflow-state]').getAttribute('data-workflow-state');
    await dialog.getByRole('button', { name: 'Move state up', exact: true }).click();
    await dialog.locator('[data-state-choice="doing"]').click();
    await dialog.getByRole('checkbox', { name: 'Review', exact: true }).check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow.states.length).toBe(10);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.workflow.states[8]).toMatchObject({ id: stateId, name: 'Review', color: '#bb22aa', category: 'in-progress' });
    expect(saved.extensions.workflow.transitions.doing).toContain(stateId);
    expect(saved.extensions.workflow.transitions[stateId!]).toEqual(['done']);
    expect(saved.board.tasks).toHaveLength(8);
});

test('removed states require relocation in the general section and category changes still require impact confirmation', async ({ page }) => {
    const dialog = await openWorkflow(page);
    await dialog.locator('[data-state-choice="doing"]').click();
    await dialog.getByRole('checkbox', { name: 'Re-analysis', exact: true }).check();
    await dialog.locator('[data-state-choice="testing"]').click();
    await expect(dialog).toContainText('1 workitems in this state, including archived');
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('tab', { name: 'Entry & references', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('alert')).toContainText('Choose a destination');
    await dialog.getByRole('combobox', { name: 'Testing: relocate 1 workitems (including archived)', exact: true }).selectOption('doing');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await answerAppMessage(page, { expectText: '1 workitems' });
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow.states.some((state: { id: string }) => state.id === 'testing')).toBe(false);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 403)).toMatchObject({ archived: true, status: 'doing' });
});

test('read-only permits navigation and keyboard tabs but no configuration changes', async ({ page }) => {
    const dialog = await openWorkflow(page, true);
    await dialog.locator('[data-state-choice="testing"]').click();
    await expect(dialog.getByRole('textbox', { name: /^Title/ })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: 'Done', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Add state', exact: true })).toHaveCount(0);
    await dialog.getByRole('tab', { name: /States & transitions/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('tab', { name: 'Entry & references', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('combobox', { name: 'Board entry state', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('unreachable states are flagged without applying an invalid draft', async ({ page }) => {
    const dialog = await openWorkflow(page);
    await dialog.getByRole('button', { name: 'Add state', exact: true }).click();
    await dialog.getByRole('textbox', { name: /^Title/ }).fill('Isolated');
    await expect(dialog.getByRole('status')).toContainText('Unreachable from Backlog');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('reachable from Backlog');
    expect((await readSavedBoard(page, 'p')).extensions.workflow.states).toHaveLength(9);
});

test('moving the last optional-category state does not leave an uneditable reference behind', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Legacy categories', hasHandle: true, tasks: [{ id: 1, title: 'Not affected', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    const dialog = page.locator('.workflow-dialog');
    await dialog.locator('[data-state-choice="doing"]').click();
    await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption('completed');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow?.states.find((state: { id: string }) => state.id === 'doing').category).toBe('completed');
    expect((await readSavedBoard(page, 'p')).extensions.workflow.references['in-progress']).toBeUndefined();
});
