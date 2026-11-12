import { readFileSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard } from '../support/portfolio';

const fixture = JSON.parse(readFileSync('tests/fixtures/manual/us-24.board.json', 'utf8'));
const control = JSON.parse(readFileSync('tests/fixtures/project-control-v2.json', 'utf8'));
test.describe.configure({ mode: 'parallel' });

for (const style of ['classic', 'modern']) for (const theme of ['light', 'dark']) {
    test(`WCAG 2.2 AA main views and dialogs (${style}/${theme})`, async ({ page }, testInfo) => {
        test.setTimeout(180_000);
        await page.clock.setFixedTime('2026-11-05T12:00:00Z');
        await page.addInitScript(({ style, theme }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', theme);
        }, { style, theme });
        await gotoApp(page);
        const findings: { view: string; id: string; nodes: unknown[] }[] = [];
        async function audit(view: string) {
            await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
            const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
            findings.push(...result.violations.map(({ id, nodes }) => ({ view, id, nodes: nodes.map(({ target, html, failureSummary, any }) => ({ target, html, failureSummary, checks: any.map(({ data }) => data) })) })));
            writeFileSync(testInfo.outputPath('findings.json'), JSON.stringify(findings, null, 2));
        }
        await audit('empty');
        await seedPortfolioBoards(page, [{ id: 'a11y', title: fixture.board.settings.title, hasHandle: true,
            tasks: fixture.board.tasks, extensions: { ...fixture.extensions, projectControl: control,
                workflow: { ...fixture.extensions.workflow, states: fixture.extensions.workflow.states.map((state: { id: string }) => state.id === 'testing' ? { ...state, color: '#787878' } : state) },
                dayPlanner: { version: 1, blocks: [{ id: 'contrast-block', taskId: 1206, date: '2026-11-05', start: '09:00', end: '10:00' }] }
            }
        }], { selectedBoardId: 'a11y' });
        await page.locator('#projectPickerBtn').click();
        await audit('project picker');
        await page.keyboard.press('Escape');
        for (const view of ['board', 'table', 'roadmap', 'planner', 'control', 'dashboard']) {
            await page.locator(`[data-view-mode="${view}"]`).click();
            if (view === 'board') await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
            await audit(view);
            if (view === 'board' || view === 'planner') await page.screenshot({ path: testInfo.outputPath(`${view}-${style}-${theme}.png`) });
            if (view === 'planner') {
                await page.getByRole('button', { name: 'Calendar', exact: true }).click();
                await audit('calendar');
            }
            if (view === 'table') {
                await page.locator('#portfolioFiltersBtn').click();
                await audit('filters');
                await page.keyboard.press('Escape');
                await page.locator('#tableColumns > button').click();
                await audit('columns');
                await page.keyboard.press('Escape');
            }
        }
        await page.locator('[data-view-mode="board"]').click();
        await portfolioCard(page, fixture.board.tasks.find((task: { type: string }) => task.type === 'task').title).click();
        await audit('task detail');
        for (const tab of ['relations', 'comments', 'attachments', 'pullRequests', 'history', 'details']) {
            await page.locator(`#task-tab-${tab}`).click();
            await audit(`task ${tab}`);
        }
        await page.locator('#taskDetailEditBtn').click();
        await audit('task editor');
        await page.keyboard.press('Escape');
        await page.locator('#portfolioSearchBtn').click();
        await audit('command palette');
        await page.keyboard.press('Escape');
        await page.locator('#appSettingsBtn').click();
        await audit('app settings');
        await page.keyboard.press('Escape');
        await page.locator('#docsToggleBtn').click();
        await audit('docs');
        await testInfo.attach('accessibility-findings', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' });
        expect(findings).toEqual([]);
    });
}

test('keyboard opens cards and menus, restores focus and exposes contextual icon labels', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'keys', title: 'Keyboard', hasHandle: true, members: ['Ana'], tags: ['ux'],
        tasks: [{ id: 1, title: 'Keyboard task', status: 'to-do', assignees: ['Ana'], tags: ['ux'] }]
    }], { selectedBoardId: 'keys' });
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
    const card = portfolioCard(page, 'Keyboard task');
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    const actions = page.locator('#taskDetailModal').getByLabel('Task actions', { exact: true });
    await actions.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Copy to project…', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Move to project…', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(actions).toBeFocused();
    await page.locator('#taskDetailEditBtn').click();
    await expect(page.getByRole('button', { name: 'Remove participant: Ana', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove tag: ux', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    if (await page.locator('#taskDetailModal').count()) await page.keyboard.press('Escape');
    await page.locator('[data-view-mode="table"]').click();
    const columns = page.getByRole('button', { name: 'Columns', exact: true });
    await columns.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Columns', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(columns).toBeFocused();
    await expect(columns).toHaveCSS('outline-style', 'solid');
    await expect(columns).toHaveCSS('outline-width', '2px');
});

test('keyboard dragging changes a board status and persists it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'drag-keys', title: 'Keyboard drag', hasHandle: true,
        tasks: [{ id: 1, title: 'Move with keyboard', status: 'to-do' }]
    }], { selectedBoardId: 'drag-keys' });
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
    const card = portfolioCard(page, 'Move with keyboard');
    await card.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.drag-overlay')).toBeVisible();
    // The keyboard sensor registers its document listener on the next task.
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#portfolio-doing-column')).toHaveClass(/drag-over/);
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('data-status', 'doing');
    await expect.poll(async () => (await readSavedBoard(page, 'drag-keys')).board.tasks[0].status).toBe('doing');
});

test('reduced motion removes CSS and drag-library transitions while saving remains explicit', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'motion', title: 'Motion', hasHandle: true,
        tasks: [{ id: 1, title: 'Motion task', status: 'to-do' }]
    }], { selectedBoardId: 'motion' });
    await page.getByRole('checkbox', { name: 'Active Sprints only' }).uncheck();
    await expect(portfolioCard(page, 'Motion task')).toHaveCSS('transition-duration', '0s');
    await page.locator('[data-view-mode="table"]').click();
    await page.getByRole('button', { name: 'Columns', exact: true }).click();
    const titleHandle = page.getByRole('button', { name: 'Drag Title to reorder', exact: true });
    await titleHandle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-column-choice="title"]')).toHaveCSS('transition-duration', '0s');
    await page.keyboard.press('Space');
    const spinner = await page.evaluate(() => {
        const node = document.createElement('span'); node.className = 'save-spinner'; document.body.append(node);
        const result = { animation: getComputedStyle(node).animationName, style: getComputedStyle(node).borderTopStyle }; node.remove(); return result;
    });
    expect(spinner).toEqual({ animation: 'none', style: 'dotted' });
});
