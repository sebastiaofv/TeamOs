import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage, setBoardSearch, portfolioCard } from '../support/portfolio';

test('first child relocation is explicit and atomic; progress is global and tree controls are independent', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Planning', hasHandle: true,
        tasks: [{ id: 1, title: 'Complete', status: 'done', phaseId: 'phase' }, { id: 2, title: 'Archived', status: 'to-do', phaseId: 'phase', archived: true }],
        extensions: { roadmap: { version: 1, milestones: [], sprints: [], phases: [{ id: 'phase', title: 'Delivery', startDate: '2026-10-01', endDate: '2026-10-30' }] } }
    }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('#roadmap-row-phase-phase')).toContainText('50%');
    await expect(page.locator('#roadmap-row-phase-phase')).toContainText('1 of 2 associated');
    await setBoardSearch(page, 'Complete');
    await expect(page.locator('#roadmap-row-phase-phase')).toContainText('50%');
    await setBoardSearch(page, '');
    await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('Implementation');
    await page.locator('#roadmapPhaseParent').selectOption('phase');
    await expect(page.locator('#roadmapEntityStartDate')).toHaveValue('2026-10-01');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await answerAppMessage(page, { button: 'Implementation', expectText: '2 directly assigned workitems' });
    await expect(page.locator('#roadmap-row-phase-implementation')).toBeVisible();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[1].phaseId).toBe('implementation');
    await page.getByRole('button', { name: 'Expand/collapse subphases of Delivery' }).click();
    await expect(page.locator('#roadmap-row-phase-implementation')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show tasks for Delivery' }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:phase"]')).toContainText('Complete');
    await page.getByRole('button', { name: 'Delete Delivery', exact: true }).click();
    await answerAppMessage(page, { expectText: 'Move or delete subphases first' });
    expect((await readSavedBoard(page, 'p')).extensions.roadmap.phases).toHaveLength(2);
});

test('unplanned workitems can receive independent leaf associations in detail', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Planning', hasHandle: true,
        tasks: [{ id: 1, title: 'Unplanned', status: 'doing', sprintId: 's' }],
        extensions: { roadmap: { version: 2, milestones: [{ id: 'm', title: 'Release', dueDate: '2026-12-15' }], sprints: [{ id: 's', title: 'Sprint', startDate: '2026-10-01', endDate: '2026-10-14' }], phases: [
            { id: 'parent', title: 'Parent', startDate: '2026-10-01', endDate: '2026-10-30' },
            { id: 'leaf', parentId: 'parent', title: 'Leaf', startDate: '2026-10-01', endDate: '2026-10-30' }
        ] } }
    }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Unplanned').click();
    const planning = page.locator('.task-planning');
    await expect(planning.locator('option[value="parent"]')).toHaveCount(0);
    await planning.getByLabel('Phase', { exact: true }).selectOption('leaf');
    await planning.getByLabel('Milestone', { exact: true }).selectOption('m');
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks[0].milestoneId).toBe('m');
    expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ phaseId: 'leaf', milestoneId: 'm', sprintId: 's', status: 'doing' });
});
