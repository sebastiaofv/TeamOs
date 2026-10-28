import { test, expect } from '@playwright/test';
import { defaultWorkflow } from '../../src/domain/workflow';
import { gotoApp, seedPortfolioBoards, readSavedBoard, waitForBoardWrites } from '../support/portfolio';

test('settings keep independent workflow drafts and apply labels and colours to the respective boards and items', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Two processes', hasHandle: true, extensions: { workflow: defaultWorkflow() }, tasks: [
        { id: 1, title: 'Implementation task', type: 'task', status: 'doing' },
        { id: 2, title: 'Product story', type: 'story', status: 'doing' },
        { id: 3, title: 'Product epic', type: 'epic', status: 'doing' },
        { id: 4, title: 'Technical bug', type: 'bug', status: 'doing' }
    ] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Settings for Two processes', exact: true }).click();
    const modal = page.locator('#projectSettingsModal');
    const tabs = modal.getByRole('tablist', { name: 'Project settings', exact: true });
    await expect(tabs.getByRole('tab')).toHaveText(['General', 'Technical workflow', 'Functional workflow']);
    await tabs.getByRole('tab', { name: 'Technical workflow', exact: true }).click();
    await expect(modal).toContainText('Applies to Tasks and Bugs.');
    await modal.locator('[data-state-choice="doing"]').click();
    await modal.getByRole('textbox', { name: 'Title 3', exact: true }).fill('Implementation');
    await modal.getByLabel('Color', { exact: true }).fill('#112233');
    await expect(modal).toContainText('2 workitems in this state, including archived');
    await tabs.getByRole('tab', { name: 'Technical workflow', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Functional workflow', exact: true })).toBeFocused();
    await expect(modal).toContainText('Applies to Stories and Epics.');
    await modal.locator('[data-state-choice="doing"]').click();
    await expect(modal.getByRole('textbox', { name: 'Title 3', exact: true })).toHaveValue('In progress');
    await modal.getByRole('textbox', { name: 'Title 3', exact: true }).fill('Functional analysis');
    await modal.getByLabel('Color', { exact: true }).fill('#aa22bb');
    await expect(modal).toContainText('2 workitems in this state, including archived');
    await tabs.getByRole('tab', { name: 'Technical workflow', exact: true }).click();
    await expect(modal.getByRole('textbox', { name: 'Title 3', exact: true })).toHaveValue('Implementation');
    await tabs.getByRole('tab', { name: 'General', exact: true }).click();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden();
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.extensions.workflow.states[2]).toMatchObject({ name: 'Implementation', color: '#112233' });
    expect(saved.extensions.functionalWorkflow.states[2]).toMatchObject({ name: 'Functional analysis', color: '#aa22bb' });
    await expect(page.locator('.portfolio-column[data-status="doing"] h2')).toHaveText('Implementation');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).toContainText('Implementation task');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).toContainText('Technical bug');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).not.toContainText('Product story');
    await page.getByRole('button', { name: 'Functional Board', exact: true }).click();
    await expect(page.locator('.portfolio-column[data-status="doing"] h2')).toHaveText('Functional analysis');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).toContainText('Product story');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).toContainText('Product epic');
    await expect(page.locator('.portfolio-column[data-status="doing"]')).not.toContainText('Technical bug');
    await page.locator('[data-view-mode="table"]').click();
    for (const id of [1, 4]) {
        const badge = page.locator(`#workitemsTable [data-task-id="${id}"] [data-column="status"] .table-status-badge`);
        await expect(badge).toHaveText('Implementation');
        await expect(badge).toHaveAttribute('data-state-color', '#112233');
    }
    for (const id of [2, 3]) {
        await page.locator(`[data-table-view="${id === 2 ? 'stories' : 'epics'}"]`).click();
        const badge = page.locator(`#workitemsTable [data-task-id="${id}"] [data-column="status"] .table-status-badge`);
        await expect(badge).toHaveText('Functional analysis');
        await expect(badge).toHaveAttribute('data-state-color', '#aa22bb');
    }
    await page.getByRole('button', { name: 'Settings for Two processes', exact: true }).click();
    await tabs.getByRole('tab', { name: 'Functional workflow', exact: true }).click();
    await modal.locator('[data-state-choice="doing"]').click();
    await expect(modal.getByRole('textbox', { name: 'Title 3', exact: true })).toHaveValue('Functional analysis');
});

for (const width of [390, 1280]) {
    test(`functional workflow fits at ${width}px and read-only settings remain consultable`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 720 });
        await gotoApp(page);
        await seedPortfolioBoards(page, [{ id: 'p', title: 'Read only workflows', extensions: { workflow: defaultWorkflow(), functionalWorkflow: defaultWorkflow() } }]);
        await page.getByRole('button', { name: 'Settings for Read only workflows', exact: true }).click();
        const modal = page.locator('#projectSettingsModal');
        await modal.getByRole('tab', { name: 'Functional workflow', exact: true }).click();
        await expect(modal.getByRole('textbox', { name: 'Title 1', exact: true })).toBeDisabled();
        await expect(modal.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
        const tab = await modal.getByRole('tab', { name: 'Functional workflow', exact: true }).boundingBox();
        expect(tab!.x + tab!.width).toBeLessThanOrEqual(width);
        const close = await modal.getByRole('button', { name: 'Close', exact: true }).last().boundingBox();
        expect(close!.y + close!.height).toBeLessThanOrEqual(720);
        await page.screenshot({ path: testInfo.outputPath(`functional-workflow-${width}.png`) });
    });
}
