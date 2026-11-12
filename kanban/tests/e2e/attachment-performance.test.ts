import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { gotoApp, portfolioCard, seedPortfolioBoards } from '../support/portfolio';

// Use the complete browser, including the PDF viewer, rather than headless shell.
test.use({ channel: 'chromium' });
const fixture = JSON.parse(readFileSync('tests/fixtures/manual/us-23.board.json', 'utf8'));

function pdfOfSize(size: number) {
  const content = 'BT /F1 18 Tf 50 120 Td (TeamOS attachment performance) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let document = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = document.length;
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  // Pad with a PDF comment before the xref, keeping a valid EOF and offsets.
  const xrefLength = 'xref\n0 6\n0000000000 65535 f \n'.length + offsets.length * 20;
  const trailer = '\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n';
  const xrefOffset = size - xrefLength - trailer.length - String(size).length - '\n%%EOF\n'.length;
  document += `%${' '.repeat(xrefOffset - document.length - 2)}\n`;
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}${trailer}${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document);
}

for (const surface of ['details', 'read-only details', 'standalone']) {
  test(`${surface}: a 100 KB PDF finishes loading in the native viewer within 2 seconds`, async ({ page }, testInfo) => {
    if (surface === 'standalone') {
      await page.goto(pathToFileURL(resolve('dist-standalone/index.html')).href);
      await expect(page.locator('#portfolioView')).toBeVisible();
    } else await gotoApp(page);
    const pdf = pdfOfSize(100 * 1024);
    expect(pdf.length).toBe(100 * 1024);
    await seedPortfolioBoards(page, [{ id: 'speed', title: 'Preview performance', hasHandle: surface !== 'read-only details',
      tasks: [{ title: '100 KB PDF', attachments: [{ ...fixture.board.tasks[0].attachments[2],
        dataUrl: `data:application/pdf;base64,${pdf.toString('base64')}`, sizeBytes: pdf.length }] }]
    }], { selectedBoardId: 'speed' });
    const card = portfolioCard(page, '100 KB PDF');
    await card.click();
    await page.getByRole('tab', { name: 'Attachments', exact: true }).click();
    const downloads: string[] = [];
    page.on('download', download => downloads.push(download.suggestedFilename()));
    const start = performance.now();
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('.attachment-open').click()]);
    // Navigation alone passes even when the PDF viewer is still loading.
    await expect.poll(async () => {
      for (const frame of popup.frames()) {
        const loaded = await frame.evaluate(() => {
          const viewer = document.querySelector('pdf-viewer');
          return viewer !== null && Reflect.get(viewer, 'loadState_') === 'success';
        }).catch(() => false);
        if (loaded) return true;
      }
      return false;
    }, { timeout: 2000, intervals: [25, 50, 100] }).toBe(true);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    testInfo.annotations.push({ type: 'PDF load', description: `${surface}: ${Math.round(elapsed)} ms` });
    expect(downloads).toEqual([]);
    await popup.close();
  });
}
