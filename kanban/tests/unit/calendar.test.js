// These calendar functions mix local-time and UTC-time handling
// (formatLocalIsoDate vs formatUtcIsoDate/createUtcDate). Pin the process
// timezone so local-time assertions are reproducible regardless of the
// machine/CI running the suite.
process.env.TZ = 'UTC';

import { describe, it, expect, vi } from 'vitest';
import {
  buildPortfolioCalendarItemStyle,
  buildPortfolioCalendarMiniMarkerStyle,
  buildPortfolioCalendarRoadmapSpanStyle,
  comparePortfolioCalendarDayItems,
  comparePortfolioCalendarItems,
  comparePortfolioCalendarRoadmapItems,
  comparePortfolioDueDateAsc,
  createUtcDate,
  doesPortfolioCalendarItemIntersectMonth,
  doesPortfolioCalendarItemOccurOnDay,
  formatDateTime,
  formatDueDateForUi,
  formatLocalIsoDate,
  formatUtcIsoDate,
  getPortfolioCalendarDayOffset,
  getPortfolioCalendarHeatColor,
  getPortfolioCalendarItemLabel,
  getPortfolioCalendarItemPriority,
  getPortfolioCalendarMiniDayMarkers,
  getPortfolioCalendarMiniMonthCellCount,
  getPortfolioCalendarMonthHeatStats,
  getPortfolioCalendarMonthRange,
  getPortfolioCalendarTaskCountsByDay,
  getPortfolioCalendarYearHeatStats,
  getUtcMonthLabel,
  normalizeDueDate,
  shouldShowPortfolioCalendarRoadmapLabel,
  todayLocalIsoDate,
  buildPortfolioCalendarWeekRoadmapSegments
} from '../../src/domain/calendar.js';
import { createPortfolioProjectColor } from '../../src/domain/board.js';

describe('createUtcDate', () => {
  it('builds a UTC date from year/month/day', () => {
    const date = createUtcDate(2024, 2, 15);
    expect(date.getUTCFullYear()).toBe(2024);
    expect(date.getUTCMonth()).toBe(2);
    expect(date.getUTCDate()).toBe(15);
  });

  it('defaults day to 1 when omitted', () => {
    const date = createUtcDate(2024, 5);
    expect(date.getUTCDate()).toBe(1);
  });

  it('rolls over into the next year when month is 12', () => {
    const date = createUtcDate(2024, 12, 1);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0);
  });
});

describe('formatLocalIsoDate', () => {
  it('formats a valid local Date as YYYY-MM-DD', () => {
    expect(formatLocalIsoDate(new Date(2024, 2, 5))).toBe('2024-03-05');
  });

  it('pads single-digit month and day', () => {
    expect(formatLocalIsoDate(new Date(2024, 0, 5))).toBe('2024-01-05');
  });

  it('returns empty string for an invalid Date', () => {
    expect(formatLocalIsoDate(new Date('not-a-date'))).toBe('');
  });

  it('returns empty string for non-Date input', () => {
    expect(formatLocalIsoDate('2024-03-05')).toBe('');
    expect(formatLocalIsoDate(null)).toBe('');
    expect(formatLocalIsoDate(undefined)).toBe('');
  });
});

describe('formatUtcIsoDate', () => {
  it('formats a valid UTC Date as YYYY-MM-DD', () => {
    expect(formatUtcIsoDate(new Date(Date.UTC(2024, 2, 5)))).toBe('2024-03-05');
  });

  it('returns empty string for an invalid Date', () => {
    expect(formatUtcIsoDate(new Date('not-a-date'))).toBe('');
  });

  it('returns empty string for non-Date input', () => {
    expect(formatUtcIsoDate('2024-03-05')).toBe('');
    expect(formatUtcIsoDate(null)).toBe('');
  });
});

describe('getUtcMonthLabel', () => {
  it('pairs the month name with the year', () => {
    expect(getUtcMonthLabel(2024, 0)).toBe('January 2024');
    expect(getUtcMonthLabel(2024, 11)).toBe('December 2024');
  });

  it('falls back to an empty name (leaving a leading space) for an out-of-range month index', () => {
    expect(getUtcMonthLabel(2024, 12)).toBe(' 2024');
    expect(getUtcMonthLabel(2024, -1)).toBe(' 2024');
  });
});

describe('normalizeDueDate', () => {
  it('accepts a well-formed ISO date', () => {
    expect(normalizeDueDate('2024-03-15')).toBe('2024-03-15');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(normalizeDueDate('  2024-03-15  ')).toBe('2024-03-15');
  });

  it('rejects a non-ISO format', () => {
    expect(normalizeDueDate('03-15-2024')).toBe('');
    expect(normalizeDueDate('2024-3-15')).toBe('');
    expect(normalizeDueDate('2024/03/15')).toBe('');
  });

  it('returns empty string for non-string or empty input', () => {
    expect(normalizeDueDate('')).toBe('');
    expect(normalizeDueDate(null)).toBe('');
    expect(normalizeDueDate(undefined)).toBe('');
    expect(normalizeDueDate(20240315)).toBe('');
  });
});

describe('getPortfolioCalendarDayOffset', () => {
  it('returns 0 for the same instant', () => {
    const d = createUtcDate(2024, 2, 10);
    expect(getPortfolioCalendarDayOffset(d, d)).toBe(0);
  });

  it('returns a positive day count for a later end date', () => {
    const start = createUtcDate(2024, 2, 10);
    const end = createUtcDate(2024, 2, 13);
    expect(getPortfolioCalendarDayOffset(start, end)).toBe(3);
  });

  it('returns a negative day count when end precedes start', () => {
    const start = createUtcDate(2024, 2, 13);
    const end = createUtcDate(2024, 2, 10);
    expect(getPortfolioCalendarDayOffset(start, end)).toBe(-3);
  });
});

describe('getPortfolioCalendarItemPriority', () => {
  it('ranks phase, sprint, milestone, task in that order', () => {
    expect(getPortfolioCalendarItemPriority({ kind: 'phase' })).toBe(0);
    expect(getPortfolioCalendarItemPriority({ kind: 'sprint' })).toBe(1);
    expect(getPortfolioCalendarItemPriority({ kind: 'milestone' })).toBe(2);
    expect(getPortfolioCalendarItemPriority({ kind: 'task' })).toBe(3);
  });

  it('ranks an unknown or missing kind last', () => {
    expect(getPortfolioCalendarItemPriority({ kind: 'other' })).toBe(4);
    expect(getPortfolioCalendarItemPriority({})).toBe(4);
    expect(getPortfolioCalendarItemPriority(null)).toBe(4);
  });
});

describe('getPortfolioCalendarItemLabel', () => {
  it('returns the item title', () => {
    expect(getPortfolioCalendarItemLabel({ title: 'Launch' })).toBe('Launch');
  });

  it('returns empty string when title is missing or item is nullish', () => {
    expect(getPortfolioCalendarItemLabel({})).toBe('');
    expect(getPortfolioCalendarItemLabel(null)).toBe('');
    expect(getPortfolioCalendarItemLabel(undefined)).toBe('');
  });
});

describe('comparePortfolioCalendarItems', () => {
  function item({ start, end, isRange = false, kind = '', title = '' }) {
    return {
      isRange,
      kind,
      title,
      bounds: {
        start: createUtcDate(2024, 0, start),
        end: createUtcDate(2024, 0, end ?? start)
      }
    };
  }

  it('orders by start date first', () => {
    const a = item({ start: 5 });
    const b = item({ start: 10 });
    expect(comparePortfolioCalendarItems(a, b)).toBeLessThan(0);
    expect(comparePortfolioCalendarItems(b, a)).toBeGreaterThan(0);
  });

  it('breaks a start-date tie by end date', () => {
    const a = item({ start: 5, end: 6 });
    const b = item({ start: 5, end: 10 });
    expect(comparePortfolioCalendarItems(a, b)).toBeLessThan(0);
  });

  it('breaks a start/end tie by isRange, ranges sorting before points', () => {
    const rangeItem = item({ start: 5, end: 10, isRange: true });
    const pointItem = item({ start: 5, end: 10, isRange: false });
    expect(comparePortfolioCalendarItems(rangeItem, pointItem)).toBe(-1);
    expect(comparePortfolioCalendarItems(pointItem, rangeItem)).toBe(1);
  });

  it('breaks an isRange tie by kind, alphabetically', () => {
    const a = item({ start: 5, end: 5, kind: 'milestone' });
    const b = item({ start: 5, end: 5, kind: 'sprint' });
    expect(comparePortfolioCalendarItems(a, b)).toBeLessThan(0);
  });

  it('finally breaks a full tie by title, alphabetically', () => {
    const a = item({ start: 5, end: 5, kind: 'task', title: 'Alpha' });
    const b = item({ start: 5, end: 5, kind: 'task', title: 'Beta' });
    expect(comparePortfolioCalendarItems(a, b)).toBeLessThan(0);
  });

  it('treats items with entirely missing bounds as equal (both default to 0)', () => {
    expect(comparePortfolioCalendarItems({}, {})).toBe(0);
  });
});

describe('getPortfolioCalendarHeatColor', () => {
  it('is the lightest/greenest color when count is 0 (or stats.max is 0)', () => {
    expect(getPortfolioCalendarHeatColor(0, { max: 0 })).toBe('hsl(118 68% 91%)');
    expect(getPortfolioCalendarHeatColor(5, { max: 0 })).toBe('hsl(118 68% 91%)');
  });

  it('is the most saturated/darkest color when count equals max', () => {
    expect(getPortfolioCalendarHeatColor(4, { max: 4 })).toBe('hsl(0 68% 73%)');
  });

  it('interpolates linearly at the midpoint', () => {
    expect(getPortfolioCalendarHeatColor(2, { max: 4 })).toBe('hsl(59 68% 82%)');
  });

  it('clamps a count above max to the max color', () => {
    expect(getPortfolioCalendarHeatColor(10, { max: 4 })).toBe('hsl(0 68% 73%)');
  });

  it('clamps a negative count to the 0 color', () => {
    expect(getPortfolioCalendarHeatColor(-5, { max: 4 })).toBe('hsl(118 68% 91%)');
  });

  it('handles a missing stats object as max 0', () => {
    expect(getPortfolioCalendarHeatColor(3, undefined)).toBe('hsl(118 68% 91%)');
  });

  it('rounds a non-terminating fraction to 3 decimal places without a trailing-zero regression', () => {
    // normalized = 1/3: hue = 118 - 118/3 = 78.6666... -> "78.667"; lightness = 91 - 6 = 85 -> "85".
    expect(getPortfolioCalendarHeatColor(1, { max: 3 })).toBe('hsl(78.667 68% 85%)');
  });
});

describe('getPortfolioCalendarMonthRange', () => {
  it('returns the first and last day of a mid-year month', () => {
    const range = getPortfolioCalendarMonthRange(2024, 5);
    expect(formatUtcIsoDate(range.start)).toBe('2024-06-01');
    expect(formatUtcIsoDate(range.end)).toBe('2024-06-30');
  });

  it('spans January correctly at the start of a year', () => {
    const range = getPortfolioCalendarMonthRange(2024, 0);
    expect(formatUtcIsoDate(range.start)).toBe('2024-01-01');
    expect(formatUtcIsoDate(range.end)).toBe('2024-01-31');
  });

  it('spans December correctly at the end of a year', () => {
    const range = getPortfolioCalendarMonthRange(2024, 11);
    expect(formatUtcIsoDate(range.start)).toBe('2024-12-01');
    expect(formatUtcIsoDate(range.end)).toBe('2024-12-31');
  });

  it('resolves February to 29 days in a leap year', () => {
    const range = getPortfolioCalendarMonthRange(2024, 1);
    expect(formatUtcIsoDate(range.end)).toBe('2024-02-29');
  });

  it('resolves February to 28 days in a non-leap year', () => {
    const range = getPortfolioCalendarMonthRange(2023, 1);
    expect(formatUtcIsoDate(range.end)).toBe('2023-02-28');
  });
});

describe('getPortfolioCalendarMiniMonthCellCount', () => {
  it('returns a 5-row grid (35 cells) for January 2024', () => {
    // Jan 1 2024 is a Monday (UTC day 1); 31 days -> ceil((1+31)/7)*7 = 35.
    expect(getPortfolioCalendarMiniMonthCellCount(2024, 0)).toBe(35);
  });

  it('returns a 4-row grid (28 cells) when the month starts on Sunday and has 28 days', () => {
    // Feb 1 2015 is a Sunday (UTC day 0); 2015 is not a leap year (28 days)
    // -> ceil((0+28)/7)*7 = 28.
    expect(getPortfolioCalendarMiniMonthCellCount(2015, 1)).toBe(28);
  });

  it('returns a 6-row grid (42 cells) when the month starts on Saturday with 31 days', () => {
    // May 1 2021 is a Saturday (UTC day 6); 31 days -> ceil((6+31)/7)*7 = 42.
    expect(getPortfolioCalendarMiniMonthCellCount(2021, 4)).toBe(42);
  });

  it('accounts for the leap-year day when computing February 2024', () => {
    // Feb 1 2024 is a Thursday (UTC day 4); 29 days (leap) -> ceil((4+29)/7)*7 = 35.
    expect(getPortfolioCalendarMiniMonthCellCount(2024, 1)).toBe(35);
  });
});

describe('getPortfolioCalendarTaskCountsByDay', () => {
  function taskItem(isoDate) {
    return { kind: 'task', bounds: { start: parseRoadmapIsoDateForTest(isoDate) } };
  }
  function parseRoadmapIsoDateForTest(isoDate) {
    return new Date(`${isoDate}T00:00:00Z`);
  }

  it('returns an empty Map for a non-array input', () => {
    const counts = getPortfolioCalendarTaskCountsByDay(null);
    expect(counts instanceof Map).toBe(true);
    expect(counts.size).toBe(0);
  });

  it('counts multiple tasks that share a due day', () => {
    const counts = getPortfolioCalendarTaskCountsByDay([
      taskItem('2024-03-05'),
      taskItem('2024-03-05'),
      taskItem('2024-03-06')
    ]);
    expect(counts.get('2024-03-05')).toBe(2);
    expect(counts.get('2024-03-06')).toBe(1);
  });

  it('ignores non-task items regardless of bounds', () => {
    const counts = getPortfolioCalendarTaskCountsByDay([
      { kind: 'milestone', bounds: { start: parseRoadmapIsoDateForTest('2024-03-05') } }
    ]);
    expect(counts.size).toBe(0);
  });

  it('ignores task items without bounds.start', () => {
    const counts = getPortfolioCalendarTaskCountsByDay([
      { kind: 'task', bounds: {} },
      { kind: 'task' }
    ]);
    expect(counts.size).toBe(0);
  });

  it('ignores a task item whose bounds.start is an invalid Date', () => {
    const counts = getPortfolioCalendarTaskCountsByDay([
      { kind: 'task', bounds: { start: new Date('not-a-date') } }
    ]);
    expect(counts.size).toBe(0);
  });
});

describe('getPortfolioCalendarMonthHeatStats', () => {
  it('returns zeros for a non-integer year or month', () => {
    expect(getPortfolioCalendarMonthHeatStats(new Map(), NaN, 1)).toEqual({ min: 0, max: 0 });
    expect(getPortfolioCalendarMonthHeatStats(new Map(), 2024, NaN)).toEqual({ min: 0, max: 0 });
  });

  it('returns min 0 max 0 across an empty month when no counts are provided', () => {
    expect(getPortfolioCalendarMonthHeatStats(null, 2024, 1)).toEqual({ min: 0, max: 0 });
  });

  it('aggregates min/max across every day of the month, treating unlisted days as 0', () => {
    const counts = new Map([
      ['2024-02-01', 3],
      ['2024-02-15', 5]
    ]);
    // February 2024 (leap year) has other days at 0, so min stays 0 even
    // though some days have counts.
    expect(getPortfolioCalendarMonthHeatStats(counts, 2024, 1)).toEqual({ min: 0, max: 5 });
  });

  it('does not look past the end of the month', () => {
    const counts = new Map([['2024-03-01', 9]]);
    expect(getPortfolioCalendarMonthHeatStats(counts, 2024, 1)).toEqual({ min: 0, max: 0 });
  });
});

describe('getPortfolioCalendarYearHeatStats', () => {
  it('returns zeros for a non-integer year', () => {
    expect(getPortfolioCalendarYearHeatStats(new Map(), NaN)).toEqual({ min: 0, max: 0 });
  });

  it('returns min 0 max 0 across an empty year when no counts are provided', () => {
    expect(getPortfolioCalendarYearHeatStats(null, 2023)).toEqual({ min: 0, max: 0 });
  });

  it('aggregates min/max across the whole year, treating unlisted days as 0', () => {
    const counts = new Map([
      ['2023-01-01', 2],
      ['2023-12-31', 7]
    ]);
    expect(getPortfolioCalendarYearHeatStats(counts, 2023)).toEqual({ min: 0, max: 7 });
  });

  it('does not leak counts from a different year', () => {
    const counts = new Map([['2024-06-01', 42]]);
    expect(getPortfolioCalendarYearHeatStats(counts, 2023)).toEqual({ min: 0, max: 0 });
  });
});

describe('doesPortfolioCalendarItemOccurOnDay', () => {
  const bounds = {
    start: createUtcDate(2024, 2, 10),
    end: createUtcDate(2024, 2, 15)
  };

  it('is true on the range start day (inclusive)', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, '2024-03-10')).toBe(true);
  });

  it('is true on the range end day (inclusive)', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, '2024-03-15')).toBe(true);
  });

  it('is true on a day strictly inside the range', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, '2024-03-12')).toBe(true);
  });

  it('is false the day before the range starts', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, '2024-03-09')).toBe(false);
  });

  it('is false the day after the range ends', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, '2024-03-16')).toBe(false);
  });

  it('is false when the item has no bounds', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({}, '2024-03-12')).toBe(false);
  });

  it('is false when isoDate does not parse', () => {
    expect(doesPortfolioCalendarItemOccurOnDay({ bounds }, 'not-a-date')).toBe(false);
  });
});

describe('getPortfolioCalendarMiniDayMarkers', () => {
  it('marks a non-range task item on its day as kind "task"', () => {
    const item = { kind: 'task', isRange: false, bounds: { start: createUtcDate(2024, 2, 10) } };
    const markers = getPortfolioCalendarMiniDayMarkers([item], '2024-03-10');
    expect(markers).toEqual([{ item, kind: 'task' }]);
  });

  it('marks a non-range non-task item on its day as kind "point"', () => {
    const item = { kind: 'milestone', isRange: false, bounds: { start: createUtcDate(2024, 2, 10) } };
    const markers = getPortfolioCalendarMiniDayMarkers([item], '2024-03-10');
    expect(markers).toEqual([{ item, kind: 'point' }]);
  });

  it('produces no marker for a non-range item on a different day', () => {
    const item = { kind: 'task', isRange: false, bounds: { start: createUtcDate(2024, 2, 10) } };
    expect(getPortfolioCalendarMiniDayMarkers([item], '2024-03-11')).toEqual([]);
  });

  it('marks both endpoints of a multi-day range item', () => {
    const item = {
      kind: 'sprint',
      isRange: true,
      bounds: { start: createUtcDate(2024, 2, 10), end: createUtcDate(2024, 2, 15) }
    };
    expect(getPortfolioCalendarMiniDayMarkers([item], '2024-03-10')).toEqual([{ item, kind: 'range-start' }]);
    expect(getPortfolioCalendarMiniDayMarkers([item], '2024-03-15')).toEqual([{ item, kind: 'range-end' }]);
  });

  it('produces no marker for a day strictly inside a range (only endpoints are marked)', () => {
    const item = {
      kind: 'sprint',
      isRange: true,
      bounds: { start: createUtcDate(2024, 2, 10), end: createUtcDate(2024, 2, 15) }
    };
    expect(getPortfolioCalendarMiniDayMarkers([item], '2024-03-12')).toEqual([]);
  });

  it('marks a single-day range only once (start === end)', () => {
    const item = {
      kind: 'sprint',
      isRange: true,
      bounds: { start: createUtcDate(2024, 2, 10), end: createUtcDate(2024, 2, 10) }
    };
    expect(getPortfolioCalendarMiniDayMarkers([item], '2024-03-10')).toEqual([{ item, kind: 'range-start' }]);
  });

  it('skips items with no bounds', () => {
    expect(getPortfolioCalendarMiniDayMarkers([{ kind: 'task' }], '2024-03-10')).toEqual([]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getPortfolioCalendarMiniDayMarkers(null, '2024-03-10')).toEqual([]);
  });
});

describe('comparePortfolioCalendarDayItems', () => {
  function item({ kind, start = 5, end = 5, title = '' }) {
    return {
      kind,
      title,
      bounds: { start: createUtcDate(2024, 0, start), end: createUtcDate(2024, 0, end) }
    };
  }

  it('orders a higher-priority kind (phase) before a lower-priority kind (task)', () => {
    const phase = item({ kind: 'phase' });
    const task = item({ kind: 'task' });
    expect(comparePortfolioCalendarDayItems(phase, task)).toBeLessThan(0);
    expect(comparePortfolioCalendarDayItems(task, phase)).toBeGreaterThan(0);
  });

  it('falls back to comparePortfolioCalendarItems ordering when priority ties', () => {
    const earlier = item({ kind: 'task', start: 1, end: 1 });
    const later = item({ kind: 'task', start: 10, end: 10 });
    expect(comparePortfolioCalendarDayItems(earlier, later)).toBeLessThan(0);
    expect(comparePortfolioCalendarDayItems(later, earlier)).toBeGreaterThan(0);
  });

  it('treats two items with unknown kinds and identical bounds as equal', () => {
    const a = item({ kind: 'unknown-kind', title: 'A' });
    const b = item({ kind: 'unknown-kind', title: 'A' });
    expect(comparePortfolioCalendarDayItems(a, b)).toBe(0);
  });
});

describe('comparePortfolioDueDateAsc', () => {
  function withDue(dueDate) {
    return { task: { dueDate } };
  }

  it('orders two due dates ascending, earliest first', () => {
    expect(comparePortfolioDueDateAsc(withDue('2024-01-01'), withDue('2024-06-01'))).toBeLessThan(0);
    expect(comparePortfolioDueDateAsc(withDue('2024-06-01'), withDue('2024-01-01'))).toBeGreaterThan(0);
  });

  it('treats identical due dates as a tie', () => {
    expect(comparePortfolioDueDateAsc(withDue('2024-01-01'), withDue('2024-01-01'))).toBe(0);
  });

  it('sorts an item with a due date before one without', () => {
    expect(comparePortfolioDueDateAsc(withDue('2024-01-01'), withDue(''))).toBe(-1);
  });

  it('sorts an item without a due date after one with', () => {
    expect(comparePortfolioDueDateAsc(withDue(''), withDue('2024-01-01'))).toBe(1);
  });

  it('treats two items with no due date as a tie', () => {
    expect(comparePortfolioDueDateAsc(withDue(''), withDue(undefined))).toBe(0);
  });

  it('treats an invalid (non-ISO) due date the same as no due date', () => {
    expect(comparePortfolioDueDateAsc(withDue('not-a-date'), withDue('2024-01-01'))).toBe(1);
  });
});

describe('formatDueDateForUi', () => {
  it('reformats a valid ISO date as DD/MM/YYYY', () => {
    expect(formatDueDateForUi('2024-03-05')).toBe('05/03/2024');
  });

  it('returns an empty string for an invalid date string', () => {
    expect(formatDueDateForUi('not-a-date')).toBe('');
  });

  it('returns an empty string for a falsy value', () => {
    expect(formatDueDateForUi('')).toBe('');
    expect(formatDueDateForUi(undefined)).toBe('');
    expect(formatDueDateForUi(null)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('returns "-" when the value does not normalize to a timestamp', () => {
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
    expect(formatDateTime('not-a-date')).toBe('-');
  });

  it('formats a valid ISO timestamp using the platform locale formatter', () => {
    const iso = '2024-03-05T12:34:56.000Z';
    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString());
  });
});

describe('todayLocalIsoDate', () => {
  it('delegates to formatLocalIsoDate(new Date())', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      expect(todayLocalIsoDate()).toBe(formatLocalIsoDate(new Date(2024, 5, 15, 10, 0, 0)));
      expect(todayLocalIsoDate()).toBe('2024-06-15');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildPortfolioCalendarItemStyle', () => {
  const projectColor = { bg: 'hsl(10 60% 90%)', border: 'hsl(10 50% 70%)', text: 'hsl(10 70% 20%)' };

  it('returns an empty string when options.aggregate is not set', () => {
    expect(buildPortfolioCalendarItemStyle({ projectColor })).toBe('');
  });

  it('returns an empty string when options.aggregate is falsy', () => {
    expect(buildPortfolioCalendarItemStyle({ projectColor }, { aggregate: false })).toBe('');
  });

  it('builds a background/border/color declaration from the item projectColor when aggregating', () => {
    const style = buildPortfolioCalendarItemStyle({ projectColor }, { aggregate: true });
    expect(style).toBe(`background:${projectColor.bg};border-color:${projectColor.border};color:${projectColor.text};`);
  });

  it('falls back to createPortfolioProjectColor(0) when the item has no projectColor', () => {
    const fallback = createPortfolioProjectColor(0);
    const style = buildPortfolioCalendarItemStyle({}, { aggregate: true });
    expect(style).toBe(`background:${fallback.bg};border-color:${fallback.border};color:${fallback.text};`);
  });
});

describe('buildPortfolioCalendarMiniMarkerStyle', () => {
  const projectColor = { bg: 'hsl(10 60% 90%)', border: 'hsl(10 50% 70%)', text: 'hsl(10 70% 20%)' };

  it('returns an empty string when options.aggregate is not set', () => {
    expect(buildPortfolioCalendarMiniMarkerStyle({ projectColor })).toBe('');
  });

  it('builds a background declaration from the item projectColor border when aggregating', () => {
    const style = buildPortfolioCalendarMiniMarkerStyle({ projectColor }, { aggregate: true });
    expect(style).toBe(`background:${projectColor.border};`);
  });

  it('falls back to createPortfolioProjectColor(0) when the item has no projectColor', () => {
    const fallback = createPortfolioProjectColor(0);
    const style = buildPortfolioCalendarMiniMarkerStyle({}, { aggregate: true });
    expect(style).toBe(`background:${fallback.border};`);
  });
});

describe('buildPortfolioCalendarRoadmapSpanStyle', () => {
  // Delegates entirely to buildPortfolioCalendarItemStyle -- same behavior.
  const projectColor = { bg: 'hsl(10 60% 90%)', border: 'hsl(10 50% 70%)', text: 'hsl(10 70% 20%)' };

  it('returns an empty string when options.aggregate is not set', () => {
    expect(buildPortfolioCalendarRoadmapSpanStyle({ projectColor })).toBe('');
  });

  it('builds a background/border/color declaration when aggregating', () => {
    const style = buildPortfolioCalendarRoadmapSpanStyle({ projectColor }, { aggregate: true });
    expect(style).toBe(`background:${projectColor.bg};border-color:${projectColor.border};color:${projectColor.text};`);
  });

  it('falls back to createPortfolioProjectColor(0) when the item has no projectColor', () => {
    expect(buildPortfolioCalendarRoadmapSpanStyle({}, { aggregate: true }))
      .toBe(buildPortfolioCalendarItemStyle({}, { aggregate: true }));
  });
});

describe('comparePortfolioCalendarRoadmapItems', () => {
  function item({ kind, start, end, title = '' }) {
    return {
      kind,
      title,
      bounds: {
        start: createUtcDate(2024, 0, start),
        end: createUtcDate(2024, 0, end ?? start)
      }
    };
  }

  it('orders by priority first: phase, sprint, milestone, task, other', () => {
    const phase = item({ kind: 'phase', start: 20 });
    const task = item({ kind: 'task', start: 1 });
    expect(comparePortfolioCalendarRoadmapItems(phase, task)).toBeLessThan(0);
    expect(comparePortfolioCalendarRoadmapItems(task, phase)).toBeGreaterThan(0);
  });

  it('breaks a priority tie by start date ascending', () => {
    const a = item({ kind: 'sprint', start: 5 });
    const b = item({ kind: 'sprint', start: 10 });
    expect(comparePortfolioCalendarRoadmapItems(a, b)).toBeLessThan(0);
  });

  it('breaks a start-date tie by end date DESCENDING (longer spans first)', () => {
    const longer = item({ kind: 'sprint', start: 5, end: 20 });
    const shorter = item({ kind: 'sprint', start: 5, end: 6 });
    expect(comparePortfolioCalendarRoadmapItems(longer, shorter)).toBeLessThan(0);
    expect(comparePortfolioCalendarRoadmapItems(shorter, longer)).toBeGreaterThan(0);
  });

  it('finally breaks a full tie by title via compareText', () => {
    const a = item({ kind: 'sprint', start: 5, end: 5, title: 'Alpha' });
    const b = item({ kind: 'sprint', start: 5, end: 5, title: 'Beta' });
    expect(comparePortfolioCalendarRoadmapItems(a, b)).toBeLessThan(0);
  });

  it('treats items with entirely missing bounds as equal on the date terms', () => {
    expect(comparePortfolioCalendarRoadmapItems({ kind: 'task' }, { kind: 'task' })).toBe(0);
  });
});

describe('doesPortfolioCalendarItemIntersectMonth', () => {
  it('returns false when the item has no bounds', () => {
    expect(doesPortfolioCalendarItemIntersectMonth({}, 2024, 2)).toBe(false);
    expect(doesPortfolioCalendarItemIntersectMonth(null, 2024, 2)).toBe(false);
  });

  it('is inclusive at the end-of-month boundary: an item starting on the last day intersects', () => {
    const item = { bounds: { start: createUtcDate(2024, 2, 31), end: createUtcDate(2024, 2, 31) } };
    expect(doesPortfolioCalendarItemIntersectMonth(item, 2024, 2)).toBe(true);
  });

  it('excludes an item that starts the day after the month ends', () => {
    const item = { bounds: { start: createUtcDate(2024, 3, 1), end: createUtcDate(2024, 3, 5) } };
    expect(doesPortfolioCalendarItemIntersectMonth(item, 2024, 2)).toBe(false);
  });

  it('is inclusive at the start-of-month boundary: an item ending on the first day intersects', () => {
    const item = { bounds: { start: createUtcDate(2024, 1, 20), end: createUtcDate(2024, 2, 1) } };
    expect(doesPortfolioCalendarItemIntersectMonth(item, 2024, 2)).toBe(true);
  });

  it('excludes an item that ends the day before the month starts', () => {
    const item = { bounds: { start: createUtcDate(2024, 1, 20), end: createUtcDate(2024, 1, 29) } };
    expect(doesPortfolioCalendarItemIntersectMonth(item, 2024, 2)).toBe(false);
  });

  it('includes an item that spans the entire month and beyond', () => {
    const item = { bounds: { start: createUtcDate(2024, 1, 1), end: createUtcDate(2024, 3, 1) } };
    expect(doesPortfolioCalendarItemIntersectMonth(item, 2024, 2)).toBe(true);
  });
});

describe('shouldShowPortfolioCalendarRoadmapLabel', () => {
  it('always shows the label when the item has no bounds', () => {
    expect(shouldShowPortfolioCalendarRoadmapLabel({}, createUtcDate(2024, 2, 12))).toBe(true);
  });

  it('always shows the label when the item is not a range (a point item)', () => {
    const item = { isRange: false, bounds: { start: createUtcDate(2024, 2, 5), end: createUtcDate(2024, 2, 5) } };
    expect(shouldShowPortfolioCalendarRoadmapLabel(item, createUtcDate(2024, 2, 12))).toBe(true);
  });

  it('shows the label on the range start date', () => {
    const item = { isRange: true, bounds: { start: createUtcDate(2024, 2, 5), end: createUtcDate(2024, 2, 20) } };
    expect(shouldShowPortfolioCalendarRoadmapLabel(item, createUtcDate(2024, 2, 5))).toBe(true);
  });

  it('shows the label on the 1st of the month, even mid-range', () => {
    const item = { isRange: true, bounds: { start: createUtcDate(2024, 1, 20), end: createUtcDate(2024, 3, 1) } };
    // 2024-03-01 is a Friday (not the start date, not a Sunday) -- only the
    // day-of-month rule should trigger here.
    expect(shouldShowPortfolioCalendarRoadmapLabel(item, createUtcDate(2024, 2, 1))).toBe(true);
  });

  it('shows the label on a Sunday, even mid-range', () => {
    const item = { isRange: true, bounds: { start: createUtcDate(2024, 1, 20), end: createUtcDate(2024, 3, 1) } };
    // 2024-03-03 is a Sunday (not the start date, not the 1st).
    expect(shouldShowPortfolioCalendarRoadmapLabel(item, createUtcDate(2024, 2, 3))).toBe(true);
  });

  it('hides the label on an ordinary mid-range day that is not the start, the 1st, or a Sunday', () => {
    const item = { isRange: true, bounds: { start: createUtcDate(2024, 1, 20), end: createUtcDate(2024, 3, 1) } };
    // 2024-03-12 is a Tuesday.
    expect(shouldShowPortfolioCalendarRoadmapLabel(item, createUtcDate(2024, 2, 12))).toBe(false);
  });
});

describe('buildPortfolioCalendarWeekRoadmapSegments', () => {
  const weekStart = createUtcDate(2024, 2, 4);
  const weekEnd = createUtcDate(2024, 2, 10);

  it('excludes items with kind "task"', () => {
    const taskItem = { kind: 'task', title: 'A task', bounds: { start: createUtcDate(2024, 2, 5), end: createUtcDate(2024, 2, 5) } };
    expect(buildPortfolioCalendarWeekRoadmapSegments([taskItem], weekStart, weekEnd)).toEqual([]);
  });

  it('excludes items with no bounds', () => {
    const noBounds = { kind: 'milestone', title: 'No bounds' };
    expect(buildPortfolioCalendarWeekRoadmapSegments([noBounds], weekStart, weekEnd)).toEqual([]);
  });

  it('excludes items whose bounds do not overlap the week', () => {
    const earlier = { kind: 'sprint', title: 'Old', bounds: { start: createUtcDate(2024, 1, 1), end: createUtcDate(2024, 1, 20) } };
    expect(buildPortfolioCalendarWeekRoadmapSegments([earlier], weekStart, weekEnd)).toEqual([]);
  });

  it('defaults to an empty array for non-array items', () => {
    expect(buildPortfolioCalendarWeekRoadmapSegments(null, weekStart, weekEnd)).toEqual([]);
    expect(buildPortfolioCalendarWeekRoadmapSegments(undefined, weekStart, weekEnd)).toEqual([]);
  });

  it('clamps segment bounds to the week, flags continuation, and sorts by roadmap priority (phase before sprint)', () => {
    const phase = { kind: 'phase', title: 'Phase A', bounds: { start: createUtcDate(2024, 2, 1), end: createUtcDate(2024, 2, 6) } };
    const sprint = { kind: 'sprint', title: 'Sprint B', bounds: { start: createUtcDate(2024, 2, 5), end: createUtcDate(2024, 2, 12) } };

    const segments = buildPortfolioCalendarWeekRoadmapSegments([sprint, phase], weekStart, weekEnd);

    expect(segments).toEqual([
      {
        item: phase,
        startDay: 0,
        endDay: 2,
        continuesBefore: true,
        continuesAfter: false
      },
      {
        item: sprint,
        startDay: 1,
        endDay: 6,
        continuesBefore: false,
        continuesAfter: true
      }
    ]);
  });

  it('marks neither continuesBefore nor continuesAfter when an item is fully contained in the week', () => {
    const milestone = { kind: 'milestone', title: 'Launch', bounds: { start: createUtcDate(2024, 2, 6), end: createUtcDate(2024, 2, 6) } };
    const [segment] = buildPortfolioCalendarWeekRoadmapSegments([milestone], weekStart, weekEnd);
    expect(segment.continuesBefore).toBe(false);
    expect(segment.continuesAfter).toBe(false);
    expect(segment.startDay).toBe(2);
    expect(segment.endDay).toBe(2);
  });
});
