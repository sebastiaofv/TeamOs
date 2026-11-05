import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { buildBoardPayload, gotoApp, renameTaskViaEditor, portfolioCard, openTaskEditor, identifyOpenProjects } from '../support/portfolio';

declare global {
    interface Window {
        __readSharedProject: () => Promise<string>;
        __writeSharedProject: (text: string) => Promise<void>;
    }
}

function sharedDisk() {
    let text = JSON.stringify(buildBoardPayload({ title: 'Concurrent project', acronym: 'CON', tasks: [
        { id: 1, title: 'First workitem' }, { id: 2, title: 'Second workitem' }
    ] }));
    const writes: string[] = [];
    const failing = new Set<Page>();
    return {
        read: () => JSON.parse(text), writes, failing,
        async install(context: BrowserContext) {
            await context.exposeBinding('__readSharedProject', () => text);
            await context.exposeBinding('__writeSharedProject', async ({ page }, next: string) => {
                if (failing.delete(page)) throw new Error('Simulated write failure');
                // Expose overlapping writes if the browser lock is omitted.
                await new Promise((resolve) => setTimeout(resolve, 40));
                text = next; writes.push(next);
            });
            await context.addInitScript(() => {
                window.showOpenFilePicker = async () => [{
                    name: 'shared.board.json',
                    async getFile() {
                        const snapshot = await window.__readSharedProject();
                        return { name: 'shared.board.json', size: snapshot.length, lastModified: 10, async text() { return snapshot; } };
                    },
                    async createWritable() {
                        let contents = '';
                        return { async write(value: string) { contents = value; }, async close() { await window.__writeSharedProject(contents); } };
                    }
                }];
            });
        }
    };
}
async function load(page: Page) {
    await gotoApp(page);
    await page.locator('#importProjectsBtn').click();
    await expect(page.locator('#projectIdentityModal')).toBeVisible();
    await identifyOpenProjects(page);
    await page.getByRole('checkbox', { name: 'Active Sprints only', exact: true }).uncheck();
    await expect(portfolioCard(page, 'First workitem')).toBeVisible();
}
async function resolve(page: Page, side = 'Keep all mine') {
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();
    const dialog = page.locator('#projectReconciliationModal');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: side, exact: true }).click();
    await dialog.getByRole('button', { name: 'Apply decisions and save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
}

test('two isolated sessions integrate independent edits before the next watcher poll', async ({ browser }) => {
    const a = await browser.newContext(), b = await browser.newContext();
    try {
        const disk = sharedDisk(); await disk.install(a); await disk.install(b);
        const first = await a.newPage(), second = await b.newPage();
        await load(first); await load(second);
        await renameTaskViaEditor(first, 'First workitem', 'Edited by A');
        await expect.poll(() => disk.read().board.tasks[0].title).toBe('Edited by A');
        await renameTaskViaEditor(second, 'Second workitem', 'Edited by B');
        await expect.poll(() => disk.read().board.tasks.map((task: { title: string }) => task.title)).toEqual(['Edited by A', 'Edited by B']);
        await expect(second.getByText(/Integrated \d+ changes made in another session/)).toBeVisible();
        await expect(second.locator('#projectReconciliationModal')).toHaveCount(0);
        expect(disk.read().meta.revision).toBe(2);
        expect(disk.read().extensions.timeline.events.filter((event: { kind: string }) => event.kind === 'task.updated')).toHaveLength(2);
    } finally { await a.close(); await b.close(); }
});

test('simultaneous saves in two tabs preserve both changes using Web Locks', async ({ context }) => {
    const disk = sharedDisk(); await disk.install(context);
    const a = await context.newPage(), b = await context.newPage();
    await load(a); await load(b);
    await openTaskEditor(a, 'First workitem'); await openTaskEditor(b, 'Second workitem');
    await a.locator('#taskName').fill('A simultaneous'); await b.locator('#taskName').fill('B simultaneous');
    await Promise.all([a.locator('#taskModal .btn-primary').click(), b.locator('#taskModal .btn-primary').click()]);
    await expect.poll(() => disk.read().board.tasks.map((task: { title: string }) => task.title)).toEqual(['A simultaneous', 'B simultaneous']);
    await expect(a.locator('.project-conflict-notice')).toHaveCount(0); await expect(b.locator('.project-conflict-notice')).toHaveCount(0);
    expect(disk.writes).toHaveLength(2);
});

test('same-field conflict exposes all values, defers without writing and survives reload through IndexedDB', async ({ browser }) => {
    const a = await browser.newContext(), b = await browser.newContext();
    try {
        const disk = sharedDisk(); await disk.install(a); await disk.install(b);
        const first = await a.newPage(), second = await b.newPage();
        await load(first); await load(second);
        await renameTaskViaEditor(first, 'First workitem', 'External title');
        await expect.poll(() => disk.writes.length).toBe(1);
        await renameTaskViaEditor(second, 'First workitem', 'Local title');
        await expect(second.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
        await second.getByRole('button', { name: 'Resolve', exact: true }).click();
        const dialog = second.locator('#projectReconciliationModal');
        await expect(dialog).toContainText('First workitem');
        await expect(dialog).toContainText('Local title'); await expect(dialog).toContainText('External title');
        await dialog.getByRole('button', { name: 'Later', exact: true }).click();
        await renameTaskViaEditor(second, 'Second workitem', 'More local work');
        expect(disk.writes).toHaveLength(1); expect(disk.read().board.tasks[0].title).toBe('External title');
        second.once('dialog', (dialog) => { expect(dialog.type()).toBe('beforeunload'); void dialog.accept(); });
        await second.reload();
        await second.locator('#importProjectsBtn').click();
        await expect(second.locator('#projectIdentityModal')).toBeVisible();
        await identifyOpenProjects(second);
        await second.getByRole('checkbox', { name: 'Active Sprints only', exact: true }).uncheck();
        await expect(second.getByRole('button', { name: 'Recover changes', exact: true })).toBeVisible();
        await second.getByRole('button', { name: 'Recover changes', exact: true }).click();
        await expect(portfolioCard(second, 'Local title')).toBeVisible(); await expect(portfolioCard(second, 'More local work')).toBeVisible();
        expect(disk.writes).toHaveLength(1);
        await resolve(second);
        await expect.poll(() => disk.read().board.tasks.map((task: { title: string }) => task.title)).toEqual(['Local title', 'More local work']);
    } finally { await a.close(); await b.close(); }
});

test('new external changes while the dialog is open are checked again before saving', async ({ browser }) => {
    const a = await browser.newContext(), b = await browser.newContext();
    try {
        const disk = sharedDisk(); await disk.install(a); await disk.install(b);
        const first = await a.newPage(), second = await b.newPage();
        await load(first); await load(second);
        await renameTaskViaEditor(first, 'First workitem', 'External one');
        await expect.poll(() => disk.writes.length).toBe(1);
        await renameTaskViaEditor(second, 'First workitem', 'Local');
        await second.getByRole('button', { name: 'Resolve', exact: true }).click();
        const dialog = second.locator('#projectReconciliationModal');
        await dialog.getByRole('button', { name: 'Keep all mine', exact: true }).click();
        await renameTaskViaEditor(first, 'External one', 'External two');
        await expect.poll(() => disk.writes.length).toBe(2);
        await dialog.getByRole('button', { name: 'Apply decisions and save', exact: true }).click();
        await expect(dialog).toContainText('External two');
        expect(disk.writes).toHaveLength(2);
        await dialog.getByRole('button', { name: 'Keep all external', exact: true }).click();
        await dialog.getByRole('button', { name: 'Apply decisions and save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect.poll(() => disk.writes.length).toBe(3);
        expect(disk.read().board.tasks[0].title).toBe('External two');
    } finally { await a.close(); await b.close(); }
});

test('individual field choices keep both independent edits, work on mobile, and replay the accepted state', async ({ browser }, testInfo) => {
    const a = await browser.newContext(), b = await browser.newContext();
    try {
        const disk = sharedDisk(); await disk.install(a); await disk.install(b);
        const first = await a.newPage(), second = await b.newPage();
        await load(first); await load(second);
        await openTaskEditor(first, 'First workitem');
        await first.locator('#taskName').fill('External title');
        await first.locator('#taskDescription').fill('External description');
        await first.locator('#taskModal .btn-primary').click();
        await expect.poll(() => disk.writes.length).toBe(1);
        await openTaskEditor(second, 'First workitem');
        await second.locator('#taskName').fill('Local title');
        await second.locator('#taskDescription').fill('Local description');
        await second.locator('#taskModal .btn-primary').click();
        await second.getByRole('button', { name: 'Resolve', exact: true }).click();
        const dialog = second.locator('#projectReconciliationModal');
        const title = dialog.locator('fieldset').filter({ has: second.locator('legend').filter({ hasText: '.title' }) });
        const description = dialog.locator('fieldset').filter({ has: second.locator('legend').filter({ hasText: '.description' }) });
        await title.getByRole('radio', { name: 'Mine', exact: false }).check();
        await description.getByRole('radio', { name: 'External', exact: false }).check();
        await second.screenshot({ path: testInfo.outputPath('reconciliation-desktop.png') });
        await second.setViewportSize({ width: 390, height: 844 });
        await expect(dialog.locator('.modal-content')).toBeVisible();
        expect(await dialog.locator('.modal-content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await second.screenshot({ path: testInfo.outputPath('reconciliation-mobile.png') });
        await dialog.getByRole('button', { name: 'Apply decisions and save', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect.poll(() => disk.writes.length).toBe(2);
        const saved = disk.read();
        expect(saved.board.tasks[0]).toMatchObject({ title: 'Local title', description: 'External description' });
        const last = saved.extensions.timeline.events.at(-1);
        expect(last.kind).toBe('board.reconciled');
        expect(last.snapshot.board.tasks[0]).toMatchObject({ title: 'Local title', description: 'External description' });
        await expect(portfolioCard(second, 'Local title')).toBeVisible();
        await expect(portfolioCard(second, 'Local title').getByRole('button', { name: 'Historical preview (read-only)' })).toHaveCount(0);
    } finally { await a.close(); await b.close(); }
});
