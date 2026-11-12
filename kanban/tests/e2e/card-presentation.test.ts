import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, toggleTheme, toggleLanguage, openProjectPicker } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('tests/fixtures/manual/us-12.board.json', 'utf8'));
test.use({ deviceScaleFactor: 2 });

for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
        test(`essential Story cards stay calm and contained at ${width}px (${theme})`, async ({ page }, testInfo) => {
            await page.clock.setFixedTime('2026-10-29T12:00:00Z');
            await page.setViewportSize({ width, height: 900 });
            await gotoApp(page);
            await seedPortfolioBoards(page, [{ id: 'cards', title: fixture.board.settings.title, hasHandle: true,
                tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'cards' });
            if (theme === 'dark') await toggleTheme(page);
            await page.getByRole('button', { name: 'Functional', exact: true }).click();
            await toggleLanguage(page);

            const card = portfolioCard(page, 'Pagar com cartão');
            await expect(card.locator('.task-title')).toHaveText('Pagar com cartão');
            await expect(card.locator('.task-card-id')).toContainText('1202');
            await expect(card.getByText('Ana', { exact: true })).toHaveCount(1);
            await expect(card.locator('select')).toContainText('Rui');
            await expect(card).not.toContainText('Checkout acessível');
            await expect(card.locator('.task-tag-label, .task-tag-assignee, .task-tag-age, .task-tag-score, .effort-dot')).toHaveCount(0);
            await expect(card.locator('.task-card-progress, time, .task-card-priority')).toHaveCount(0);
            await expect(card.locator('.task-card-project')).toHaveCount(0);
            expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
            expect((await card.boundingBox())!.height).toBeLessThan(190);
            await page.mouse.move(1, 1);
            await card.screenshot({ path: testInfo.outputPath('essential-story.png') });

            await card.click();
            await expect(page.locator('#taskDetailModal')).toBeVisible();
            await expect(page.locator('#taskAssigneeItems')).toContainText('Rui');
            await expect(page.locator('#detailEffortInput')).toHaveValue('L');
            await page.keyboard.press('Escape');
            await page.locator('#projectPickerBtn').click();
            await openProjectPicker(page); await page.locator('.portfolio-chip button[data-board-id=""]').click();
            await expect(portfolioCard(page, 'Pagar com cartão').locator('.task-card-project')).toHaveCount(0);
        });
    }
}

test('cards show actionable deadlines and priority while keeping blockers visible', async ({ page }) => {
    await page.clock.setFixedTime('2026-10-29T12:00:00Z');
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'dates', title: 'Card dates', hasHandle: true, tasks: [
        { id: 1, title: 'Overdue work', dueDate: '2026-10-28', blocked: true, blockerReason: 'Waiting for access' },
        { id: 2, title: 'Due today', dueDate: '2026-10-29' },
        { id: 3, title: 'Due soon', dueDate: '2026-11-01', priority: 'high' },
        { id: 4, title: 'Later work', dueDate: '2026-11-02', priority: 'medium' },
        { id: 5, title: 'Finished work', status: 'done', dueDate: '2026-10-28', priority: 'high' }
    ] }], { selectedBoardId: 'dates' });
    for (const title of ['Overdue work', 'Due today', 'Due soon', 'Later work', 'Finished work']) {
        await expect(portfolioCard(page, title).locator('time, .task-card-priority, .task-card-blocker')).toHaveCount(0);
    }
    await portfolioCard(page, 'Overdue work').click();
    await expect(page.locator('#detailDueDateInput')).toHaveValue('28/10/2026');
    await expect(page.locator('#detailBlockerInput')).toHaveValue('Waiting for access');
});
