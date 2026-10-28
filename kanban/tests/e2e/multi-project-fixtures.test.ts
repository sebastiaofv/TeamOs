import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoApp, mockImportProjectsPicker, selectPortfolioBoard, dragWithMouse, answerAppMessage } from '../support/portfolio';

test('manual US-12 projects import together and preserve types, states and repeated local IDs', async ({ page }, testInfo) => {
    await page.clock.setFixedTime('2026-10-28T12:00:00.000Z');
    await gotoApp(page);
    await mockImportProjectsPicker(page, ['us-12.board.json', 'us-12-support.board.json'].map((fileName) => ({
        fileName, payload: JSON.parse(readFileSync(`test-board/${fileName}`, 'utf8'))
    })));
    await page.locator('#importProjectsBtn').click();
    await expect(page.locator('#portfolioBoardsChips .portfolio-chip')).toHaveCount(3);
    await page.locator('#portfolioBoardsChips').getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.portfolio-task-card')).toHaveCount(14);
    await expect(page.locator('.portfolio-column')).toHaveCount(5);
    const repeated = page.locator('.portfolio-task-card[data-task-id="1204"]');
    await expect(repeated).toHaveCount(2);
    await expect(repeated.filter({ hasText: 'Implementar confirmação' }).locator('.portfolio-project-badge')).toHaveText('US-12 · Checkout');
    await expect(repeated.filter({ hasText: 'Enviar confirmação por email' }).locator('.portfolio-project-badge')).toHaveText('US-12 · Suporte');
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card[data-status="review"]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('all-technical.png'), animations: 'disabled' });
    await dragWithMouse(page, page.locator('.portfolio-task-card[data-task-id="1208"] .task-title'), page.locator('#portfolio-done-column'));
    await expect(page.locator('#appMessageModal .modal-footer button')).toHaveText(['Cancel', 'Validado', 'Publicado']);
    await answerAppMessage(page, { button: 'Cancel' });
    await expect(page.locator('.portfolio-task-card[data-task-id="1208"]')).toHaveAttribute('data-status', 'building');
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await expect(page.locator('.portfolio-task-card')).toHaveCount(10);
    await expect(page.locator('.portfolio-task-card[data-task-id="1201"]')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('all-functional.png'), animations: 'disabled' });
    await selectPortfolioBoard(page, 'US-12 · Checkout');
    await expect(page.locator('.portfolio-column')).toHaveCount(9);
    await expect(page.locator('.portfolio-task-card[data-task-id="1201"]')).toContainText('Checkout acessível');
    await selectPortfolioBoard(page, 'US-12 · Suporte');
    await expect(page.locator('.portfolio-column')).toHaveCount(8);
    await expect(page.locator('.portfolio-task-card[data-task-id="1201"]')).toContainText('Portal de suporte');
    await expect(page.locator('#portfolio-released-column')).toContainText('Receber número do pedido');
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('.roadmap-axis-label')).toContainText('2026-10-05 — 2026-11-27');
});
