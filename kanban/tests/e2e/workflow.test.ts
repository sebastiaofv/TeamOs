import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, dragWithMouse, answerAppMessage } from '../support/portfolio';

test('workflow settings are draft-based and state changes share directional rules', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Workflow project', hasHandle: true, tasks: [{ id: 1, title: 'Intake', status: 'backlog' }] }], { selectedBoardId: 'p' });
    await expect(page.locator('.portfolio-column[data-status="backlog"]')).toHaveCount(0);
    await portfolioCard(page, 'Intake').getByRole('button', { name: 'Send to Board' }).click();
    await expect(portfolioCard(page, 'Intake')).toHaveAttribute('data-status', 'to-do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('To Do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('To Do');
    await expect(portfolioCard(page, 'Intake').locator('.workflow-state-badge')).toHaveText('Ready');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow.states[1].name).toBe('Ready');
});

test('clarified workflow uses category columns, repeated testing cycles and direct detail controls with shared state colors', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await expect(page.locator('.portfolio-column')).toHaveCount(3);
    await expect(page.locator('#portfolio-doing-column')).toContainText('Business validation ready');
    await expect(page.locator('#portfolio-doing-column')).toContainText('Re-analysis cycle');
    await expect(portfolioCard(page, 'Business validation ready').locator('.workflow-state-badge')).toHaveAttribute('data-state-color', '#a78bfa');
    await portfolioCard(page, 'Business validation ready').locator('.task-title').click();
    const header = page.locator('.task-workflow-header');
    await header.getByLabel('Status', { exact: true }).selectOption('testing');
    await expect(header.locator('.workflow-state-badge')).toHaveAttribute('data-state-color', '#38bdf8');
    await header.getByLabel('Responsible', { exact: true }).fill('Carla');
    await header.getByLabel('Responsible', { exact: true }).press('Enter');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.find((task: { id: number }) => task.id === 406).responsible).toBe('Carla');
    for (let cycle = 0; cycle < 2; cycle++) for (const status of ['re-analysis', 'doing', 'ready-to-test', 'testing']) await header.getByLabel('Status', { exact: true }).selectOption(status);
    await header.getByLabel('Status', { exact: true }).selectOption('done');
    await expect(header.getByLabel('Status', { exact: true })).toBeDisabled();
    await expect(header.locator('.workflow-state-badge')).toHaveAttribute('data-state-color', '#34d399');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.find((task: { id: number }) => task.id === 406).status).toBe('done');
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks).toHaveLength(8);
    expect(saved.board.tasks.find((task: { id: number }) => task.id === 406)).toMatchObject({ responsible: 'Carla', assignees: ['Carla'], status: 'done' });
    expect(saved.extensions.timeline.events.filter((event: { entityId: string; kind: string }) => event.entityId === '406' && event.kind === 'task.status.changed')).toHaveLength(10);
    await page.keyboard.press('Escape');
    await expect(portfolioCard(page, 'Business validation ready').locator('.workflow-state-badge')).toHaveAttribute('data-state-color', '#34d399');
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.locator('tr[data-task-id="406"] td[data-column="status"] .workflow-state-badge')).toHaveAttribute('data-state-color', '#34d399');
});

test('project and aggregate category drops share zero/one/multiple destination rules', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    fixture.extensions.workflow.states.push({ id: 'triage', name: 'Triage', color: '#123456', category: 'to-do' });
    fixture.extensions.workflow.transitions.backlog.push('triage');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-done-column'));
    await answerAppMessage(page, { expectText: 'not allowed' });
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'backlog');
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-to-do-column'));
    await answerAppMessage(page, { button: 'To Do', expectText: 'Choose a destination' });
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'to-do');
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-doing-column'));
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'doing');
    await page.locator('#portfolioBoardsChips').getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.portfolio-column')).toHaveCount(3);
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-done-column'));
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'done');
});

test('terminal reopening must be configured explicitly and does not reassign responsibility', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await expect(portfolioCard(page, 'Delivered work').getByLabel('Status', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await page.locator('[data-workflow-state="done"]').getByRole('checkbox', { name: 'In progress', exact: true }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await portfolioCard(page, 'Delivered work').getByLabel('Status', { exact: true }).selectOption('doing');
    await expect(portfolioCard(page, 'Delivered work')).toHaveAttribute('data-status', 'doing');
});
