import { readFileSync } from 'node:fs';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { gotoApp, portfolioCard, seedPortfolioBoards } from '../support/portfolio';

// Full Chromium includes the PDF viewer; Playwright's default headless shell
// downloads PDFs because it has no viewer.
test.use({ channel: 'chromium' });

const fixture = JSON.parse(readFileSync('test-board/us-23.board.json', 'utf8'));
const attachments: { name: string; dataUrl: string }[] = fixture.board.tasks[0].attachments;

async function expectActionsAligned(rows: Locator, count = 7) {
  const positions = await rows.evaluateAll((items) => items.map((item) => {
    const download = item.querySelector('.attachment-download')!.getBoundingClientRect();
    const open = item.querySelector('.attachment-open')?.getBoundingClientRect();
    return { x: download.x, right: download.right, y: download.y, openRight: open?.right, openY: open?.y };
  }));
  expect(positions).toHaveLength(count);
  for (const position of positions) {
    expect(position.x).toBeCloseTo(positions[0].x, 0);
    expect(position.right).toBeCloseTo(positions[0].right, 0);
    if (position.openRight !== undefined) {
      expect(position.openRight).toBeLessThan(position.x);
      expect(position.openY).toBeCloseTo(position.y, 0);
    }
  }
}

async function expectPreviewsAndDownloads(page: Page, rows: Locator) {
  await expect(rows).toHaveCount(7);
  await expect(rows.locator('.attachment-open')).toHaveCount(4);
  await expectActionsAligned(rows);
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  for (let index = 0; index < attachments.length; index++) {
    const row = rows.nth(index);
    const open = row.getByRole('link', { name: 'Open', exact: true });
    if (index < 4) {
      await expect(open).toHaveAttribute('target', '_blank');
      await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
      const [popup] = await Promise.all([page.waitForEvent('popup'), open.click()]);
      await popup.waitForLoadState();
      await expect(popup).toHaveURL(/^blob:/);
      if (index < 2) {
        await expect.poll(() => popup.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);
      }
      // Inspect the bytes behind the navigated URL, including PDFs with a
      // generic upload MIME: they must be served inline as application/pdf.
      const preview = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return { type: response.headers.get('content-type'), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
      }, popup.url());
      expect(preview.type).toBe(index === 0 ? 'image/png' : index === 1 ? 'image/jpeg' : 'application/pdf');
      expect(Buffer.from(preview.bytes)).toEqual(Buffer.from(attachments[index].dataUrl.split(',')[1], 'base64'));
      await popup.close();
      expect(downloads).toEqual([]);
    } else {
      await expect(open).toHaveCount(0);
    }
  }
  for (let index = 0; index < attachments.length; index++) {
    const [download] = await Promise.all([
      page.waitForEvent('download'), rows.nth(index).getByRole('link', { name: /^Download(?: |$)/ }).click()
    ]);
    expect(download.suggestedFilename()).toBe(attachments[index].name);
    const path = await download.path();
    expect(readFileSync(path!)).toEqual(Buffer.from(attachments[index].dataUrl.split(',')[1], 'base64'));
  }
}

for (const surface of ['details', 'read-only details']) {
  test(`${surface}: images and PDFs open in new tabs; every format downloads and stays aligned`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'preview', title: fixture.board.settings.title,
      hasHandle: surface !== 'read-only details', tasks: fixture.board.tasks }], { selectedBoardId: 'preview' });
    const card = portfolioCard(page, fixture.board.tasks[0].title);
    await card.click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    const rows = page.locator('#detailAttachments .detail-attachment-item');
    await expectPreviewsAndDownloads(page, rows);
    // The added action must still fit the existing mobile dialog layout.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectActionsAligned(rows);
    const list = page.locator('#detailAttachments');
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  });
}

test('preview URLs are released when the dialog closes and recreated when reopened', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'preview', title: fixture.board.settings.title, hasHandle: true, tasks: fixture.board.tasks }], { selectedBoardId: 'preview' });
  const card = portfolioCard(page, fixture.board.tasks[0].title);
  await card.click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  const open = page.locator('#detailAttachments .attachment-open').first();
  await expect(open).toHaveAttribute('href', /^blob:/);
  const previousUrl = await open.getAttribute('href');
  await page.locator('#taskDetailModalCloseBtn').click();
  const released = await page.evaluate(async (url) => {
    try { await fetch(url!); return false; } catch { return true; }
  }, previousUrl);
  expect(released).toBe(true);
  await card.click();
  await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
  await expect(open).toHaveAttribute('href', /^blob:/);
  expect(await open.getAttribute('href')).not.toBe(previousUrl);
});

for (const surface of ['details', 'read-only details']) {
  test(`${surface}: text, CSV, JSON, XML, images, audio and video open inline with original downloads`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'formats', title: fixture.board.settings.title,
      hasHandle: surface !== 'read-only details', tasks: fixture.board.tasks }], { selectedBoardId: 'formats' });
    const downloads: string[] = [];
    page.on('download', download => downloads.push(download.suggestedFilename()));
    for (const task of fixture.board.tasks.slice(2)) {
      const card = portfolioCard(page, task.title);
      await card.click();
      await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
      const rows = page.locator('#detailAttachments .detail-attachment-item');
      await expect(rows.locator('.attachment-open')).toHaveCount(task.attachments.length);
      await expectActionsAligned(rows, task.attachments.length);
      for (let index = 0; index < task.attachments.length; index++) {
        const attachment = task.attachments[index];
        const downloadCount = downloads.length;
        const [popup] = await Promise.all([
          page.waitForEvent('popup'), rows.nth(index).getByRole('link', { name: 'Open', exact: true }).click()
        ]);
        await popup.waitForLoadState();
        await expect(popup).toHaveURL(/^blob:/);
        if (attachment.mime.startsWith('image/')) {
          await expect.poll(() => popup.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        } else if (/^(audio|video)\//.test(attachment.mime)) {
          await expect.poll(() => popup.locator('video, audio').evaluate((media: HTMLMediaElement) => media.readyState)).toBeGreaterThanOrEqual(1);
        } else {
          await expect(popup.locator('body')).toContainText('TeamOS');
        }
        const preview = await page.evaluate(async (url) => {
          const response = await fetch(url);
          return { type: response.headers.get('content-type'), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
        }, popup.url());
        expect(preview.type).toBe(['text/csv', 'application/xml'].includes(attachment.mime) ? 'text/plain' : attachment.mime);
        expect(Buffer.from(preview.bytes)).toEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'));
        expect(downloads).toHaveLength(downloadCount);
        await popup.close();
        const [download] = await Promise.all([
          page.waitForEvent('download'), rows.nth(index).getByRole('link', { name: /^Download(?: |$)/ }).click()
        ]);
        expect(download.suggestedFilename()).toBe(attachment.name);
        expect(readFileSync((await download.path())!)).toEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'));
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await expectActionsAligned(rows, task.attachments.length);
      await page.locator('#taskDetailModalCloseBtn').click();
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });
}
