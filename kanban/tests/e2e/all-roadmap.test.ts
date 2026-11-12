import { test, expect, type Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, openProjectPicker, toggleTheme, type SeedBoard } from '../support/portfolio';

async function selectProject(page: Page, title: string) {
    await openProjectPicker(page);
    await page.locator('#portfolioBoardsChips').getByRole('button', { name: title, exact: true }).click();
}

function project(id: string, status = 'active', start = '2026-02-01'): SeedBoard {
    return {
        id, title: id, hasHandle: true,
        tasks: [
            { id: 1, title: `${id} completed work`, status: 'done', archived: true, phaseId: 'done', assigneeIds: [], responsibleId: '' },
            { id: 2, title: `${id} future work`, status: 'to-do', phaseId: 'future', assigneeIds: [], responsibleId: '' }
        ],
        extensions: {
            project: { version: 1, id: `project-${id}`, description: '', status, members: [], tags: [] },
            roadmap: { version: 5, phases: [
                { id: 'root', title: 'Delivery', startDate: start, endDate: '2026-06-01' },
                { id: 'done', title: 'Completed phase', parentId: 'root', startDate: start, endDate: '2026-03-01' },
                { id: 'future', title: 'Next phase', parentId: 'root', startDate: '2026-04-01', endDate: '2026-06-01' }
            ], milestones: [{ id: 'm', title: 'Release', dueDate: '2027-01-01' }], sprints: [{ id: 's', title: 'Sprint', startDate: '2025-01-01', endDate: '2025-02-01' }] }
        }
    };
}

test('ALL Roadmap groups active projects, drills into completed work and preserves individual Roadmap', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [project('Later'), project('Paused', 'paused'), project('Earlier', 'active', '2026-01-01'), project('Completed', 'completed')]);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page).toHaveURL(/pv=roadmap/);
    const roadmap = page.locator('#portfolioRoadmapView');
    const projects = roadmap.locator('[data-roadmap-project]');
    await expect(projects).toHaveCount(2);
    await expect(projects.locator('.roadmap-project-row .roadmap-row-title')).toHaveText(['Earlier', 'Later']);
    await expect(roadmap.locator('[data-roadmap-kind="phase"]')).toHaveCount(0);
    await expect(roadmap.locator('.roadmap-create-btn, .milestone-annotation, [data-roadmap-kind="sprints"]')).toHaveCount(0);
    await expect(projects.first().locator('.roadmap-project-row .roadmap-row-timeline-bar')).toHaveAttribute('data-start', '2026-01-01');
    await expect(projects.first().locator('.roadmap-project-row .roadmap-row-timeline-bar')).toHaveAttribute('data-end', '2026-06-01');
    await expect(projects.first().locator('.roadmap-project-row .roadmap-bar-value')).toHaveText('50%');

    const earlier = projects.first(); const later = projects.last();
    await earlier.getByRole('button', { name: 'Expand/collapse project Earlier' }).click();
    await expect(earlier.locator('[data-roadmap-kind="phase"]')).toHaveCount(3);
    await expect(later.locator('[data-roadmap-kind="phase"]')).toHaveCount(0);
    await earlier.locator('[data-roadmap-id="done"] .roadmap-disclosure-btn').click();
    await earlier.getByRole('button', { name: 'Earlier completed work', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toContainText('Earlier completed work');
    await page.locator('#taskDetailModal .modal-close').click();

    await earlier.getByRole('button', { name: 'Expand/collapse subphases of Delivery' }).click();
    await expect(earlier.locator('[data-roadmap-kind="phase"]')).toHaveCount(1);
    await roadmap.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(roadmap.locator('[data-roadmap-kind="phase"]')).toHaveCount(6);
    await later.locator('[data-roadmap-id="done"] .roadmap-disclosure-btn').click();
    await expect(later.getByRole('button', { name: 'Later completed work', exact: true })).toBeVisible();
    const ids = await roadmap.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    const alignment = await roadmap.locator('.roadmap-row-main').evaluateAll(rows => rows.map(row => {
        const labels = row.querySelector('.roadmap-row-labels')!.getBoundingClientRect();
        const track = row.querySelector('.roadmap-row-track')!.getBoundingClientRect();
        return { edge: labels.right, track: track.left, middle: Math.abs((labels.top + labels.height / 2) - (track.top + track.height / 2)) };
    }));
    for (const row of alignment) { expect(Math.abs(row.edge - alignment[0].edge)).toBeLessThan(1); expect(Math.abs(row.track - row.edge)).toBeLessThan(1); expect(row.middle).toBeLessThan(1); }
    await page.screenshot({ path: 'test-results/all-roadmap-overview.png', fullPage: true });
    await page.getByRole('combobox', { name: 'Timeline zoom' }).selectOption('2');
    await page.screenshot({ path: 'test-results/all-roadmap-expanded.png', fullPage: true });
    await roadmap.getByRole('button', { name: 'Collapse all', exact: true }).click();
    await expect(roadmap.locator('[data-roadmap-kind="phase"]')).toHaveCount(0);

    await selectProject(page, 'Later');
    await expect(page.getByRole('button', { name: 'Add Phase', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Milestone', exact: true })).toBeVisible();
    await expect(roadmap.locator('.milestone-annotation')).toHaveCount(1);
    await expect(roadmap.locator('[data-roadmap-kind="sprints"]')).toBeVisible();
    await selectProject(page, 'All');
    await expect(roadmap).toBeVisible();
    await expect(projects).toHaveCount(2);
    await expect(page).toHaveURL(/pv=roadmap/);
});

test('ALL Roadmap explains empty active projects and an empty portfolio scope', async ({ page }) => {
    await gotoApp(page);
    const empty = project('Empty'); empty.extensions!.roadmap = { version: 5, phases: [], milestones: [], sprints: [] }; empty.tasks = [];
    await seedPortfolioBoards(page, [empty]);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('.roadmap-project-row')).toContainText('N/A');
    await page.getByRole('button', { name: 'Expand/collapse project Empty' }).click();
    await expect(page.locator('#portfolioRoadmapView')).toContainText('No phases in this project yet.');
});

test('ALL Roadmap explains when no loaded project is Active', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [project('Inactive', 'paused')]);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('#portfolioRoadmapView')).toContainText('No active projects.');
});


test('ALL Roadmap keeps project bars visible and aligned on a narrow dark viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoApp(page);
    await toggleTheme(page);
    const day = project('One day'); day.tasks = [];
    day.extensions!.roadmap = { version: 5, phases: [{ id: 'day', title: 'One-day phase', startDate: '2026-06-01', endDate: '2026-06-01' }], milestones: [], sprints: [] };
    await seedPortfolioBoards(page, [project('Earlier'), day]);
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    const bars = await page.locator('.roadmap-project-row .roadmap-row-timeline-bar').evaluateAll(elements => elements.map(element => {
        const bar = element.getBoundingClientRect(); const track = element.parentElement!.getBoundingClientRect();
        return { width: bar.width, left: bar.left - track.left, right: track.right - bar.right };
    }));
    expect(bars).toHaveLength(2);
    for (const bar of bars) { expect(bar.width).toBeGreaterThan(1); expect(bar.left).toBeGreaterThanOrEqual(-1); expect(bar.right).toBeGreaterThanOrEqual(-1); }
    const lastValue = page.locator('.roadmap-project-row').last().locator('.roadmap-bar-value');
    const valueBox = await lastValue.boundingBox();
    expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole('combobox', { name: 'Timeline zoom' })).toBeVisible();
    await page.screenshot({ path: 'test-results/all-roadmap-mobile-dark.png', fullPage: true });
});
