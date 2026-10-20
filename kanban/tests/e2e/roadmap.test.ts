import { test, expect, type Page } from '@playwright/test';

import {
  gotoApp,
  seedPortfolioBoards,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy,
  openTaskEditor,
  answerAppMessage
} from '../support/portfolio';

test.describe('roadmap', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('checked board tasks can be grouped into a new sprint', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: 'Add to Existing Sprint' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await waitForBoardWrites(page);
    const board = await readSavedBoard(page, 'alpha');
    expect(board.extensions.roadmap.sprints).toHaveLength(1);
    expect(board.board.tasks.every((task: any) => task.sprintId === board.extensions.roadmap.sprints[0].id)).toBeTruthy();
  });

  test('checked board tasks can be added to an existing sprint from the bulk action bar', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-04-07T12:00:00Z'));
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog' },
        { id: 2, title: 'Task B', status: 'to-do' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [],
          sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();

    await expect(page.getByRole('button', { name: 'Add to Existing Sprint' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to Existing Sprint' }).click();
    await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('Add to Existing Sprint');
    await page.selectOption('#roadmapEntityExistingSprint', 's1');
    await page.getByRole('button', { name: 'Add to Sprint' }).click();

    await waitForBoardWrites(page);
    const board = await readSavedBoard(page, 'alpha');
    expect(board.extensions.roadmap.sprints).toHaveLength(1);
    expect(board.board.tasks.every((task: any) => task.sprintId === 's1')).toBeTruthy();

    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await expect(portfolioCard(page, 'Task A').locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(portfolioCard(page, 'Task B').locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('bulk sprint creation clears selection and board changes clear stale bulk selection', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [
      {
        id: 'alpha',
        hasHandle: true,
        title: 'Alpha',
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'to-do' }
        ]
      },
      {
        id: 'beta',
        hasHandle: true,
        title: 'Beta',
        tasks: [{ id: 3, title: 'Task C', status: 'backlog' }]
      }
    ], { selectedBoardId: 'alpha' });

    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await expect(page.locator('#portfolioBulkActions')).toBeVisible();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('1 task selected');

    await page.getByRole('button', { name: 'Create Sprint' }).click();
    await page.fill('#roadmapEntityTitle', 'Sprint 12');
    await page.fill('#roadmapEntityStartDate', '2026-04-01');
    await page.fill('#roadmapEntityEndDate', '2026-04-14');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('0 tasks selected');
    await expect(portfolioCard(page, 'Task A').locator('input[type="checkbox"]')).not.toBeChecked();

    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();
    await expect(page.locator('#portfolioBulkActions')).toBeVisible();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('1 task selected');

    await selectPortfolioBoard(page, 'Beta');
    await expect(portfolioCard(page, 'Task C')).toBeVisible();

    await selectPortfolioBoard(page, 'Alpha');
    await expect(portfolioCard(page, 'Task A')).toBeVisible();
    await expect(page.locator('#portfolioBulkActions')).toBeHidden();
    await expect(page.locator('#portfolioBulkActionsSummary')).toContainText('0 tasks selected');
    await expect(portfolioCard(page, 'Task B').locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('roadmap rows can create and delete milestones while clearing task refs', async ({ page }) => {
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

    await expect(page.locator('#portfolioRoadmapView')).toContainText('Beta');

    await page.locator('.milestone-annotation[data-roadmap-id="m1"]').click();
    await page.locator('#milestoneWorkitemsModal').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#appMessageModal')).toContainText('choose how to reallocate or clear');
    await page.locator('#appMessageModal').getByRole('button', { name: 'Delete', exact: true }).click();
    await answerAppMessage(page, { button: 'Clear assignments · None', expectText: '1 directly assigned workitems' });

    await expect.poll(async () => (await readSavedBoard(page, 'alpha')).extensions.timeline?.events?.at(-1)?.summary || '').toContain('Milestone deleted');
    const board = await readSavedBoard(page, 'alpha');
    const result = {
      task: board.board.tasks[0],
      roadmap: board.extensions.roadmap,
      lastTimelineKind: board.extensions.timeline?.events?.at(-1)?.kind || '',
      lastTimelineSummary: board.extensions.timeline?.events?.at(-1)?.summary || ''
    };

    expect(result.roadmap.milestones).toEqual([{
      id: 'beta',
      title: 'Beta',
      dueDate: '2026-05-01',
      color: '#7c3aed'
    }]);
    expect(result.task.milestoneId).toBe('');
    expect(result.lastTimelineKind).toBe('roadmap.updated');
    expect(result.lastTimelineSummary).toContain('Milestone deleted');
  });

  test('editing an existing roadmap item preserves its ID', async ({ page }) => {
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
    await page.locator('.milestone-annotation[data-roadmap-id="m1"]').click();
    await page.locator('#milestoneWorkitemsModal').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#roadmapEntityTitle').fill('Alpha Renamed');
    await page.getByRole('button', { name: 'Save Item' }).click();

    await expect.poll(async () => (await readSavedBoard(page, 'alpha')).extensions.roadmap?.milestones?.[0]?.title).toBe('Alpha Renamed');
    const board = await readSavedBoard(page, 'alpha');
    const result = {
      milestone: board.extensions.roadmap.milestones[0],
      task: board.board.tasks[0]
    };

    expect(result.milestone).toEqual({
      id: 'm1',
      title: 'Alpha Renamed',
      dueDate: '2026-04-15',
      color: '#2563eb'
    });
    expect(result.task.milestoneId).toBe('m1');
  });

  test('roadmap view renders milestones phases and sprints with assigned task rows', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1', sprintId: 's1' },
        { id: 2, title: 'Task B', status: 'to-do', milestoneId: 'm1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha Release', dueDate: '2026-04-15' }],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await expect(page.locator('.milestone-annotation-label')).toContainText('Alpha Release');
    await expect(page.locator('#portfolioRoadmapView .portfolio-roadmap-timeline')).toHaveCount(1);
    await expect(page.locator('#portfolioRoadmapView .portfolio-roadmap-header')).toHaveCount(0);
    await expect(page.locator('[data-roadmap-axis="shared"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="milestone"]')).toHaveCount(0);
    await expect(page.locator('.milestone-annotation')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="phase"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="sprint"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="phase"] .roadmap-row-labels > .roadmap-row-actions')).toHaveCount(1);
    const sharedGeometry = await page.evaluate(() => {
      const axis = document.querySelector('.roadmap-axis-shell');
      const row = document.querySelector('.roadmap-row-main');
      if (!(axis instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
      const axisStyles = getComputedStyle(axis);
      const rowStyles = getComputedStyle(row);
      return {
        axisColumns: axisStyles.gridTemplateColumns,
        rowColumns: rowStyles.gridTemplateColumns,
        axisGap: axisStyles.columnGap,
        rowGap: rowStyles.columnGap
      };
    });
    expect(sharedGeometry).not.toBeNull();
    expect(sharedGeometry!.axisColumns).toBe(sharedGeometry!.rowColumns);
    expect(sharedGeometry!.axisGap).toBe(sharedGeometry!.rowGap);

    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');
    await expect(page.locator('[data-roadmap-task-list="phase:p1"] table.workitems-table')).toHaveCount(1);
    await expect(page.locator('[data-roadmap-task-list="phase:p1"] th[data-column="responsible"]')).toHaveCount(1);
    await expect(page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card, [data-roadmap-task-list="phase:p1"] .roadmap-row-timeline-bar')).toHaveCount(0);
  });

  test('roadmap rows are sorted by date within each section', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [
            { id: 'm2', title: 'Later Milestone', dueDate: '2026-04-20' },
            { id: 'm1', title: 'Earlier Milestone', dueDate: '2026-04-10' }
          ],
          phases: [
            { id: 'p2', title: 'Later Phase', startDate: '2026-04-15', endDate: '2026-04-30' },
            { id: 'p1', title: 'Earlier Phase', startDate: '2026-04-01', endDate: '2026-04-10' }
          ],
          sprints: [
            { id: 's2', title: 'Sprint 2', startDate: '2026-04-15', endDate: '2026-04-21' },
            { id: 's1', title: 'Sprint 1', startDate: '2026-04-01', endDate: '2026-04-07' }
          ]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const titles = await page.evaluate(() => ({
      milestones: Array.from(document.querySelectorAll('.milestone-annotation-label strong')).map((node) => node.textContent?.trim()),
      phases: Array.from(document.querySelectorAll('[data-roadmap-kind="phases"] .roadmap-row-title')).map((node) => node.textContent?.trim()),
      sprints: Array.from(document.querySelectorAll('[data-roadmap-kind="sprints"] .roadmap-row-title')).map((node) => node.textContent?.trim())
    }));

    expect(titles.milestones).toEqual(['Earlier Milestone', 'Later Milestone']);
    expect(titles.phases).toEqual(['Earlier Phase', 'Later Phase']);
    expect(titles.sprints).toEqual(['Sprint 1', 'Sprint 2']);
  });

  test('roadmap view uses shared app surfaces and control styles', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', milestoneId: 'm1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha Release', dueDate: '2026-04-15' }],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const styles = await page.evaluate(() => {
      const timeline = document.querySelector('.portfolio-roadmap-timeline');
      const header = document.querySelector('.roadmap-section-header');
      const row = document.querySelector('.roadmap-row');
      const axisLine = document.querySelector('.roadmap-axis-line');
      const actionBtn = document.querySelector('.roadmap-action-btn');
      const sectionBtn = document.querySelector('.roadmap-section-btn');
      const disclosureBtn = document.querySelector('.roadmap-disclosure-btn');
      const track = document.querySelector('.roadmap-row-track');
      const timelineBar = document.querySelector('.roadmap-row[data-roadmap-kind="phase"] .roadmap-row-timeline-bar');
      const milestonePoint = document.querySelector('.milestone-annotation .milestone-diamond');
      if (!(timeline instanceof HTMLElement)
        || !(header instanceof HTMLElement)
        || !(row instanceof HTMLElement)
        || !(axisLine instanceof HTMLElement)
        || !(actionBtn instanceof HTMLElement)
        || !(sectionBtn instanceof HTMLElement)
        || !(disclosureBtn instanceof HTMLElement)
        || !(track instanceof HTMLElement)
        || !(timelineBar instanceof HTMLElement)
        || !(milestonePoint instanceof HTMLElement)) {
        return null;
      }
      const root = getComputedStyle(document.documentElement);
      return {
        vars: {
          bgPrimary: root.getPropertyValue('--bg-primary').trim(),
          bgSecondary: root.getPropertyValue('--bg-secondary').trim(),
          bgCard: root.getPropertyValue('--bg-card').trim(),
          border: root.getPropertyValue('--border').trim(),
          borderLight: root.getPropertyValue('--border-light').trim(),
          textSecondary: root.getPropertyValue('--text-secondary').trim(),
          accent: root.getPropertyValue('--accent').trim()
        },
        timeline: getComputedStyle(timeline),
        header: getComputedStyle(header),
        row: getComputedStyle(row),
        axisLine: getComputedStyle(axisLine),
        actionBtn: getComputedStyle(actionBtn),
        sectionBtn: getComputedStyle(sectionBtn),
        disclosureBtn: getComputedStyle(disclosureBtn),
        track: getComputedStyle(track),
        timelineBar: getComputedStyle(timelineBar),
        milestonePoint: getComputedStyle(milestonePoint, '::before')
      };
    });

    expect(styles).not.toBeNull();
    expect(styles!.timeline.backgroundColor).toBe('rgb(250, 250, 250)');
    expect(styles!.timeline.borderColor).toBe('rgb(208, 208, 208)');
    expect(styles!.header.backgroundColor).toBe('rgb(240, 240, 240)');
    expect(styles!.header.borderBottomColor).toBe('rgb(208, 208, 208)');
    expect(styles!.row.rowGap).toBe('0px');
    expect(styles!.actionBtn.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(styles!.actionBtn.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(styles!.sectionBtn.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(styles!.sectionBtn.borderColor).toBe('rgb(208, 208, 208)');
    expect(styles!.disclosureBtn.color).toBe('rgb(102, 102, 102)');
    expect(styles!.axisLine.height).toBe('44px');
    expect(styles!.track.height).toBe('28px');
    expect(styles!.timelineBar.height).toBe('21px');
    expect(styles!.milestonePoint.backgroundColor).toBe('rgb(37, 99, 235)');

    await page.locator('.milestone-annotation[data-roadmap-id="m1"]').click();
    await expect(page.locator('#milestoneWorkitemsModal table.workitems-table')).toHaveCount(1);
    await expect(page.locator('#milestoneWorkitemsModal')).toContainText('Task A');
  });

  test('roadmap timeline bars stay contained within the track at edge dates', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [
            { id: 'p1', title: 'Full Range', startDate: '2026-04-01', endDate: '2026-04-30' }
          ],
          sprints: [
            { id: 's1', title: 'Closing Sprint', startDate: '2026-04-30', endDate: '2026-04-30' }
          ]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const placements = await page.locator('.roadmap-row-timeline-bar').evaluateAll((bars) => {
      return bars.map((bar) => {
        const track = bar.closest('.roadmap-row-track');
        if (!track) return null;
        const barRect = bar.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        return {
          leftInside: barRect.left >= trackRect.left,
          rightInside: barRect.right <= trackRect.right,
          width: barRect.width,
          trackWidth: trackRect.width
        };
      });
    });

    for (const placement of placements) {
      expect(placement).not.toBeNull();
      expect(placement!.leftInside).toBeTruthy();
      expect(placement!.rightInside).toBeTruthy();
      expect(placement!.width).toBeLessThanOrEqual(placement!.trackWidth);
    }
  });

  test('roadmap axis ticks align with matching timeline endpoints', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const alignment = await page.evaluate(() => {
      const tick = Array.from(document.querySelectorAll('.roadmap-axis-tick')).find((node) => node.textContent?.trim() === 'Apr 30');
      const bar = document.querySelector('.roadmap-row[data-roadmap-kind="phase"] .roadmap-row-timeline-bar');
      if (!(tick instanceof HTMLElement) || !(bar instanceof HTMLElement)) return null;
      const tickRect = tick.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      return {
        delta: Math.abs((tickRect.left + (tickRect.width / 2)) - barRect.right)
      };
    });

    expect(alignment).not.toBeNull();
    expect(alignment!.delta).toBeLessThanOrEqual(1);
  });

  test('roadmap axis guide lines align with intermediate tick positions', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    const alignment = await page.evaluate(() => {
      const ticks = Array.from(document.querySelectorAll('.roadmap-axis-tick'));
      const guides = Array.from(document.querySelectorAll('.roadmap-temporal-overlay .roadmap-grid-guide'));
      const tick = ticks.find((node) => node.textContent?.trim() === 'Apr 08');
      if (!(tick instanceof HTMLElement)) return null;
      const guide = guides.find((node) => node instanceof HTMLElement && node.style.left === tick.style.left);
      if (!(tick instanceof HTMLElement) || !(guide instanceof HTMLElement)) return null;
      const tickRect = tick.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      return {
        delta: Math.abs((tickRect.left + (tickRect.width / 2)) - (guideRect.left + (guideRect.width / 2))),
        guideCount: guides.length
      };
    });

    expect(alignment).not.toBeNull();
    expect(alignment!.guideCount).toBeGreaterThan(0);
    expect(alignment!.delta).toBeLessThanOrEqual(1);
  });

  test('roadmap axis shows a today marker when today is within the visible range', async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = '2026-04-15T12:00:00.000Z';
      const RealDate = window.Date;
      class FakeDate extends RealDate {
        constructor(...args: any[]) {
          super(...(args.length ? args : [fixedNow]) as [any]);
        }
        static now() {
          return new RealDate(fixedNow).getTime();
        }
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      (window as any).Date = FakeDate;
    });

    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    // The only roadmap item spans 2026-04-01..2026-04-30, so the visible range is
    // those 29 days and the fixed "today" (2026-04-15) sits 14 days into it.
    const expectedPosition = (14 / 29) * 100;
    const marker = await page.evaluate(() => {
      const markerNode = document.querySelector('.roadmap-today-marker');
      const axisLine = document.querySelector('.roadmap-axis-line');
      if (!(markerNode instanceof HTMLElement) || !(axisLine instanceof HTMLElement)) return null;
      const axisRect = axisLine.getBoundingClientRect();
      const markerRect = markerNode.getBoundingClientRect();
      return {
        label: document.querySelector('.roadmap-today-marker-label')?.textContent?.trim() || '',
        markerPosition: ((markerRect.left + (markerRect.width / 2)) - axisRect.left) / axisRect.width * 100
      };
    });

    expect(marker).not.toBeNull();
    expect(marker!.label).toBe('T');
    expect(Math.abs(marker!.markerPosition - expectedPosition)).toBeLessThanOrEqual(1);
  });

  test('roadmap axis hides the today marker when today is outside the visible range', async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = '2026-06-15T12:00:00.000Z';
      const RealDate = window.Date;
      class FakeDate extends RealDate {
        constructor(...args: any[]) {
          super(...(args.length ? args : [fixedNow]) as [any]);
        }
        static now() {
          return new RealDate(fixedNow).getTime();
        }
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      (window as any).Date = FakeDate;
    });

    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();

    await expect(page.locator('.roadmap-today-marker')).toHaveCount(0);
  });

  test('roadmap rows support keyboard disclosure for task expansion', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    const disclosure = page.getByRole('button', { name: 'Show tasks for Foundation' });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');

    await page.getByRole('button', { name: 'Hide tasks for Foundation' }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toHaveCount(0);
  });

  test('historical roadmap task rows open the detail modal with projected read-only data', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await openTaskEditor(page, 'Task A');
    await page.locator('#taskName').fill('Task A Updated');
    await page.locator('#taskDescription').fill('Latest description');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node) => {
      (node as HTMLInputElement).value = '0';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await page.locator('[data-roadmap-task-list="phase:p1"]').getByRole('button', { name: 'Task A', exact: true }).click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    // Read-only: the edit shortcut does nothing from a historical detail view.
    await page.keyboard.press('e');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.tasks.find((task: any) => task.id === 1)?.title).toBe('Task A Updated');
  });

  test('roadmap shared-table rows support keyboard detail and edit navigation', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' },
        { id: 2, title: 'Task B', status: 'to-do', phaseId: 'p1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await page.locator('[data-roadmap-task-list="phase:p1"]').getByRole('button', { name: 'Task B', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('e');

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveValue('Task B');
  });

  test('closing detail returns focus to the selected shared-table workitem', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 1, title: 'Task A', status: 'backlog', phaseId: 'p1' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    const trigger = page.locator('[data-roadmap-task-list="phase:p1"]').getByRole('button', { name: 'Task A', exact: true });
    await trigger.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(trigger).toBeFocused();
  });

  test('roadmap entity modal traps shortcut context and Escape closes it', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [],
          phases: [],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();

    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeHidden();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#roadmapEntityModal')).toBeHidden();
    await expect(page.locator('#helpModal')).toBeHidden();
  });

  const ROADMAP_EXTENSION = {
    roadmap: {
      version: 1,
      milestones: [],
      phases: [],
      sprints: [{ id: 's1', title: 'Sprint 12', startDate: '2026-04-01', endDate: '2026-04-14' }]
    }
  };

  async function openAddMilestone(page: Page) {
    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Add Milestone' }).click();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();
  }

  test('roadmap entity modal focuses the title when adding a milestone', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
    ], { selectedBoardId: 'alpha' });

    await openAddMilestone(page);

    await expect(page.locator('#roadmapEntityTitle')).toBeFocused();
  });

  test('roadmap entity modal focuses the sprint select when adding to an existing sprint', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'alpha',
        title: 'Alpha',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'to-do' }
        ],
        extensions: ROADMAP_EXTENSION
      }
    ], { selectedBoardId: 'alpha' });
    await portfolioCard(page, 'Task A').locator('input[type="checkbox"]').check();
    await portfolioCard(page, 'Task B').locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: 'Add to Existing Sprint' }).click();

    await expect(page.locator('#roadmapEntityModalTitle')).toHaveText('Add to Existing Sprint');
    await expect(page.locator('#roadmapEntityExistingSprint')).toBeFocused();
  });

  for (const method of ['Escape', 'close button', 'cancel button', 'overlay click']) {
    test(`roadmap entity modal closed by ${method} leaves the page and reopens empty`, async ({ page }) => {
      await seedPortfolioBoards(page, [
        { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
      ], { selectedBoardId: 'alpha' });
      await openAddMilestone(page);
      await expect.poll(() => focusIsInside(page, '#roadmapEntityModal')).toBe(true);
      await page.locator('#roadmapEntityTitle').fill('Unsaved draft');

      await closeDialogBy(page, 'roadmapEntityModal', method);

      await expect(page.locator('#roadmapEntityModal')).toHaveCount(0);
      await page.getByRole('button', { name: 'Add Milestone' }).click();
      await expect(page.locator('#roadmapEntityTitle')).toHaveValue('');
    });
  }

  test('roadmap entity modal rejects a milestone without a date', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, tasks: [], extensions: ROADMAP_EXTENSION }
    ], { selectedBoardId: 'alpha' });
    await openAddMilestone(page);
    await page.locator('#roadmapEntityTitle').fill('Gamma');

    await page.locator('#roadmapEntityModalSaveBtn').click();

    await answerAppMessage(page, { expectText: 'Milestone requires a valid due date.' });
    await expect(page.locator('#roadmapEntityDate')).toBeFocused();
    await expect(page.locator('#roadmapEntityModal')).toBeVisible();
  });
});
