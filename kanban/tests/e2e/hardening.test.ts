import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, installControlledPortfolioWriter, readSavedBoard } from '../support/portfolio';

for (const style of ['classic', 'modern']) for (const mode of ['light', 'dark']) {
    test(`audit accessibility fixes in ${style}/${mode}`, async ({ page }, testInfo) => {
        await page.addInitScript(({ style, mode }) => {
            localStorage.setItem('teamOsKanbanThemeStyle', style);
            localStorage.setItem('teamOsKanbanTheme', mode);
        }, { style, mode });
        await gotoApp(page);
        const language = page.locator('#languageToggleBtn');
        await expect(language).toHaveAccessibleName('EN: Switch language to PT');
        await language.click();
        await expect(language).toHaveAccessibleName('PT: Mudar idioma para EN');
        await language.click();
        await seedPortfolioBoards(page, [{ id: 'harden', title: 'Projeto de acessibilidade 日本語 🚀', hasHandle: true,
            tasks: [{ id: 1, title: 'Workitem', status: 'to-do' }],
            extensions: { roadmap: { version: 1,
                milestones: [], phases: [{ id: 'phase', title: 'Phase', startDate: '2026-11-01', endDate: '2026-11-30' }],
                sprints: [{ id: 'sprint', title: 'Sprint', startDate: '2026-11-01', endDate: '2026-11-15' }] } }
        }], { selectedBoardId: 'harden' });
        const remove = page.locator('.portfolio-chip .chip-link-danger');
        const contrast = () => remove.evaluate((button) => {
            const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
            const luminance = (value: string) => rgb(value).map((v) => {
                const channel = v / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
            const foreground = luminance(getComputedStyle(button).color);
            const background = luminance(getComputedStyle(button.closest('.portfolio-chip')!).backgroundColor);
            return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        });
        expect(await contrast()).toBeGreaterThanOrEqual(4.5);
        await remove.hover();
        await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
        await page.locator('[data-view-mode="roadmap"]').click();
        for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 900 });
            const targets = await page.locator('.roadmap-action-btn').evaluateAll((buttons) => buttons.map((button) => {
                const bounds = button.getBoundingClientRect();
                return { width: bounds.width, height: bounds.height };
            }));
            expect(targets.length).toBeGreaterThan(0);
            for (const target of targets) {
                expect(target.width).toBeGreaterThanOrEqual(24);
                expect(target.height).toBeGreaterThanOrEqual(24);
            }
        }
        await page.locator('[data-view-mode="planner"]').click();
        const schedule = page.getByRole('region', { name: 'Planning schedule', exact: true });
        await schedule.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(schedule).toBeFocused();
        await expect(schedule).toHaveCSS('outline-style', 'solid');
        const before = await schedule.evaluate((element) => element.scrollTop);
        await page.keyboard.press('PageDown');
        await expect.poll(() => schedule.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
        await page.screenshot({ path: testInfo.outputPath('planner-keyboard.png') });
        await language.click();
        await expect(page.getByRole('region', { name: 'Grelha de planeamento', exact: true })).toBeVisible();
    });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`saving remains explicit with motion preference ${reducedMotion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion });
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'saving', title: 'Saving', hasHandle: true,
            tasks: [{ id: 1, title: 'Original', status: 'to-do' }] }], { selectedBoardId: 'saving' });
        await portfolioCard(page, 'Original').getByRole('button', { name: 'Edit', exact: true }).click();
        await page.locator('#taskName').fill('Saved after waiting');
        await installControlledPortfolioWriter(page, { boardId: 'saving', holdWrites: true });
        await page.locator('#taskModalSaveBtn').click();
        const saving = page.locator('.chip-save-state.saving');
        await expect(saving).toHaveText('Saving');
        const spinner = saving.locator('.save-spinner');
        await expect(spinner).toBeVisible();
        if (reducedMotion === 'reduce') {
            await expect(spinner).toHaveCSS('animation-name', 'none');
            await expect(spinner).toHaveCSS('border-top-style', 'dotted');
        } else {
            await expect(spinner).toHaveCSS('animation-name', 'save-spin');
            await expect(spinner).toHaveCSS('animation-iteration-count', 'infinite');
        }
        await page.evaluate(() => window.__releaseNextPortfolioWrite!());
        await expect(saving).toHaveCount(0);
        await expect.poll(async () => (await readSavedBoard(page, 'saving')).board.tasks[0].title).toBe('Saved after waiting');
    });
}
