import { confirmWorkitemChanges } from '../support/portfolio';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, dragWithMouse, answerAppMessage } from '../support/portfolio';

test('workflow settings remain draft-based and renamed states keep their own columns', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Workflow project', hasHandle: true, tasks: [{ id: 1, title: 'Intake', status: 'backlog' }] }], { selectedBoardId: 'p' });
    await expect(page.locator('.workitem-backlog')).toHaveCount(1);
    await dragWithMouse(page, portfolioCard(page, 'Intake').locator('.task-title'), page.locator('#portfolio-to-do-column'));
    await expect(portfolioCard(page, 'Intake')).toHaveAttribute('data-status', 'to-do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-state-choice="to-do"]').click();
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('To Do');
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await dialog.locator('[data-state-choice="to-do"]').click();
    await dialog.getByRole('textbox', { name: 'Title 2', exact: true }).fill('Ready');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#portfolio-to-do-heading')).toHaveText('Ready');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.workflow.states[1].name).toBe('Ready');
});

test('same-category state columns support repeated testing cycles without new card or modal controls', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    fixture.extensions.boardView = { version: 1, hiddenStateIds: ['backlog', 'to-do', 'done', 'cancelled', 'duplication'] };
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await expect(page.locator('.portfolio-column')).toHaveCount(4);
    for (let cycle = 0; cycle < 2; cycle++) for (const status of ['testing', 're-analysis', 'doing', 'ready-to-test']) {
        await dragWithMouse(page, portfolioCard(page, 'Business validation ready').locator('.task-title'), page.locator(`[id="portfolio-${status}-column"]`));
        await expect(portfolioCard(page, 'Business validation ready')).toHaveAttribute('data-status', status);
    }
    await portfolioCard(page, 'Business validation ready').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#taskName')).toHaveValue('Business validation ready');
    await expect(page.locator('.task-workflow-header, .task-workflow-controls')).toHaveCount(0);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks).toHaveLength(8);
    expect(saved.extensions.timeline.events.filter((event: { entityId: string; kind: string }) => event.entityId === '406' && event.kind === 'task.status.changed')).toHaveLength(8);
});

test('drops use the exact destination state in both project and aggregate boards', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    fixture.extensions.boardView = { version: 1, hiddenStateIds: ['ready-to-test', 'testing', 're-analysis', 'cancelled', 'duplication'] };
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-done-column'));
    await answerAppMessage(page, { expectText: 'not allowed' });
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'backlog');
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-to-do-column'));
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'to-do');
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-doing-column'));
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'doing');
    await page.locator('#portfolioBoardsChips').getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.portfolio-column')).toHaveCount(3);
    await dragWithMouse(page, portfolioCard(page, 'Unplanned intake').locator('.task-title'), page.locator('#portfolio-done-column'));
    await expect(portfolioCard(page, 'Unplanned intake')).toHaveAttribute('data-status', 'done');
});

test('terminal reopening is still configurable without changing the card appearance', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
    fixture.extensions.boardView = { version: 1, hiddenStateIds: ['backlog', 'to-do', 'ready-to-test', 'testing', 're-analysis', 'cancelled', 'duplication'] };
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await dragWithMouse(page, portfolioCard(page, 'Delivered work').locator('.task-title'), page.locator('#portfolio-doing-column'));
    await answerAppMessage(page, { expectText: 'not allowed' });
    await page.getByRole('button', { name: 'Project settings · Workflow', exact: true }).click();
    await page.locator('[data-state-choice="done"]').click();
    await page.locator('[data-workflow-state="done"]').getByRole('checkbox', { name: 'In progress', exact: true }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await dragWithMouse(page, portfolioCard(page, 'Delivered work').locator('.task-title'), page.locator('#portfolio-doing-column'));
    await confirmWorkitemChanges(page);
    await expect(portfolioCard(page, 'Delivered work')).toHaveAttribute('data-status', 'doing');
});
