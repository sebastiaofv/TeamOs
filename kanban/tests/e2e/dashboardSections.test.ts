import { setDashboardDate } from '../support/dashboard';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, toggleTheme } from '../support/portfolio';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { LANGUAGE_STORAGE_KEY } from '../../src/domain/constants';

const section = (page: Page, key: string) => page.locator(`[data-dashboard-section="${key}"]`);
async function seed(page: Page, writable = true) {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'sections', title: data.board.settings.title, hasHandle: writable, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'sections' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await setDashboardDate(page, 'Start date', '24/10/2026');
}

test('overview and four activity widgets appear in the requested order; visibility affects entire sections and supports all/none', async ({ page }) => {
    await seed(page);
    const keys = ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'workitemStatus', 'epics', 'activitySummary', 'started', 'completedInPeriod', 'currentlyInProgress', 'openRisks', 'deliverables', 'decisions'];
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(13);
    expect(await page.locator('[data-dashboard-section]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-dashboard-section')))).toEqual(keys);
    const summary = page.locator('.dashboard-visible-sections summary');
    const start = page.locator('.dashboard-range-field');
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
    await setDashboardDate(page, 'End date', '30/10/2026');
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
    await setDashboardDate(page, 'Start date', '26/10/2026');
    await expect(started.locator('tbody tr')).toHaveCount(1); // The Bug starts on 28/10; Doing → Testing is not another start.
    await expect(started).toContainText('Bug excluded');
    await setDashboardDate(page, 'End date', '29/10/2026');
    await expect(completed.locator('tbody tr')).toHaveCount(0);
    await expect(section(page, 'currentlyInProgress')).toContainText('Story started then completed');
});

test('historical controls show risks and decisions still open at end date and deliveries in the period', async ({ page }) => {
    await seed(page);
    await expect(section(page, 'openRisks').locator('tbody tr')).toHaveCount(1);
    await expect(section(page, 'decisions').locator('tbody tr')).toHaveCount(1);
    await setDashboardDate(page, 'End date', '31/10/2026');
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
    await setDashboardDate(page, 'End date', '31/10/2026');
    const phases = section(page, 'activePhases');
    for (const title of ['Overdue parent phase', 'Delivery programme', 'Future parent phase', 'Completed parent phase']) await expect(phases).toContainText(title);
    await expect(phases).not.toContainText('API delivery');
    await expect(phases).not.toContainText('UX delivery');
    await expect(phases.locator('[data-dashboard-planning="finished"]')).toHaveAttribute('data-phase-state', 'completed');
    await expect(phases.locator('[data-dashboard-planning="late"]')).toHaveAttribute('data-phase-state', 'overdue');
    await expect(phases.locator('[data-dashboard-planning="delivery"]')).toContainText('01/10/2026');
    const milestones = section(page, 'milestones');
    await expect(milestones.locator('[data-dashboard-planning="late-milestone"] .dashboard-milestone-alert [aria-label="Overdue"]')).toBeVisible();
    await expect(milestones.locator('[data-dashboard-planning="late-milestone"]')).toContainText('0%');
    await expect(milestones).toContainText('Next unassigned checkpoint');
    await milestones.getByRole('button', { name: 'Next unassigned checkpoint', exact: true }).click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Next unassigned checkpoint');
});

test('stacked horizontal bars distinguish actual workflow states and exclude child Tasks', async ({ page }) => {
    await seed(page);
    await expect(section(page, 'workitemStatus').locator('.dashboard-stacked-bar')).toHaveCount(3);
    const tasks = page.locator('[data-dashboard-statistics="task"]');
    await expect(tasks.getByRole('group')).toHaveAccessibleName(/Independent Tasks:.*Testing 1/);
    await expect(tasks.getByRole('group')).toHaveAccessibleName(/Independent Tasks:.*In progress 3/);
    await expect(tasks.getByRole('button')).toHaveCount(0);
    await expect(tasks.locator('.dashboard-status-segment > span')).toHaveText(['1', '3', '1', '3', '1']);
    await expect(tasks.locator('.dashboard-status-segment[title*="Testing: 1"]')).toHaveAttribute('title', /Testing: 1 \(11%\)/);
    await expect(page.locator('#dashboardSources')).toHaveCount(0);
});

test('started Epics use their own status and shared progress and open historical details', async ({ page }) => {
    await seed(page);
    await setDashboardDate(page, 'End date', '31/10/2026');
    const epics = section(page, 'epics');
    await expect(epics.locator('[data-dashboard-epic]')).toHaveCount(1);
    await expect(epics).toContainText('0%');
    await expect(epics.getByRole('progressbar')).toHaveAttribute('value', '0');
    await epics.locator('.dashboard-epic-id').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal [id="detailStatus"]')).toContainText('In progress');
});

test('active sprint displays shared planning-unit completion, dates and navigation; absence is explicit', async ({ page }) => {
    await seed(page);
    const sprint = section(page, 'activeSprint');
    await expect(sprint).toContainText('Sprint 2 - Implementation');
    await expect(sprint).toContainText('15/10/2026');
    await expect(sprint).toContainText('05/11/2026');
    await expect(sprint).toContainText('2Workitems');
    await expect(sprint).toContainText('0 / 0Story Points');
    await expect(sprint).toContainText('On Target');
    await expect(sprint).toContainText('0%'); // Story validation and independent Task are still open.
    await sprint.getByRole('button', { name: 'Sprint 2 - Implementation', exact: true }).click();
    await expect(page.locator('[data-roadmap-task-list="sprint:active"]')).toBeVisible();
    await page.locator('[data-view-mode="dashboard"]').click();
    await setDashboardDate(page, 'Start date', '14/10/2026');
    await setDashboardDate(page, 'End date', '14/10/2026');
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
    await expect(sprint).toContainText('8 / 11Story Points');
    await expect(sprint).toContainText('Overdue');
    await expect(page.locator('[data-dashboard-planning="late-start"]')).toHaveAttribute('data-phase-state', 'late');
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
    await setDashboardDate(page, 'End date', '31/10/2026');
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
    await setDashboardDate(page, 'Start date', '24/10/2026');
    await setDashboardDate(page, 'End date', '31/10/2026');
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(13);
    await expect(section(page, 'projectProgress')).toContainText('31%');
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
    await setDashboardDate(page, 'Start date', '15/10/2026');
    await setDashboardDate(page, 'End date', '15/10/2026');
    await expect(section(page, 'started')).toContainText('No workitems match');
    await expect(section(page, 'activitySummary').locator('strong').first()).toHaveText('0');
    await setDashboardDate(page, 'Start date', '01/10/2026');
    await expect(section(page, 'started')).toContainText('History is available from');
    await expect(section(page, 'activitySummary')).toContainText('History is available from');
});

for (const width of [1280, 390]) test(`navigation, range field and compact menus preserve validation and keyboard dismissal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await expect(page.locator('#portfolioViewModeToggle button').last()).toHaveAttribute('data-view-mode', 'dashboard');
    const tabs = page.locator('.dashboard-tabs');
    const sections = page.locator('.dashboard-visible-sections summary');
    const range = page.locator('.dashboard-range-field');
    if (width > 700) expect(Math.abs((await tabs.boundingBox())!.y - (await range.boundingBox())!.y)).toBeLessThan(4);
    expect((await sections.boundingBox())!.x).toBeLessThan((await range.boundingBox())!.x);
    await expect(sections.locator('svg')).toHaveCount(1);
    await expect(range).toContainText('24/10/2026 – 04/11/2026');
    await expect(page.getByLabel('Start date', { exact: true })).toBeHidden();
    await range.click();
    const panel = (await page.locator('.dashboard-range-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    await page.getByLabel('Start date', { exact: true }).fill('05/11/2026');
    await expect(page.getByRole('alert')).toContainText('The end date');
    await page.keyboard.press('Escape');
    await expect(range).toBeFocused();
    await expect(page.getByLabel('Start date', { exact: true })).toBeHidden();
    await setDashboardDate(page, 'Start date', '24/10/2026');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await range.click();
    await page.getByLabel('End date', { exact: true }).fill('05/11/2026');
    expect(await page.getByLabel('End date', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    await page.getByLabel('End date', { exact: true }).fill('04/11/2026');
    await page.locator('.dashboard-tabs').click({ position: { x: 2, y: 2 } });
    await expect(page.getByLabel('Start date', { exact: true })).toBeHidden();
    await sections.click();
    await page.keyboard.press('Escape');
    await expect(sections).toBeFocused();
    await expect(page.locator('[data-dashboard-kpi="blocked"]')).toHaveCount(0);
    await expect(page.locator('.dashboard-reporting-info p')).toBeHidden();
    await page.getByLabel('About these indicators', { exact: true }).click();
    await expect(page.locator('.dashboard-reporting-info p')).toContainText('UTC');
});

test('phase alerts take precedence and completions without a recorded date stay in the summary', async ({ page }) => {
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    data.extensions.roadmap.phases.push({ id: 'waiting', title: 'Waiting phase', startDate: '2026-10-01', endDate: '2026-12-01' });
    data.extensions.roadmap.milestones.push({ id: 'complete', title: 'Completed checkpoint', dueDate: '2026-10-01' });
    const completedTask = data.board.tasks.find((task: { id: number }) => task.id === 915);
    completedTask.milestoneId = 'complete';
    completedTask.milestoneMode = 'explicit';
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'states', title: 'State checks', hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'states' });
    await page.locator('[data-view-mode="dashboard"]').click();
    const phases = section(page, 'activePhases');
    for (const [id, state] of [['finished', 'completed'], ['delivery', 'inProgress'], ['late', 'overdue'], ['waiting', 'late'], ['empty', 'future']]) {
        await expect(phases.locator(`[data-dashboard-planning="${id}"]`)).toHaveAttribute('data-phase-state', state);
    }
    await expect(phases.locator('[data-dashboard-planning="late"] .dashboard-missed-date')).toHaveText('20/10/2026');
    await expect(phases.locator('[data-dashboard-planning="waiting"] .dashboard-missed-date')).toHaveText('01/10/2026');
    await expect(phases.locator('[data-dashboard-planning="finished"] .dashboard-missed-date')).toHaveCount(0);
    const milestone = section(page, 'milestones').locator('[data-dashboard-planning="complete"]');
    await expect(milestone).toHaveCount(0);
    await expect(section(page, 'milestones').locator('.dashboard-milestone-completed strong')).toHaveText('1');
});

for (const width of [1840, 390]) test(`toolbar stays below main navigation during scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    const toolbar = page.locator('.dashboard-toolbar');
    await page.locator('#portfolioBoardWrap').evaluate((node) => { node.scrollTop = 700; });
    await expect.poll(async () => Math.round((await toolbar.boundingBox())!.y)).toBe(Math.round((await page.locator('#portfolioBoardWrap').boundingBox())!.y));
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Sprint Analytics', exact: true })).toBeInViewport();
    await expect(page.locator('.dashboard-visible-sections summary')).toBeInViewport();
    const range = page.locator('.dashboard-range-field');
    await expect(range).toBeInViewport();
    await range.click();
    await expect(page.getByLabel('End date', { exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Story point metrics', exact: true })).toBeVisible();
    await expect(range).toBeInViewport();
});

for (const style of ['classic', 'modern']) test(`rings, phase circles, continuous bars and Epic points retain their shapes in both themes (${style})`, async ({ page }) => {
    await page.setViewportSize({ width: 1840, height: 1000 });
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    await page.addInitScript((style) => localStorage.setItem('teamOsKanbanThemeStyle', style), style);
    const epic = data.board.tasks.find((task: { id: number }) => task.id === 901);
    const story = data.board.tasks.find((task: { id: number }) => task.id === 902);
    story.storyPoints = 8; story.status = 'accepted';
    data.board.tasks.find((task: { id: number }) => task.id === 904).status = 'accepted';
    epic.title = 'Completed epic with estimated story';
    data.extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'finished').title = 'A very long parent phase title that must be clamped to exactly two lines with a hover tooltip';
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'shapes', title: 'Shape checks', hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'shapes' });
    await page.locator('[data-view-mode="dashboard"]').click();
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await toggleTheme(page);
        const ring = section(page, 'projectProgress').getByRole('progressbar');
        await expect(ring).toHaveAttribute('aria-valuenow', /[0-9]+/);
        await expect(ring.locator('svg circle')).toHaveCount(2);
        const circles = page.locator('.dashboard-phase-circle');
        for (const circle of await circles.all()) await expect(circle).toHaveCSS('border-radius', '50%');
        await expect(page.locator('.dashboard-phase-completed')).toHaveCSS('background-color', 'rgb(21, 153, 107)');
        await expect(page.locator('.dashboard-phase-overdue').first()).toHaveCSS('border-top-color', await page.locator('.dashboard-phase-overdue').first().evaluate((node) => getComputedStyle(node).color));
        const phaseName = page.locator('.dashboard-phase-name').first();
        await expect(phaseName).toHaveAttribute('title', /A very long parent phase/);
        await expect(phaseName).toHaveCSS('-webkit-line-clamp', '2');
        const bar = section(page, 'workitemStatus').locator('.dashboard-stacked-bar').first();
        const segments = await bar.locator('.dashboard-status-segment').all();
        for (let index = 1; index < segments.length; index++) {
            const before = (await segments[index - 1].boundingBox())!;
            const after = (await segments[index].boundingBox())!;
            expect(Math.abs(before.x + before.width - after.x)).toBeLessThan(1);
        }
        await expect(section(page, 'epics').locator('.dashboard-epic-points')).toContainText('8 / 8');
        await expect(section(page, 'epics').getByRole('progressbar')).toHaveClass(/dashboard-progress-completed/);
        await expect(section(page, 'epics').getByRole('progressbar')).toHaveCSS('height', '16px');
        await expect(section(page, 'epics').locator('.dashboard-inline-progress')).toHaveText('');
        const sprintWidth = (await section(page, 'activeSprint').boundingBox())!.width;
        expect((await section(page, 'activePhases').boundingBox())!.width).toBeGreaterThan(sprintWidth * 2);
    }
});


test('milestone summaries and recent completions follow the report end date and keep detail actions', async ({ page }) => {
    const data = serializeBoardDataFromObject(JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8')));
    data.extensions.roadmap!.milestones = [
        { id: 'recent-ui', title: 'Latest completed milestone with a long title that should truncate', dueDate: '2026-10-02' },
        { id: 'old-ui', title: 'Old completed milestone', dueDate: '2026-10-01' },
        { id: 'overdue-ui', title: 'Overdue checkpoint', dueDate: '2026-10-03' },
        { id: 'next-ui', title: 'Next checkpoint', dueDate: '2026-11-20' },
        { id: 'later-ui', title: 'Later checkpoint', dueDate: '2026-11-21' }
    ];
    data.extensions.projectControl!.records = [];
    for (const task of data.board.tasks) { task.milestoneId = ''; task.milestoneMode = 'none'; }
    for (const [index, id] of [905, 906, 908, 909, 911].entries()) {
        const task = data.board.tasks.find((task) => task.id === id)!;
        task.milestoneId = data.extensions.roadmap!.milestones[index].id;
        task.milestoneMode = 'explicit'; task.status = 'to-do';
    }
    data.extensions.timeline = { version: 1, baselineEventId: 'baseline', events: [
        { id: 'baseline', at: '2026-10-15T12:00:00Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Baseline', snapshot: createBoardStateSnapshot(data) },
        { id: 'older', at: '2026-10-20T12:00:00Z', kind: 'task.status.changed', entityType: 'task', entityId: '906', summary: 'Completed', changes: { status: { before: 'to-do', after: 'accepted' } } },
        { id: 'latest', at: '2026-10-30T12:00:00Z', kind: 'task.status.changed', entityType: 'task', entityId: '905', summary: 'Completed', changes: { status: { before: 'to-do', after: 'accepted' } } }
    ] };
    data.board.tasks.filter((task) => [905, 906].includes(task.id)).forEach((task) => { task.status = 'accepted'; });
    await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'milestones', title: 'Milestone relevance', hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'milestones' });
    await page.locator('[data-view-mode="dashboard"]').click();
    await setDashboardDate(page, 'Start date', '15/10/2026');
    await setDashboardDate(page, 'End date', '09/11/2026');
    const widget = section(page, 'milestones');
    await expect(widget.locator('.dashboard-milestone-summary strong')).toHaveText(['2', '1', '3']);
    expect(await widget.locator('[data-dashboard-planning]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-dashboard-planning')))).toEqual(['recent-ui', 'overdue-ui', 'next-ui']);
    const completed = widget.locator('[data-dashboard-planning="recent-ui"]');
    await expect(completed).not.toContainText('100%');
    await expect(completed.getByRole('progressbar')).toHaveClass(/dashboard-progress-completed/);
    await expect(completed.getByRole('button').first()).toHaveAttribute('title', /Latest completed milestone/);
    await completed.getByRole('button').first().click();
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Latest completed milestone');
    await page.keyboard.press('Escape');
    await page.locator('[data-view-mode="dashboard"]').click();
    await setDashboardDate(page, 'End date', '10/11/2026');
    await expect(completed).toHaveCount(0);
    await expect(widget).toContainText('Next checkpoint');
    await expect(widget).not.toContainText('Later checkpoint');
    await expect(widget.locator('.dashboard-milestone-summary strong')).toHaveText(['2', '1', '3']);
});

for (const width of [390, 1840]) test(`many phases expand without internal scroll while Epics remain compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 });
    const data = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
    data.extensions.roadmap.phases.push(...Array.from({ length: 20 }, (_, index) => ({ id: `extra-${index}`, title: `Additional phase ${index} with a long title for truncation`, startDate: '2026-11-10', endDate: '2026-12-01' })));
    const template = data.board.tasks.find((task: { id: number }) => task.id === 901);
    data.board.tasks.push(...Array.from({ length: 20 }, (_, index) => ({ ...template, id: 1000 + index, permanentId: `extra-epic-${index}`, displayId: `ATL-EP-${1000 + index}`, title: `Additional epic ${index} with a long title for truncation` })));
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'expansion', title: 'Content sizing', hasHandle: false, tasks: data.board.tasks, extensions: data.extensions }], { selectedBoardId: 'expansion' });
    await page.locator('[data-view-mode="dashboard"]').click();
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await toggleTheme(page);
        const phases = section(page, 'activePhases');
        await expect(phases.locator('[data-dashboard-planning]')).toHaveCount(26);
        expect(await phases.locator('.dashboard-phase-scroll').evaluate((node) => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        const lastPhase = (await phases.locator('[data-dashboard-planning]').last().boundingBox())!;
        const phaseBounds = (await phases.boundingBox())!;
        expect(lastPhase.y + lastPhase.height).toBeLessThanOrEqual(phaseBounds.y + phaseBounds.height);
        if (width > 700) expect((await section(page, 'projectProgress').boundingBox())!.height).toBe(phaseBounds.height);
        const epics = section(page, 'epics');
        await expect(epics).toHaveCSS('height', '280px');
        expect(await epics.locator('.dashboard-epic-list').evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
        expect(await epics.locator('.dashboard-epic-list').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        const link = epics.locator('.dashboard-epic-id').first();
        await expect(link).toHaveCSS('text-decoration-line', 'none');
        await expect(link).toHaveCSS('color', await section(page, 'projectProgress').locator('.dashboard-progress-count').evaluate((node) => getComputedStyle(node).color));

    }
});
