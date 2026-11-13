import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, dragWithMouse, answerAppMessage, showTimeline, setTimelineSlider, renameTaskViaEditor } from '../support/portfolio';

test.describe.configure({ mode: 'parallel' });

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) for (const width of [1280, 390]) {
    test(`compact workspace ${style}/${mode} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await gotoApp(page);
        const title = 'Identificação de pareceres fiscais, PIVs e outras tarefas para análise';
        await seedPortfolioBoards(page, [{ id: 'design', title: 'Fiscal', acronym: 'FIS', hasHandle: true, members: ['Bruno Silva', 'Ana Ferreira'], tasks: [
            { id: 8, displayId: 'FIS-TK-8', title, responsible: 'Bruno Silva', assignees: ['Bruno Silva'], status: 'to-do', blocked: true, blockerReason: 'Waiting', dueDate: '2020-01-01', priority: 'high' },
            { id: 9, title: 'Sem responsável', status: 'to-do' }
        ] }], { selectedBoardId: 'design' });
        const card = portfolioCard(page, title);
        await expect(page.locator('#portfolioBoardsChips')).toBeHidden();
        expect(await page.locator('.header-actions > button').evaluateAll((nodes) => nodes.map((node) => node.id))).toEqual([
            'portfolioSearchBtn', 'openShortcutsBtn', 'docsToggleBtn', 'appSettingsBtn', 'importProjectsBtn', 'newProjectBtn'
        ]);
        const logo = (await page.locator('.app-logo').boundingBox())!;
        const picker = (await page.locator('#projectPickerBtn').boundingBox())!;
        expect(picker.x).toBeGreaterThan(logo.x + logo.width);
        expect(Math.abs(logo.y + logo.height / 2 - picker.y - picker.height / 2)).toBeLessThan(2);
        await expect(page.locator('#projectPickerBtn')).toHaveCSS('border-top-width', '0px');
        await expect(card.locator('input, time, .task-card-progress, .task-card-blocker, .task-card-priority')).toHaveCount(0);
        await expect(card.locator('.task-card-next')).toBeVisible();
        await expect(card.locator('.task-card-id')).toHaveText('FIS-TK-8');
        await expect(card.locator('.task-card-type')).toHaveText('Task');
        await expect(card.getByRole('combobox', { name: 'Responsible' })).toHaveValue('Bruno Silva');
        await expect(portfolioCard(page, 'Sem responsável').locator('select option:checked')).toHaveText('Not assigned');
        await expect(card.locator('.task-title')).toHaveCSS('-webkit-line-clamp', '2');
        expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(card).toHaveCSS('border-top-left-radius', style === 'modern' ? '7px' : '0px');
        const filled = (await page.locator('.portfolio-column[data-status="to-do"]').boundingBox())!;
        const empty = (await page.locator('.portfolio-column[data-status="doing"]').boundingBox())!;
        expect(filled.width / empty.width).toBeCloseTo(width < 760 ? 2 : 1, 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('workspace.png') });
        await card.getByRole('combobox').selectOption('Ana Ferreira');
        await expect.poll(async () => (await readSavedBoard(page, 'design')).board.tasks[0].responsible).toBe('Ana Ferreira');
        await expect(page.locator('#taskDetailModal')).toHaveCount(0);
        await card.locator('.task-card-id').click();
        await expect(page.locator('#taskDetailModal')).toBeVisible();
        await expect(page.locator('#detailDueDateInput')).toHaveValue('01/01/2020');
        await page.locator('#taskDetailEditBtn').click();
        await expect(page.locator('#taskName')).toHaveValue(title);
        await page.keyboard.press('Escape');
        await page.locator('#portfolioFiltersBtn').click();
        await expect(page.getByRole('dialog', { name: 'Filters & View' })).toBeVisible();
        await page.locator('#portfolioSortSelect').selectOption('name');
        await page.getByRole('checkbox', { name: 'done', exact: true }).uncheck();
        await expect(page.locator('.portfolio-column[data-status="done"]')).toHaveCount(0);
        await page.locator('#portfolioResponsibleFilter').selectOption({ label: 'Ana Ferreira' });
        await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.locator('#portfolioFiltersBtn')).toBeFocused();
        await page.keyboard.press('s');
        await expect(page.locator('#portfolioSortSelect')).toBeFocused();
        await page.keyboard.press('Escape');
        await page.locator('.board-create-btn').click();
        await expect(page.locator('#taskModal')).toBeVisible();
        await page.keyboard.press('Escape');
    });
}

test('settings are anchored and persist mode, theme, language and timeline', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#appSettingsBtn').click();
    const panel = page.locator('#appSettingsModal');
    await expect(panel).toBeVisible();
    const anchor = (await page.locator('#appSettingsBtn').boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThan(anchor.y + anchor.height);
    expect(box.y).toBeLessThan(anchor.y + anchor.height + 20);
    await page.getByRole('radio', { name: 'Modern', exact: true }).check();
    await page.getByRole('radio', { name: 'Dark', exact: true }).check();
    await page.getByRole('radio', { name: 'Português', exact: true }).check();
    await expect(panel).toContainText('Definições da aplicação');
    await page.getByRole('checkbox', { name: 'Mostrar barra do histórico' }).check();
    await page.keyboard.press('Escape');
    await expect(page.locator('#appSettingsBtn')).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'modern');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await page.locator('#appSettingsBtn').click();
    await expect(page.getByRole('checkbox', { name: 'Mostrar barra do histórico' })).toBeChecked();
    await page.locator('.app-logo').click();
    await expect(panel).toHaveCount(0);
});

test('picker groups products and retains selection, settings and removal', async ({ page }) => {
    await gotoApp(page);
    const product = { version: 1, description: '', status: null, productName: 'House', members: [{ id: 'ana', name: 'Ana' }], tags: [] };
    await seedPortfolioBoards(page, [
        { id: 'a', title: 'Construction', hasHandle: true, extensions: { project: { ...product, id: 'a' } } },
        { id: 'b', title: 'Maintenance', hasHandle: true, extensions: { project: { ...product, id: 'b' } } },
        { id: 'c', title: 'Independent', hasHandle: true }
    ], { selectedBoardId: 'c' });
    await page.locator('#projectPickerBtn').click();
    const picker = page.locator('#portfolioBoardsChips');
    await picker.locator('summary').filter({ hasText: 'House' }).click();
    await picker.getByRole('button', { name: 'Construction', exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.locator('#projectPickerBtn')).toContainText('Construction');
    await page.locator('#projectPickerBtn').click();
    await picker.getByRole('button', { name: 'Settings for Construction', exact: true }).click();
    await expect(page.locator('#projectSettingsModal')).toBeVisible();
    await expect(picker).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('#projectPickerBtn').click();
    await picker.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('#projectPickerBtn')).toContainText('All');
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveCount(0);
});

test('columns share the full Board width and stay equal after moving their last card', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'dnd', title: 'Drag', hasHandle: true, tasks: [{ id: 1, title: 'Move this', status: 'backlog' }] }], { selectedBoardId: 'dnd' });
    const columnBounds = () => page.locator('.portfolio-column').evaluateAll(nodes => nodes.map(node => {
        const { x, width } = node.getBoundingClientRect();
        return { x, width };
    }));
    const before = await columnBounds();
    const board = (await page.locator('.workitem-board-columns').boundingBox())!;
    for (const column of before) expect(column.width).toBeCloseTo(before[0].width, 1);
    expect(before[0].x).toBeCloseTo(board.x, 1);
    expect(before.at(-1)!.x + before.at(-1)!.width).toBeCloseTo(board.x + board.width, 1);
    const card = portfolioCard(page, 'Move this');
    const destination = page.locator('#portfolio-doing-column');
    await dragWithMouse(page, card, destination);
    await expect(destination.locator('.portfolio-task-card')).toHaveCount(1);
    expect(await columnBounds()).toEqual(before);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator('.workitem-board-columns')).toHaveClass(/is-compact/);
    const compressed = await columnBounds();
    expect(compressed[2].width / compressed[0].width).toBeCloseTo(2, 1);
    expect(compressed.at(-1)!.x + compressed.at(-1)!.width).toBeCloseTo(900, 1);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.locator('.workitem-board-columns').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.locator('.workitem-board-columns')).not.toHaveClass(/is-compact/);
    expect(await columnBounds()).toEqual(before);
    await expect(page.locator('#taskDetailModal')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'dnd')).board.tasks[0].status).toBe('doing');
});

test('read-only and historical cards retain details and prevent assignment changes', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'ro', title: 'Read only', hasHandle: false, tasks: [{ id: 1, title: 'Inspect', status: 'to-do' }] }], { selectedBoardId: 'ro' });
    const card = portfolioCard(page, 'Inspect');
    await expect(card.locator('select')).toBeDisabled();
    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskDetailEditBtn')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await seedPortfolioBoards(page, [{ id: 'rw', title: 'History', hasHandle: true, tasks: [{ id: 1, title: 'Current', status: 'to-do' }] }], { selectedBoardId: 'rw' });
    await renameTaskViaEditor(page, 'Current', 'Updated');
    await showTimeline(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    await expect(portfolioCard(page, 'Current').locator('select')).toBeDisabled();
});

test('deletion remains available in workitem details', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'delete', title: 'Delete', hasHandle: true, tasks: [{ id: 1, title: 'Delete this' }] }], { selectedBoardId: 'delete' });
    await portfolioCard(page, 'Delete this').click();
    await page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true }).click();
    await page.locator('#taskDetailModal').getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await answerAppMessage(page, { button: 'Delete' });
    await expect(portfolioCard(page, 'Delete this')).toHaveCount(0);
});
