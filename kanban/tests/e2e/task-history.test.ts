import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, openTaskEditor, readSavedBoard, setTimelineSlider } from '../support/portfolio';

test('multi-field saves form one read-only history operation; filters and tabs preserve the project', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'History', hasHandle: true, tasks: [{ id: 1, title: 'Original', status: 'to-do', assignees: ['Ana'], responsible: 'Ana' }] }], { selectedBoardId: 'p' });
    await openTaskEditor(page, 'Original');
    await page.locator('#taskName').fill('Edited');
    await page.locator('#taskDescription').fill('Clarified\nSecond line');
    await page.locator('#taskModal .btn-primary').click();
    await portfolioCard(page, 'Edited').click();
    await expect(page.getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-entry')).toHaveCount(1);
    await page.locator('.history-entry summary').click();
    await expect(page.locator('.history-entry')).toContainText('Original');
    await expect(page.locator('.history-entry')).toContainText('Clarified');
    await expect(page.locator('.history-author')).toHaveText('Unknown');
    const before = (await readSavedBoard(page, 'p')).extensions.timeline.events.length;
    await page.getByLabel('Category', { exact: true }).selectOption('relations');
    await expect(page.locator('.history-empty')).toContainText('No events match');
    await page.locator('.history-empty').getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await expect(page.locator('#detailTitle')).toHaveText('Edited');
    expect((await readSavedBoard(page, 'p')).extensions.timeline.events).toHaveLength(before);
});

test('historical history uses the canonical position even with equal or inverted timestamps', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-6.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 1);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Show tasks for Build at date', exact: true }).click();
    await portfolioCard(page, 'Release ready').click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-entry')).toHaveCount(1);
    await expect(page.locator('.history-context')).toContainText('position 2');
    await page.locator('.history-entry summary').click();
    await expect(page.locator('.history-entry')).toContainText('Draft acceptance');
    await expect(page.locator('#portfolioTimelinePanel .timeline-slider')).toHaveValue('1');
});

test('read-only partial files show evidence limits and do not invent an author', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/us-6-partial.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: false, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Partial item').click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-entry')).toHaveCount(2);
    await page.locator('.history-entry summary').first().click();
    await expect(page.locator('.task-history')).toContainText('Details unavailable for this recorded operation');
    await page.locator('.history-entry summary').last().click();
    await expect(page.locator('.task-history')).toContainText('current name, not a known historical label');
    await expect(page.locator('.task-history button')).toHaveCount(0);
});
