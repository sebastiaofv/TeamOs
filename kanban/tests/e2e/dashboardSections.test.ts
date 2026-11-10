import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, toggleTheme } from '../support/portfolio';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { LANGUAGE_STORAGE_KEY } from '../../src/domain/constants';

const section = (page: Page, key: string) => page.locator(`[data-dashboard-section="${key}"]`);
async function seed(page: Page, writable = true) {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: writable, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByLabel('Start date', { exact: true }).fill('24/10/2026');
}

test('overview and four activity widgets appear in the requested order; visibility affects entire sections and supports all/none', async ({ page }) => {
    await seed(page);
    const keys = ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'workitemStatus', 'epics', 'activitySummary', 'started', 'completedInPeriod', 'currentlyInProgress', 'openRisks', 'deliverables', 'decisions'];
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(13);
    expect(await page.locator('[data-dashboard-section]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-dashboard-section')))).toEqual(keys);
    const summary = page.locator('.dashboard-visible-sections summary');
    const start = page.getByLabel('Start date', { exact: true });
    expect((await summary.boundingBox())!.x).toBeLessThan((await start.boundingBox())!.x);
    await summary.click();
    const filter = page.locator('.dashboard-visible-sections');
    await expect(filter.getByRole('checkbox')).toHaveCount(13);
    await filter.getByRole('checkbox', { name: 'Workitem status', exact: true }).uncheck();
    await expect(section(page, 'workitemStatus')).toHaveCount(0);
    await expect(section(page, 'projectProgress')).toBeVisible();
    await filter.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(0);
    await filter.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(13);
    await expect(section(page, 'started').locator('tbody tr')).toHaveCount(3);
});

test('period activity includes Bugs, actual transition dates and end-date responsibility', async ({ page }) => {
    await seed(page);
    await page.getByLabel('End date', { exact: true }).fill('30/10/2026');
    const started = section(page, 'started');
    const completed = section(page, 'completedInPeriod');
    await expect(started.locator('tbody tr')).toHaveCount(3);
    await expect(started).toContainText('Story started then completed');
    await expect(started).toContainText('Independent task started');
    await expect(started.locator('tr', { hasText: 'Story started then completed' })).toContainText('Marta');
    await expect(started.locator('tr', { hasText: 'Independent task started' })).toContainText('25/10/2026');
    await expect(started.locator('thead th')).toHaveText(['Type', 'ID', 'Title', 'Responsible', 'Started on']);
    await expect(completed.locator('tbody tr')).toHaveCount(2);
    await expect(completed).toContainText('Independent completed at end boundary');
    await expect(started).not.toContainText('Child task excluded');
    await expect(started).toContainText('Bug excluded');
    await expect(section(page, 'activitySummary').locator('strong')).toHaveText(['3', '2', (await section(page, 'currentlyInProgress').locator('.dashboard-activity-count').innerText()).trim()]);
    await expect(section(page, 'currentlyInProgress')).toContainText('Independent task started');
    await expect(section(page, 'currentlyInProgress')).not.toContainText('Story started then completed');
    await started.getByRole('button', { name: 'Independent task started', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toContainText('Testing');
    await page.keyboard.press('Escape');
    await page.getByLabel('Start date', { exact: true }).fill('26/10/2026');
    await expect(started.locator('tbody tr')).toHaveCount(1); // The Bug starts on 28/10; Doing → Testing is not another start.
    await expect(started).toContainText('Bug excluded');
    await page.getByLabel('End date', { exact: true }).fill('29/10/2026');
    await expect(completed.locator('tbody tr')).toHaveCount(0);
    await expect(section(page, 'currentlyInProgress')).toContainText('Story started then completed');
});

test('historical controls show risks and decisions still open at end date and deliveries in the period', async ({ page }) => {
    await seed(page);
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(1);
    await expect(section(page, 'decisions').locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'decisions').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'deliverables').locator('tbody tr')).toHaveCount(2);
    await expect(section(page, 'deliverables')).toContainText('Accepted delivery in period');
    await expect(section(page, 'deliverables')).not.toContainText('Accepted before period');
    await expect(section(page, 'openRisks')).toContainText('High');
    for (const [key, title, status] of [['openRisks', 'Risk closed after period', 'Open'], ['deliverables', 'Accepted delivery in period', 'Accepted'], ['decisions', 'Decision resolved after period', 'Proposed']]) {
        await section(page, key).getByRole('button', { name: title, exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText(title);
        await expect(dialog.getByLabel('Status', { exact: true })).toHaveValue(status.toLowerCase());
        await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    }
    await expect(page.getByLabel('Planning scope', { exact: true })).toHaveCount(0);
});

test('phases and milestones are independent compact widgets with dates, progress and navigation', async ({ page }) => {
    await seed(page);
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    const phases = section(page, 'activePhases');
    for (const title of ['Overdue parent phase', 'Delivery programme', 'API delivery', 'UX delivery', 'Future parent phase']) await expect(phases).toContainText(title);
    await expect(phases).not.toContainText('Completed parent phase');
    await expect(phases.locator('[data-dashboard-planning="late"]')).toContainText('Overdue');
    await expect(phases.locator('[data-dashboard-planning="api"]')).toContainText('On Target');
    await expect(phases.locator('[data-dashboard-planning="api"]')).toContainText('01/10/2026');
    const milestones = section(page, 'milestones');
    await expect(milestones.locator('[data-dashboard-planning="late-milestone"] .dashboard-warning')).toBeVisible();
    await expect(milestones.locator('[data-dashboard-planning="late-milestone"]')).toContainText('0%');
    await expect(milestones).toContainText('Next unassigned checkpoint');
    await milestones.getByRole('button', { name: 'Next unassigned checkpoint', exact: true }).click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Next unassigned checkpoint');
});

test('stacked horizontal bars distinguish actual workflow states and exclude child Tasks', async ({ page }) => {
    await seed(page);
    await expect(section(page, 'workitemStatus').getByRole('img')).toHaveCount(3);
    const tasks = page.locator('[data-dashboard-statistics="task"]');
    await expect(tasks.getByRole('img')).toHaveAccessibleName(/Independent Tasks:.*Testing 1/);
    await expect(tasks.getByRole('img')).toHaveAccessibleName(/Independent Tasks:.*In progress 3/);
    await tasks.getByRole('button', { name: /Testing 1/, exact: false }).click();
    await expect(page.locator('#dashboardSources tbody tr')).toHaveCount(1);
    await expect(page.locator('#dashboardSources')).toContainText('Independent task started');
    await expect(page.locator('#dashboardSources')).not.toContainText('Child task excluded');
});

test('started Epics use their own status and shared progress and open historical details', async ({ page }) => {
    await seed(page);
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    const epics = section(page, 'epics');
    await expect(epics.locator('tbody tr')).toHaveCount(1);
    await expect(epics).toContainText('0%');
    await expect(epics.getByRole('progressbar')).toHaveAttribute('value', '0');
    await epics.locator('tbody td').first().getByRole('button').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal [id="detailStatus"]')).toContainText('In progress');
});

test('active sprint displays shared planning-unit completion, dates and navigation; absence is explicit', async ({ page }) => {
    await seed(page);
    const sprint = section(page, 'activeSprint');
    await expect(sprint).toContainText('Sprint 2 - Implementation');
    await expect(sprint).toContainText('15/10/2026');
    await expect(sprint).toContainText('05/11/2026');
    await expect(sprint).toContainText('User Stories1');
    await expect(sprint).toContainText('Planned SP / capacity0 / N/A');
    await expect(sprint).toContainText('Completed SP0');
    await expect(sprint).toContainText('On Target');
    await expect(sprint).toContainText('0%'); // Story validation and independent Task are still open.
    await sprint.getByRole('button', { name: 'Sprint 2 - Implementation', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="sprint:active"]')).toBeVisible();
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByLabel('Start date', { exact: true }).fill('14/10/2026');
    await page.getByLabel('End date', { exact: true }).fill('14/10/2026');
    await expect(page.locator('#portfolioDashboard')).toContainText('no historical baseline');
});

test('active Sprint SP/capacity and missed deadlines remain visible, alongside late-start phases', async ({ page }) => {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    data.extensions.roadmap.sprints.find((item: { id: string }) => item.id === 'active').status = 'active';
    data.extensions.roadmap.sprints.find((item: { id: string }) => item.id === 'active').capacity = 10;
    data.extensions.roadmap.phases.push({ id: 'late-start', title: 'Waiting for kickoff', startDate: '2026-10-01', endDate: '2026-12-01' });
    data.board.tasks.find((task: { id: number }) => task.id === 902).storyPoints = 8;
    data.board.tasks.find((task: { id: number }) => task.id === 905).storyPoints = 3;
    data.board.tasks.find((task: { id: number }) => task.id === 904).status = 'accepted';
    await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'deadline', title: 'Deadline checks', hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'deadline' });
    await page.locator('[data-view-mode="dashboard"]').click();
    const sprint = page.locator('[data-dashboard-active-sprint="active"]');
    await expect(sprint).toContainText('11 / 10');
    await expect(sprint).toContainText('Completed SP8');
    await expect(sprint).toContainText('Overdue');
    await expect(page.locator('[data-dashboard-planning="late-start"]')).toContainText('Late');
    await expect(page.locator('[data-dashboard-planning="late-start"]')).toContainText('01/10/2026');
});

for (const theme of ['light', 'dark']) test(`Portuguese read-only sections remain usable at mobile width (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((key) => localStorage.setItem(key, 'pt'), LANGUAGE_STORAGE_KEY);
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    if (theme === 'dark') await toggleTheme(page);
    await expect(page.getByRole('heading', { name: 'Estado dos workitems', exact: true })).toBeVisible();
    await expect(section(page, 'decisions')).toContainText('Pending architecture decision');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await section(page, 'openRisks').getByRole('button', { name: 'Open high risk', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Open high risk');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `test-results/dashboard-sections-mobile-pt-${theme}.png`, fullPage: true });
});

test('consultation leaves the project file untouched', async ({ page }) => {
    await seed(page);
    const before = await readSavedBoard(page, 'sections');
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await section(page, 'openRisks').getByRole('button', { name: 'Risk closed after period', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('[data-dashboard-kpi="progress"]').click();
    await page.locator('#dashboardSources tbody button').first().click();
    await page.keyboard.press('Escape');
    expect(await readSavedBoard(page, 'sections')).toEqual(before);
});

test('standalone Dashboard supports offline historical widgets and detail navigation', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await context.setOffline(true);
    await page.goto(new URL('../../dist-standalone/index.html', import.meta.url).href);
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'offline', title: data.board.settings.title, hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'offline' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await page.getByLabel('Start date', { exact: true }).fill('24/10/2026');
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(13);
    await expect(section(page, 'projectProgress')).toContainText('30.8%');
    await section(page, 'milestones').getByRole('button', { name: 'Next unassigned checkpoint', exact: true }).click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Next unassigned checkpoint');
    expect(errors).toEqual([]);
});

test('summary and View All open full Testing lists while previews remain limited to five rows', async ({ page }) => {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    const template = data.board.tasks.find((task: { id: number }) => task.id === 911);
    const tasks = Array.from({ length: 8 }, (_, index) => ({ ...template, id: 930 + index, displayId: `ATL-TK-${930 + index}`, permanentId: `activity-${index}`, title: `Activity workitem ${index + 1} with a long descriptive title`, status: 'testing', phaseId: '', phaseMode: 'none', sprintId: '' }));
    data.board.tasks = tasks;
    data.extensions.workflow.states.find((state: { id: string }) => state.id === 'testing').category = 'testing';
    data.extensions.workflow.references.testing = 'testing';
    data.extensions.timeline = { version: 1, baselineEventId: 'activity-baseline', events: [
        { id: 'activity-baseline', at: '2026-10-15T12:00:00.000Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Baseline', snapshot: { meta: data.meta, board: { ...data.board, tasks: tasks.map((task) => ({ ...task, status: 'to-do' })) }, extensions: { workflow: data.extensions.workflow } } },
        ...tasks.map((task, index) => ({ id: `started-${index}`, at: '2026-11-03T12:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: String(task.id), summary: 'Started Testing', changes: { status: { before: 'to-do', after: 'testing' } } }))
    ] };
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'activity', title: 'Activity previews', hasHandle: true, tasks, extensions: { workflow: data.extensions.workflow, timeline: data.extensions.timeline } }], { selectedBoardId: 'activity' });
    await page.locator('[data-view-mode="dashboard"]').click();
    const before = await readSavedBoard(page, 'activity');
    await expect(section(page, 'started').locator('tbody tr')).toHaveCount(5);
    await expect(section(page, 'currentlyInProgress').locator('tbody tr')).toHaveCount(5);
    await expect(section(page, 'activitySummary').locator('strong')).toHaveText(['8', '0', '8']);
    await expect(section(page, 'currentlyInProgress')).toContainText('Testing');
    await section(page, 'started').getByRole('button', { name: 'View All (8)', exact: true }).click();
    await expect(page.locator('#dashboardSources tbody tr')).toHaveCount(8);
    await expect(page.locator('#dashboardSources')).toContainText('03/11/2026');
    await page.locator('#dashboardSources tbody tr').last().getByRole('button', { name: tasks[7].title, exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toContainText(tasks[7].title);
    await page.keyboard.press('Escape');
    await section(page, 'activitySummary').getByRole('button', { name: /In Progress/ }).click();
    await expect(page.locator('#dashboardSources tbody tr')).toHaveCount(8);
    await expect(page.locator('#dashboardSources')).toContainText('Testing');
    expect(await readSavedBoard(page, 'activity')).toEqual(before);
});

test('activity visibility/order are saved in the project and reset without changing workitems', async ({ page }) => {
    await seed(page);
    const original = await readSavedBoard(page, 'sections');
    const filter = page.locator('.dashboard-visible-sections');
    await filter.locator('summary').click();
    await filter.getByRole('checkbox', { name: 'Started Workitems', exact: true }).uncheck();
    await expect(section(page, 'started')).toHaveCount(0);
    await filter.getByRole('button', { name: 'Move Completed Workitems up', exact: true }).click();
    expect(await page.locator('.dashboard-activity [data-dashboard-section]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-dashboard-section')))).toEqual(['activitySummary', 'completedInPeriod', 'currentlyInProgress']);
    await expect.poll(async () => (await readSavedBoard(page, 'sections')).extensions.dashboardActivity).toEqual({ version: 1, order: ['activitySummary', 'completedInPeriod', 'started', 'currentlyInProgress'], hidden: ['started'] });
    expect(serializeBoardDataFromObject(await readSavedBoard(page, 'sections')).board).toEqual(serializeBoardDataFromObject(original).board);
    const saved = await readSavedBoard(page, 'sections');
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'sections', title: saved.board.settings.title, hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(section(page, 'started')).toHaveCount(0);
    expect(await page.locator('.dashboard-activity [data-dashboard-section]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-dashboard-section')))).toEqual(['activitySummary', 'completedInPeriod', 'currentlyInProgress']);
    await filter.locator('summary').click();
    await filter.getByRole('button', { name: 'Reset to Default', exact: true }).click();
    await expect(section(page, 'started')).toBeVisible();
    await expect.poll(async () => (await readSavedBoard(page, 'sections')).extensions.dashboardActivity.hidden).toEqual([]);
    expect(await page.locator('.dashboard-activity [data-dashboard-section]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-dashboard-section')))).toEqual(['activitySummary', 'started', 'completedInPeriod', 'currentlyInProgress']);
});

test('read-only activity changes stay local; zero activity and partial history have distinct messages', async ({ page }) => {
    await seed(page, false);
    const filter = page.locator('.dashboard-visible-sections');
    await filter.locator('summary').click();
    await filter.getByRole('checkbox', { name: 'Activity Summary', exact: true }).uncheck();
    await filter.getByRole('button', { name: 'Move Completed Workitems up', exact: true }).click();
    await expect(section(page, 'activitySummary')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await filter.getByRole('button', { name: 'Reset to Default', exact: true }).click();
    await filter.locator('summary').click();
    await page.getByLabel('Start date', { exact: true }).fill('15/10/2026');
    await page.getByLabel('End date', { exact: true }).fill('15/10/2026');
    await expect(section(page, 'started')).toContainText('No workitems match');
    await expect(section(page, 'activitySummary').locator('strong').first()).toHaveText('0');
    await page.getByLabel('Start date', { exact: true }).fill('01/10/2026');
    await expect(section(page, 'started')).toContainText('History is available from');
    await expect(section(page, 'activitySummary')).toContainText('History is available from');
});
