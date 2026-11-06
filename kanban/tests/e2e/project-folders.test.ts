import { test, expect } from '@playwright/test';
import { gotoApp, identifyOpenProjects, portfolioCard, renameTaskViaEditor, selectPortfolioBoard, showTimeline, portfolioProjectChipButtons } from '../support/portfolio';
import { fixtureTree, mockFolderPicker, readFolderJson } from '../support/folderProjects';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const tree = fixtureTree('test-board/us-25/projects');
for (const standalone of [false, true]) {
    test(`${standalone ? 'standalone file' : 'web'}: opens a portfolio lazily, saves isolated edits, and reopens history and attachments`, async ({ page }) => {
        if (standalone) await page.goto(pathToFileURL(resolve('dist-standalone/index.html')).href);
        else await gotoApp(page);
        if (standalone) await page.evaluate(() => { localStorage.setItem('teamos-language', 'en'); });
        await mockFolderPicker(page, tree);
        await page.locator('#openProjectFolderBtn').click();
        await expect(portfolioProjectChipButtons(page)).toHaveCount(2);
        await identifyOpenProjects(page);
        expect(await page.evaluate(() => Object.entries(window.__folderDisk.reads).filter(([path]) => path.endsWith('history.json') || path.includes('/attachments/')))).toEqual([]);
        // Opening the same parent appends no duplicate records.
        await page.locator('#openProjectFolderBtn').click();
        await expect(portfolioProjectChipButtons(page)).toHaveCount(2);
        await selectPortfolioBoard(page, 'US-25 Alpha — attachments and comments');
        if (await page.locator('.board-active-sprints input').count()) await page.locator('.board-active-sprints input').uncheck();
        const legacy = JSON.parse(readFileSync('test-board/us-25/migration/legacy.board.json', 'utf8'));
        const title = legacy.board.tasks[0].title;
        await renameTaskViaEditor(page, title, 'Changed without visiting history');
        await expect.poll(async () => (await readFolderJson(page, 'alpha/project.json')).board.tasks[0].title).toBe('Changed without visiting history');
        expect(await page.evaluate(() => Object.keys(window.__folderDisk.reads).some((path) => path.includes('/attachments/')))).toBe(false);
        const saved = await readFolderJson(page, 'alpha/project.json');
        expect(saved.extensions.timeline).toBeUndefined();
        expect(JSON.stringify(saved)).not.toContain('data:');
        expect(await page.evaluate(() => window.__folderDisk.writes['beta/project.json'] || 0)).toBe(0);
        await page.locator('.portfolio-chip').filter({ hasText: 'US-25 Alpha' }).getByRole('button', { name: 'Remove project' }).click();
        await page.locator('#openProjectFolderBtn').click();
        await expect(portfolioProjectChipButtons(page)).toHaveCount(2);
        await identifyOpenProjects(page);
        await selectPortfolioBoard(page, 'US-25 Alpha — attachments and comments');
        await portfolioCard(page, 'Changed without visiting history').click();
        await page.getByRole('tab', { name: 'Comments', exact: true }).click();
        await expect(page.locator('.comment-publication')).toContainText('This image lives in attachments/');
        await expect.poll(() => page.locator('.comment-images img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
        const imageAttachment = legacy.board.tasks[0].attachments.find((item: { mime: string }) => item.mime === 'image/png');
        const row = page.locator('.detail-attachment-item').filter({ hasText: imageAttachment.name });
        const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: /^Download/ }).click()]);
        expect(readFileSync((await download.path())!)).toEqual(Buffer.from(imageAttachment.dataUrl.split(',')[1], 'base64'));
        const [popup] = await Promise.all([page.waitForEvent('popup'), row.getByRole('link', { name: 'Open', exact: true }).click()]);
        await expect(popup).toHaveURL(/^blob:/); await popup.close();
        await page.getByRole('tab', { name: 'History', exact: true }).click();
        await expect(page.locator('#task-panel-history')).toContainText('Changed without visiting history');
        await page.locator('#taskDetailModalCloseBtn').click();
        await selectPortfolioBoard(page, 'US-25 Beta — large history and Project Control');
        expect(await page.evaluate(() => window.__folderDisk.reads['beta/history.json'] || 0)).toBe(0);
        await showTimeline(page);
        await page.getByRole('button', { name: 'Load history / timeline', exact: true }).click();
        await expect(page.locator('#portfolioTimelinePanel')).toContainText('10001');
    });
}

test('creates the destination structure and asks for another name on collision', async ({ page }) => {
    await gotoApp(page);
    await mockFolderPicker(page);
    await page.locator('#newProjectBtn').click();
    await page.getByLabel('Project name', { exact: true }).fill('Folder Alpha');
    await page.locator('#projectAcronym').fill('FAL');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Folder Alpha');
    await identifyOpenProjects(page);
    expect(await page.evaluate(() => window.__folderDisk.directories)).toContain('folder-alpha/attachments');
    expect((await readFolderJson(page, 'folder-alpha/project.json')).board.tasks).toEqual([]);
    expect((await readFolderJson(page, 'folder-alpha/history.json')).version).toBe(1);
    await page.locator('#newProjectBtn').click();
    await page.getByLabel('Project name', { exact: true }).fill('Folder Alpha');
    await page.locator('#projectAcronym').fill('FBL');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('already exists');
    await page.locator('#appMessageModal input').fill('folder-beta');
    await page.locator('#appMessageModal').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(portfolioProjectChipButtons(page)).toHaveCount(2);
    expect((await readFolderJson(page, 'folder-alpha/project.json')).extensions.project.acronym).toBe('FAL');
    expect((await readFolderJson(page, 'folder-beta/project.json')).extensions.project.acronym).toBe('FBL');
});

test('reports incomplete projects, keeps valid siblings, and defers corrupt history and missing binary errors', async ({ page }) => {
    await gotoApp(page);
    await mockFolderPicker(page, fixtureTree('test-board/us-25/invalid-projects'));
    await page.locator('#openProjectFolderBtn').click();
    await expect(page.locator('#appMessageModal')).toContainText('missing-history');
    await expect(page.locator('#appMessageModal')).toContainText('wrong-attachments-type');
    await page.locator('#appMessageModal').getByRole('button', { name: 'OK', exact: true }).click();
    await identifyOpenProjects(page);
    await expect(portfolioProjectChipButtons(page)).toHaveCount(3);
    expect(await page.evaluate(() => Object.keys(window.__folderDisk.reads).some((path) => path.endsWith('history.json')))).toBe(false);
    await selectPortfolioBoard(page, 'US-25 corrupt-history');
    await showTimeline(page);
    await page.getByRole('button', { name: 'Load history / timeline', exact: true }).click();
    await expect(page.locator('#portfolioTimelinePanel [role="alert"]')).toContainText('corrupt-history/history.json');
    const repaired = readFileSync('test-board/us-25/projects/alpha/history.json', 'utf8').replaceAll('us25-alpha', 'us25-corrupt-history');
    await page.evaluate((text) => { window.__folderDisk.files['corrupt-history/history.json'] = [...new TextEncoder().encode(text)]; }, repaired);
    await page.getByRole('button', { name: 'Load history / timeline', exact: true }).click();
    await expect(page.locator('#portfolioTimelinePanel [role="alert"]')).toHaveCount(0);
    await expect(page.locator('#portfolioTimelinePanel .timeline-slider')).toBeAttached();
    await selectPortfolioBoard(page, 'US-25 missing-binary');
    if (await page.locator('.board-active-sprints input').count()) await page.locator('.board-active-sprints input').uncheck();
    const legacy = JSON.parse(readFileSync('test-board/us-25/migration/legacy.board.json', 'utf8'));
    await portfolioCard(page, legacy.board.tasks[0].title).click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    await expect(page.locator('#detailAttachments [role="alert"]').first()).toContainText('attachments/');
});

test('migrates a legacy board through the picker without writing the original', async ({ page }) => {
    await gotoApp(page); await mockFolderPicker(page);
    const legacy = readFileSync('test-board/us-25/migration/legacy.board.json', 'utf8');
    await page.evaluate((legacy) => {
        window.showOpenFilePicker = async () => [{ name: 'legacy.board.json', async getFile() { return new File([legacy], 'legacy.board.json'); }, async createWritable() { window.__folderDisk.writes['original'] = 1; throw new Error('Original must stay intact.'); } }];
    }, legacy);
    await page.locator('#migrateProjectsBtn').click();
    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    await identifyOpenProjects(page);
    expect(await page.evaluate(() => window.__folderDisk.writes['original'] || 0)).toBe(0);
    const path = await page.evaluate(() => Object.keys(window.__folderDisk.files).find((entry) => entry.endsWith('/project.json'))!);
    const current = await readFolderJson(page, path);
    const original = JSON.parse(legacy);
    expect(current.extensions.project.id).toBe(original.extensions.project.id);
    expect(current.extensions.timeline).toBeUndefined();
    expect(current.board.tasks.map((task: { id: number; permanentId: string }) => [task.id, task.permanentId])).toEqual(original.board.tasks.map((task: { id: number; permanentId: string }) => [task.id, task.permanentId]));
    expect(JSON.stringify(current)).not.toContain('data:');
    expect((await readFolderJson(page, path.replace('project.json', 'history.json'))).timeline.events.map((event: { id: string }) => event.id)).toEqual(original.extensions.timeline.events.map((event: { id: string }) => event.id));
});

test('writes valid append-only history using real browser file streams with Unicode events', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
    await page.locator('#newProjectBtn').click();
    await page.getByLabel('Project name', { exact: true }).fill('Native folder');
    await page.locator('#projectAcronym').fill('NAT');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Native folder');
    await identifyOpenProjects(page);
    if (await page.locator('.board-active-sprints input').count()) await page.locator('.board-active-sprints input').uncheck();
    await page.getByRole('button', { name: 'Create workitem', exact: true }).click();
    await page.locator('#taskName').fill('Ação — ficheiro');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#detailTitle')).toHaveText('Ação — ficheiro');
    await page.locator('#taskDetailModalCloseBtn').click();
    await renameTaskViaEditor(page, 'Ação — ficheiro', 'Atualização — ação guardada');
    const readNative = () => page.evaluate(async () => {
        try {
            const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('native-folder');
            return {
                project: JSON.parse(await (await (await directory.getFileHandle('project.json')).getFile()).text()),
                history: JSON.parse(await (await (await directory.getFileHandle('history.json')).getFile()).text())
            };
        } catch { return null; } // Atomic replacement can invalidate a concurrent file snapshot.
    });
    await expect.poll(async () => (await readNative())?.project.board.tasks[0].title).toBe('Atualização — ação guardada');
    await expect.poll(async () => (await readNative())?.history.transactions.filter((entry: { kind: string }) => entry.kind === 'commit').length || 0).toBeGreaterThanOrEqual(3);
    const saved = await readNative();
    if (!saved) throw new Error('Native project files are not readable after save.');
    expect(saved.project.extensions.timeline).toBeUndefined();
    expect(saved.history.transactions.filter((entry: { kind: string }) => entry.kind === 'commit').length).toBeGreaterThanOrEqual(3);
    await portfolioCard(page, 'Atualização — ação guardada').click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('#task-panel-history')).toContainText('Ação — ficheiro');
});
