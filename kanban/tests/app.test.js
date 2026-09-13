'use strict';

const { test, expect } = require('@playwright/test');

const {
  buildBoardPayload,
  gotoApp,
  seedPortfolioBoards,
  selectPortfolioBoard,
  readSavedBoard,
  waitForBoardWrites,
  portfolioCard,
  focusIsInside,
  closeDialogBy
} = require('./support/portfolio');

// Project chips for loaded boards (excludes the "All" chip).
function portfolioProjectChipButtons(page) {
  return page.locator('#portfolioBoardsChips [data-action="select-board"]:not([data-board-id=""])');
}

async function openTaskEditor(page, cardTitle) {
  await portfolioCard(page, cardTitle).locator('[data-action="edit-task"]').click();
  await expect(page.locator('#taskModal')).toBeVisible();
}

async function renameTaskViaEditor(page, fromTitle, toTitle) {
  await openTaskEditor(page, fromTitle);
  await page.locator('#taskName').fill(toTitle);
  await page.locator('#taskModal .btn-primary').click();
  await expect(page.locator('#taskModal')).toBeHidden();
}

async function setTimelineSlider(page, value) {
  await page.locator('#portfolioTimelinePanel .timeline-slider').evaluate((node, value) => {
    node.value = String(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function mockNewProjectFlow(page, { promptValue = 'New Project', fileName = 'new-project.json' } = {}) {
  await page.evaluate(({ promptValue, fileName }) => {
    window.__newProjectWrites = [];
    const disk = {
      text: '',
      lastModified: Date.now()
    };
    window.prompt = () => promptValue;
    window.showSaveFilePicker = async () => ({
      name: fileName,
      async getFile() {
        const text = String(disk.text || '');
        const lastModified = Number(disk.lastModified) || Date.now();
        return {
          name: fileName,
          size: new Blob([text]).size,
          lastModified,
          async text() {
            return text;
          }
        };
      },
      async createWritable() {
        return {
          async write(text) {
            const serialized = String(text);
            window.__newProjectWrites.push(serialized);
            disk.text = serialized;
            disk.lastModified = Date.now();
          },
          async close() {}
        };
      }
    });
  }, { promptValue, fileName });
}

async function mockImportProjectsPicker(page, payloads) {
  await page.evaluate((payloads) => {
    window.showOpenFilePicker = async () => payloads.map((entry) => ({
      name: entry.fileName,
      async getFile() {
        return {
          name: entry.fileName,
          async text() {
            return JSON.stringify(entry.payload);
          }
        };
      }
    }));
  }, payloads);
}

async function mutateExternalBoardFile(page, { boardId, payload, invalidText = null }) {
  await page.evaluate(({ boardId, payload, invalidText }) => {
    if (!window.__portfolioDiskByBoardId || !window.__portfolioDiskByBoardId[boardId]) {
      throw new Error(`Disk state not found for board: ${boardId}`);
    }
    const disk = window.__portfolioDiskByBoardId[boardId];
    const nextText = typeof invalidText === 'string' ? invalidText : JSON.stringify(payload, null, 2);
    disk.text = nextText;
    disk.lastModified = (Number(disk.lastModified) || Date.now()) + 1000;
  }, { boardId, payload, invalidText });
}

// Runs the app's external-change check the way the browser does: a window
// focus event. A focus that lands while a check is already running is ignored
// by the app, so keep re-focusing until every seeded writable file has been
// opened again, then let the (microtask-only) fake reads settle.
async function triggerExternalFileCheck(page) {
  const before = await page.evaluate(() => ({ ...(window.__portfolioFileOpensByBoardId || {}) }));
  await expect.poll(() => page.evaluate((before) => {
    const opens = window.__portfolioFileOpensByBoardId || {};
    const labels = Object.keys(before);
    if (labels.every((label) => opens[label] > before[label])) return true;
    window.dispatchEvent(new Event('focus'));
    return false;
  }, before), { intervals: [50, 100, 250] }).toBe(true);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function portfolioTitlesInColumn(page, status = 'backlog') {
  const titles = await page.locator(`#portfolio-${status}-column .portfolio-task-card .task-title`).allTextContents();
  return titles.map((t) => t.trim());
}

// Controls writes to one seeded board's fake file: hold each write until the
// test releases it, and/or fail the next N writes. Only the fake disk changes;
// the seeded handle's createWritable() consults this control on every write.
async function installControlledPortfolioWriter(page, { boardId, holdWrites = false, failWrites = 0 } = {}) {
  await page.evaluate(({ boardId, holdWrites, failWrites }) => {
    if (!window.__portfolioDiskByBoardId || !window.__portfolioDiskByBoardId[boardId]) {
      throw new Error(`Disk state not found for board: ${boardId}`);
    }
    window.__portfolioTestWrites = [];
    window.__portfolioWriteControl = {
      boardId,
      holdWrites: Boolean(holdWrites),
      failRemaining: Math.max(0, Number(failWrites) || 0),
      attempts: 0,
      active: 0,
      maxActive: 0,
      pendingResolvers: []
    };
    window.__releaseNextPortfolioWrite = () => {
      const next = window.__portfolioWriteControl?.pendingResolvers?.shift();
      if (typeof next === 'function') {
        next();
        return true;
      }
      return false;
    };
  }, { boardId, holdWrites, failWrites });
}

test.describe('portfolio-only app', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads portfolio-only minimalist UI', async ({ page }) => {
    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toHaveCount(0);
    await expect(page.locator('.header-actions > #importProjectsBtn')).toBeVisible();
    await expect(page.locator('.header-actions > #newProjectBtn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(page.locator('#portfolioBoardWrap')).toBeVisible();
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
  });

  test('top bar theme toggle switches and persists dark mode', async ({ page }) => {
    const root = page.locator('html');
    const toggle = page.locator('#themeToggleBtn');

    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    await expect(toggle.locator('.theme-toggle-icon-light')).toBeVisible();
    await expect(toggle.locator('.theme-toggle-icon-dark')).toBeHidden();

    await toggle.click();

    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(toggle.locator('.theme-toggle-icon-light')).toBeHidden();
    await expect(toggle.locator('.theme-toggle-icon-dark')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('teamOsKanbanTheme'))).toBe('dark');

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#themeToggleBtn')).toHaveAttribute('aria-label', 'Switch to light mode');

    await page.locator('#themeToggleBtn').click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#themeToggleBtn')).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(await page.evaluate(() => localStorage.getItem('teamOsKanbanTheme'))).toBe('light');
  });

  test('app shell does not create a page scrollbar on load', async ({ page }) => {
    const metrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight
    }));

    expect(metrics.docScrollHeight).toBe(metrics.viewportHeight);
    expect(metrics.bodyScrollHeight).toBe(metrics.viewportHeight);
  });

  test('selected project shows board roadmap calendar toggles and persists calendar mode', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'alpha' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await page.getByRole('button', { name: 'Calendar' }).click();

    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
    await expect(page).toHaveURL(/pv=calendar/);
  });

  test('invalid selected board query resets roadmap mode and clears URL state', async ({ page }) => {
    await page.goto('/?pb=ghost&pv=roadmap');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }], { selectedBoardId: 'ghost' });

    await expect(page.locator('#portfolioViewModeToggle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Roadmap' })).toHaveCount(0);
    await expect(page.locator('#portfolioBoard')).toBeVisible();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
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
      const readBackground = (selector) => {
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
      const readBackground = (selector) => {
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
    const parseRgb = (value) => ((value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number));
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
    expect(calendarLayout.viewChildren).toEqual(['portfolio-calendar-header', 'portfolio-calendar-shell']);
    expect(calendarLayout.headerParentId).toBe('portfolioCalendarView');
    expect(calendarLayout.headerBackground).toBe('rgb(250, 250, 250)');
    expect(calendarLayout.viewPadding).toBe('0px 0px 0px 0px');
    expect(calendarLayout.shellPadding).toBe('16px 16px 16px 16px');
    expect(calendarLayout.viewOverflowY).toBe('hidden');
    expect(calendarLayout.shellOverflowY).toBe('auto');

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
      const readBackground = (selector) => {
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
    expect(calendarItemMetrics.cellMinHeight).toBe('112px');
    expect(calendarItemMetrics.cellPadding).toBe('8px 8px 8px 8px');
    expect(calendarItemMetrics.roadmapHeight).toBe(calendarItemMetrics.taskHeight);
    expect(calendarItemMetrics.roadmapGap).toBe(calendarItemMetrics.taskGap);
    expect(calendarItemMetrics.roadmapFontSize).toBe(calendarItemMetrics.taskFontSize);
    expect(calendarItemMetrics.roadmapLineHeight).toBe(calendarItemMetrics.taskLineHeight);
    expect(calendarItemMetrics.roadmapPadding).toBe(calendarItemMetrics.taskPadding);

    await page.locator('[data-calendar-day="2026-04-04"]').click();
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
    expect(styles.alphaLabel).toBe('Alpha Due');
    expect(styles.alphaTitle).toBe('Alpha Due');
    expect(styles.alphaBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.roadmapLabel).toBe('Launch');
    expect(styles.roadmapTitle).toBe('Launch');
    expect(styles.bravoBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.alphaBackground).not.toBe(styles.bravoBackground);
    expect(styles.aggregateHighBackground).not.toBe(styles.aggregateLowBackground);

    await page.locator('[data-calendar-item-title="Alpha Due"]').click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Alpha Due');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    // Opening the task did not select its board or leave calendar mode.
    await expect(page.locator('#portfolioBoardsChips .portfolio-chip.active [data-action="select-board"][data-board-id=""]')).toHaveCount(1);
    await expect(page.locator('#portfolioCalendarView')).toBeVisible();
  });

  test('stale selected board query resets roadmap mode on empty startup portfolio', async ({ page }) => {
    await page.goto('/?pb=ghost&pv=roadmap');

    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#portfolioViewModeToggle')).toBeHidden();
    await expect(page.locator('#portfolioRoadmapView')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');
    await expect(portfolioProjectChipButtons(page)).toHaveCount(0);
    await expect(page.locator('#portfolioCalendarView')).toBeHidden();
  });

  test('task form enforces blocker reason and attachment hard size', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    await expect(page.locator('#taskModal')).toBeVisible();
    expect(await page.evaluate(() => window.__lastAlert)).toBe('Blocked tasks require a blocker reason.');
    await expect(page.locator('#taskBlockerReason')).toBeFocused();

    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'huge.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc((10 * 1024 * 1024) + 1)
    });

    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('huge.bin exceeds the 10 MB limit.');
    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(0);
  });

  test('new project flow creates and selects a project', async ({ page }) => {
    await mockNewProjectFlow(page, { promptValue: 'Project Alpha', fileName: 'project-alpha.json' });

    await page.locator('#newProjectBtn').click();

    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Alpha');
    await expect(page.locator('#portfolio-backlog-column .add-task-card')).toBeVisible();

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    const result = await page.evaluate(() => ({
      writes: window.__newProjectWrites || []
    }));

    expect(result.writes.length).toBe(1);

    const saved = JSON.parse(result.writes[0]);
    expect(saved.board.settings.title).toBe('Project Alpha');
    expect(saved.board.tasks).toEqual([]);
  });

  test('new project flow aborts cleanly if name prompt is canceled after file picker', async ({ page }) => {
    await mockNewProjectFlow(page, { promptValue: null, fileName: 'canceled.json' });

    await page.locator('#newProjectBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('No projects loaded');

    await expect(portfolioProjectChipButtons(page)).toHaveCount(0);
    const result = await page.evaluate(() => ({
      writes: window.__newProjectWrites || []
    }));

    expect(result.writes).toEqual([]);
  });

  test('help button opens and closes help modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect(page.locator('#helpModal')).toContainText('Drag cards between columns');

    await page.keyboard.press('Escape');
    await expect(page.locator('#helpModal')).toBeHidden();
  });

  test('keyboard shortcut opens shortcuts modal', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsModal')).toContainText('Import projects');
    await expect(page.locator('#shortcutsModal')).toContainText('Open keyboard shortcuts');

    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcutsModal')).toBeHidden();
  });

  test('keyboard shortcuts can open help and import projects', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeVisible();
    await page.keyboard.press('Escape');

    await mockImportProjectsPicker(page, [
      {
        fileName: 'imported.json',
        payload: buildBoardPayload({
          title: 'Imported Via Shortcut',
          tasks: [{ id: 1, title: 'Shortcut import task', status: 'backlog' }]
        })
      }
    ]);

    await page.keyboard.press('i');
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Imported Via Shortcut');
    await expect(portfolioCard(page, 'Shortcut import task')).toBeVisible();
  });

  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`help dialog takes focus and returns it to the Help button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openHelpBtn');
      await trigger.click();
      await expect(page.locator('#helpModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

      await closeDialogBy(page, 'helpModal', method);

      await expect(page.locator('#helpModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('help dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#helpModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`shortcuts dialog takes focus and returns it to the Shortcuts button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openShortcutsBtn');
      await trigger.click();
      await expect(page.locator('#shortcutsModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

      await closeDialogBy(page, 'shortcutsModal', method);

      await expect(page.locator('#shortcutsModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('shortcuts dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#shortcutsModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('shortcuts dialog groups entries into Global, Cards and Modals', async ({ page }) => {
    await page.locator('#openShortcutsBtn').click();
    const list = page.locator('#shortcutsList');

    await expect(list.locator('.shortcut-section-card-title')).toHaveText(['Global', 'Cards', 'Modals']);
    await expect(list.locator('.shortcut-section-title')).toHaveText(['Task Modal', 'Task Detail', 'Modal']);
    await expect(list.locator('.shortcut-row').filter({ hasText: 'Save task' }).locator('.shortcut-keys'))
      .toHaveText('Ctrl+Enter');
  });

  test('import projects appends to current portfolio and projects can be removed from session', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'Task 1', status: 'backlog' }] }
    ]);

    await mockImportProjectsPicker(page, [
      {
        fileName: 'project-two.json',
        payload: buildBoardPayload({
          title: 'Project Two',
          tasks: [{ id: 2, title: 'Task 2', status: 'doing', priority: 'high', effort: 'S' }]
        })
      }
    ]);

    await page.locator('#importProjectsBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project One');
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project Two');
    await expect(portfolioCard(page, 'Task 1')).toBeVisible();
    await expect(portfolioCard(page, 'Task 2')).toBeVisible();

    await page.locator('.portfolio-chip').filter({ hasText: 'Project Two' }).getByRole('button', { name: 'Remove project' }).click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Project One');
    await expect(page.locator('#portfolioBoardsChips')).not.toContainText('Project Two');
    await expect(portfolioCard(page, 'Task 2')).toHaveCount(0);

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
  });

  test('imported project chips always receive distinct colors', async ({ page }) => {
    await mockImportProjectsPicker(page, Array.from({ length: 9 }, (_, index) => ({
      fileName: `project-${index + 1}.board.json`,
      payload: buildBoardPayload({
        title: `Project ${index + 1}`,
        tasks: [{ id: index + 1, title: `Task ${index + 1}`, status: 'backlog' }]
      })
    })));

    await page.locator('#importProjectsBtn').click();

    const projectChipStyles = await page.locator('.portfolio-chip').evaluateAll((nodes) => (
      nodes
        .map((node) => {
          const button = node.querySelector('[data-action="select-board"]');
          const boardId = button?.getAttribute('data-board-id') || '';
          return boardId ? (node.getAttribute('style') || '').trim() : null;
        })
        .filter(Boolean)
    ));

    expect(projectChipStyles).toHaveLength(9);
    expect(new Set(projectChipStyles).size).toBe(projectChipStyles.length);
  });

  test('import projects partially succeeds and reports invalid files', async ({ page }) => {
    await page.evaluate(() => {
      window.__alerts = [];
      window.alert = (msg) => { window.__alerts.push(String(msg)); };
    });

    await mockImportProjectsPicker(page, [
      {
        fileName: 'valid.board.json',
        payload: buildBoardPayload({
          title: 'Valid Project',
          tasks: [{ id: 1, title: 'Valid task', status: 'backlog' }]
        })
      },
      {
        fileName: 'invalid.board.json',
        payload: {
          meta: {
            schemaVersion: 1,
            appId: 'wrong-app-id',
            createdAt: '2026-02-26T00:00:00.000Z',
            updatedAt: '2026-02-26T00:00:00.000Z'
          },
          board: {
            columns: [{ status: 'backlog', title: 'backlog' }],
            tasks: [],
            settings: { title: 'Broken', sortMode: 'manual', showArchivedOnly: false, archiveFilter: 'active' }
          },
          extensions: {}
        }
      }
    ]);

    await page.locator('#importProjectsBtn').click();

    await expect(page.locator('#portfolioBoardsChips')).toContainText('Valid Project');
    await expect(portfolioCard(page, 'Valid task')).toBeVisible();

    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    await expect(portfolioProjectChipButtons(page)).toContainText('Valid Project');
    const result = await page.evaluate(() => ({
      alerts: window.__alerts || []
    }));

    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0]).toContain('Some projects were not imported');
    expect(result.alerts[0]).toContain('invalid.board.json');
  });

  test('selected mutable project can create tasks directly from portfolio columns and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Portfolio-created task');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskEffort').selectOption('S');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await expect(portfolioCard(page, 'Portfolio-created task')).toBeVisible();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      taskTitles: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.map((t) => t.title),
      writes: (window.__portfolioTestWrites || []).map((w) => ({ boardId: w.boardId, text: w.text }))
    }));

    expect(result.taskTitles).toContain('Portfolio-created task');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('Portfolio-created task');
  });

  test('blocked tasks require a blocker reason before save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Blocked task');
    await page.locator('#taskBlocked').check();
    await page.locator('#taskModal .btn-primary').click();

    await expect(page.locator('#taskModal')).toBeVisible();

    const result = await page.evaluate(() => ({
      alert: window.__lastAlert,
      taskCount: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.length
    }));

    expect(result.alert).toContain('Blocked tasks require a blocker reason');
    expect(result.taskCount).toBe(0);
  });

  test('task modal places blocked fields immediately after description', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();

    const fieldOrder = await page.evaluate(() => (
      [...document.querySelectorAll('#taskForm > .form-group')]
        .map((group) => {
          if (group.querySelector('#taskName')) return 'taskName';
          if (group.querySelector('#taskDescription')) return 'taskDescription';
          if (group.querySelector('#taskBlocked')) return 'taskBlocked';
          if (group.querySelector('#taskBlockerReason')) return 'taskBlockerReason';
          if (group.querySelector('#taskAssigneeEditor')) return 'taskAssigneeEditor';
          return null;
        })
        .filter(Boolean)
    ));

    expect(fieldOrder).toEqual(expect.arrayContaining([
      'taskDescription',
      'taskBlocked',
      'taskBlockerReason',
      'taskAssigneeEditor'
    ]));
    expect(fieldOrder.indexOf('taskDescription')).toBeLessThan(fieldOrder.indexOf('taskBlocked'));
    expect(fieldOrder.indexOf('taskBlocked')).toBeLessThan(fieldOrder.indexOf('taskBlockerReason'));
    expect(fieldOrder.indexOf('taskBlockerReason')).toBeLessThan(fieldOrder.indexOf('taskAssigneeEditor'));
  });

  test('assignees and blocked fields save and render as card badges', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    const assigneeAddButton = page.locator('#taskAssigneeEditor').getByRole('button', { name: 'Add' });
    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Investigate deploy issue');
    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await assigneeAddButton.click();
    await page.locator('#taskAssigneeNewItem').fill('Sam');
    await assigneeAddButton.click();
    await page.locator('#taskBlocked').check();
    await page.locator('#taskBlockerReason').fill('Waiting for staging access');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const backlogColumn = page.locator('#portfolio-backlog-column');
    await expect(backlogColumn).toContainText('Investigate deploy issue');
    await expect(backlogColumn).toContainText('Alex');
    await expect(backlogColumn).toContainText('Sam');
    await expect(backlogColumn).toContainText('Blocked');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t) => t.title === 'Investigate deploy issue');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Investigate deploy issue');
      return {
        task: task ? { assignees: task.assignees, blocked: task.blocked, blockerReason: task.blockerReason } : null,
        savedTask: savedTask ? { assignees: savedTask.assignees, blocked: savedTask.blocked, blockerReason: savedTask.blockerReason } : null
      };
    });

    expect(result.task).toEqual({
      assignees: ['Alex', 'Sam'],
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
    expect(result.savedTask).toEqual({
      assignees: ['Alex', 'Sam'],
      blocked: true,
      blockerReason: 'Waiting for staging access'
    });
  });

  test('portfolio assignee and blocked filters work', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alex blocked', status: 'backlog', assignees: ['Alex', 'Sam'], blocked: true, blockerReason: 'Vendor response' },
          { id: 2, title: 'Alex active', status: 'backlog', assignees: ['Alex'], blocked: false },
          { id: 3, title: 'Sam active', status: 'backlog', assignees: ['Sam'], blocked: false }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await expect(page.locator('#portfolioAssigneeFilter')).toContainText('Alex');
    await expect(page.locator('#portfolioAssigneeFilter')).toContainText('Sam');

    await page.locator('#portfolioAssigneeFilter').selectOption('Alex');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex active', 'Alex blocked']);

    await page.locator('#portfolioAssigneeFilter').selectOption('');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex blocked']);

    await page.locator('#portfolioBlockedFilter').selectOption('unblocked');
    expect(await portfolioTitlesInColumn(page, 'backlog')).toEqual(['Alex active', 'Sam active']);
  });

  test('assignee editor suggests board assignees and excludes ones already added', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', assignees: ['Alex'] },
          { id: 2, title: 'Task B', status: 'backlog', assignees: ['Sam'] }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();

    let options = await page.evaluate(() => Array.from(document.querySelectorAll('#taskAssigneeSuggestions option')).map((option) => option.value));
    expect(options).toEqual(['Alex', 'Sam']);

    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await page.locator('#taskAssigneeNewItem').press('Enter');
    await expect(page.locator('#taskAssigneeItems .assignee-editor-row')).toHaveCount(1);

    options = await page.evaluate(() => Array.from(document.querySelectorAll('#taskAssigneeSuggestions option')).map((option) => option.value));
    expect(options).toEqual(['Sam']);

    await page.locator('#taskAssigneeNewItem').fill('Alex');
    await page.locator('#taskAssigneeNewItem').press('Enter');
    await expect(page.locator('#taskAssigneeItems .assignee-editor-row')).toHaveCount(1);
  });

  test('assignee editor can edit and remove existing assignees before save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', assignees: ['Alex', 'Sam'] }
        ]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task A');

    const rows = page.locator('#taskAssigneeItems .assignee-editor-row');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).locator('input[type="text"]').fill('Jamie');
    await rows.nth(1).getByRole('button', { name: 'Remove assignee' }).click();

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry) => entry.id === 1);
      return {
        taskAssignees: task?.assignees || [],
        savedAssignees: savedTask?.assignees || []
      };
    });

    expect(result.taskAssignees).toEqual(['Jamie']);
    expect(result.savedAssignees).toEqual(['Jamie']);
    await expect(portfolioCard(page, 'Task A')).toContainText('Jamie');
    await expect(portfolioCard(page, 'Task A')).not.toContainText('Sam');
  });

  test('tags can be added on task create and display on cards and detail modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Tagged task');
    await page.locator('#taskTagNewItem').fill('bug');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskTagNewItem').fill('urgent');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Tagged task');
    await expect(card).toContainText('bug');
    await expect(card).toContainText('urgent');

    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTags')).toHaveText('bug, urgent');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t) => t.title === 'Tagged task');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Tagged task');
      return {
        taskTags: task?.tags || [],
        savedTags: savedTask?.tags || []
      };
    });

    expect(result.taskTags).toEqual(['bug', 'urgent']);
    expect(result.savedTags).toEqual(['bug', 'urgent']);
  });

  test('tag editor deduplicates and lowercases tags', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Dedup task');
    await page.locator('#taskTagNewItem').fill('Bug');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskTagNewItem').fill('bug');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t) => t.title === 'Dedup task');
      return { tags: task?.tags || [] };
    });

    expect(result.tags).toEqual(['bug']);
  });

  test('tag editor enforces max count and max length', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__lastAlert = '';
      window.alert = (msg) => { window.__lastAlert = String(msg); };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Limit task');

    for (let i = 0; i < 11; i++) {
      await page.locator('#taskTagNewItem').fill(`tag${i}`);
      await page.locator('#taskTagAddBtn').click();
    }

    const alertResult = await page.evaluate(() => window.__lastAlert);
    expect(alertResult).toContain('at most 10 tags');

    await page.locator('#taskTagNewItem').fill('a'.repeat(31));
    await page.locator('#taskTagAddBtn').click();

    const lengthAlert = await page.evaluate(() => window.__lastAlert);
    expect(lengthAlert).toContain('30 characters');
  });

  test('editing a task preloads and updates tags', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Edit tags task', status: 'backlog', tags: ['old'] }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Edit tags task');

    await expect(page.locator('#taskTagItems')).toContainText('old');

    await page.locator('#taskTagItems .tag-editor-remove').click();
    await page.locator('#taskTagNewItem').fill('new');
    await page.locator('#taskTagAddBtn').click();
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t) => t.id === 1);
      return { tags: task?.tags || [] };
    });

    expect(result.tags).toEqual(['new']);
  });

  test('due date input uses native date picker and saves ISO to JSON', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
    await page.locator('#taskName').fill('Date formatting task');
    await page.locator('#taskDueDate').fill('2026-03-05');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    const card = portfolioCard(page, 'Date formatting task');
    await expect(card).toContainText('05/03/2026');

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((t) => t.title === 'Date formatting task');
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((t) => t.title === 'Date formatting task');
      return {
        taskDueDate: task?.dueDate || '',
        savedDueDate: savedTask?.dueDate || ''
      };
    });

    expect(result.taskDueDate).toBe('2026-03-05');
    expect(result.savedDueDate).toBe('2026-03-05');

    await card.click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailDueDate')).toHaveText('05/03/2026');
  });

  test('editing a task preloads the native due date picker with the saved ISO value', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Bad date task', status: 'backlog', dueDate: '2026-03-05' }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Bad date task');
    await expect(page.locator('#modalTitle')).toHaveText('Edit Task');
    await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
    await expect(page.locator('#taskDueDate')).toHaveValue('2026-03-05');
  });

  test('checklist items can be reordered in the task modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Checklist task',
          status: 'backlog',
          checklist: [
            { text: 'First', done: false },
            { text: 'Second', done: false },
            { text: 'Third', done: true }
          ]
        }]
      }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Checklist task');

    const checklistTexts = async () => page.locator('#taskChecklistItems .checklist-editor-row input[type="text"]').evaluateAll((nodes) => (
      nodes.map((node) => node.value)
    ));

    await expect.poll(checklistTexts).toEqual(['First', 'Second', 'Third']);

    await page.locator('#taskChecklistItems .checklist-editor-row').nth(2).locator('.checklist-editor-drag-handle').dragTo(
      page.locator('#taskChecklistItems .checklist-editor-row').nth(0),
      { targetPosition: { x: 10, y: 2 } }
    );

    await expect.poll(checklistTexts).toEqual(['Third', 'First', 'Second']);

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const persistedChecklist = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry) => entry.id === 1);
      return (task?.checklist || []).map((item) => item.text);
    });

    expect(persistedChecklist).toEqual(['Third', 'First', 'Second']);
  });

  test('task modal assigns phase and milestone from roadmap selectors', async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{
      id: 'alpha',
      hasHandle: true,
      title: 'Alpha',
      tasks: [{ id: 1, title: 'Task A', status: 'to-do' }],
      extensions: {
        roadmap: {
          version: 1,
          milestones: [{ id: 'm1', title: 'Alpha', dueDate: '2026-04-15' }],
          phases: [{ id: 'p1', title: 'Foundation', startDate: '2026-04-01', endDate: '2026-04-30' }],
          sprints: []
        }
      }
    }], { selectedBoardId: 'alpha' });

    await portfolioCard(page, 'Task A').locator('[data-action="edit-task"]').click();
    await page.selectOption('#taskPhase', 'p1');
    await page.selectOption('#taskMilestone', 'm1');
    await page.getByRole('button', { name: 'Save Task' }).click();

    await waitForBoardWrites(page);
    const task = (await readSavedBoard(page, 'alpha')).board.tasks[0];
    expect(task.phaseId).toBe('p1');
    expect(task.milestoneId).toBe('m1');
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
    expect(board.board.tasks.every((task) => task.sprintId === board.extensions.roadmap.sprints[0].id)).toBeTruthy();
  });

  test('checked board tasks can be added to an existing sprint from the bulk action bar', async ({ page }) => {
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
    expect(board.board.tasks.every((task) => task.sprintId === 's1')).toBeTruthy();

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

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: 'Delete Alpha' }).click();

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
      dueDate: '2026-05-01'
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
    await page.getByRole('button', { name: 'Edit Alpha' }).click();
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
      dueDate: '2026-04-15'
    });
    expect(result.task.milestoneId).toBe('m1');
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

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: 'Delete Alpha' }).click();

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
    await expect(page.locator('#portfolioRoadmapView')).toContainText('Milestones');
    await expect(page.locator('#portfolioRoadmapView > .portfolio-roadmap-timeline')).toHaveCount(1);
    await expect(page.locator('#portfolioRoadmapView .portfolio-roadmap-header')).toHaveCount(0);
    await expect(page.locator('[data-roadmap-axis="shared"]')).toHaveCount(1);
    await expect(page.locator('.roadmap-row[data-roadmap-kind="milestone"]')).toHaveCount(1);
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
    expect(sharedGeometry.axisColumns).toBe(sharedGeometry.rowColumns);
    expect(sharedGeometry.axisGap).toBe(sharedGeometry.rowGap);

    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await expect(page.locator('[data-roadmap-task-list="phase:p1"]')).toContainText('Task A');
    const taskListLayout = await page.locator('[data-roadmap-task-list="phase:p1"]').evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        columns: styles.gridTemplateColumns.split(' ').filter(Boolean).length,
        paddingLeft: styles.paddingLeft
      };
    });
    expect(taskListLayout.columns).toBe(2);
    expect(taskListLayout.paddingLeft).toBe('0px');
    const taskGridColumns = await page.locator('[data-roadmap-task-list="phase:p1"] .roadmap-task-list-track').evaluate((node) => {
      const columns = getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean);
      return columns.length;
    });
    expect(taskGridColumns).toBeGreaterThan(1);
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
      milestones: Array.from(document.querySelectorAll('[data-roadmap-kind="milestones"] .roadmap-row-title')).map((node) => node.textContent?.trim()),
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
      const milestonePoint = document.querySelector('.roadmap-row[data-roadmap-kind="milestone"] .roadmap-row-timeline-point');
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
        milestonePoint: getComputedStyle(milestonePoint)
      };
    });

    expect(styles).not.toBeNull();
    expect(styles.timeline.backgroundColor).toBe('rgb(250, 250, 250)');
    expect(styles.timeline.borderColor).toBe('rgb(208, 208, 208)');
    expect(styles.header.backgroundColor).toBe('rgb(240, 240, 240)');
    expect(styles.header.borderBottomColor).toBe('rgb(208, 208, 208)');
    expect(styles.row.rowGap).toBe('0px');
    expect(styles.actionBtn.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(styles.actionBtn.borderColor).toBe('rgb(208, 208, 208)');
    expect(styles.sectionBtn.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(styles.sectionBtn.borderColor).toBe('rgb(208, 208, 208)');
    expect(styles.disclosureBtn.color).toBe('rgb(102, 102, 102)');
    expect(styles.axisLine.height).toBe('20px');
    expect(styles.track.height).toBe('20px');
    expect(styles.track.borderColor).toBe('rgb(224, 224, 224)');
    expect(styles.timelineBar.height).toBe('10px');
    expect(styles.milestonePoint.backgroundColor).toBe('rgb(0, 102, 204)');

    await page.getByRole('button', { name: 'Show tasks for Alpha Release' }).click();
    const taskListSpacing = await page.locator('[data-roadmap-task-list="milestone:m1"]').evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom
      };
    });
    expect(taskListSpacing.marginTop).toBe('10px');
    expect(taskListSpacing.marginBottom).toBe('10px');
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
      expect(placement.leftInside).toBeTruthy();
      expect(placement.rightInside).toBeTruthy();
      expect(placement.width).toBeLessThanOrEqual(placement.trackWidth);
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
    expect(alignment.delta).toBeLessThanOrEqual(1);
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
      const guides = Array.from(document.querySelectorAll('.roadmap-axis-line .roadmap-grid-guide'));
      const tick = ticks.find((node) => node.textContent?.trim() === 'Apr 08');
      const guide = guides[0];
      if (!(tick instanceof HTMLElement) || !(guide instanceof HTMLElement)) return null;
      const tickRect = tick.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      return {
        delta: Math.abs((tickRect.left + (tickRect.width / 2)) - (guideRect.left + (guideRect.width / 2))),
        guideCount: guides.length
      };
    });

    expect(alignment).not.toBeNull();
    expect(alignment.guideCount).toBeGreaterThan(0);
    expect(alignment.delta).toBeLessThanOrEqual(1);
  });

  test('roadmap axis shows a today marker when today is within the visible range', async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = '2026-04-15T12:00:00.000Z';
      const RealDate = window.Date;
      class FakeDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }
        static now() {
          return new RealDate(fixedNow).getTime();
        }
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      window.Date = FakeDate;
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
        label: markerNode.textContent?.trim() || '',
        markerPosition: ((markerRect.left + (markerRect.width / 2)) - axisRect.left) / axisRect.width * 100
      };
    });

    expect(marker).not.toBeNull();
    expect(marker.label).toContain('Today');
    expect(Math.abs(marker.markerPosition - expectedPosition)).toBeLessThanOrEqual(1);
  });

  test('roadmap axis hides the today marker when today is outside the visible range', async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = '2026-06-15T12:00:00.000Z';
      const RealDate = window.Date;
      class FakeDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }
        static now() {
          return new RealDate(fixedNow).getTime();
        }
      }
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      window.Date = FakeDate;
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
      node.value = '0';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(page.locator('#portfolioTimelinePanel .timeline-preview-banner.active')).toContainText('Historical preview');

    await page.getByRole('button', { name: 'Roadmap' }).click();
    await page.getByRole('button', { name: 'Show tasks for Foundation' }).click();
    await page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card').click();

    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await expect(page.locator('#detailDescription')).toHaveText('-');

    // Read-only: the edit shortcut does nothing from a historical detail view.
    await page.keyboard.press('e');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.tasks.find((task) => task.id === 1)?.title).toBe('Task A Updated');
  });

  test('roadmap task cards support hovered edit shortcuts', async ({ page }) => {
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
    await page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card').filter({ hasText: 'Task B' }).hover();
    await page.keyboard.press('e');

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveValue('Task B');
  });

  test('clicking a roadmap task card renders it as selected', async ({ page }) => {
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
    await page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('[data-roadmap-task-list="phase:p1"] .portfolio-task-card.selected')).toHaveCount(1);
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

  test('task attachments save on the task and show in task details', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');

    await page.setInputFiles('#taskAttachmentsInput', {
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello attachment')
    });

    await expect(page.locator('#taskAttachmentsList')).toContainText('note.txt');
    await expect(page.locator('#taskAttachmentsList .attachment-editor-download')).toHaveCount(1);
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      const payload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const attachments = payload?.board?.tasks?.find((t) => t.id === 1)?.attachments || [];
      return {
        writeCount: writes.length,
        attachmentCount: attachments.length,
        attachmentName: attachments[0]?.name,
        attachmentMime: attachments[0]?.mime,
        legacyAttachmentMapPresent: Boolean(payload?.extensions?.teamOsKanban?.taskAttachments)
      };
    });

    expect(saved.writeCount).toBeGreaterThan(0);
    expect(saved.attachmentCount).toBe(1);
    expect(saved.attachmentName).toBe('note.txt');
    expect(saved.attachmentMime).toBe('text/plain');
    expect(saved.legacyAttachmentMapPresent).toBe(false);

    await portfolioCard(page, 'Task with file').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailAttachments')).toContainText('note.txt');
    await expect(page.locator('#detailAttachments .detail-attachment-download')).toHaveCount(1);
  });

  test('task detail modal scrolls when content exceeds the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });

    await seedPortfolioBoards(page, [
      {
        id: 'p1',
        title: 'Project One',
        hasHandle: true,
        tasks: [{
          id: 1,
          title: 'Oversized detail task',
          status: 'backlog',
          description: Array.from({ length: 18 }, (_, index) => `Detail line ${index + 1}`).join('\n'),
          checklist: Array.from({ length: 28 }, (_, index) => ({
            text: `Checklist item ${index + 1}`,
            done: index % 2 === 0
          }))
        }]
      }
    ], { selectedBoardId: 'p1' });

    await portfolioCard(page, 'Oversized detail task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const content = document.querySelector('#taskDetailModal .modal-content');
      const body = document.querySelector('#taskDetailModal .modal-body');
      if (!content || !body) {
        return null;
      }
      const rect = content.getBoundingClientRect();
      return {
        bodyScrolls: body.scrollHeight > body.clientHeight,
        bodyOverflowY: getComputedStyle(body).overflowY,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics.bodyScrolls).toBe(true);
    expect(['auto', 'scroll']).toContain(metrics.bodyOverflowY);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  });

  test('attachment picker caps attachments per task and saves the accepted ones', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await page.locator('#taskName').fill('Attachment limits');

    await page.setInputFiles('#taskAttachmentsInput', Array.from({ length: 11 }, (_, i) => ({
      name: `f${i + 1}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`file ${i + 1}`)
    })));

    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(10);
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('Attachment limit reached (10 per task).');

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p1');
    const task = saved.board.tasks.find((entry) => entry.title === 'Attachment limits');
    expect(task?.attachments).toHaveLength(10);
  });

  test('duplicate attachment uploads are skipped in the task modal', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Task with file', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await openTaskEditor(page, 'Task with file');

    const filePayload = {
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello attachment')
    };

    await page.setInputFiles('#taskAttachmentsInput', filePayload);
    await page.setInputFiles('#taskAttachmentsInput', filePayload);

    await expect(page.locator('#taskAttachmentsList .attachment-editor-item')).toHaveCount(1);
    await expect(page.locator('#taskAttachmentsWarnings')).toContainText('already attached');

    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((entry) => entry.id === 1);
      const writes = window.__portfolioTestWrites || [];
      const savedPayload = writes.length ? JSON.parse(writes[writes.length - 1].text) : null;
      const savedTask = savedPayload?.board?.tasks?.find((entry) => entry.id === 1);
      return {
        taskAttachmentCount: task?.attachments?.length || 0,
        savedAttachmentCount: savedTask?.attachments?.length || 0
      };
    });

    expect(result.taskAttachmentCount).toBe(1);
    expect(result.savedAttachmentCount).toBe(1);
  });

  test('all-projects view hides add-task cards and read-only selected project also hides them', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'm1', title: 'Mutable A', hasHandle: true, tasks: [] },
      { id: 'm2', title: 'Mutable B', hasHandle: true, tasks: [] }
    ], { selectedBoardId: '' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);

    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await expect(page.locator('.portfolio-column .add-task-card')).toHaveCount(0);
    await expect(page.locator('.portfolio-chip.active')).toContainText('Read Only (Read-only)');
    await expect(portfolioCard(page, 'RO Task').locator('button[title=\"Read-only (no file handle)\"]')).toHaveCount(3);
  });

  test('read-only task detail keyboard shortcuts do not open edit or mutate', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'ro1', title: 'Read Only', hasHandle: false, tasks: [{ id: 1, title: 'RO Task', status: 'backlog' }] }
    ], { selectedBoardId: 'ro1' });

    await portfolioCard(page, 'RO Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#taskModal')).toBeHidden();

    await page.keyboard.press('x');
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    // Still listed under the default "active" archive filter, so not archived.
    await page.locator('#taskDetailModalCloseBtn').click();
    await expect(portfolioCard(page, 'RO Task')).toBeVisible();
    const writes = await page.evaluate(() => window.__portfolioTestWrites || []);
    expect(writes).toEqual([]);
  });

  test('task card delete removes the task and persists the board', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Delete Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Delete me', status: 'backlog' }]
      }
    ], { selectedBoardId: 'd1' });

    const card = portfolioCard(page, 'Delete me');
    await card.hover();

    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Delete me')).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      taskCount: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.length,
      timelineKinds: JSON.parse(window.__portfolioDiskByBoardId.d1.text).extensions.timeline?.events?.map((event) => event.kind) || [],
      writes: window.__portfolioTestWrites || []
    }));
    expect(result.taskCount).toBe(0);
    expect(result.timelineKinds).toEqual(['board.baseline', 'task.deleted']);
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"tasks": []');
  });

  test('delete cancel leaves the task untouched', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Keep me', status: 'backlog' }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.confirm = () => false;
    });

    const card = portfolioCard(page, 'Keep me');
    await card.hover();
    await card.getByRole('button', { name: 'Delete' }).click();

    await expect(portfolioCard(page, 'Keep me')).toBeVisible();

    const result = await page.evaluate(() => ({
      taskCount: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.length,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.taskCount).toBe(1);
    expect(result.writes).toEqual([]);
  });

  test('archive confirms before archiving a task', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Archive me', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Archive me');
    await card.hover();

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Archive me')).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(dialogMessage).toContain('Archive "Archive me"?');
    expect(result.archived).toBe(true);
    expect(result.writes.length).toBeGreaterThan(0);
  });

  test('archive cancel leaves the task untouched', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Keep archive', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.confirm = () => false;
    });

    const card = portfolioCard(page, 'Keep archive');
    await card.hover();
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Keep archive')).toBeVisible();

    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.archived).toBe(false);
    expect(result.writes).toEqual([]);
  });

  test('archiving a task can be undone from the toast', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ id: 1, title: 'Undo me', status: 'backlog', archived: false }] }
    ], { selectedBoardId: 'p1' });

    const card = portfolioCard(page, 'Undo me');
    await card.hover();
    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Archive"]').click();

    await expect(portfolioCard(page, 'Undo me')).toHaveCount(0);
    await expect(page.locator('#undoToast')).toHaveClass(/active/);

    await page.locator('#undoBtn').click();
    await expect(portfolioCard(page, 'Undo me')).toBeVisible();

    // One write for the archive, one for the undo.
    await waitForBoardWrites(page, 2);
    const result = await page.evaluate(() => ({
      archived: JSON.parse(window.__portfolioDiskByBoardId.p1.text).board.tasks.find((task) => task.id === 1)?.archived,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.archived).toBe(false);
    expect(result.writes.length).toBeGreaterThan(0);
  });

  test('portfolio filters and URL params persist in portfolio-only mode', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a',
        title: 'Alpha Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alpha low', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Beta target', status: 'backlog', priority: 'high', effort: 'L' }
        ]
      },
      {
        id: 'b',
        title: 'Bravo Project',
        hasHandle: true,
        tasks: [
          { id: 3, title: 'Gamma', status: 'doing', priority: 'high', effort: 'S' }
        ]
      }
    ]);

    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('L');
    await page.locator('#portfolioSearchInput').fill('beta');
    await page.locator('#portfolioSortSelect').selectOption('score');

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await expect(portfolioCard(page, 'Beta target')).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('pp')).toBe('high');
    expect(url.searchParams.get('pe')).toBe('L');
    expect(url.searchParams.get('pq')).toBe('beta');
    expect(url.searchParams.get('ps')).toBe('score');
    expect(url.searchParams.get('view')).toBeNull();
  });

  test('reset filters button clears top filters and restores default sort', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'rf1',
        title: 'Reset Filters Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Alpha low', status: 'backlog', priority: 'low', effort: 'L', assignees: ['Ana'] },
          { id: 2, title: 'Beta target', status: 'doing', priority: 'high', effort: 'S', assignees: ['Bruno'], blocked: true, blockerReason: 'Waiting on review' }
        ]
      }
    ]);

    await page.locator('#portfolioSearchInput').fill('beta');
    await page.locator('#portfolioArchiveFilter').selectOption('all');
    await page.locator('#portfolioBlockedFilter').selectOption('blocked');
    await page.locator('#portfolioAssigneeFilter').selectOption('Bruno');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioEffortFilter').selectOption('S');
    await page.locator('#portfolioSortSelect').selectOption('score');

    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await page.locator('#resetPortfolioFiltersBtn').click();

    await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioBlockedFilter')).toHaveValue('all');
    await expect(page.locator('#portfolioAssigneeFilter')).toHaveValue('');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('priority');
    await expect(page.locator('.portfolio-task-card')).toHaveCount(2);

    const url = new URL(page.url());
    expect(url.searchParams.get('pq')).toBeNull();
    expect(url.searchParams.get('pa')).toBeNull();
    expect(url.searchParams.get('pbk')).toBeNull();
    expect(url.searchParams.get('pu')).toBeNull();
    expect(url.searchParams.get('pp')).toBeNull();
    expect(url.searchParams.get('pe')).toBeNull();
    expect(url.searchParams.get('ps')).toBeNull();
  });

  test('drag and drop import loads project files and clears the overlay state', async ({ page }) => {
    const payload = buildBoardPayload({
      title: 'Dropped Project',
      tasks: [{ id: 1, title: 'Dropped task', status: 'backlog' }]
    });

    await page.evaluate((boardPayload) => {
      const dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify(boardPayload)], 'dropped.board.json', { type: 'application/json' }));
      window.__dropTestDataTransfer = dt;
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, payload);

    await expect(page.locator('#portfolioView')).toHaveClass(/file-drop-active/);

    await page.evaluate(() => {
      const dt = window.__dropTestDataTransfer;
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });

    await expect(page.locator('#portfolioView')).not.toHaveClass(/file-drop-active/);
    await expect(page.locator('#portfolioBoardsChips')).toContainText('Dropped Project');
    await expect(portfolioCard(page, 'Dropped task')).toBeVisible();
  });

  test('keyboard shortcuts focus sort, reset filters, and cycle project chips', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [{ title: 'One task', status: 'backlog' }] },
      { id: 'p2', title: 'Project Two', hasHandle: true, tasks: [{ title: 'Two task', status: 'doing' }] }
    ], { selectedBoardId: '' });

    await page.locator('#portfolioSearchInput').fill('one');
    await page.locator('#portfolioPriorityFilter').selectOption('high');
    await page.locator('#portfolioSortSelect').selectOption('score');
    await page.locator('body').click();

    await page.keyboard.press('s');
    await expect(page.locator('#portfolioSortSelect')).toBeFocused();

    await page.locator('body').click();
    await page.keyboard.press('r');
    await expect(page.locator('#portfolioSearchInput')).toHaveValue('');
    await expect(page.locator('#portfolioArchiveFilter')).toHaveValue('active');
    await expect(page.locator('#portfolioPriorityFilter')).toHaveValue('');
    await expect(page.locator('#portfolioEffortFilter')).toHaveValue('');
    await expect(page.locator('#portfolioSortSelect')).toHaveValue('priority');

    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
    await page.keyboard.press('BracketRight');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project Two');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator('.portfolio-chip.active')).toContainText('Project One');
  });

  test('portfolio score sort orders cards in board columns', async ({ page }) => {
    const sortProject = [
      {
        id: 's1',
        title: 'Sort Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Low XL', status: 'backlog', priority: 'low', effort: 'XL' },
          { id: 2, title: 'High S', status: 'backlog', priority: 'high', effort: 'S' },
          { id: 3, title: 'Med M', status: 'backlog', priority: 'medium', effort: 'M' }
        ]
      }
    ];

    await seedPortfolioBoards(page, sortProject);
    await page.locator('#portfolioSortSelect').selectOption('score');
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'Low XL',
      'Med M',
      'High S'
    ]);

    // The sort select always sorts ascending; descending is only reachable
    // through the pd URL param, which the app applies on load.
    await page.goto('/?ps=score&pd=desc');
    await expect(page.locator('#portfolioView')).toBeVisible();
    await seedPortfolioBoards(page, sortProject);
    await expect.poll(async () => (await portfolioTitlesInColumn(page, 'backlog')).slice(0, 3)).toEqual([
      'High S',
      'Med M',
      'Low XL'
    ]);
  });

  test('card keyboard shortcuts support selection, move, open details, and edit/save', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k1',
        title: 'Keyboard Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k1', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(1);

    const selectedBefore = page.locator('.portfolio-task-card.selected');
    await expect(selectedBefore).toContainText('Task A');

    await page.keyboard.press('3');
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card.selected')).toContainText('Task A');

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task A');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskName').fill('Task A Edited');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();
    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Task A Edited' })).toBeVisible();
  });

  test('hovered card shortcuts take priority over the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k2',
        title: 'Hover Priority Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog', priority: 'low', effort: 'L' },
          { id: 2, title: 'Task B', status: 'backlog', priority: 'high', effort: 'S' }
        ]
      }
    ], { selectedBoardId: 'k2', sortKey: 'task' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    const hoveredCard = portfolioCard(page, 'Task B');
    await hoveredCard.hover();

    await page.keyboard.press('Enter');
    await expect(page.locator('#taskDetailModal')).toBeVisible();
    await expect(page.locator('#detailTitle')).toHaveText('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskDetailModal')).toBeHidden();

    await hoveredCard.hover();
    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskName')).toHaveValue('Task B');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskModal')).toBeHidden();
  });

  test('clicking outside cards clears the selected card', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'k3',
        title: 'Selection Project',
        hasHandle: true,
        tasks: [
          { id: 1, title: 'Task A', status: 'backlog' },
          { id: 2, title: 'Task B', status: 'backlog' }
        ]
      }
    ], { selectedBoardId: 'k3' });

    await page.keyboard.press('j');
    await expect(page.locator('.portfolio-task-card.selected')).toContainText('Task A');

    await page.locator('.header').click();
    await expect(page.locator('.portfolio-task-card.selected')).toHaveCount(0);
  });

  test('opening edit from task detail closes the detail modal (no modal stacking)', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'm1',
        title: 'Modal Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Modal Task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'm1' });

    await portfolioCard(page, 'Modal Task').click();
    await expect(page.locator('#taskDetailModal')).toBeVisible();

    await page.keyboard.press('e');
    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(page.locator('#taskDetailModal')).toBeHidden();
  });

  test('single-key shortcuts do not fire while typing in task modal inputs', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'p1', title: 'Project One', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'p1' });

    await page.evaluate(() => {
      window.__shortcutImportCalls = 0;
      window.showOpenFilePicker = async () => {
        window.__shortcutImportCalls += 1;
        return [];
      };
    });

    await page.locator('#portfolio-backlog-column .add-task-card').click();
    await expect(page.locator('#taskModal')).toBeVisible();

    const name = page.locator('#taskName');
    await name.click();
    await page.keyboard.type('nix/');

    await expect(page.locator('#taskModal')).toBeVisible();
    await expect(name).toHaveValue('nix/');

    const result = await page.evaluate(() => ({
      importCalls: window.__shortcutImportCalls || 0
    }));
    await expect(portfolioProjectChipButtons(page)).toHaveCount(1);
    expect(result.importCalls).toBe(0);
  });

  test('dragging a task across portfolio columns updates status and auto-saves', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'd1',
        title: 'Drag Project',
        hasHandle: true,
        tasks: [
          {
            id: 11,
            title: 'Move me',
            status: 'backlog',
            priority: 'medium',
            effort: 'M'
          }
        ]
      }
    ], { selectedBoardId: 'd1' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);
    await expect(card.locator('.task-tag-age')).toContainText('Age');

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Move me' })).toBeVisible();
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Move me' })).toHaveCount(0);

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      status: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.find((t) => t.id === 11)?.status,
      statusChangedAt: JSON.parse(window.__portfolioDiskByBoardId.d1.text).board.tasks.find((t) => t.id === 11)?.statusChangedAt,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.status).toBe('doing');
    expect(result.statusChangedAt).toBeUndefined();
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).toContain('"status": "doing"');
    expect(result.writes.at(-1).text).not.toContain('"statusChangedAt"');
  });

  test('editing a task does not add statusChangedAt to saved payloads', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 's1',
        title: 'Status Age Project',
        hasHandle: true,
        tasks: [
          {
            id: 1,
            title: 'Keep status age',
            status: 'backlog'
          }
        ]
      }
    ], { selectedBoardId: 's1' });

    await openTaskEditor(page, 'Keep status age');
    await page.locator('#taskName').fill('Keep status age edited');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toBeHidden();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => {
      const task = JSON.parse(window.__portfolioDiskByBoardId.s1.text).board.tasks.find((t) => t.id === 1);
      return {
        title: task?.title,
        status: task?.status,
        statusChangedAt: task?.statusChangedAt,
        writes: window.__portfolioTestWrites || []
      };
    });

    expect(result.title).toBe('Keep status age edited');
    expect(result.status).toBe('backlog');
    expect(result.statusChangedAt).toBeUndefined();
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.writes.at(-1).text).not.toContain('"statusChangedAt"');
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

  test('auto-save queue serializes writes per project and persists latest mutation', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'q1',
        title: 'Queued Save Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Queued task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'q1' });

    await installControlledPortfolioWriter(page, { boardId: 'q1', holdWrites: true, failWrites: 0 });

    // Card drags apply the change and render immediately, then save in the
    // background, so a second change can be made while the first write is held.
    // (The task editor instead stays open until its save completes.)
    const activeChip = page.locator('.portfolio-chip.active');
    const cardIn = (status) => page.locator(`#portfolio-${status}-column .portfolio-task-card`).filter({ hasText: 'Queued task' });

    await cardIn('backlog').dragTo(page.locator('#portfolio-doing-column'));
    await expect(cardIn('doing')).toBeVisible();
    // The chip only shows "Saving" from the next status change after a save
    // starts (here, the second drag queueing behind the held write).

    await cardIn('doing').dragTo(page.locator('#portfolio-done-column'));
    await expect(cardIn('done')).toBeVisible();
    await expect(activeChip).toContainText('Saving');

    const interim = await page.evaluate(() => ({
      maxActive: window.__portfolioWriteControl?.maxActive || 0,
      writes: window.__portfolioTestWrites || []
    }));
    expect(interim.maxActive).toBeLessThanOrEqual(1);
    expect(interim.writes).toHaveLength(0);

    await page.evaluate(() => window.__releaseNextPortfolioWrite());
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);

    // The queued second save starts only after the first completes; release it
    // once its write is actually waiting.
    await expect.poll(() => page.evaluate(() => window.__releaseNextPortfolioWrite())).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(2);
    await expect(activeChip.locator('.chip-save-state')).toHaveCount(0);

    const result = await page.evaluate(() => {
      const ctl = window.__portfolioWriteControl || {};
      const writes = window.__portfolioTestWrites || [];
      return {
        maxActive: ctl.maxActive || 0,
        writesCount: writes.length,
        lastPayloadHasLatestStatus: writes[writes.length - 1]?.text.includes('"status": "done"') || false
      };
    });

    expect(result.maxActive).toBe(1);
    expect(result.writesCount).toBe(2);
    expect(result.lastPayloadHasLatestStatus).toBe(true);
    await expect(cardIn('done')).toBeVisible();
  });

  test('auto-save failure shows retry in chip and retry persists without alert', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'r1',
        title: 'Retry Save Project',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Retry task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'r1' });

    await page.evaluate(() => {
      window.__alerts = [];
      window.alert = (msg) => window.__alerts.push(String(msg));
    });
    await installControlledPortfolioWriter(page, { boardId: 'r1', holdWrites: false, failWrites: 1 });

    await renameTaskViaEditor(page, 'Retry task', 'Retry task edited');

    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');
    await expect(activeChip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();

    const beforeRetry = await page.evaluate(() => ({
      alerts: window.__alerts || [],
      writes: window.__portfolioTestWrites || []
    }));
    expect(beforeRetry.alerts).toEqual([]);
    expect(beforeRetry.writes).toHaveLength(0);

    await activeChip.getByRole('button', { name: 'Retry', exact: true }).click();

    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);
    await expect(activeChip).not.toContainText('Save failed');
    await expect(activeChip).not.toContainText('Unsaved');

    const afterRetry = await page.evaluate(() => {
      const writes = window.__portfolioTestWrites || [];
      return {
        writesCount: writes.length,
        lastPayloadHasEdit: writes[writes.length - 1]?.text.includes('Retry task edited') || false,
        alerts: window.__alerts || []
      };
    });

    expect(afterRetry.writesCount).toBe(1);
    expect(afterRetry.lastPayloadHasEdit).toBe(true);
    expect(afterRetry.alerts).toEqual([]);
  });

  test('external disk change reloads board when there are no unsaved local edits', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'e1',
        title: 'External One',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'e1' });

    await mutateExternalBoardFile(page, {
      boardId: 'e1',
      payload: buildBoardPayload({
        title: 'External One',
        tasks: [{ id: 1, title: 'Changed on disk', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect(portfolioCard(page, 'Changed on disk')).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('External update');

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Changed on disk' })).toBeVisible();
  });

  test('external change conflict can keep local edits and save them', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'c1',
        title: 'Conflict Local',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Start title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'c1' });

    await installControlledPortfolioWriter(page, { boardId: 'c1', holdWrites: false, failWrites: 1 });
    await renameTaskViaEditor(page, 'Start title', 'Local unsaved edit');
    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');

    await page.evaluate(() => {
      window.__conflictPrompts = [];
      window.prompt = (message, initialValue) => {
        window.__conflictPrompts.push({ message: String(message), initialValue: String(initialValue || '') });
        return 'local';
      };
    });

    await mutateExternalBoardFile(page, {
      boardId: 'c1',
      payload: buildBoardPayload({
        title: 'Conflict Local',
        tasks: [{ id: 1, title: 'Disk title', status: 'done' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect.poll(async () => (await page.evaluate(() => (window.__portfolioTestWrites || []).length))).toBe(1);
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Local unsaved edit' })).toBeVisible();
    // No save/watch status label on the chip: saved, and no conflict pending.
    // (Checking the chip's whole text would match the board title "Conflict Local".)
    await expect(activeChip.locator('.chip-save-state')).toHaveCount(0);

    const promptCount = await page.evaluate(() => (window.__conflictPrompts || []).length);
    expect(promptCount).toBeGreaterThan(0);
    const saved = await readSavedBoard(page, 'c1');
    expect(saved.board.tasks.find((task) => task.id === 1)).toMatchObject({ title: 'Local unsaved edit', status: 'backlog' });
  });

  test('external change conflict can reload from disk and discard unsaved local edits', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'c2',
        title: 'Conflict Reload',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Original title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'c2' });

    await installControlledPortfolioWriter(page, { boardId: 'c2', holdWrites: false, failWrites: 1 });
    await renameTaskViaEditor(page, 'Original title', 'Local edited title');
    const activeChip = page.locator('.portfolio-chip.active');
    await expect(activeChip).toContainText('Save failed');

    await page.evaluate(() => {
      window.prompt = () => 'reload';
    });

    await mutateExternalBoardFile(page, {
      boardId: 'c2',
      payload: buildBoardPayload({
        title: 'Conflict Reload',
        tasks: [{ id: 1, title: 'Disk wins title', status: 'doing' }]
      })
    });
    await triggerExternalFileCheck(page);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Disk wins title' })).toBeVisible();
    await expect(portfolioCard(page, 'Local edited title')).toHaveCount(0);
    await expect(activeChip).not.toContainText('Save failed');
    await expect(activeChip).not.toContainText('Unsaved');

    const writes = await page.evaluate(() => (window.__portfolioTestWrites || []).length);
    expect(writes).toBe(0);
  });

  test('invalid external file does not replace in-memory board and reports watch error', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'w1',
        title: 'Watch Errors',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Safe title', status: 'backlog' }]
      }
    ], { selectedBoardId: 'w1' });

    await mutateExternalBoardFile(page, { boardId: 'w1', payload: null, invalidText: '{ invalid json' });
    await triggerExternalFileCheck(page);

    await expect(portfolioCard(page, 'Safe title')).toBeVisible();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Watch error');

  });

  test('external checks cover writable boards that are not selected', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a1',
        title: 'Alpha',
        hasHandle: true,
        tasks: [{ id: 1, title: 'Alpha task', status: 'backlog' }]
      },
      {
        id: 'b1',
        title: 'Bravo',
        hasHandle: true,
        tasks: [{ id: 2, title: 'Bravo task', status: 'backlog' }]
      }
    ], { selectedBoardId: 'a1' });

    await mutateExternalBoardFile(page, {
      boardId: 'b1',
      payload: buildBoardPayload({
        title: 'Bravo',
        tasks: [{ id: 2, title: 'Bravo updated externally', status: 'done' }]
      })
    });
    await triggerExternalFileCheck(page);

    await selectPortfolioBoard(page, 'Bravo');
    await expect(page.locator('#portfolio-done-column .portfolio-task-card').filter({ hasText: 'Bravo updated externally' })).toBeVisible();
    await selectPortfolioBoard(page, 'Alpha');
    await expect(page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Alpha task' })).toBeVisible();
  });

  test('dragging works in all-projects view for mutable cards', async ({ page }) => {
    await seedPortfolioBoards(page, [
      {
        id: 'a1',
        title: 'Alpha',
        hasHandle: true,
        tasks: [{ id: 21, title: 'Drag in all view', status: 'backlog', priority: 'low', effort: 'M' }]
      },
      {
        id: 'b1',
        title: 'Bravo',
        hasHandle: true,
        tasks: [{ id: 22, title: 'Other task', status: 'done', priority: 'medium', effort: 'S' }]
      }
    ], { selectedBoardId: '' });

    const card = page.locator('#portfolio-backlog-column .portfolio-task-card').filter({ hasText: 'Drag in all view' }).first();
    const targetColumn = page.locator('#portfolio-doing-column');

    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('draggable', true);

    await card.dragTo(targetColumn);

    await expect(page.locator('#portfolio-doing-column .portfolio-task-card').filter({ hasText: 'Drag in all view' })).toBeVisible();

    await waitForBoardWrites(page);
    const result = await page.evaluate(() => ({
      alphaStatus: JSON.parse(window.__portfolioDiskByBoardId.a1.text).board.tasks.find((t) => t.id === 21)?.status,
      writes: window.__portfolioTestWrites || []
    }));

    expect(result.alphaStatus).toBe('doing');
    expect(result.writes.some((w) => w.boardId === 'a1')).toBe(true);
  });
});
