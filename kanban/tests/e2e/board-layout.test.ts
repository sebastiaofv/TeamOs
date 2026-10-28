import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, dragWithMouse, readSavedBoard } from '../support/portfolio';

test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'layout', title: 'Board layout', hasHandle: true, tasks: [
        { id: 1, title: 'Business objective', type: 'epic', status: 'doing' },
        { id: 2, title: 'Customer need', type: 'story', parentId: 1, status: 'backlog' },
        { id: 3, title: 'Implementation', type: 'task', parentId: 1, status: 'backlog' },
        { id: 4, title: 'Defect', type: 'bug', status: 'doing' },
        { id: 5, title: 'Independent execution', type: 'task', status: 'to-do' }
    ] }], { selectedBoardId: 'layout' });
});

test('both boards share a single row of workflow columns including backlog and differ only by workitem types', async ({ page }, testInfo) => {
    const geometry: { status: string | null; x: number; y: number; width: number; height: number }[][] = [];
    for (const mode of ['Technical Board', 'Functional Board']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(page.locator('.portfolio-column')).toHaveCount(4);
        await expect(page.locator('.workitem-backlog, .workitem-swimlane')).toHaveCount(0);
        const columns = await page.locator('.portfolio-column').evaluateAll((nodes) => nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { status: node.getAttribute('data-status'), x, y, width, height };
        }));
        expect(columns.map((column) => column.status)).toEqual(['backlog', 'to-do', 'doing', 'done']);
        expect(new Set(columns.map((column) => column.y)).size).toBe(1);
        geometry.push(columns);
        if (mode === 'Technical Board') {
            await expect(page.locator('#portfolio-backlog-column')).toContainText('Implementation');
            await expect(portfolioCard(page, 'Defect')).toBeVisible();
            await expect(portfolioCard(page, 'Independent execution')).toBeVisible();
            await expect(portfolioCard(page, 'Customer need')).toHaveCount(0);
            await expect(page.locator('.portfolio-task-card[data-task-id="1"]')).toHaveCount(0);
        } else {
            await expect(page.locator('#portfolio-backlog-column')).toContainText('Customer need');
            await expect(page.locator('.portfolio-task-card[data-task-id="1"]')).toBeVisible();
            await expect(portfolioCard(page, 'Implementation')).toHaveCount(0);
            await expect(portfolioCard(page, 'Defect')).toHaveCount(0);
        }
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${mode}-light.png`) });
        await page.locator('#themeToggleBtn').click();
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${mode}-dark.png`) });
        await page.locator('#themeToggleBtn').click();
    }
    expect(geometry[1]).toEqual(geometry[0]);
    await expect(page.getByRole('button', { name: 'Story automation', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ['Technical Board', 'Functional Board']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        expect(await page.locator('.portfolio-column').evaluateAll((nodes) => new Set(nodes.map((node) => node.getBoundingClientRect().y)).size)).toBe(1);
        await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${mode}-mobile.png`) });
    }
});

test('backlog visibility applies to both boards and restores its cards', async ({ page }) => {
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'backlog', exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator('.portfolio-column[data-status="backlog"]')).toHaveCount(0);
    await expect(portfolioCard(page, 'Implementation')).toHaveCount(0);
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await expect(portfolioCard(page, 'Customer need')).toHaveCount(0);
    await page.getByRole('button', { name: 'Board columns', exact: true }).click();
    await page.getByRole('checkbox', { name: 'backlog', exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(page.locator('#portfolio-backlog-column')).toContainText('Customer need');
});

test('backlog is a drop target and persists the moved workitem', async ({ page }) => {
    await dragWithMouse(page, portfolioCard(page, 'Independent execution').locator('.task-title'), page.locator('#portfolio-backlog-column'));
    await expect(portfolioCard(page, 'Independent execution')).toHaveAttribute('data-status', 'backlog');
    await expect.poll(async () => (await readSavedBoard(page, 'layout')).board.tasks.find((task: { id: number }) => task.id === 5).status).toBe('backlog');
});
