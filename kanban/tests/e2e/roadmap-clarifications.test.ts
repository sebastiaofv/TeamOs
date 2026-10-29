import { showTimeline } from '../support/portfolio';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoApp, seedPortfolioBoards, readSavedBoard, answerAppMessage } from '../support/portfolio';

async function seed(page: Page, writable = true) {
    const fixture = JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
    await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: fixture.board.settings.title, hasHandle: writable, tasks: fixture.board.tasks, extensions: fixture.extensions }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
}
const area = (page: Page, key: string) => page.locator(`[data-roadmap-task-list="${key}"]`);
const ids = async (scope: ReturnType<typeof area>) => scope.locator('tbody tr[data-task-id]').evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-task-id'))).sort((a, b) => a - b));

test('compact phase/sprint rows share tables and execution progress; Today spans the complete expanded Gantt', async ({ page }) => {
    await seed(page);
    await expect(page.locator('.roadmap-section[data-roadmap-kind="milestones"]')).toHaveCount(0);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="milestone"]')).toHaveCount(0);
    await expect(page.locator('.milestone-annotation')).toHaveCount(3);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    await expect(page.locator('#roadmap-row-sprint-october .roadmap-bar-value')).toHaveText('25%');
    await expect(page.locator('#roadmap-row-phase-empty-phase .roadmap-bar-value')).toHaveText('N/A');
    const geometry = await page.locator('#roadmap-row-phase-api .roadmap-row-main').evaluate((row) => {
        const name = row.querySelector('.roadmap-row-title')!.getBoundingClientRect();
        const dates = row.querySelector('.roadmap-row-meta')!.getBoundingClientRect();
        const labels = row.querySelector('.roadmap-row-labels')!.getBoundingClientRect();
        const track = row.querySelector('.roadmap-row-track')!.getBoundingClientRect();
        return { height: row.getBoundingClientRect().height, centerDifference: Math.abs(name.y + name.height / 2 - dates.y - dates.height / 2), overlap: labels.right - track.left };
    });
    expect(geometry.height).toBeLessThanOrEqual(40); expect(geometry.centerDifference).toBeLessThan(2); expect(geometry.overlap).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    await expect(area(page, 'phase:delivery').locator('table.workitems-table')).toHaveCount(1);
    expect(await ids(area(page, 'phase:delivery'))).toEqual([501, 502, 504]);
    await expect(area(page, 'phase:delivery').locator('.portfolio-task-card, .roadmap-row-timeline-bar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show tasks for October execution', exact: true }).click();
    await page.locator('#portfolioRoadmapView').evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    expect(await ids(area(page, 'sprint:october'))).toEqual([501, 502, 506, 507]);
    const line = await page.locator('.roadmap-today-marker').boundingBox();
    const sprint = await page.locator('#roadmap-row-sprint-october').boundingBox();
    expect(line!.height).toBeGreaterThan(400); expect(line!.y + line!.height).toBeGreaterThanOrEqual(sprint!.y + sprint!.height);
    await expect(page.locator('.roadmap-unclassified')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Unclassified / No phase', exact: true })).toHaveCount(0);
    const boundary = sprint!.y + sprint!.height;
    const ends = await page.locator('.roadmap-date-overlay > span, .roadmap-temporal-overlay > span').evaluateAll((guides) => guides.map((guide) => guide.getBoundingClientRect().bottom));
    ends.forEach((end) => expect(Math.abs(end - boundary)).toBeLessThanOrEqual(1));
});

test('review adjustments keep the axis compact, guides above bars and progress at the filled edge', async ({ page }) => {
    await seed(page);
    await expect(page.locator('[data-roadmap-kind="phases"] .roadmap-section-header')).toHaveCount(0);
    await expect(page.locator('.roadmap-view-controls button').last()).toHaveAccessibleName('Add Phase');
    await expect(page.locator('.roadmap-view-controls button').nth(-2)).toHaveAccessibleName('Add Milestone');
    await expect(page.locator('.roadmap-today-marker-label')).toHaveText('T');
    const axis = await page.locator('.roadmap-axis-line').boundingBox();
    const annotations = await page.locator('.milestone-annotations').boundingBox();
    expect(annotations!.y).toBe(axis!.y + axis!.height);
    expect(annotations!.height).toBeLessThanOrEqual(76);
    const boxes = await page.locator('.milestone-annotation').evaluateAll((items) => items.map((item) => {
        const box = item.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }));
    boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other) => expect(box.right <= other.x || other.right <= box.x || box.bottom <= other.y || other.bottom <= box.y).toBe(true)));
    for (const id of ['phase-delivery', 'phase-api', 'sprint-october', 'phase-empty-phase']) {
        const geometry = await page.locator(`#roadmap-row-${id} .roadmap-row-timeline-bar`).evaluate((bar) => {
            const fill = bar.querySelector('.roadmap-bar-fill')!.getBoundingClientRect();
            const label = bar.querySelector('.roadmap-bar-value')!;
            const box = label.getBoundingClientRect();
            if (getComputedStyle(bar).zIndex !== 'auto') throw new Error('Bar stacking context hides its text behind date guides');
            if (Number(getComputedStyle(label).zIndex) <= 4) throw new Error('Percentage is below the date guides');
            return { inside: label.classList.contains('roadmap-value-inside'), right: box.right, left: box.left, edge: fill.right };
        });
        expect(Math.abs((geometry.inside ? geometry.right : geometry.left) - geometry.edge)).toBeLessThanOrEqual(5);
    }
    const line = await page.locator('.roadmap-today-marker').evaluate((element) => {
        const css = getComputedStyle(element);
        return { style: css.borderLeftStyle, color: css.borderLeftColor, overlayZ: getComputedStyle(element.parentElement!).zIndex };
    });
    expect(line.style).toBe('solid'); expect(line.color).toBe('rgb(37, 99, 235)'); expect(Number(line.overlayZ)).toBeGreaterThan(2);
    for (const id of ['release', 'empty', 'checkpoint']) {
        const guide = page.locator(`[data-milestone-guide="${id}"]`);
        const diamond = page.locator(`.milestone-annotation[data-roadmap-id="${id}"] .milestone-diamond`);
        const guideBox = await guide.boundingBox(); const diamondBox = await diamond.boundingBox();
        expect(Math.abs(guideBox!.x - diamondBox!.x - diamondBox!.width / 2)).toBeLessThanOrEqual(1);
        const color = await diamond.evaluate((element) => getComputedStyle(element, '::before').backgroundColor);
        await expect(guide).toHaveCSS('color', color); await expect(guide.locator('line')).toHaveAttribute('stroke-dasharray', /4 \d+/);
    }
});

test('fractional milestone progress stays inside the small coloured diamond in both themes', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'fraction', title: 'Fractional progress', hasHandle: true, tasks: [
        { id: 1, title: 'Done', status: 'done', milestoneId: 'm' },
        { id: 2, title: 'In progress', status: 'doing', milestoneId: 'm' },
        { id: 3, title: 'Pending', status: 'to-do', milestoneId: 'm' }
    ], extensions: { roadmap: { version: 3, milestones: [{ id: 'm', title: 'One third', dueDate: '2026-10-20', color: '#b45309' }], phases: [], sprints: [] } } }], { selectedBoardId: 'fraction' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
        const diamond = page.locator('.milestone-annotation .milestone-diamond');
        await expect(diamond).toHaveText('33.3%');
        const geometry = await diamond.evaluate((element) => {
            const text = element.querySelector('span')!.getBoundingClientRect();
            const shape = getComputedStyle(element, '::before');
            return { textWidth: text.width, textHeight: text.height, diagonal: parseFloat(shape.width) * Math.SQRT2 };
        });
        // A centred text rectangle is contained by a diamond iff width + height <= diagonal.
        expect(geometry.textWidth + geometry.textHeight).toBeLessThanOrEqual(geometry.diagonal);
    }
});

test('leaf arrows expose workitems and parent work/table expansion remains independent', async ({ page }) => {
    await seed(page);
    const leaf = page.getByRole('button', { name: 'Expand/collapse workitems of API', exact: true });
    await leaf.focus(); await page.keyboard.press('Enter');
    await expect(leaf).toHaveAttribute('aria-expanded', 'true');
    await expect(area(page, 'phase:api')).toBeVisible();
    await page.getByRole('button', { name: 'Show tasks for Engineering', exact: true }).click();
    await page.getByRole('button', { name: 'Hide tasks for Engineering', exact: true }).click();
    await expect(area(page, 'phase:api')).toBeVisible();
    const parent = page.getByRole('button', { name: 'Expand/collapse subphases of Engineering', exact: true });
    await parent.click(); await expect(area(page, 'phase:api')).toHaveCount(0);
    await parent.click(); await expect(area(page, 'phase:api')).toBeVisible();
    await expect(leaf).toHaveAttribute('aria-expanded', 'true');
});

test('milestone colours are suggested, editable and persisted; history collapses across project views without writes', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Add Milestone', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Amber', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Blue', exact: true }).check();
    await page.locator('#roadmapEntityTitle').fill('Review colour'); await page.locator('#roadmapEntityDate').fill('2026-11-01');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.milestones.find((item: { id: string }) => item.id === 'review-colour').color).toBe('#2563eb');
    await page.locator('.milestone-annotation[data-roadmap-id="review-colour"]').click();
    await page.locator('#milestoneWorkitemsModal').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Blue', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Rose', exact: true }).check();
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.milestones.find((item: { id: string }) => item.id === 'review-colour').color).toBe('#be123c');
    await page.locator('#milestoneWorkitemsModal .modal-close').click();
    const before = await readSavedBoard(page, 'p');
    await showTimeline(page);
    const panel = page.locator('#portfolioTimelinePanel');
    await expect(panel).toHaveClass(/collapsed/); await expect(panel.locator('.timeline-panel-subtitle')).toContainText('Review colour');
    for (const mode of ['board', 'table', 'calendar', 'planner', 'roadmap']) {
        await page.locator(`#portfolioViewModeToggle [data-view-mode="${mode}"]`).click();
        await expect(panel.locator('.timeline-body')).toBeHidden();
        await panel.locator('.timeline-toggle-btn').click(); await expect(panel.locator('.timeline-body')).toBeVisible();
        await panel.locator('.timeline-toggle-btn').click(); await expect(panel.locator('.timeline-controls')).toBeHidden();
        expect((await panel.boundingBox())!.height).toBeLessThan(60);
    }
    expect(await readSavedBoard(page, 'p')).toEqual(before);
});

test('phase-scoped sprint/milestone perspectives exclude other work and keep absent associations independent', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Show tasks for Delivery', exact: true }).click();
    const work = area(page, 'phase:delivery');
    await work.getByRole('button', { name: 'By sprint', exact: true }).click();
    expect(await ids(work.locator('[data-roadmap-group="october"]'))).toEqual([501, 502]);
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([504]);
    await page.getByLabel('Workitem archive visibility', { exact: true }).selectOption('all');
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([503, 504]);
    await work.getByRole('button', { name: 'By milestone', exact: true }).click();
    expect(await ids(work.locator('[data-roadmap-group="release"]'))).toEqual([501, 502, 503]);
    expect(await ids(work.locator('[data-roadmap-group="none"]'))).toEqual([504]);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    await page.getByRole('group', { name: 'Workitem completion filter', exact: true }).getByRole('button', { name: 'Completed', exact: true }).click();
    expect(await ids(work)).toEqual([501]);
    await expect(page.locator('#roadmap-row-phase-delivery .roadmap-bar-value')).toHaveText('25%');
    expect((await readSavedBoard(page, 'p')).extensions.timeline).toBeUndefined();
});

test('phase detail navigation preserves zoom, width, selection and scroll', async ({ page }) => {
    await seed(page);
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('1.5');
    await page.getByLabel('Identification column width', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Show tasks for API', exact: true }).click();
    const work = area(page, 'phase:api');
    expect(await ids(work)).toEqual([501, 502]);
    await work.getByRole('checkbox', { name: 'Select API contracts', exact: true }).check();
    const trigger = work.getByRole('button', { name: 'API contracts', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.locator('#portfolioRoadmapView').evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    await trigger.click();
    await expect(page.locator('#detailPlanning-phaseId')).toHaveValue('api');
    await expect(page.locator('#detailPlanning-milestoneId')).toHaveValue('release');
    await expect(page.locator('#detailSprintInput')).toHaveValue('october');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(work.getByRole('checkbox', { name: 'Select API contracts', exact: true })).toBeChecked();
    await expect(page.getByLabel('Timeline zoom', { exact: true })).toHaveValue('1.5');
    await expect(page.getByLabel('Identification column width', { exact: true })).toHaveValue('500');
    const after = await page.locator('#portfolioRoadmapView').evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    expect(Math.abs(after.top - before.top)).toBeLessThan(2); expect(Math.abs(after.left - before.left)).toBeLessThan(2);
});

test('milestone diamonds open the shared table modal and returning from a workitem preserves its context', async ({ page }) => {
    await seed(page);
    const trigger = page.locator('.milestone-annotation[data-roadmap-id="release"]');
    await trigger.click();
    const modal = page.locator('#milestoneWorkitemsModal');
    await expect(modal.getByRole('heading', { name: 'Public release', exact: true })).toBeVisible();
    await expect(modal.locator('.milestone-modal-heading')).toContainText('15/12/2026');
    await expect(modal.locator('.milestone-diamond')).toHaveText('25%');
    expect(await ids(modal)).toEqual([501, 502, 506]);
    await modal.getByLabel('Workitem archive visibility', { exact: true }).selectOption('all');
    expect(await ids(modal)).toEqual([501, 502, 503, 506]);
    await modal.getByRole('checkbox', { name: 'Select API contracts', exact: true }).check();
    await modal.getByRole('button', { name: 'API contracts', exact: true }).click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('checkbox', { name: 'Select API contracts', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test('nearby milestones remain separately accessible, empty groups use N/A, and read-only does not expose mutations', async ({ page }) => {
    await seed(page, false);
    const release = await page.locator('.milestone-annotation[data-roadmap-id="release"] .milestone-diamond').boundingBox();
    const checkpoint = await page.locator('.milestone-annotation[data-roadmap-id="checkpoint"] .milestone-diamond').boundingBox();
    expect(Math.abs(release!.x + release!.width / 2 - checkpoint!.x - checkpoint!.width / 2)).toBeLessThan(1);
    expect(Math.abs(release!.y - checkpoint!.y)).toBeGreaterThanOrEqual(32);
    await page.locator('.milestone-annotation[data-roadmap-id="checkpoint"]').click();
    const modal = page.locator('#milestoneWorkitemsModal');
    await expect(modal.locator('.milestone-diamond')).toHaveText('N/A');
    await expect(modal).toContainText('No tasks assigned');
    await expect(modal.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await expect(modal.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Add Phase', exact: true })).toBeDisabled();
});

test('parent-only phase moves save and structural confirmations identify archived and active affected workitems', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Edit Future work', exact: true }).click();
    await page.locator('#roadmapPhaseParent').selectOption('delivery');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect.poll(async () => (await readSavedBoard(page, 'p')).extensions.roadmap.phases.find((phase: { id: string }) => phase.id === 'future').parentId).toBe('delivery');
    await page.getByRole('button', { name: 'Delete Interface', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('#503 · Archived research · Archived');
    await expect(page.locator('#appMessageModal')).toContainText('#504 · UI build');
    await answerAppMessage(page, { button: 'Cancel' });
    await page.getByRole('button', { name: 'Add Phase', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('Frontend detail'); await page.locator('#roadmapPhaseParent').selectOption('ui');
    await page.getByRole('button', { name: 'Save Item', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('#503 · Archived research · Archived');
    await answerAppMessage(page, { button: 'Frontend detail', expectText: '#504 · UI build' });
    await expect.poll(async () => (await readSavedBoard(page, 'p')).board.tasks.find((task: { id: number }) => task.id === 503).phaseId).toBe('frontend-detail');
    const data = await readSavedBoard(page, 'p');
    expect(data.board.tasks.find((task: { id: number }) => task.id === 503)).toMatchObject({ archived: true, milestoneId: 'release', status: 'to-do' });
    expect(data.board.tasks.find((task: { id: number }) => task.id === 507)).toMatchObject({ phaseId: 'future', sprintId: 'october', responsible: 'Bruno' });
});

test('clarified Roadmap stays readable in the existing light and dark themes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await seed(page);
    await page.getByRole('button', { name: 'Show tasks for API', exact: true }).click();
    await page.getByRole('button', { name: 'Show tasks for October execution', exact: true }).click();
    await page.locator('#portfolioRoadmapView').evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    await page.mouse.move(10, 10); await page.screenshot({ path: testInfo.outputPath('roadmap-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    const background = await page.locator('#roadmap-row-phase-delivery .roadmap-row-timeline-bar').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toBe('none');
    await page.locator('.milestone-annotation[data-roadmap-id="release"]').click();
    await expect(page.locator('#milestoneWorkitemsModal .workitems-table')).toBeVisible();
    await page.mouse.move(10, 10); await page.screenshot({ path: testInfo.outputPath('milestone-dark.png'), fullPage: true });
});


test('milestone names and dates hug either side of their diamond, with small matching type and ellipsis', async ({ page }, testInfo) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'labels', title: 'Milestone label spacing', hasHandle: true, tasks: [], extensions: {
        roadmap: { version: 3, phases: [{ id: 'phase', title: 'Phase title', startDate: '2026-10-01', endDate: '2026-10-31' }], sprints: [], milestones: [
            { id: 'right', title: 'Short', dueDate: '2026-10-01' },
            { id: 'long', title: 'A milestone name that is deliberately much longer than the available label width '.repeat(3), dueDate: '2026-10-30' },
            { id: 'left', title: 'End', dueDate: '2026-10-31' },
            { id: 'nearby', title: 'Nearby', dueDate: '2026-10-31' }
        ] }
    } }], { selectedBoardId: 'labels' });
    await page.getByRole('button', { name: 'Roadmap', exact: true }).click();
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const zoom of ['1', '2']) {
            await page.getByLabel('Timeline zoom', { exact: true }).selectOption(zoom);
            await expect(page.locator('[data-roadmap-id="left"]')).toHaveClass(/milestone-at-end/);
            await expect(page.locator('[data-roadmap-id="right"]')).not.toHaveClass(/milestone-at-end/);
            const labels = await page.locator('.milestone-annotation').evaluateAll((items) => items.map((item) => {
                const diamond = item.querySelector('.milestone-diamond')!.getBoundingClientRect();
                const label = item.querySelector('.milestone-annotation-label')!;
                const name = label.querySelector('strong')!;
                const date = label.querySelector('span')!;
                const textBox = (node: Element) => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect(); };
                const nameBox = textBox(name); const dateBox = textBox(date);
                const left = item.classList.contains('milestone-at-end');
                return { id: item.getAttribute('data-roadmap-id'), left,
                    nameGap: left ? diamond.left - nameBox.right : nameBox.left - diamond.right,
                    dateGap: left ? diamond.left - dateBox.right : dateBox.left - diamond.right,
                    width: label.getBoundingClientRect().width,
                    nameSize: getComputedStyle(name).fontSize, dateSize: getComputedStyle(date).fontSize,
                    truncated: name.scrollWidth > name.clientWidth, overflow: getComputedStyle(name).textOverflow };
            }));
            for (const label of labels) {
                expect(label.nameSize).toBe(label.dateSize);
                expect(parseFloat(label.nameSize)).toBeGreaterThanOrEqual(10);
                expect(parseFloat(label.nameSize)).toBeLessThan(11);
                expect(label.dateGap).toBeCloseTo(6, 0);
                if (label.id !== 'long') { expect(label.nameGap).toBeCloseTo(6, 0); expect(label.width).toBeLessThan(140); }
                else { expect(label.width).toBe(140); expect(label.truncated).toBe(true); expect(label.overflow).toBe('ellipsis'); }
            }
            const boxes = await page.locator('.milestone-annotation').evaluateAll((items) => items.map((item) => {
                const box = item.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
            }));
            boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other) => expect(box.right <= other.x || other.right <= box.x || box.bottom <= other.y || other.bottom <= box.y).toBe(true)));
        }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByLabel('Timeline zoom', { exact: true }).selectOption('1');
    for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
        await page.mouse.move(1, 1);
        await page.screenshot({ path: testInfo.outputPath(`milestone-labels-${theme}.png`), fullPage: true });
    }
});
