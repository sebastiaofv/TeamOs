import { setDashboardDate } from '../support/dashboard';
import { test, expect, type Page } from '@playwright/test';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { gotoApp, identifyOpenProjects, seedPortfolioBoards, selectPortfolioBoard } from '../support/portfolio';
import { mockFolderPicker } from '../support/folderProjects';
import { attachmentsToHashes, toProjectFile } from '../../src/domain/projectFormat';
import { createHistoryWriter, eventToFile, serializeHistoryFile } from '../../src/domain/projectHistoryFormat';

async function openLargeProject(page: Page, tasks: number, events: number) {
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
    await gotoApp(page);
    const data = createEmptyProjectData('Performance regression', 'PERF');
    data.meta.createdAt = data.meta.updatedAt = '2026-11-03T10:00:00.000Z';
    data.extensions.project!.members = [{ id: 'tester', name: 'Tester' }];
    data.board.tasks = Array.from({ length: tasks }, (_, index) => normalizeTask({ id: index + 1, title: `Workitem ${index + 1}`, type: 'task', status: 'backlog', createdAt: data.meta.createdAt, updatedAt: data.meta.updatedAt }));
    ensureBoardTimelineBaseline(data)!.events.push(...Array.from({ length: events }, (_, index) => ({ id: `event-${index}`, at: '2026-11-09T10:00:00.000Z', kind: 'task.updated', entityType: 'task' as const, entityId: '2', summary: 'Priority changed', changes: { priority: { before: index % 2 ? 'high' : 'low', after: index % 2 ? 'low' : 'high' } } })));
    data.board.tasks[1].priority = events % 2 ? 'high' : 'low';
    const project = serializeBoardDataFromObject(data);
    const timeline = project.extensions.timeline!;
    delete project.extensions.timeline;
    project.extensions.projectStorage = { version: 1, baselineEventId: timeline.baselineEventId };
    const writer = createHistoryWriter(undefined);
    await mockFolderPicker(page, { directories: ['', 'perf', 'perf/attachments'], files: {
        'perf/project.json': [...Buffer.from(JSON.stringify(attachmentsToHashes(toProjectFile(project))))],
        'perf/history.json': [...Buffer.from(serializeHistoryFile(project.extensions.project!.id, timeline.baselineEventId, timeline.events.map((event) => eventToFile(event, writer)), {}))]
    } }, 'perf');
    await page.locator('#importProjectsBtn').click();
    await expect(page.locator('#projectIdentityModal')).toBeVisible();
    await identifyOpenProjects(page);
    await selectPortfolioBoard(page, 'Performance regression');
    await page.locator('.board-active-sprints input').uncheck();
    await expect(page.locator('.portfolio-task-card')).toHaveCount(tasks);
    await page.locator('.portfolio-task-card[data-task-id="1"]').click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('#commentText')).toBeVisible();
}

async function paintedClick(page: Page, selector: string) {
    return page.evaluate(async (selector) => {
        const target = document.querySelector<HTMLElement>(selector);
        if (!target) throw new Error(`Missing target: ${selector}`);
        const start = performance.now();
        target.click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return performance.now() - start;
    }, selector);
}

test('a hydrated 1000-event Dashboard stays within its interaction budget and retains historical consultation through dates', async ({ page }, testInfo) => {
    await openLargeProject(page, 20, 1000);
    await page.locator('#taskDetailModalCloseBtn').click();
    const elapsed = await paintedClick(page, '[data-view-mode="dashboard"]');
    await expect(page.locator('#portfolioDashboard .dashboard-history')).toHaveCount(0);
    expect(elapsed).toBeLessThan(2000);
    testInfo.annotations.push({ type: 'Dashboard interaction', description: `${Math.round(elapsed)} ms; 20 workitems, 1000 events` });
    expect(await page.evaluate(() => window.__folderDisk.fullReads['perf/history.json'])).toBe(1);
    await setDashboardDate(page, 'Start date', '03/11/2026');
    await setDashboardDate(page, 'End date', '03/11/2026');
    await expect(page.locator('#portfolioDashboard [role="status"]').first()).toContainText('2026-11-03');
});

test('opening details after loading 10000 events stays fast and preserves comment drafts and history consultation', async ({ page }, testInfo) => {
    await openLargeProject(page, 100, 10000);
    await page.locator('#commentText').fill('Draft survives tab changes');
    await page.getByRole('tab', { name: 'Relations', exact: true }).click();
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('#commentText')).toHaveValue('Draft survives tab changes');
    await page.locator('#taskDetailModalCloseBtn').click();
    const elapsed = await paintedClick(page, '.portfolio-task-card[data-task-id="1"]');
    await expect(page.locator('#detailTitle')).toHaveText('Workitem 1');
    expect(elapsed).toBeLessThan(1000);
    testInfo.annotations.push({ type: 'Details interaction', description: `${Math.round(elapsed)} ms; 100 workitems, 10000 events` });
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('#commentText')).toHaveValue('Draft survives tab changes');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.task-history')).toBeVisible();
    await expect(page.locator('.history-entry')).toHaveCount(0);
    expect(await page.evaluate(() => window.__folderDisk.fullReads['perf/history.json'])).toBe(1);
});

test('switching views preserves an expanded Sprint and its table state', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Sprint navigation', hasHandle: true,
        tasks: [{ id: 1, title: 'Participating workitem', sprintId: 'sprint' }],
        extensions: { roadmap: { version: 5, phases: [], milestones: [], sprints: [{ id: 'sprint', title: 'Delivery', status: 'active', startDate: '2026-11-01', endDate: '2026-11-14' }] } }
    }], { selectedBoardId: 'p' });
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    const sprint = page.locator('[data-table-sprint="sprint"]');
    await sprint.locator('.roadmap-disclosure-btn').click();
    await expect(sprint).toHaveAttribute('open', '');
    await expect(sprint.getByRole('button', { name: 'Participating workitem', exact: true })).toBeVisible();
    await page.locator('[data-view-mode="board"]').click();
    await page.locator('[data-view-mode="table"]').click();
    await expect(sprint).toHaveAttribute('open', '');
    await expect(sprint.getByRole('button', { name: 'Participating workitem', exact: true })).toBeVisible();
});
