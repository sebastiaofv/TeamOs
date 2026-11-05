import { test, expect, type Page } from '@playwright/test';
import {
    gotoApp, seedPortfolioBoards, readSavedBoard, openTaskEditor,
    renameTaskViaEditor, showTimeline, setTimelineSlider, portfolioCard
} from '../support/portfolio';

async function chooseTheme(page: Page, name: 'Classic' | 'Modern') {
    await page.locator('#themePickerBtn').click();
    await page.getByRole('radio', { name, exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(page.locator('#themePicker')).toBeHidden();
}

test('keyboard selection, independent mode and persistence work without a project', async ({ page }) => {
    await gotoApp(page);
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme-style', 'classic');
    await page.locator('#themePickerBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('radio', { name: 'Classic', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Modern', exact: true })).toBeChecked();
    await expect(root).toHaveAttribute('data-theme-style', 'modern');
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await expect(page.locator('#themePickerBtn')).toBeFocused();
    await expect(page.locator('#themePickerBtn')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#themeToggleBtn').click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(root).toHaveAttribute('data-theme-style', 'modern');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme-style', 'modern');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await chooseTheme(page, 'Classic');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme-style', 'classic');
    await expect(root).toHaveAttribute('data-theme', 'dark');
});

for (const [savedMode, savedStyle, mode, style] of [
    ['dark', null, 'dark', 'classic'],
    ['broken', 'modern', 'light', 'modern'],
    ['dark', 'broken', 'dark', 'classic'],
    ['dark', 'modern', 'dark', 'modern']
]) {
    test(`applies saved ${savedMode}/${savedStyle} before React loads`, async ({ page }) => {
        await page.addInitScript(({ savedMode, savedStyle }) => {
            localStorage.setItem('teamOsKanbanTheme', savedMode!);
            if (savedStyle !== null) localStorage.setItem('teamOsKanbanThemeStyle', savedStyle!);
        }, { savedMode, savedStyle });
        await page.route('**/assets/*.js', (route) => route.abort());
        await page.goto('/');
        await expect(page.locator('#root')).toBeEmpty();
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode!);
        await expect(page.locator('html')).toHaveAttribute('data-theme-style', style!);
    });
}

test('the picker works in Portuguese and documentation and closes on outside click', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#docsToggleBtn').click();
    await page.locator('#languageToggleBtn').click();
    await page.getByRole('button', { name: 'Escolher tema', exact: true }).click();
    await page.getByRole('radio', { name: 'Moderno', exact: true }).check();
    await expect(page.locator('#docsView')).toBeVisible();
    await page.locator('.app-logo').click();
    await expect(page.locator('#themePicker')).toBeHidden();
    await expect(page.locator('#themePickerBtn')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#themeToggleBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'modern');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('appearance remains selectable when browser storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    await gotoApp(page);
    await chooseTheme(page, 'Modern');
    await page.locator('#themeToggleBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'modern');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await chooseTheme(page, 'Classic');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('switching from another tab preserves an unsaved editor and never writes project data', async ({ page, context }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p1', title: 'Theme project', hasHandle: true,
        tasks: [{ title: 'Original task', status: 'backlog' }] }], { selectedBoardId: 'p1' });
    const original = await readSavedBoard(page, 'p1');
    const writes = await page.evaluate(() => window.__portfolioTestWrites.length);
    await openTaskEditor(page, 'Original task');
    await page.locator('#taskName').fill('Unsaved draft');
    await page.locator('#taskDescription').fill('Keep this description');
    const otherTab = await context.newPage();
    await gotoApp(otherTab);
    await chooseTheme(otherTab, 'Modern');
    await otherTab.locator('#themeToggleBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'modern');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#taskName')).toHaveValue('Unsaved draft');
    await expect(page.locator('#taskDescription')).toHaveValue('Keep this description');
    expect(await readSavedBoard(page, 'p1')).toEqual(original);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(writes);
    await otherTab.close();
});

test('theme changes keep the selected view, URL filters and project file intact', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p1', title: 'Theme project', hasHandle: true,
        tasks: [{ title: 'Original task', status: 'doing' }] }], { selectedBoardId: 'p1' });
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    const url = page.url();
    const original = await readSavedBoard(page, 'p1');
    const writes = await page.evaluate(() => window.__portfolioTestWrites.length);
    await chooseTheme(page, 'Modern');
    await page.locator('#themeToggleBtn').click();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Theme project');
    await expect(page).toHaveURL(url);
    await expect(page.locator('#workitemsTable')).toContainText('Original task');
    expect(await readSavedBoard(page, 'p1')).toEqual(original);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(writes);
});

test('the selector also works for read-only projects and historical previews', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'readonly', title: 'Read only', hasHandle: false,
        tasks: [{ title: 'Read-only task' }] }], { selectedBoardId: 'readonly' });
    await chooseTheme(page, 'Modern');
    await expect(page.locator('.portfolio-read-only-notice')).toBeVisible();
    await expect(portfolioCard(page, 'Read-only task')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'p1', title: 'History project', hasHandle: true,
        tasks: [{ title: 'Original task' }] }], { selectedBoardId: 'p1' });
    await renameTaskViaEditor(page, 'Original task', 'Current task');
    await showTimeline(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    const saved = await readSavedBoard(page, 'p1');
    const writes = await page.evaluate(() => window.__portfolioTestWrites.length);
    await chooseTheme(page, 'Classic');
    await page.locator('#themeToggleBtn').click();
    await expect(portfolioCard(page, 'Original task')).toBeVisible();
    expect(await readSavedBoard(page, 'p1')).toEqual(saved);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(writes);
});

for (const width of [390, 1280]) {
    test(`theme picker stays within a ${width}px viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 780 });
        await gotoApp(page);
        await page.locator('#themePickerBtn').click();
        await page.getByRole('radio', { name: 'Modern', exact: true }).check();
        const panel = page.locator('#themePicker');
        const bounds = await panel.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(780);
        await expect(page.getByRole('radio', { name: 'Modern', exact: true })).toBeInViewport();
    });
}

for (const style of ['classic', 'modern']) {
    for (const mode of ['light', 'dark']) {
        test(`${style}/${mode} applies to every view, forms and overlays`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
            await page.addInitScript(({ style, mode }) => {
                localStorage.setItem('teamOsKanbanThemeStyle', style);
                localStorage.setItem('teamOsKanbanTheme', mode);
            }, { style, mode });
            await gotoApp(page);
            const capture = async (surface: string) => {
                const path = testInfo.outputPath(`${style}-${mode}-${surface}.png`);
                await page.screenshot({ path });
                await testInfo.attach(surface, { path, contentType: 'image/png' });
            };
            await seedPortfolioBoards(page, [{ id: 'p1', title: 'Theme project', hasHandle: true,
                tasks: [{ title: 'Visible workitem', status: 'doing', dueDate: '2026-11-05' }],
                extensions: { roadmap: { version: 1,
                    phases: [{ id: 'phase', title: 'Delivery', startDate: '2026-11-01', endDate: '2026-11-30' }],
                    milestones: [{ id: 'milestone', title: 'Launch', dueDate: '2026-11-20' }],
                    sprints: [] } }
            }], { selectedBoardId: 'p1' });
            await expect(page.locator('html')).toHaveAttribute('data-theme-style', style);
            await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
            const radius = style === 'modern' ? '5px' : '0px';
            await expect(page.locator('#themeToggleBtn')).toHaveCSS('border-radius', radius);
            for (const view of ['board', 'table', 'dashboard', 'roadmap', 'control', 'planner']) {
                const button = page.locator(`[data-view-mode="${view}"]`);
                await button.click();
                await expect(button).toHaveAttribute('aria-pressed', 'true');
                await capture(view);
            }
            await page.getByRole('button', { name: 'Calendar', exact: true }).click();
            await capture('calendar');
            await page.locator('#docsToggleBtn').click();
            await expect(page.locator('#docsView')).toBeVisible();
            await capture('docs');
            await page.locator('#docsToggleBtn').click();
            await page.locator('[data-view-mode="board"]').click();
            await openTaskEditor(page, 'Visible workitem');
            const effortBounds = await page.locator('#taskEffort').boundingBox();
            const pointsLabelBounds = await page.locator('label[for="taskStoryPoints"]').boundingBox();
            expect(pointsLabelBounds!.y - effortBounds!.y - effortBounds!.height).toBeGreaterThanOrEqual(16);
            await expect(page.locator('#taskName')).toHaveCSS('border-radius', radius);
            await expect(page.locator('#taskModal .modal-content')).toHaveCSS('border-radius', style === 'modern' ? '9px' : '0px');
            await capture('editor');
            await page.locator('#taskModalCancelBtn').click();
            await page.keyboard.press('Control+k');
            await expect(page.locator('#commandPalette')).toBeVisible();
            await expect(page.locator('.palette')).toHaveCSS('border-radius', style === 'modern' ? '9px' : '0px');
            await capture('palette');
        });
    }
}


test('standalone HTML restores both preferences and switches themes offline', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('teamOsKanbanThemeStyle', 'modern');
        localStorage.setItem('teamOsKanbanTheme', 'dark');
    });
    await page.goto(new URL('../../dist-standalone/index.html', import.meta.url).href);
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'modern');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await chooseTheme(page, 'Classic');
    await expect(page.locator('html')).toHaveAttribute('data-theme-style', 'classic');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
