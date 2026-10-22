import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, answerAppMessage, openFiltersPanel } from '../support/portfolio';

for (const { width, dark } of [1280, 390].flatMap((width) => [false, true].map((dark) => ({ width, dark })))) {
test(`settings rows fit and unused values can be removed at ${width}px (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await gotoApp(page);
    if (dark) await page.locator('#themeToggleBtn').click();
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Settings layout', hasHandle: true,
        members: ['Ana', 'Unused member'], tags: ['bug', 'unused-tag'],
        tasks: [{ id: 1, title: 'Assigned', assignees: ['Ana'], tags: ['bug'] }] }]);
    await page.getByRole('button', { name: 'Settings for Settings layout', exact: true }).click();
    await page.screenshot({ path: `test-results/project-settings-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    const saveBox = await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).boundingBox();
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const row = page.getByLabel('Member 2 name', { exact: true }).locator('..');
    const inputBox = await page.getByLabel('Member 2 name', { exact: true }).boundingBox();
    const removeBox = await row.getByRole('button').boundingBox();
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(removeBox!.x);
    expect(removeBox!.width).toBeGreaterThanOrEqual(32);
    expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(width);
    await expect(page.locator('.project-settings-use')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Remove member 1', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove tag bug', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove member 2', exact: true }).click();
    await expect(page.getByLabel('Member 2 name', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove tag unused-tag', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove tag unused-tag', exact: true })).toHaveCount(0);
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.project.members.map((member: { name: string }) => member.name)).toEqual(['Ana']);
    expect(saved.extensions.project.tags).toEqual(['bug']);
});
}

test('settings edit the intended project without changing selection and persist identity, members, tags and status', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'p', title: 'Project', hasHandle: true, tasks: [{ id: 1, title: 'Legacy task', assignees: ['Ana'], responsible: 'Ana', tags: ['legacy'] }] },
        { id: 'other', title: 'Other', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'other' });
    const trigger = page.getByRole('button', { name: 'Settings for Project', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const modal = page.locator('#projectSettingsModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Other');
    await expect(page.locator('#projectStatus')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Remove member 1', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove tag legacy', exact: true })).toBeDisabled();
    await page.locator('#projectName').fill('Renamed project');
    await page.locator('#projectDescription').fill('Reusable description');
    await page.locator('#projectStatus').selectOption('paused');
    await page.getByLabel('Member 1 name', { exact: true }).fill('Ana Silva');
    await modal.getByRole('button', { name: 'Add member', exact: true }).click();
    await page.getByLabel('Member 2 name', { exact: true }).fill('Rui');
    await page.locator('#projectNewTag').fill(' Delivery ');
    await modal.getByRole('button', { name: 'Add tag', exact: true }).click();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden(); await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.project).toMatchObject({ version: 1, description: 'Reusable description', status: 'paused', tags: ['legacy', 'delivery'] });
    expect(saved.board.tasks[0]).toMatchObject({ assignees: ['Ana Silva'], responsible: 'Ana Silva' });
    expect(saved.board.tasks[0].responsibleId).toBe(saved.extensions.project.members[0].id);
    expect(saved.extensions.timeline.events.at(-1).kind).toBe('board.project.updated');
    const id = saved.extensions.project.id;
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'reopen', title: saved.board.settings.title, fileName: 'different-file-name.board.json', hasHandle: true, tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopen' });
    await page.getByRole('button', { name: 'Settings for Renamed project', exact: true }).click();
    await expect(page.locator('#projectDescription')).toHaveValue('Reusable description');
    await expect(page.locator('#projectStatus')).toHaveValue('paused');
    await page.locator('#projectName').fill('Renamed again');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden(); await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'reopen')).extensions.project.id).toBe(id);
});

test('cancel, close, Escape and outside-click discard settings drafts and restore focus', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Unchanged', hasHandle: true }]);
    const trigger = page.getByRole('button', { name: 'Settings for Unchanged', exact: true });
    const modal = page.locator('#projectSettingsModal');
    for (const action of ['Cancel', 'Close', 'Escape', 'Outside']) {
        await trigger.click();
        await page.locator('#projectName').fill('Discard');
        if (action === 'Escape') await page.keyboard.press('Escape');
        else if (action === 'Outside') await page.mouse.click(5, 5);
        else await modal.getByRole('button', { name: action, exact: true }).click();
        await expect(modal).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click(); await expect(page.locator('#projectName')).toHaveValue('Unchanged');
        await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
});

test('curated choices are local to the project and neither the task editor nor palette can create typos', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
        { id: 'p', title: 'Curated', hasHandle: true, members: ['Ana', 'Rui'], tags: ['bug'], tasks: [{ id: 1, title: 'Work', assignees: ['Ana'] }] },
        { id: 'other', title: 'Other', hasHandle: true, members: ['Outside person'], tags: ['outside'] }
    ], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Work').locator('[data-action="edit-task"]').click();
    await expect(page.locator('#taskResponsible option')).toHaveText(['No responsible person', 'Ana', 'Rui']);
    await expect(page.locator('#taskAssigneeNewItem option')).toHaveText(['Choose', 'Rui']);
    await expect(page.locator('#taskTagNewItem option')).toHaveText(['Choose', 'bug']);
    await expect(page.locator('#taskAssigneeItems input')).toHaveCount(0);
    await page.locator('#taskResponsible').selectOption('Rui');
    await expect(page.locator('#taskAssigneeItems')).toContainText('Rui');
    await page.locator('#taskTagNewItem').selectOption('bug'); await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModalSaveBtn').click(); await expect(page.locator('#taskModal')).toBeHidden();
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: 'Rui', tags: ['bug'] });
    await page.locator('#portfolioSearchBtn').click();
    await page.locator('#commandPaletteInput').fill('+ Typo @unknown #bug in:curated');
    await expect(page.locator('#commandPalette')).toContainText('Member not in this project');
    await expect(page.locator('#commandPalette .palette-item')).toHaveCount(0);
    await page.locator('#commandPaletteInput').fill('+ Typo #outside in:curated');
    await expect(page.locator('#commandPalette')).toContainText('Tag not in this project');
    await expect(page.locator('#commandPalette .palette-item')).toHaveCount(0);
});

test('historical and read-only settings are consultable; restoring recovers names and identity', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'History', hasHandle: true, tasks: [{ id: 1, title: 'Task', assignees: ['Ana'] }] }], { selectedBoardId: 'p' });
    const trigger = page.getByRole('button', { name: 'Settings for History', exact: true });
    await trigger.click(); await page.getByLabel('Member 1 name', { exact: true }).fill('Ana Silva');
    await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#projectSettingsModal')).toBeHidden(); await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    await page.locator('[data-action="timeline-toggle-expanded"]').click();
    const slider = page.getByRole('slider'); await slider.focus(); await page.keyboard.press('Home');
    await trigger.click();
    await expect(page.getByLabel('Member 1 name', { exact: true })).toHaveValue('Ana');
    await expect(page.locator('#projectName')).toBeDisabled();
    await expect(page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Restore this state', exact: true }).click();
    await waitForBoardWrites(page, 2);
    const restored = await readSavedBoard(page, 'p');
    expect(restored.board.tasks[0].assignees).toEqual(['Ana']);
    expect(restored.extensions.project.id).toBe(saved.extensions.project.id);
    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'ro', title: 'Read only', tasks: restored.board.tasks, extensions: restored.extensions }]);
    await page.getByRole('button', { name: 'Settings for Read only', exact: true }).click();
    await expect(page.locator('#projectName')).toBeDisabled();
    await expect(page.locator('#projectSettingsModal')).toContainText('Read-only project settings');
});

test('archived is informational and invalid member names leave the draft available for correction', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Lifecycle', hasHandle: true, members: ['Ana', 'Rui'], tasks: [{ id: 1, title: 'Unfinished', status: 'doing', assignees: ['Ana'] }] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Settings for Lifecycle', exact: true }).click();
    const modal = page.locator('#projectSettingsModal');
    await page.locator('#projectStatus').selectOption('archived');
    await page.getByLabel('Member 2 name', { exact: true }).fill(' ANA ');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await answerAppMessage(page, { expectText: 'Member names must be unique' });
    await expect(modal).toBeVisible();
    await page.getByLabel('Member 2 name', { exact: true }).fill('Rui');
    await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal).toBeHidden();
    await expect(portfolioCard(page, 'Unfinished')).toBeVisible();
    await portfolioCard(page, 'Unfinished').locator('[data-action="edit-task"]').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await openFiltersPanel(page); // Project lifecycle must not alter the independent task archive filter.
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
});
