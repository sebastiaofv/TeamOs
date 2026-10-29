import { showTimeline } from '../support/portfolio';
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
    await expect(page.locator('.history-operation')).toHaveText('Fields and content · 2 changes');
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

for (const language of ['en', 'pt'] as const) {
    test(`history titles count the complete grouped operation and preserve specific operations (${language})`, async ({ page }) => {
        const fixture = JSON.parse(readFileSync('test-board/us-6.board.json', 'utf8'));
        const baseline = fixture.extensions.timeline.events[0];
        const initialTask = baseline.snapshot.board.tasks[0];
        baseline.snapshot.board.tasks = baseline.snapshot.board.tasks.filter((task: { id: number }) => task.id !== 601);
        const event = (id: string, kind: string, changes?: Record<string, { before: unknown; after: unknown }>, operationId = id) => ({
            id, kind, ...(changes ? { changes } : {}), entityType: 'task', entityId: '601', at: '2026-10-19T10:00:00.000Z', summary: id, meta: { operationId }
        });
        fixture.extensions.timeline.events = [baseline,
            { ...event('created', 'task.created'), snapshot: initialTask },
            event('people', 'task.updated', { assignees: { before: [], after: ['Ana'] }, responsible: { before: '', after: 'Ana' } }),
            event('status', 'task.status.changed', { status: { before: 'to-do', after: 'done' } }),
            event('multi-fields', 'task.updated', {
                title: { before: 'Release draft', after: 'Release ready' },
                description: { before: 'Draft acceptance', after: 'Clarified acceptance' },
                priority: { before: null, after: 'high' }
            }, 'multi'),
            event('multi-people', 'task.updated', { assignees: { before: ['Ana'], after: ['Ana', 'Bruno'] } }, 'multi'),
            event('multi-status', 'task.status.changed', { status: { before: 'done', after: 'doing' } }, 'multi'),
            event('archived', 'task.archived', { archived: { before: false, after: true } }),
            event('unarchived', 'task.restored', { archived: { before: true, after: false } })
        ];
        fixture.board.tasks[0].status = 'doing';
        fixture.board.tasks[0].assignees = ['Ana', 'Bruno'];
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
        if (language === 'pt') await page.locator('#languageToggleBtn').click();
        await portfolioCard(page, 'Release ready').click();
        await page.getByRole('tab', { name: language === 'pt' ? 'Histórico' : 'History', exact: true }).click();
        const titles = language === 'pt'
            ? ['Workitem desarquivado', 'Workitem arquivado', '3 categorias · 5 alterações', 'Estado', 'Pessoas · 2 alterações', 'Workitem criado']
            : ['Workitem unarchived', 'Workitem archived', '3 categories · 5 changes', 'Status', 'People · 2 changes', 'Workitem created'];
        await expect(page.locator('.history-operation')).toHaveText(titles);
        const multi = page.locator('.history-entry').filter({ has: page.locator('.history-operation', { hasText: titles[2] }) });
        await multi.locator('summary').click();
        await expect(multi.locator('.history-change')).toHaveCount(5);
        await expect(multi).toContainText('Draft acceptance');
        await expect(multi).toContainText('Bruno');
        const metadata = await multi.locator('.history-entry-meta').textContent();
        const filter = page.getByLabel(language === 'pt' ? 'Categoria' : 'Category', { exact: true });
        for (const category of ['fields', 'people', 'status']) {
            await filter.selectOption(category);
            await expect(multi).toHaveCount(1);
            await expect(multi.locator('.history-operation')).toHaveText(titles[2]);
            await expect(multi.locator('.history-change')).toHaveCount(5);
            await expect(multi.locator('.history-entry-meta')).toHaveText(metadata!);
        }
        await filter.selectOption('all');
        await expect(page.locator('.history-operation')).toHaveText(titles);
    });
}

test('historical history uses the canonical position even with equal or inverted timestamps', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-6.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await showTimeline(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 1);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Show tasks for Build at date', exact: true }).click();
    await page.locator('[data-roadmap-task-list="phase:build"]').getByRole('button', { name: 'Release ready', exact: true }).click();
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
