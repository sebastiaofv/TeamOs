import { test, expect } from '@playwright/test';

import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

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
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toBeVisible();
    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page).toHaveURL(/pv=calendar/);
    await expect(page).not.toHaveURL(/pb=/);

    await page.getByRole('button', { name: 'Board', exact: true }).click();

    await expect(page.locator('#portfolioBoard')).toBeVisible();
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveClass(/active/);
    await expect(page).toHaveURL(/\/$/);
  });

  test('calendar consults Task deadlines while excluding roadmap entities and parent workitems', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Deadlines', hasHandle: true, tasks: [
      { id: 1, title: 'Execution deadline', status: 'to-do', dueDate: '2026-04-03' },
      { id: 2, title: 'Story deadline', type: 'story', status: 'to-do', dueDate: '2026-04-03' },
      { id: 3, title: 'Bug deadline', type: 'bug', status: 'to-do', dueDate: '2026-04-03' }
    ], extensions: { roadmap: { version: 1, phases: [], sprints: [], milestones: [{ id: 'm', title: 'Release', dueDate: '2026-04-03' }] } } }]);
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: /^April \d+ items?$/ }).click();
    await expect(page.locator('#portfolioCalendarView')).toContainText('Execution deadline');
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Story deadline');
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Bug deadline');
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Release');
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

    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar' }).click();
    const aggregateCalendarShell = page.locator('.portfolio-calendar-shell');
    await expect(page.getByRole('button', { name: 'Heat Map' })).toBeVisible();
    await page.getByRole('button', { name: 'Heat Map' }).click();
    await expect(aggregateCalendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');
    await page.getByRole('button', { name: /^April \d+ items?$/ }).click();
    await expect(aggregateCalendarShell).toHaveAttribute('data-calendar-display-mode', 'heatmap');

    await expect(page.locator('#portfolioCalendarView')).toContainText('Alpha Due');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Bravo Due');
    await expect(page.locator('#portfolioCalendarView')).toContainText('Bravo Later');
    await expect(page.locator('#portfolioCalendarView')).not.toContainText('Launch');

    const styles = await page.evaluate(() => {
      const alpha = document.querySelector('[data-calendar-item-title="Alpha Due"]');
      const bravo = document.querySelector('[data-calendar-item-title="Bravo Due"]');
      const aggregateHigh = document.querySelector('[data-calendar-day="2026-04-03"]');
      const aggregateLow = document.querySelector('[data-calendar-day="2026-04-09"]');
      if (!alpha || !bravo || !aggregateHigh || !aggregateLow) return null;
      return {
        alphaLabel: alpha.textContent?.trim() || '',
        alphaTitle: alpha.getAttribute('title') || '',
        alphaBackground: getComputedStyle(alpha).backgroundColor,
        aggregateHighBackground: getComputedStyle(aggregateHigh).backgroundColor,
        aggregateLowBackground: getComputedStyle(aggregateLow).backgroundColor,
        bravoBackground: getComputedStyle(bravo).backgroundColor
      };
    });

    expect(styles).not.toBeNull();
    await expect(page.locator('#projectPickerBtn')).toHaveText('All');
    expect(styles!.alphaLabel).toBe('Alpha Due');
    expect(styles!.alphaTitle).toBe('Alpha Due');
    expect(styles!.alphaBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles!.bravoBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles!.alphaBackground).not.toBe(styles!.bravoBackground);
    expect(styles!.aggregateHighBackground).not.toBe(styles!.aggregateLowBackground);

    await page.locator('[data-calendar-item-title="Alpha Due"]').click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Alpha Due');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    // Opening the task did not select its board or leave calendar mode.
    await expect(page.locator('#projectPickerBtn')).toHaveText('All');
    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
  });

  test('calendar is for consultation and does not create Tasks from date cells', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Consultation', hasHandle: true, tasks: [] }]);
    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.locator('[data-action="open-calendar-month"]').first().click();
    await expect(page.locator('[data-action="create-calendar-task"]')).toHaveCount(0);
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

    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    const calendarShell = page.locator('.portfolio-calendar-shell');

    await page.getByRole('button', { name: /^February \d+ items?$/ }).click();
    await expect(calendarShell).toHaveAttribute('data-calendar-view', 'month');
    await expect(calendarShell.locator('.portfolio-calendar-week-row')).toHaveCount(4);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell')).toHaveCount(28);
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').first()).toHaveAttribute('data-calendar-day', '2026-02-01');
    await expect(calendarShell.locator('.portfolio-calendar-day-cell').last()).toHaveAttribute('data-calendar-day', '2026-02-28');

    await page.getByRole('button', { name: 'Back to year' }).click();
    await page.getByRole('button', { name: /^April \d+ items?$/ }).click();
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

    await page.getByRole('button', { name: 'Day Planner', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: /^April \d+ items?$/ }).click();

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
