import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, installControlledPortfolioWriter, mutateExternalBoardFile, triggerExternalFileCheck, setTimelineSlider, mockImportProjectsPicker } from '../support/portfolio';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

test('drafts survive closing, publication requires an author, and text stays safe and independent', async ({ page }) => {
    const destinations: string[] = [];
    page.on('request', (request) => { if (request.url().includes('example.test')) destinations.push(request.url()); });
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Comments', hasHandle: true, tasks: [{ id: 1, title: 'Workitem', description: 'Original description', status: 'done' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Workitem').click();
    await page.locator('#commentText').fill('<img src=https://example.test/x onerror=alert(1)>\n@Ana https://example.test/review javascript:alert(1)');
    await page.getByRole('button', { name: 'Publish comment', exact: true }).click();
    await expect(page.locator('.comment-error')).toContainText('explicit local author');
    await page.locator('#commentAuthor').fill('Explicit Bruno');
    await page.keyboard.press('Escape');
    await portfolioCard(page, 'Workitem').click();
    await expect(page.locator('#commentText')).toHaveValue(/@Ana/);
    await page.locator('#commentText').press('Control+Enter');
    await expect(page.locator('.comment-publication')).toHaveCount(1);
    await expect(page.locator('#commentText')).toHaveValue('');
    await expect(page.locator('.comment-publication img')).toHaveCount(0);
    await expect(page.locator('.comment-publication a').first()).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('#detailDescription')).toHaveText('Original description');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.conversations.entries.length).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0]).toMatchObject({ description: 'Original description', status: 'done', assignees: [] });
    expect(saved.extensions.timeline.events.filter((event: { kind: string }) => event.kind === 'task.comment.published')).toHaveLength(1);
    expect(JSON.stringify(saved.extensions.timeline)).not.toContain('javascript:alert');
    expect(destinations).toEqual([]);
});

test('pasted screenshots and selected images validate actual content and published images are immutable', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Images', hasHandle: true, tasks: [{ id: 1, title: 'Screenshots', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Screenshots').click();
    await page.locator('#commentAuthor').fill('Image author');
    await page.locator('#commentText').evaluate((element, encoded) => {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], 'paste.png', { type: 'image/png' }));
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, png);
    await expect(page.locator('.comment-composer .comment-image img')).toHaveCount(1);
    // Declared JPEG / .jpg name, real PNG: sniffed content wins, unchanged bytes are preserved.
    await page.locator('.comment-composer input[type="file"]').setInputFiles({ name: 'actually-png.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('.comment-composer .comment-image img')).toHaveCount(2);
    const encoded = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
        return { jpeg: canvas.toDataURL('image/jpeg').split(',')[1], webp: canvas.toDataURL('image/webp').split(',')[1] };
    });
    await page.locator('.comment-composer input[type="file"]').setInputFiles([
        { name: 'canvas.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(encoded.jpeg, 'base64') },
        { name: 'canvas.webp', mimeType: 'image/webp', buffer: Buffer.from(encoded.webp, 'base64') }
    ]);
    await expect(page.locator('.comment-composer .comment-image img')).toHaveCount(4);
    await page.locator('.comment-composer input[type="file"]').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload="alert(1)"></svg>') });
    await expect(page.locator('.comment-error')).toContainText('Invalid image content');
    await expect(page.locator('.comment-composer .comment-image img')).toHaveCount(4);
    await page.getByRole('button', { name: 'Publish comment', exact: true }).click();
    await expect(page.locator('.comment-publication img')).toHaveCount(4);
    await expect(page.locator('.comment-publication button')).toHaveCount(4);
    await page.getByRole('button', { name: 'Enlarge paste.png', exact: true }).click();
    await expect(page.locator('.comment-image-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('.comment-image-viewer')).toHaveCount(0);
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.conversations.entries.length).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.conversations.entries[0].images[1].mime).toBe('image/png');
    expect(saved.extensions.conversations.entries[0].images.map((image: { mime: string }) => image.mime)).toEqual(['image/png', 'image/png', 'image/jpeg', 'image/webp']);
    expect(saved.board.tasks[0].attachments).toEqual([]);
});

test('a failed save keeps the applied publication and retry saves that same record once', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Retry comments', hasHandle: true, tasks: [{ id: 1, title: 'Retry workitem', status: 'to-do' }] }], { selectedBoardId: 'p' });
    await installControlledPortfolioWriter(page, { boardId: 'p', failWrites: 1 });
    await portfolioCard(page, 'Retry workitem').click();
    await page.locator('#commentAuthor').fill('Author'); await page.locator('#commentText').fill('Applied only once');
    await page.getByRole('button', { name: 'Publish comment', exact: true }).click();
    await expect(page.locator('.comment-publication')).toHaveCount(1);
    const id = await page.locator('.comment-publication').getAttribute('data-comment-id');
    await expect(page.locator('#commentText')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.locator('.chip-save-state.error')).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.conversations?.entries.length).toBe(1);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.conversations.entries[0].id).toBe(id);
    expect(saved.extensions.timeline.events.filter((event: { kind: string }) => event.kind === 'task.comment.published')).toHaveLength(1);
});

test('manual volume fixture paginates by publication order and historic snapshots cannot show future posts', async ({ page }) => {
    const fixture = JSON.parse(readFileSync('test-board/us-7.board.json', 'utf8'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Delivery conversation').click();
    await expect(page.locator('.comment-publication')).toHaveCount(50);
    await expect(page.locator('.comment-publication').first()).toHaveAttribute('data-comment-id', 'us7-comment-6');
    await page.getByRole('button', { name: 'Load earlier comments', exact: true }).click();
    await expect(page.locator('.comment-publication')).toHaveCount(55);
    await expect(page.locator('.comment-publication').first()).toHaveAttribute('data-comment-id', 'us7-comment-1');
    await page.keyboard.press('Escape');
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 1);
    // Historical cards retain their projected source and open a read-only detail.
    await portfolioCard(page, 'Delivery conversation').click();
    await expect(page.locator('.comment-publication')).toHaveCount(1);
    await expect(page.locator('.comment-composer')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('[data-action="timeline-restore"]').click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.timeline.events.at(-1).kind).toBe('board.restored');
    await portfolioCard(page, 'Delivery conversation').click();
    await expect(page.locator('.comment-publication')).toHaveCount(50);
    await expect(page.locator('.comment-composer')).toBeVisible();
    expect((await readSavedBoard(page, 'p')).extensions.conversations.entries).toHaveLength(56);
});

test('conflict reload warns before losing unsaved publications and offers a complete recovery download', async ({ page }, testInfo) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Conflict comments', hasHandle: true, tasks: [{ id: 1, title: 'Conflict item', status: 'to-do' }] }], { selectedBoardId: 'p' });
    const external = await readSavedBoard(page, 'p');
    await installControlledPortfolioWriter(page, { boardId: 'p', failWrites: 1 });
    await portfolioCard(page, 'Conflict item').click();
    await page.locator('#commentAuthor').fill('Author'); await page.locator('#commentText').fill('Locally published, not saved');
    await page.getByRole('button', { name: 'Publish comment', exact: true }).click();
    await expect(page.locator('.comment-publication')).toHaveCount(1);
    await page.locator('#commentText').fill('Unsent draft also survives');
    await page.keyboard.press('Escape');
    external.board.tasks[0].title = 'External item';
    await mutateExternalBoardFile(page, { boardId: 'p', payload: external }); await triggerExternalFileCheck(page);
    await page.locator('#appMessageModal').getByRole('button', { name: 'Reload from disk', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('locally available published comments');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download recovery copy', exact: true }).click();
    const download = await downloadPromise; const path = testInfo.outputPath('comments-recovery.json'); await download.saveAs(path);
    expect(JSON.parse(readFileSync(path, 'utf8')).publishedComments[0].text).toBe('Locally published, not saved');
    await expect(page.locator('#appMessageModal')).toHaveCount(0);
    await portfolioCard(page, 'Conflict item').click();
    await expect(page.locator('.comment-publication')).toHaveCount(1);
    await expect(page.locator('#commentText')).toHaveValue('Unsent draft also survives');
});

test('import rejects structurally PNG-looking but undecodable image content rather than dropping it', async ({ page }) => {
    await gotoApp(page);
    const fixture = JSON.parse(readFileSync('test-board/us-7.board.json', 'utf8'));
    const corrupt = Buffer.from(png, 'base64'); corrupt.fill(0, 41, 54);
    fixture.extensions.conversations.entries[0].images[0].dataUrl = `data:image/png;base64,${corrupt.toString('base64')}`;
    await mockImportProjectsPicker(page, [{ fileName: 'invalid-image.board.json', payload: fixture }]);
    await page.locator('#importProjectsBtn').click();
    await expect(page.locator('#appMessageModal')).toContainText('Invalid comment: format');
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
});

test('external removal retains an orphaned draft for recovery instead of deleting it', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Draft recovery', hasHandle: true, tasks: [{ id: 1, title: 'Draft item', status: 'to-do' }] }], { selectedBoardId: 'p' });
    const disk = await readSavedBoard(page, 'p');
    await portfolioCard(page, 'Draft item').click();
    await page.locator('#commentAuthor').fill('Draft author'); await page.locator('#commentText').fill('Recover this unsent text');
    disk.board.tasks = [];
    await mutateExternalBoardFile(page, { boardId: 'p', payload: disk }); await triggerExternalFileCheck(page);
    await expect(page.locator('#taskDetailModal')).toHaveCount(0);
    await page.getByText('Recover draft for Draft item', { exact: true }).click();
    await expect(page.getByLabel('Retained draft text', { exact: true })).toHaveValue('Recover this unsent text');
    await expect(page.getByRole('button', { name: 'Download recovery copy', exact: true })).toBeVisible();
});
