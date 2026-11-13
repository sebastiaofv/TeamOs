import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, portfolioCard } from '../support/portfolio';

async function seedPlanner(page: Page, many = false) {
    await page.clock.setFixedTime('2026-11-05T12:00:00Z');
    await seedPortfolioBoards(page, [{ id: 'adapt', title: 'Adaptive workspace', hasHandle: true,
        tasks: Array.from({ length: many ? 30 : 1 }, (_, i) => ({ id: i + 1, title: `Workitem ${i + 1}`, status: 'to-do' })),
        extensions: { dayPlanner: { version: 1, blocks: [{ id: 'block', taskId: 1, date: '2026-11-05', start: '09:00', end: '10:00' }] } }
    }], { selectedBoardId: 'adapt' });
    await page.locator('[data-view-mode="planner"]').click();
}

async function touchGesture(page: Page, from: {x: number; y: number}, to: {x: number; y: number}, cancel = false, hold = 0) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    if (hold) await page.waitForTimeout(hold);
    for (let i = 1; i <= 6; i++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 6, y: from.y + (to.y - from.y) * i / 6, id: 1 }] });
        await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await session.detach();
}

test.describe('touch adaptation', () => {
    test.use({ hasTouch: true });
    for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) {
        test(`${style}/${mode} keeps touch controls and narrow menus usable`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width: 320, height: 740 });
            await page.addInitScript(({ style, mode }) => {
                localStorage.setItem('teamOsKanbanThemeStyle', style);
                localStorage.setItem('teamOsKanbanTheme', mode);
            }, { style, mode });
            await gotoApp(page);
            await seedPortfolioBoards(page, [{ id: 'touch', title: 'Touch', hasHandle: true, tasks: [{ id: 1, title: 'Touch workitem', status: 'to-do' }] }], { selectedBoardId: 'touch' });
            for (const selector of ['#appSettingsBtn', '#openShortcutsBtn', '.workitem-board-actions > .btn', '#portfolioFiltersBtn']) {
                const bounds = await page.locator(selector).boundingBox();
                expect(bounds!.height).toBeGreaterThanOrEqual(44);
            }
            const card = portfolioCard(page, 'Touch workitem');
            await card.scrollIntoViewIfNeeded();
            await card.tap();
            await expect(page.locator('#taskDetailModal')).toBeVisible();
            await page.keyboard.press('Escape');
            await page.locator('[data-view-mode="table"]').tap();
            for (const selector of ['.table-columns']) {
                const disclosure = page.locator(`#portfolioTable ${selector}`);
                await disclosure.locator(':scope > button').tap();
                const panel = await disclosure.locator('[data-table-panel]').boundingBox();
                expect(panel!.x).toBeGreaterThanOrEqual(0);
                expect(panel!.x + panel!.width).toBeLessThanOrEqual(320);
                await page.screenshot({ path: testInfo.outputPath(`${selector.slice(1)}.png`) });
                await page.keyboard.press('Escape');
            }
            await page.locator('[data-view-mode="planner"]').tap();
            await page.getByRole('button', { name: 'Week', exact: true }).tap();
            const headers = page.locator('.planner-day-header');
            expect(await headers.first().evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(96);
            const week = page.locator('.planner-week');
            await week.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
            expect(await week.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
            const left = await headers.first().evaluate((el) => el.getBoundingClientRect().left);
            const day = await page.locator('[data-planner-date]').first().evaluate((el) => el.getBoundingClientRect().left);
            expect(Math.abs(left - day)).toBeLessThan(2);
        });
    }

    test('a long press moves a Board card and a swipe scrolls its columns', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1100 });
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'board-touch', title: 'Touch Board', hasHandle: true,
            tasks: [{ id: 1, title: 'Move by touch', status: 'to-do' }] }], { selectedBoardId: 'board-touch' });
        const card = portfolioCard(page, 'Move by touch');
        const source = (await card.locator('.task-title').boundingBox())!;
        const target = (await page.locator('#portfolio-backlog-column').boundingBox())!;
        await touchGesture(page, { x: source.x + 50, y: source.y + 10 }, { x: target.x + target.width / 2, y: source.y + 10 }, false, 250);
        await expect(card).toHaveAttribute('data-status', 'backlog');
        await expect.poll(async () => (await readSavedBoard(page, 'board-touch')).board.tasks[0].status).toBe('backlog');
        const columns = page.locator('.workitem-board-columns');
        await page.setViewportSize({ width: 600, height: 1100 });
        const bounds = (await columns.boundingBox())!;
        await touchGesture(page, { x: 550, y: bounds.y + 20 }, { x: 150, y: bounds.y + 20 });
        await expect.poll(() => columns.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    });

    test('native touch scrolls the task tray and moves a block; cancellation permits another drag', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1100 });
        await gotoApp(page);
        await seedPlanner(page, true);
        const tray = page.locator('.planner-tray-list');
        const bounds = (await tray.boundingBox())!;
        const start = { x: bounds.x + bounds.width / 2, y: bounds.y + Math.min(180, bounds.height - 16) };
        await touchGesture(page, start, { x: start.x, y: start.y - 100 });
        await expect.poll(() => tray.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        const block = page.locator('[data-block-id="block"]');
        await block.scrollIntoViewIfNeeded();
        const drag = async (delta: number, cancel = false) => {
            const box = (await block.boundingBox())!;
            const from = { x: box.x + box.width / 2, y: box.y + 16 };
            await touchGesture(page, from, { x: from.x, y: from.y + delta }, cancel);
        };
        const savedStart = async () => (await readSavedBoard(page, 'adapt')).extensions.dayPlanner.blocks[0].start;
        await drag(48);
        await expect.poll(savedStart).toBe('09:30');
        await drag(48, true);
        await expect(block).not.toHaveClass(/dragging/);
        expect(await savedStart()).toBe('09:30');
        await drag(24);
        await expect.poll(savedStart).toBe('09:45');
    });
});

test('short landscape windows can scroll past the toolbar to complete Board cards', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'landscape', title: 'Landscape', hasHandle: true, tasks: [{ id: 1, title: 'Reachable', status: 'to-do' }] }], { selectedBoardId: 'landscape' });
    const columns = page.locator('.workitem-board-columns');
    expect(await columns.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(260);
    const card = portfolioCard(page, 'Reachable');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
    await card.click(); await page.locator('#taskDetailEditBtn').click();
    await expect(page.locator('#taskModal')).toBeVisible();
});

test('foreign pointers and window blur cannot commit or retain a Planner drag', async ({ page }) => {
    await gotoApp(page);
    await seedPlanner(page);
    const block = page.locator('[data-block-id="block"]');
    const box = (await block.boundingBox())!;
    const event = { pointerId: 10, isPrimary: true, pointerType: 'touch', button: 0, clientX: box.x + 50, clientY: box.y + 16 };
    const start = async () => block.dispatchEvent('pointerdown', event);
    await start();
    await page.evaluate((event) => window.dispatchEvent(new PointerEvent('pointermove', { ...event, pointerId: 11, isPrimary: false, clientY: event.clientY + 96 })), event);
    await expect(block).not.toHaveClass(/dragging/);
    await page.evaluate((event) => window.dispatchEvent(new PointerEvent('pointermove', { ...event, clientY: event.clientY + 48 })), event);
    await expect(block).toHaveClass(/dragging/);
    await page.evaluate((event) => window.dispatchEvent(new PointerEvent('pointerup', { ...event, pointerId: 11, isPrimary: false })), event);
    await expect(block).toHaveClass(/dragging/);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(block).not.toHaveClass(/dragging/);
    expect((await readSavedBoard(page, 'adapt')).extensions.dayPlanner.blocks[0].start).toBe('09:00');
    await start();
    await page.evaluate((event) => {
        window.dispatchEvent(new PointerEvent('pointermove', { ...event, clientY: event.clientY + 24 }));
        window.dispatchEvent(new PointerEvent('lostpointercapture', event));
    }, event);
    await expect(block).not.toHaveClass(/dragging/);
    expect((await readSavedBoard(page, 'adapt')).extensions.dayPlanner.blocks[0].start).toBe('09:00');
    await start();
    await page.evaluate((event) => {
        window.dispatchEvent(new PointerEvent('pointermove', { ...event, clientY: event.clientY + 24 }));
        window.dispatchEvent(new PointerEvent('pointerup', { ...event, clientY: event.clientY + 24 }));
    }, event);
    await expect.poll(async () => (await readSavedBoard(page, 'adapt')).extensions.dayPlanner.blocks[0].start).toBe('09:15');
});


test('Table menus open above their trigger in landscape and stay within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'menus', title: 'Menus', hasHandle: true,
        tasks: [{ id: 1, title: 'Visible workitem', status: 'to-do' }] }], { selectedBoardId: 'menus' });
    await page.locator('[data-view-mode="table"]').click();
    for (const selector of ['.table-columns']) {
        const menu = page.locator(`#portfolioTable ${selector}`);
        await menu.locator(':scope > button').click();
        const panel = menu.locator('[data-table-panel]');
        await expect(panel).toBeVisible();
        await expect.poll(() => panel.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(390);
        const bounds = (await panel.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(390);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(844);
        expect(bounds.height).toBeGreaterThan(80);
        await page.keyboard.press('Escape');
        await expect(menu.locator(':scope > button')).toBeFocused();
    }
});
