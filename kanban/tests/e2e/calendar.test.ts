import { test, expect } from '@playwright/test';

import {
  gotoApp,
  seedPortfolioBoards
} from '../support/portfolio';

test.describe('calendar', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('aggregate portfolio shows calendar mode without selecting a board and persists calendar url state', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] },
      { id: 'bravo', hasHandle: true, title: 'Bravo', tasks: [] }
    ]);

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Board' })).toHaveClass(/active/);
    await expect(page.locator('#portfolioBoard')).toBeVisible();

    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page).toHaveURL(/pv=calendar/);
    await expect(page).not.toHaveURL(/pb=/);

    await page.getByRole('button', { name: 'Board' }).click();

    await expect(page.locator('#portfolioBoard')).toBeVisible();
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Board' })).toHaveClass(/active/);
    await expect(page).toHaveURL(/\/$/);
  });

  test('calendar view renders roadmap items and due-date tasks with month drill-down', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [
        { id: 7, title: 'March Peak A', status: 'backlog', dueDate: '2026-03-31' },
        { id: 8, title: 'March Peak B', status: 'backlog', dueDate: '2026-03-31' },
        { id: 9, title: 'March Peak C', status: 'backlog', dueDate: '2026-03-31' },
        { id: 10, title: 'March Peak D', status: 'backlog', dueDate: '2026-03-31' },
        { id: 1, title: 'Due Task', status: 'backlog', dueDate: '2026-04-03' },
        { id: 3, title: 'Launch Task', status: 'backlog', dueDate: '2026-04-10' },
        { id: 4, title: 'Scale Task', status: 'backlog', dueDate: '2026-04-10' },
        { id: 5, title: 'Support Task', status: 'backlog', dueDate: '2026-04-10' },
        { id: 6, title: 'September Task', status: 'backlog', dueDate: '2026-09-15' },
        { id: 2, title: 'Undated Task', status: 'backlog' }
      ],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Launch', dueDate: '2026-04-10' }],
          phases: [{ id: 'p1', title: 'Build', startDate: '2026-04-01', endDate: '2026-05-15' }],
          sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2026-04-01', endDate: '2026-04-14' }]
        }
      }
    }], { selectedBoardId: 'alpha' });

    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('.portfolio-calendar-title')).toHaveCount(0);
    await expect(page.locator('.portfolio-calendar-subtitle')).toHaveCount(0);
    await expect(page.locator('.portfolio-calendar-quarter-label')).toHaveCount(0);
    const calendarHeader = page.locator('#portfolioCalendarView .portfolio-calendar-header');
    const periodGroup = calendarHeader.locator('.portfolio-calendar-period-group');
    const toggleButton = periodGroup.getByRole('button');

    await expect(periodGroup).toBeVisible();
    await expect(periodGroup.locator('.portfolio-calendar-period')).toBeVisible();
    await expect(toggleButton).toHaveCount(1);
    await expect(toggleButton).toHaveText('Heat Map');
    await expect(calendarHeader).toContainText('2026');
    const calendarShell = page.locator('.portfolio-calendar-shell');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'calendar');

    const calendarModeYearColors = await page.evaluate(() => {
      const readBackground = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).backgroundColor : '';
      };
      return {
        zero: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-02"]'),
        single: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-03"]'),
        high: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-10"]'),
        sameCount: readBackground('.portfolio-calendar-month-card[data-month="8"] [data-calendar-mini-day="2026-09-15"]'),
        aprilCard: readBackground('.portfolio-calendar-month-card[data-month="3"]')
      };
    });

    await toggleButton.click();
    await expect(periodGroup.getByRole('button')).toHaveText('Calendar');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');

    const heatMapYearColors = await page.evaluate(() => {
      const readBackground = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).backgroundColor : '';
      };
      return {
        zero: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-02"]'),
        single: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-03"]'),
        high: readBackground('.portfolio-calendar-month-card[data-month="3"] [data-calendar-mini-day="2026-04-10"]'),
        sameCount: readBackground('.portfolio-calendar-month-card[data-month="8"] [data-calendar-mini-day="2026-09-15"]'),
        aprilCard: readBackground('.portfolio-calendar-month-card[data-month="3"]')
      };
    });
    const parseRgb = (value: string) => ((value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number));
    const zeroRgb = parseRgb(heatMapYearColors.zero);
    const highRgb = parseRgb(heatMapYearColors.high);

    expect(heatMapYearColors.high).not.toBe(calendarModeYearColors.high);
    expect(heatMapYearColors.aprilCard).toBe(calendarModeYearColors.aprilCard);
    expect(heatMapYearColors.single).toBe(heatMapYearColors.sameCount);
    expect(zeroRgb[1]).toBeGreaterThan(highRgb[1]);
    expect(highRgb[0]).toBeGreaterThan(zeroRgb[0]);

    await periodGroup.getByRole('button', { name: 'Calendar' }).click();
    await expect(periodGroup.getByRole('button')).toHaveText('Heat Map');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'calendar');

    await page.getByRole('button', { name: 'Previous year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2025');
    await page.getByRole('button', { name: 'Next year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2026');
    await page.getByRole('button', { name: 'Next year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2027');
    await page.getByRole('button', { name: 'Previous year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2026');

    const calendarLayout = await page.evaluate(() => {
      const view = document.getElementById('portfolioCalendarView');
      const header = view?.querySelector('.portfolio-calendar-header');
      const shell = view?.querySelector('.portfolio-calendar-shell');
      if (!view || !header || !shell) return null;
      const viewStyle = getComputedStyle(view);
      const shellStyle = getComputedStyle(shell);
      return {
        viewChildren: Array.from(view.children).map((node) => node.className),
        headerParentId: header.parentElement?.id || '',
        headerBackground: getComputedStyle(header).backgroundColor,
        viewPadding: `${viewStyle.paddingTop} ${viewStyle.paddingRight} ${viewStyle.paddingBottom} ${viewStyle.paddingLeft}`,
        shellPadding: `${shellStyle.paddingTop} ${shellStyle.paddingRight} ${shellStyle.paddingBottom} ${shellStyle.paddingLeft}`,
        viewOverflowY: viewStyle.overflowY,
        shellOverflowY: shellStyle.overflowY
      };
    });

    expect(calendarLayout).not.toBeNull();
    expect(calendarLayout!.viewChildren).toEqual(['portfolio-calendar-header', 'portfolio-calendar-shell']);
    expect(calendarLayout!.headerParentId).toBe('portfolioCalendarView');
    expect(calendarLayout!.headerBackground).toBe('rgb(250, 250, 250)');
    expect(calendarLayout!.viewPadding).toBe('0px 0px 0px 0px');
    expect(calendarLayout!.shellPadding).toBe('16px 16px 16px 16px');
    expect(calendarLayout!.viewOverflowY).toBe('hidden');
    expect(calendarLayout!.shellOverflowY).toBe('auto');

    const aprilCard = page.locator('.portfolio-calendar-month-card[data-month="3"]');
    await expect(aprilCard).toBeVisible();
    await expect(aprilCard.locator('.portfolio-calendar-month-name')).toHaveText('April');
    await expect(aprilCard.locator('.portfolio-calendar-mini-month-grid')).toHaveCount(1);
    await expect(aprilCard.locator('.portfolio-calendar-mini-day')).toHaveCount(35);
    await expect(aprilCard.locator('.portfolio-calendar-mini-day').first()).toHaveCSS('min-height', '48px');
    await expect(aprilCard.locator('[data-calendar-mini-day="2026-04-03"]')).toHaveCount(1);
    await expect(aprilCard.locator('[data-calendar-mini-day="2026-04-10"]')).toHaveCount(1);
    await expect(aprilCard.locator('.portfolio-calendar-mini-marker')).toHaveCount(8);

    await toggleButton.click();
    await expect(periodGroup.getByRole('button')).toHaveText('Calendar');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Previous year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2025');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Next year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2026');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Open April 2026' }).click();

    await expect(page.locator('#portfolioCalendarView')).toContainText('April 2026');
    await expect(page.getByRole('button', { name: 'Back to year' })).toBeVisible();
    await expect(calendarShell).toHaveAttribute('data-calendar-view', 'month');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');

    const monthHeatColors = await page.evaluate(() => {
      const readBackground = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).backgroundColor : '';
      };
      return {
        zero: readBackground('[data-calendar-day="2026-04-02"]'),
        single: readBackground('[data-calendar-day="2026-04-03"]'),
        high: readBackground('[data-calendar-day="2026-04-10"]'),
        outsideTask: readBackground('[data-calendar-day="2026-03-31"]'),
        outsideEmpty: readBackground('[data-calendar-day="2026-03-30"]')
      };
    });
    const monthZeroRgb = parseRgb(monthHeatColors.zero);
    const monthHighRgb = parseRgb(monthHeatColors.high);
    const yearHighRgb = parseRgb(heatMapYearColors.high);

    expect(monthHeatColors.high).not.toBe(monthHeatColors.outsideTask);
    expect(monthHeatColors.outsideTask).toBe(monthHeatColors.outsideEmpty);
    expect(monthHeatColors.high).not.toBe(heatMapYearColors.high);
    expect(monthHighRgb[1]).toBeLessThan(yearHighRgb[1]);
    expect(monthZeroRgb[1]).toBeGreaterThan(monthHighRgb[1]);
    expect(monthHighRgb[0]).toBeGreaterThan(monthZeroRgb[0]);

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.locator('#portfolioCalendarView')).toContainText('May 2026');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.locator('#portfolioCalendarView')).toContainText('April 2026');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Back to year' }).click();
    await expect(page.locator('#portfolioCalendarView .portfolio-calendar-header')).toContainText('2026');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Open April 2026' }).click();
    await expect(page.locator('#portfolioCalendarView')).toContainText('April 2026');
    await expect(calendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');

    await expect(page.locator('.portfolio-calendar-week-roadmap')).toHaveCount(0);

    const roadmapTitlesByDay = await page.evaluate(() => ({
      aprilNinth: Array.from(document.querySelectorAll('[data-calendar-day="2026-04-09"] .portfolio-calendar-day-roadmap [data-calendar-roadmap-title]')).map((node) => node.getAttribute('data-calendar-roadmap-title')),
      aprilTenth: Array.from(document.querySelectorAll('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-roadmap [data-calendar-roadmap-title]')).map((node) => node.getAttribute('data-calendar-roadmap-title')),
      aprilEleventh: Array.from(document.querySelectorAll('[data-calendar-day="2026-04-11"] .portfolio-calendar-day-roadmap [data-calendar-roadmap-title]')).map((node) => node.getAttribute('data-calendar-roadmap-title'))
    }));
    expect(roadmapTitlesByDay).toEqual({
      aprilNinth: ['Build', 'Sprint 1'],
      aprilTenth: ['Build', 'Sprint 1', 'Launch'],
      aprilEleventh: ['Build', 'Sprint 1']
    });

    const aprilTenthDayTitles = await page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-items [data-calendar-item-title]').evaluateAll((nodes) => (
      nodes.map((node) => node.getAttribute('data-calendar-item-title'))
    ));
    expect(aprilTenthDayTitles).toEqual(['Launch Task']);
    await expect(page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-item-overflow')).toHaveText('+2 more');

    const calendarItemMetrics = await page.evaluate(() => {
      const dayCell = document.querySelector('[data-calendar-day="2026-04-10"]');
      const roadmap = document.querySelector('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-roadmap [data-calendar-roadmap-title="Launch"]');
      const task = document.querySelector('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-items [data-calendar-item-title="Launch Task"]');
      const roadmapStack = document.querySelector('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-roadmap');
      const taskStack = document.querySelector('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-items');
      if (!dayCell || !roadmap || !task || !roadmapStack || !taskStack) return null;
      const dayCellStyle = getComputedStyle(dayCell);
      const roadmapStyle = getComputedStyle(roadmap);
      const taskStyle = getComputedStyle(task);
      return {
        cellMinHeight: dayCellStyle.minHeight,
        cellPadding: `${dayCellStyle.paddingTop} ${dayCellStyle.paddingRight} ${dayCellStyle.paddingBottom} ${dayCellStyle.paddingLeft}`,
        roadmapHeight: Math.round(roadmap.getBoundingClientRect().height),
        taskHeight: Math.round(task.getBoundingClientRect().height),
        roadmapGap: getComputedStyle(roadmapStack).gap,
        taskGap: getComputedStyle(taskStack).gap,
        roadmapFontSize: roadmapStyle.fontSize,
        taskFontSize: taskStyle.fontSize,
        roadmapLineHeight: roadmapStyle.lineHeight,
        taskLineHeight: taskStyle.lineHeight,
        roadmapPadding: `${roadmapStyle.paddingTop} ${roadmapStyle.paddingRight} ${roadmapStyle.paddingBottom} ${roadmapStyle.paddingLeft}`,
        taskPadding: `${taskStyle.paddingTop} ${taskStyle.paddingRight} ${taskStyle.paddingBottom} ${taskStyle.paddingLeft}`
      };
    });
    expect(calendarItemMetrics).not.toBeNull();
    expect(calendarItemMetrics!.cellMinHeight).toBe('112px');
    expect(calendarItemMetrics!.cellPadding).toBe('8px 8px 8px 8px');
    expect(calendarItemMetrics!.roadmapHeight).toBe(calendarItemMetrics!.taskHeight);
    expect(calendarItemMetrics!.roadmapGap).toBe(calendarItemMetrics!.taskGap);
    expect(calendarItemMetrics!.roadmapFontSize).toBe(calendarItemMetrics!.taskFontSize);
    expect(calendarItemMetrics!.roadmapLineHeight).toBe(calendarItemMetrics!.taskLineHeight);
    expect(calendarItemMetrics!.roadmapPadding).toBe(calendarItemMetrics!.taskPadding);

    await page.locator('[data-calendar-day="2026-04-10"] [data-calendar-roadmap-title="Launch"]').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-item-overflow').click();
    await expect(page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-item-overflow')).toHaveText('Show less');
    await expect(page.locator('[data-calendar-day="2026-04-10"] [data-calendar-item-title="Scale Task"]')).toBeVisible();
    await expect(page.locator('[data-calendar-day="2026-04-10"] [data-calendar-item-title="Support Task"]')).toBeVisible();

    await page.locator('[data-calendar-day="2026-04-04"]').click({ position: { x: 10, y: 105 } });
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('New Task');
    await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
    await expect(page.locator('#taskDueDate')).toHaveValue('2026-04-04');
    await page.locator('#taskModalCancelBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(page.locator('#portfolioCalendarView')).toContainText('Due Task');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Launch');
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Undated Task');
  });

  test('aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'alpha',
        hasHandle: true,
        title: 'Alpha',
        tasks: [{ id: 1, title: 'Alpha Due', status: 'backlog', dueDate: '2026-04-03' }],
        extensions: {
          roadmap: {
            version: 1,
            milestones: [{ id: 'm1', title: 'Launch', dueDate: '2026-04-03' }],
            phases: [],
            sprints: []
          }
        }
      },
      {
        id: 'bravo',
        hasHandle: true,
        title: 'Bravo',
        tasks: [
          { id: 2, title: 'Bravo Due', status: 'backlog', dueDate: '2026-04-03' },
          { id: 3, title: 'Bravo Later', status: 'backlog', dueDate: '2026-04-09' }
        ]
      }
    ]);

    await page.getByRole('button', { name: 'Calendar' }).click();
    const aggregateCalendarShell = page.locator('.portfolio-calendar-shell');
    await expect(page.getByRole('button', { name: 'Heat Map' })).toBeVisible();
    await page.getByRole('button', { name: 'Heat Map' }).click();
    await expect(aggregateCalendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: 'Open April 2026' }).click();
    await expect(aggregateCalendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');

    await expect(page.locator('#portfolioCalendarView')).toContainText('Alpha Due');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Bravo Due');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Bravo Later');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Launch');

    const styles = await page.evaluate(() => {
      const alpha = document.querySelector('[data-calendar-item-title="Alpha Due"]');
      const bravo = document.querySelector('[data-calendar-item-title="Bravo Due"]');
      const roadmap = document.querySelector('[data-calendar-day="2026-04-03"] .portfolio-calendar-day-roadmap [data-calendar-roadmap-title="Launch"]');
      const aggregateHigh = document.querySelector('[data-calendar-day="2026-04-03"]');
      const aggregateLow = document.querySelector('[data-calendar-day="2026-04-09"]');
      if (!alpha || !bravo || !roadmap || !aggregateHigh || !aggregateLow) return null;
      return {
        alphaLabel: alpha.textContent?.trim() || '',
        alphaTitle: alpha.getAttribute('title') || '',
        alphaBackground: getComputedStyle(alpha).backgroundColor,
        aggregateHighBackground: getComputedStyle(aggregateHigh).backgroundColor,
        aggregateLowBackground: getComputedStyle(aggregateLow).backgroundColor,
        roadmapLabel: roadmap.textContent?.trim() || '',
        roadmapTitle: roadmap.getAttribute('title') || '',
        bravoBackground: getComputedStyle(bravo).backgroundColor
      };
    });

    expect(styles).not.toBeNull();
    await expect(page.locator('#portfolioBoardsChips .portfolio-chip.active [data-action="select-board"][data-board-id=""]')).toHaveCount(1);
    expect(styles!.alphaLabel).toBe('Alpha Due');
    expect(styles!.alphaTitle).toBe('Alpha Due');
    expect(styles!.alphaBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles!.roadmapLabel).toBe('Launch');
    expect(styles!.roadmapTitle).toBe('Launch');
    expect(styles!.bravoBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles!.alphaBackground).not.toBe(styles!.bravoBackground);
    expect(styles!.aggregateHighBackground).not.toBe(styles!.aggregateLowBackground);

    await page.locator('[data-calendar-item-title="Alpha Due"]').click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Alpha Due');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    // Opening the task did not select its board or leave calendar mode.
    await expect(page.locator('#portfolioBoardsChips .portfolio-chip.active [data-action="select-board"][data-board-id=""]')).toHaveCount(1);
    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
  });

  test('creating a task from a calendar day prefills the due date', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undated', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.locator('[data-action="open-calendar-month"]').first().click();
    const dayCell = page.locator('.portfolio-calendar-day-cell[data-action="create-calendar-task"]').first();
    const dueDate = await dayCell.getAttribute('data-due-date');
    expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await dayCell.click();
    await expect(page.locator('#modalTitle')).toHaveText('New Task');
    await expect(page.locator('#taskDueDate')).toHaveValue(dueDate!);
  });

  test('month calendar renders only the weeks needed by each month', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'calendar-weeks',
      title: 'Calendar Weeks',
      hasHandle: true,
      tasks: [
        { id: 1, title: 'February task', status: 'backlog', dueDate: '2026-02-03' },
        { id: 2, title: 'April task', status: 'backlog', dueDate: '2026-04-03' }
      ]
    }], { selectedBoardId: 'calendar-weeks' });

    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    const calendarShell = page.locator('.portfolio-calendar-shell');

    await page.getByRole('button', { name: 'Open February 2026' }).click();
    await expect(calendarShell).toHaveAttribute('data-calendar-view', 'month');
    await expect(calendarShell.locator('.portfolio-calendar-week-row')).toHaveCount(4);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell')).toHaveCount(28);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').first()).toHaveAttribute('data-calendar-day', '2026-02-01');
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').last()).toHaveAttribute('data-calendar-day', '2026-02-28');

    await page.getByRole('button', { name: 'Back to year' }).click();
    await page.getByRole('button', { name: 'Open April 2026' }).click();
    await expect(calendarShell).toHaveAttribute('data-calendar-view', 'month');
    await expect(calendarShell.locator('.portfolio-calendar-week-row')).toHaveCount(5);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell')).toHaveCount(35);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').first()).toHaveAttribute('data-calendar-day', '2026-03-29');
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').last()).toHaveAttribute('data-calendar-day', '2026-05-02');
  });

  test('month calendar keeps the period controls centered', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'calendar-layout',
      title: 'Layout Project',
      hasHandle: true,
      tasks: [{ id: 1, title: 'April task', status: 'backlog', dueDate: '2026-04-03' }]
    }], { selectedBoardId: 'calendar-layout' });

    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Open April 2026' }).click();

    const metrics = await page.evaluate(() => {
      const controls = document.querySelector('.portfolio-calendar-controls')?.getBoundingClientRect();
      const period = document.querySelector('.portfolio-calendar-period-group')?.getBoundingClientRect();
      const back = document.querySelector('[data-action="calendar-back-to-year"]')?.getBoundingClientRect();
      const previous = document.querySelector('[data-action="calendar-prev-month"]')?.getBoundingClientRect();
      const next = document.querySelector('[data-action="calendar-next-month"]')?.getBoundingClientRect();
      if (!controls || !period || !back || !previous || !next) return null;
      return {
        controlsCenter: controls.left + controls.width / 2,
        periodCenter: period.left + period.width / 2,
        backLeft: back.left,
        previousLeft: previous.left,
        nextRight: next.right,
        controlsRight: controls.right
      };
    });

    expect(metrics).not.toBeNull();
    expect(Math.abs(metrics!.periodCenter - metrics!.controlsCenter), JSON.stringify(metrics)).toBeLessThan(1);
    expect(metrics!.backLeft).toBeLessThan(metrics!.previousLeft);
    expect(Math.abs(metrics!.nextRight - metrics!.controlsRight)).toBeLessThan(1);
  });
});
