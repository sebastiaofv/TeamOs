'use strict';

const { test, expect } = require('@playwright/test');

const {
  gotoApp,
  seedPortfolioBoards,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  openTaskEditor,
  renameTaskViaEditor,
  setTimelineSlider,
  answerAppMessage
} = require('../support/portfolio');

test.describe('timeline', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('bulk sprint timeline event reconstructs sprint assignments in timeline preview', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog' },
        { id: 2, title: 'Task B', status: 'to-do' }
      ]
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    // A later edit makes the bulk sprint event (index 1) historical, so the
    // preview below is reconstructed from the timeline rather than live state.
    await renameTaskViaEditor(page, 'Task A', 'Task A later');
    await waitForBoardWrites(page, 2);

    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.roadmap.sprints.map((entry) => entry.id)).toEqual(['sprint-12']);
    expect(saved.board.tasks.every((task) => task.sprintId === 'sprint-12')).toBeTruthy();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    // Historical cards on the board only select on click, so read the replayed
    // state from the roadmap view: sprint rows and how many tasks each links.
    const viewMode = (mode) => page.locator(`#portfolioViewModeToggle [data-view-mode="${mode}"]`).click();
    const sprintRowsAt = async (index) => {
      await viewMode('board');
      await setTimelineSlider(page, index);
      await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');
      await viewMode('roadmap');
      const rows = page.locator('#portfolioRoadmapView .roadmap-row[data-roadmap-kind="sprint"]');
      const titles = (await rows.locator('.roadmap-row-title').allTextContents()).map((text) => text.trim());
      const usage = (await rows.locator('.roadmap-row-usage span').allTextContents()).map((text) => text.trim());
      return { titles, usage };
    };

    expect(await sprintRowsAt(0)).toEqual({ titles: [], usage: [] });
    expect(await sprintRowsAt(1)).toEqual({ titles: ['Sprint 12'], usage: ['2 linked tasks'] });
  });

  test('roadmap timeline replays CRUD changes and cleared refs in historical preview state', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do', milestoneId: 'm1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await page.locator('#roadmapEntityTitle').fill('Beta');
    await page.locator('#roadmapEntityDate').fill('2026-05-01');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await page.getByRole('button', { name: 'Edit Beta' }).click();
    await page.locator('#roadmapEntityTitle').fill('Beta Renamed');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await page.getByRole('button', { name: 'Delete Alpha' }).click();
    await answerAppMessage(page, { button: 'Delete' });

    await expect.poll(async () => (await readSavedBoard(page, 'alpha')).extensions.timeline?.events?.map((event) => event.kind))
      .toEqual(['board.baseline', 'roadmap.updated', 'roadmap.updated', 'roadmap.updated']);

    const viewMode = (mode) => page.locator(`#portfolioViewModeToggle [data-view-mode="${mode}"]`).click();
    // Moves the timeline to `index`, then reads the replayed state the way a user
    // sees it in the roadmap view: milestone rows and how many tasks each links.
    // Task A is the only task, so the counts show where its milestone ref points.
    const replayedStateAt = async (index) => {
      await viewMode('board');
      await setTimelineSlider(page, index);
      await viewMode('roadmap');
      const rows = page.locator('#portfolioRoadmapView .roadmap-row[data-roadmap-kind="milestone"]');
      const titles = (await rows.locator('.roadmap-row-title').allTextContents()).map((text) => text.trim());
      const usage = (await rows.locator('.roadmap-row-usage span').allTextContents()).map((text) => text.trim());
      return { titles, usage };
    };

    await viewMode('board');
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    expect(await replayedStateAt(1)).toEqual({ titles: ['Alpha', 'Beta'], usage: ['1 linked task', '0 linked tasks'] });
    expect(await replayedStateAt(2)).toEqual({ titles: ['Alpha', 'Beta Renamed'], usage: ['1 linked task', '0 linked tasks'] });
    expect(await replayedStateAt(3)).toEqual({ titles: ['Beta Renamed'], usage: ['0 linked tasks'] });
  });

  test('task edits create timeline events in extensions.timeline', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl1',
        title: 'Timeline Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl1' });

    await expect(page.locator('#portfolioTimelinePanel')).toHaveClass(/collapsed/);

    await openTaskEditor(page, 'Original title');
    await page.locator('#taskName').fill('Updated title');
    await page.locator('#taskDescription').fill('Updated description');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const board = { data: JSON.parse(window.__portfolioDiskByBoardId.tl1.text) };
      return {
        timeline: board?.data?.extensions?.timeline || null,
        writes: window.__portfolioTestWrites || []
      };
    });

    expect(result.timeline).toBeTruthy();
    expect(result.timeline.version).toBe(1);
    expect(result.timeline.events.map((event) => event.kind)).toEqual(['board.baseline', 'task.updated']);
    expect(result.timeline.events[1].changes.title.before).toBe('Original title');
    expect(result.timeline.events[1].changes.title.after).toBe('Updated title');
    expect(result.timeline.events[1].changes.description.after).toBe('Updated description');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"timeline"');
    expect(result.writes.at(-1).text).toContain('"task.updated"');
  });

  test('task saves keep timeline pinned to latest state', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl3',
        title: 'Timeline Latest Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl3' });

    await renameTaskViaEditor(page, 'Original title', 'Phase 1');

    // Explicitly select the latest event (index 1 of baseline + one update).
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);
    await setTimelineSlider(page, 1);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);

    await renameTaskViaEditor(page, 'Phase 1', 'Phase 2');

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Created from latest');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Created from latest')).toBeVisible();

    const sliderRow = page.locator('#portfolioTimelinePanel .timeline-slider-row');
    await expect(sliderRow.getByRole('button', { name: 'Latest' })).toBeVisible();
    await expect(sliderRow.getByRole('button', { name: 'Restore this state' })).toBeVisible();

    await expect.poll(async () => (await readSavedBoard(page, 'tl3')).extensions.timeline?.events?.length || 0).toBe(4);
    await expect(page.locator('#portfolioTimelinePanel .timeline-summary-row')).toContainText('Event 4 / 4');
    await expect(page.locator('#portfolioTimelinePanel .timeline-event-item.active')).toHaveAttribute('data-event-index', '3');
  });

  test('timeline slider previews historical state and restore persists it', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl2',
        title: 'Timeline Restore Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl2' });

    await expect(page.locator('#portfolioTimelinePanel')).toHaveClass(/collapsed/);

    await renameTaskViaEditor(page, 'Original title', 'Phase 1');
    await renameTaskViaEditor(page, 'Phase 1', 'Phase 2');

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    await setTimelineSlider(page, 0);

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');
    await expect(portfolioCard(page, 'Original title')).toBeVisible();
    await expect(portfolioCard(page, 'Phase 2')).toHaveCount(0);
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toHaveCount(0);

    await page.locator('#portfolioTimelinePanel .btn-primary').click();

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toHaveCount(0);
    await expect(portfolioCard(page, 'Original title')).toBeVisible();
    await expect(portfolioCard(page, 'Phase 2')).toHaveCount(0);

    await expect.poll(() => page.evaluate(() => (window.__portfolioTestWrites || []).at(-1)?.text || '')).toContain('"board.restored"');
    const saved = await readSavedBoard(page, 'tl2');
    expect(saved.board.tasks.find((task) => task.id === 1)?.title).toBe('Original title');
    expect(saved.extensions.timeline.events.map((event) => event.kind)).toEqual(['board.baseline', 'task.updated', 'task.updated', 'board.restored']);
  });

  test('timeline slider supports continuous dragging across multiple events', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'tl4',
        title: 'Timeline Drag Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Phase 0', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl4' });

    let previousTitle = 'Phase 0';
    for (const title of ['Phase 1', 'Phase 2', 'Phase 3']) {
      await renameTaskViaEditor(page, previousTitle, title);
      previousTitle = title;
    }

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    const slider = page.locator('#portfolioTimelinePanel .timeline-slider');
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box.x + box.width - 4, box.y + (box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + 4, box.y + (box.height / 2), { steps: 20 });

    const panel = page.locator('#portfolioTimelinePanel');
    const activeEvent = panel.locator('.timeline-event-item.active');
    await expect(activeEvent).toHaveAttribute('data-event-index', '0');
    await expect(panel.locator('.timeline-summary-row')).toContainText('Event 1 / 4');
    const activeSummary = (await activeEvent.locator('.timeline-event-summary').textContent()).trim();
    await expect(panel.locator('.timeline-event-detail-title')).toHaveText(activeSummary);
    await expect(portfolioCard(page, 'Phase 0')).toBeVisible();
    await expect(portfolioCard(page, 'Phase 3')).toHaveCount(0);

    await page.mouse.up();

    await expect(activeEvent).toHaveAttribute('data-event-index', '0');
    await expect(portfolioCard(page, 'Phase 0')).toBeVisible();
  });

  test('clicking a timeline event preserves the event list scroll position', async ({ page }) => {
    // 24 real edits build a timeline long enough for the event list to scroll.
    test.setTimeout(90_000);
    await seedPortfolioBoards(page, [
      {
        id: 'tl4',
        title: 'Timeline Scroll Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'tl4' });

    let previousTitle = 'Original title';
    for (let index = 1; index <= 24; index += 1) {
      const nextTitle = `Phase ${index}`;
      await renameTaskViaEditor(page, previousTitle, nextTitle);
      previousTitle = nextTitle;
    }

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    const result = await page.evaluate(() => {
      const list = document.querySelector('#portfolioTimelinePanel .timeline-event-list');
      if (!list) {
        throw new Error('Timeline event list not found.');
      }

      list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - 48);
      const target = Array.from(list.querySelectorAll('.timeline-event-item')).find((button) => (
        button.offsetTop >= list.scrollTop
        && button.offsetTop + button.offsetHeight <= list.scrollTop + list.clientHeight
        && !button.classList.contains('active')
      ));

      if (!target) {
        throw new Error('No visible timeline event item available for click.');
      }

      const beforeScrollTop = list.scrollTop;
      const targetIndex = Number(target.dataset.eventIndex);
      target.click();

      const nextList = document.querySelector('#portfolioTimelinePanel .timeline-event-list');
      const activeItem = document.querySelector('#portfolioTimelinePanel .timeline-event-item.active');
      return {
        beforeScrollTop,
        afterScrollTop: nextList ? nextList.scrollTop : null,
        targetIndex,
        selectedIndex: activeItem ? Number(activeItem.dataset.eventIndex) : null
      };
    });

    expect(result.selectedIndex).toBe(result.targetIndex);
    expect(Math.abs((result.afterScrollTop ?? 0) - result.beforeScrollTop)).toBeLessThanOrEqual(1);
  });

  test('timeline panel follows the published historical selection', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'timeline-react',
      title: 'React Timeline',
      hasHandle: true,
      tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
    }], { selectedBoardId: 'timeline-react' });

    await renameTaskViaEditor(page, 'Original title', 'Phase 1');
    await renameTaskViaEditor(page, 'Phase 1', 'Phase 2');
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await expect(page.locator('#portfolioTimelinePanel')).not.toHaveClass(/collapsed/);

    await setTimelineSlider(page, 0);
    const panel = page.locator('#portfolioTimelinePanel');
    await expect(panel.locator('.timeline-preview-banner.active')).toContainText('Historical preview');
    await expect(panel.locator('.timeline-summary-row')).toContainText('Event 1 / 3');
    await expect(panel.locator('.timeline-event-item.active')).toHaveAttribute('data-event-index', '0');
    await expect(panel.locator('.timeline-event-detail-title')).toHaveText('Baseline snapshot created');
    await expect(panel.locator('[data-action="timeline-restore"]')).toBeVisible();

    await panel.locator('[data-action="timeline-latest"]').click();
    await expect(panel.locator('.timeline-preview-banner.active')).toHaveCount(0);
    await expect(panel.locator('.timeline-summary-row')).toContainText('Event 3 / 3');
    await expect(panel.locator('.timeline-event-item.active')).toHaveAttribute('data-event-index', '2');
    await expect(panel.locator('.timeline-event-detail-title')).toHaveText('Task updated: Phase 2');
  });
});
