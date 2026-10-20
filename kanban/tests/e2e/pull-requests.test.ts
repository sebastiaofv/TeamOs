import { test, expect, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, answerAppMessage, openTaskEditor, setTimelineSlider, installControlledPortfolioWriter } from '../support/portfolio';

const first = 'https://github.com/example/project/pull/1?view=full#review';
const second = 'https://code.example.test:8443/team/repo/pull/2';
const internal = 'http://git.internal:8080/anything?Q=One%2FTwo#Diff';
async function add(scope: Locator, value: string) {
    await scope.getByRole('button', { name: 'Add pull request link', exact: true }).click();
    await scope.getByLabel('Full URL', { exact: true }).fill(value);
    await scope.getByRole('button', { name: 'Confirm link', exact: true }).click();
}

test('closing URL editing returns keyboard focus to Add or the corrected link action', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Keyboard links', hasHandle: true, tasks: [{ id: 1, title: 'Links', pullRequests: [first] }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Links').click();
    const scope = page.locator('#taskDetailModal .pull-request-links');
    const addButton = scope.getByRole('button', { name: 'Add pull request link', exact: true });
    const input = scope.getByLabel('Full URL', { exact: true });
    const cancel = scope.getByRole('button', { name: 'Cancel', exact: true });
    await addButton.focus();
    await addButton.press('Enter');
    await expect(input).toBeFocused();
    await cancel.focus();
    await cancel.press('Enter');
    await expect(addButton).toBeFocused();

    await addButton.press('Enter');
    await input.fill(second);
    await input.press('Enter');
    await expect(addButton).toBeFocused();
    const editButton = scope.getByRole('button', { name: `Correct ${second}`, exact: true });
    await editButton.focus();
    await editButton.press('Enter');
    await expect(input).toBeFocused();
    await cancel.focus();
    await cancel.press('Enter');
    await expect(editButton).toBeFocused();

    await editButton.press('Enter');
    await input.press('Enter');
    await expect(editButton).toBeFocused();
    await editButton.press('Enter');
    await input.fill(internal);
    await input.press('Enter');
    await expect(scope.getByRole('button', { name: `Correct ${internal}`, exact: true })).toBeFocused();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].pullRequests).toEqual([first, internal]);
});

test('detail links validate locally, preserve spelling, and support explicit correction/removal without network metadata', async ({ page }) => {
    const network: string[] = [];
    page.on('request', (request) => { if (/github\.com|example\.test|git\.internal/.test(request.url())) network.push(request.url()); });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'PR links', hasHandle: true, tasks: [{ id: 1, title: 'Implementation', description: 'Keep description', status: 'doing', pullRequests: [first, second] }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Implementation').click();
    const scope = page.locator('#taskDetailModal .pull-request-links');
    await scope.getByRole('button', { name: 'Add pull request link', exact: true }).click();
    const input = scope.getByLabel('Full URL', { exact: true });
    for (const [value, message] of [['javascript:alert(1)', 'Only absolute HTTP'], ['https://user:pass@git.internal/pr/1', 'embedded credentials'], [`  ${first}  `, 'already associated']]) {
        await input.fill(value); await scope.getByRole('button', { name: 'Confirm link', exact: true }).click();
        await expect(scope.getByRole('alert')).toContainText(message); await expect(input).toHaveValue(value); await expect(scope.locator('li')).toHaveCount(2);
    }
    await input.fill(`  ${internal}  `); await scope.getByRole('button', { name: 'Confirm link', exact: true }).click();
    await expect(scope.getByRole('link', { name: internal, exact: true })).toHaveAttribute('href', internal);
    await scope.getByRole('button', { name: `Correct ${internal}`, exact: true }).click();
    await scope.getByLabel('Full URL', { exact: true }).fill(second);
    await scope.getByRole('button', { name: 'Confirm link', exact: true }).click();
    await expect(scope.getByRole('alert')).toContainText('already associated');
    await scope.locator('.pull-request-form').getByRole('button', { name: 'Cancel', exact: true }).click();
    await scope.getByRole('button', { name: `Remove ${internal}`, exact: true }).click();
    await answerAppMessage(page, { button: 'Cancel', expectText: internal });
    await expect(scope.locator('li')).toHaveCount(3);
    await scope.getByRole('button', { name: `Remove ${internal}`, exact: true }).click();
    await answerAppMessage(page, { button: 'Remove', expectText: internal });
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].pullRequests).toEqual([first, second]);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0]).toMatchObject({ description: 'Keep description', status: 'doing', assignees: [] });
    expect(saved.extensions.timeline.events).toHaveLength(3);
    expect(network).toEqual([]);
});

test('creation/edit forms stage associations until saving; cancel and Enter do not accidentally apply the workitem', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Draft links', hasHandle: true, tasks: [{ id: 1, title: 'Original', status: 'to-do', pullRequests: [first] }] }], { selectedBoardId: 'p' });
    await openTaskEditor(page, 'Original');
    let scope = page.locator('#taskModal .pull-request-links');
    await add(scope, internal);
    expect((await readSavedBoard(page, 'p')).board.tasks[0].pullRequests).toEqual([first]);
    await page.locator('#taskModalCancelBtn').click();
    await openTaskEditor(page, 'Original');
    scope = page.locator('#taskModal .pull-request-links');
    await expect(scope.getByRole('link')).toHaveCount(1);
    await scope.getByRole('button', { name: 'Add pull request link', exact: true }).click();
    await scope.getByLabel('Full URL', { exact: true }).fill(internal);
    await scope.getByLabel('Full URL', { exact: true }).press('Enter');
    await expect(page.locator('#taskModal')).toBeVisible();
    expect((await readSavedBoard(page, 'p')).board.tasks[0].pullRequests).toEqual([first]);
    await page.locator('#taskName').fill('Saved together'); await page.locator('#taskModalSaveBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].title).toBe('Saved together');
    let saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0].pullRequests).toEqual([first, internal]);
    expect(Object.keys(saved.extensions.timeline.events[1].changes).sort()).toEqual(['pullRequests', 'title']);
    await page.getByRole('button', { name: '+ Add Task', exact: true }).first().click();
    await page.locator('#taskName').fill('New workitem');
    await add(page.locator('#taskModal .pull-request-links'), second);
    await page.locator('#taskModalSaveBtn').click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.length).toBe(2);
    saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[1].pullRequests).toEqual([second]);
    expect(saved.extensions.timeline.events.at(-1).snapshot.pullRequests).toEqual([second]);
});

test('historical and read-only details expose safe links but no mutation controls; restore rolls associations back', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-8.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click(); await setTimelineSlider(page, 0);
    await portfolioCard(page, 'Delivery with multiple servers').click();
    let scope = page.locator('#taskDetailModal .pull-request-links');
    await expect(scope.getByRole('link')).toHaveCount(1); await expect(scope.getByRole('button')).toHaveCount(0);
    await page.keyboard.press('Escape'); await page.locator('[data-action="timeline-restore"]').click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].pullRequests.length).toBe(1);
    const saved = await readSavedBoard(page, 'p'); expect(saved.extensions.timeline.events).toHaveLength(3);
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'readonly', title: saved.board.settings.title, hasHandle: false, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'readonly' });
    await portfolioCard(page, 'Delivery with multiple servers').click(); scope = page.locator('#taskDetailModal .pull-request-links');
    await expect(scope.getByRole('link')).toHaveCount(1); await expect(scope.getByRole('button')).toHaveCount(0);
    await expect(scope.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
});

test('save failure and retry persist the already-applied link/event without duplicating them', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Retry links', hasHandle: true, tasks: [{ id: 1, title: 'Retry link', status: 'to-do', pullRequests: [] }] }], { selectedBoardId: 'p' });
    await installControlledPortfolioWriter(page, { boardId: 'p', failWrites: 1 });
    await portfolioCard(page, 'Retry link').click(); await add(page.locator('#taskDetailModal .pull-request-links'), internal);
    await expect(page.locator('.pull-request-list li')).toHaveCount(1); await expect(page.locator('.pull-request-form')).toHaveCount(0);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].pullRequests).toEqual([internal]);
    expect((await readSavedBoard(page, 'p')).extensions.timeline.events).toHaveLength(2);
});

test('only explicitly opening a link navigates to its destination and the new window has no opener', async ({ page, context }) => {
    const destination = 'https://review.example.test/anything?x=1#discussion';
    const requests: string[] = [];
    context.on('request', (request) => { if (request.url().includes('review.example.test')) requests.push(request.url()); });
    await context.route('https://review.example.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Mock destination</title><p>Opened explicitly</p>' }));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Open link', hasHandle: true, tasks: [{ id: 1, title: 'Open target', status: 'to-do', pullRequests: [destination] }] }], { selectedBoardId: 'p' });
    const before = await readSavedBoard(page, 'p');
    await portfolioCard(page, 'Open target').click(); expect(requests).toEqual([]);
    const popupPromise = context.waitForEvent('page'); await page.locator('.pull-request-links').getByRole('link', { name: destination, exact: true }).click();
    const popup = await popupPromise; await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(popup.locator('body')).toContainText('Opened explicitly');
    expect(requests).toHaveLength(1); expect(await readSavedBoard(page, 'p')).toEqual(before);
});
