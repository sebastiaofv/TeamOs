import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, identifyOpenProjects, showTimeline, setTimelineSlider, openProjectPicker, expectProjectCount, selectPortfolioBoard } from '../support/portfolio';
import { fixtureTree, mockFolderPicker, readFolderJson } from '../support/folderProjects';

const root = 'test-board/teamos-development';
const project = JSON.parse(readFileSync(`${root}/project.json`, 'utf8'));
const history = JSON.parse(readFileSync(`${root}/history.json`, 'utf8'));

test('imports the historical example, explores native views, saves and reopens it without losing evidence', async ({ page }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(15_000);
    await page.clock.setFixedTime(new Date('2026-11-12T10:45:00Z'));
    await gotoApp(page);
    const tree = fixtureTree(root);
    // Documentation is not needed on the browser's fake disk.
    for (const path of Object.keys(tree.files)) if (path.endsWith('.md') || path === 'summary.json') delete tree.files[path];
    await mockFolderPicker(page, tree);
    await page.locator('#importProjectsBtn').click();
    await expectProjectCount(page, 1);
    await identifyOpenProjects(page);
    await selectPortfolioBoard(page, '— Desenvolvimento da Aplicação');
    await expect(page.locator('#appMessageModal')).toHaveCount(0);
    await page.locator('[data-view-mode="table"]').click();
    await expect(page.locator('#portfolioView')).toContainText('396');
    // A current-Sprint Task is easy to locate in Board for save/reopen verification.
    await page.locator('[data-view-mode="board"]').click();
    const activeOnly = page.locator('.board-active-sprints input');
    if (await activeOnly.count()) await activeOnly.uncheck();
    await page.locator('[data-view-mode="table"]').click();
    const story = project.workitems.find((item: { type: string; title: string }) => item.type === 'story' && item.title.includes('Separar os anexos'));
    // Use the existing command palette to navigate the actual imported project.
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(story.displayId);
    await page.locator('#commandPalette .palette-item').filter({ hasText: story.title }).first().click();
    await expect(page.locator('#detailTitle')).toHaveText(story.title);
    await page.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.locator('.comment-publication').first()).toBeVisible();
    await expect(page.locator('#task-panel-comments')).toContainText('fictício');
    await expect.poll(() => page.locator('.comment-images img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(960);
    console.info('Example: native comments and image loaded');
    await page.getByRole('tab', { name: 'Pull Requests', exact: true }).click();
    await expect(page.locator('#taskDetailModal a[href="https://github.com/sebastiaofv/TeamOs/pull/82"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    const csvRow = page.locator('.detail-attachment-item').filter({ hasText: 'amostra-de-capacidade-ficticio.csv' });
    const [download] = await Promise.all([page.waitForEvent('download'), csvRow.getByRole('link', { name: /^Download/ }).click()]);
    expect(readFileSync((await download.path())!, 'utf8')).toContain('fictício');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-entry').first()).toBeVisible();
    await page.locator('#taskDetailModalCloseBtn').click();
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('[data-roadmap-kind="phase"]').first()).toBeVisible();
    await page.locator('[data-view-mode="table"]').click();
    await page.locator('[data-table-view="sprints"]').click();
    await expect(page.locator('[data-table-sprint]')).toHaveCount(9);
    await expect(page.locator('[data-table-sprint="sprint-1"]')).toContainText('Done');
    await expect(page.locator('[data-table-sprint="sprint-7"]')).toContainText('Active');
    await page.locator('[data-view-mode="control"]').click();
    for (const [tab, title] of [['Risks','Custo crescente do histórico e dos anexos'],['Decisions','Adotar React e extrair um domínio puro'],['Deliverables','Projeto histórico demonstrativo']]) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    }
    await page.locator('[data-view-mode="planner"]').click();
    await expect(page.locator('.planner-block').first()).toBeVisible();
    console.info('Example: Roadmap, Sprints, Project Control and Day Planner verified');
    await page.locator('[data-view-mode="roadmap"]').click();
    await showTimeline(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    const juneIndex = history.events.findLastIndex((event: { at: string }) => event.at.slice(0,10) <= '2026-06-30');
    await setTimelineSlider(page, juneIndex);
    console.info('Example: June Timeline preview selected');
    await expect(page.locator('#portfolioTimelinePanel')).toContainText('2026');
    await setTimelineSlider(page, history.events.length - 1);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await page.locator('[data-view-mode="table"]').click();
    const candidate = project.workitems.find((item: { title: string }) => item.title.startsWith('Preparar checklist técnico'));
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(candidate.displayId);
    await page.locator('#commandPalette .palette-item').filter({ hasText: candidate.title }).first().click();
    console.info('Example: current independent Task opened');
    await page.locator('#taskDetailEditBtn').click();
    await page.locator('#taskName').fill('Checklist de lançamento — reabertura verificada');
    await page.locator('#taskModal .btn-primary').click();
    // The native example writes its full project and attachment metadata; slower CI runners
    // can still be saving when the default five-second assertion budget expires.
    const saveStarted = Date.now();
    await expect.poll(async () => (await readFolderJson(page, 'project.json')).workitems.find((item: { id: number }) => item.id === candidate.id).title, { timeout: 30_000 }).toBe('Checklist de lançamento — reabertura verificada');
    console.info(`Example: native project save completed in ${Date.now() - saveStarted} ms`);
    const saved = await readFolderJson(page, 'project.json');
    expect(saved.comments).toHaveLength(project.comments.length);
    if (await page.locator('#taskDetailModalCloseBtn').isVisible()) await page.locator('#taskDetailModalCloseBtn').click();
    await openProjectPicker(page);
    await page.locator('.portfolio-chip').filter({ hasText: 'Desenvolvimento da Aplicação' }).getByRole('button', { name: 'Remove project' }).click();
    await expectProjectCount(page, 0);
    await page.locator('#importProjectsBtn').click();
    await expectProjectCount(page, 1);
    await expect(page.locator('#projectIdentityModal')).toBeVisible();
    await identifyOpenProjects(page);
    await selectPortfolioBoard(page, '— Desenvolvimento da Aplicação');
    await expectProjectCount(page, 1);
    await page.locator('[data-view-mode="table"]').click();
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(candidate.displayId);
    await page.locator('#commandPalette .palette-item').filter({ hasText: 'Checklist de lançamento — reabertura verificada' }).first().click();
    await expect(page.locator('#detailTitle')).toHaveText('Checklist de lançamento — reabertura verificada');
    await page.screenshot({ path: 'test-results/example-project-reopened.png', fullPage: true });
});

// Keep the historical Dashboard check separate from the save/reopen journey.
test('the historical example changes Dashboard counts between June and October', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.setFixedTime(new Date('2026-11-12T10:45:00Z'));
    await gotoApp(page);
    const tree = fixtureTree(root);
    for (const path of Object.keys(tree.files)) if (path.endsWith('.md') || path === 'summary.json') delete tree.files[path];
    await mockFolderPicker(page, tree);
    await page.locator('#importProjectsBtn').click();
    await expectProjectCount(page, 1);
    await identifyOpenProjects(page);
    await selectPortfolioBoard(page, '— Desenvolvimento da Aplicação');
    await showTimeline(page);
    await page.getByRole('button', { name: 'Load history / timeline', exact: true }).click();
    await page.locator('[data-view-mode="dashboard"]').click();
    console.info('Example: Dashboard opened with the full native history');
    await page.getByLabel('Start date', { exact: true }).fill('01/06/2026');
    await page.getByLabel('End date', { exact: true }).fill('30/06/2026');
    const overview = page.locator('[data-dashboard-section="projectOverview"]');
    const june = await overview.innerText();
    console.info('Example: June Dashboard calculated');
    await page.getByLabel('Start date', { exact: true }).fill('01/10/2026');
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await expect(overview).not.toHaveText(june);
    await expect(page.locator('[data-dashboard-section="completedInPeriod"]')).toContainText('US-');
    await page.screenshot({ path: 'test-results/example-project-october-dashboard.png', fullPage: true });
    console.info('Example: different October Dashboard verified');
});

// Issue 104: loading the history from a workitem's History tab froze Dashboard Overview.
test('Dashboard opens promptly after a workitem History tab loads the full history', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.setFixedTime(new Date('2026-11-12T10:45:00Z'));
    await gotoApp(page);
    const tree = fixtureTree(root);
    for (const path of Object.keys(tree.files)) if (path.endsWith('.md') || path === 'summary.json') delete tree.files[path];
    await mockFolderPicker(page, tree);
    await page.locator('#importProjectsBtn').click();
    await expectProjectCount(page, 1);
    await identifyOpenProjects(page);
    await selectPortfolioBoard(page, '— Desenvolvimento da Aplicação');
    const story = project.workitems.find((item: { type: string; title: string }) => item.type === 'story' && item.title.includes('Separar os anexos'));
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#commandPaletteInput').fill(story.displayId);
    await page.locator('#commandPalette .palette-item').filter({ hasText: story.title }).first().click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-entry').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#taskDetailModalCloseBtn').click();
    const opened = Date.now();
    await page.locator('[data-view-mode="dashboard"]').click();
    await expect(page.locator('[data-dashboard-section]')).toHaveCount(9, { timeout: 10_000 });
    await expect(page.locator('[data-dashboard-section="completedInPeriod"]')).toContainText('US-', { timeout: 10_000 });
    console.info(`Example: Overview rendered ${Date.now() - opened} ms after opening the Dashboard`);
    // The page stays responsive: changing the period recalculates.
    const started = page.locator('[data-dashboard-section="started"]');
    const lastWeek = await started.innerText();
    await page.getByLabel('Start date', { exact: true }).fill('01/10/2026');
    await page.getByLabel('End date', { exact: true }).fill('31/10/2026');
    await expect(started).not.toHaveText(lastWeek, { timeout: 10_000 });
    // Sprint scope changes replay the same history (Sprint 4 ran within the October period).
    await page.getByRole('button', { name: 'Sprint Analytics', exact: true }).click();
    await page.locator('.dashboard-sprint-selection label').filter({ hasText: 'Tabela e colaboração' }).locator('input').check();
    await expect(page.locator('.dashboard-scope-changes li').first()).toBeVisible({ timeout: 10_000 });
});
