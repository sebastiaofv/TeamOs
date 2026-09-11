// These calendar functions mix local-time and UTC-time handling
// (formatLocalIsoDate vs formatUtcIsoDate/createUtcDate). Pin the process
// timezone so local-time assertions are reproducible regardless of the
// machine/CI running the suite.
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import {
  comparePortfolioCalendarItems,
  createUtcDate,
  formatLocalIsoDate,
  formatUtcIsoDate,
  getPortfolioCalendarDayOffset,
  getPortfolioCalendarHeatColor,
  getPortfolioCalendarItemLabel,
  getPortfolioCalendarItemPriority,
  getUtcMonthLabel,
  normalizeDueDate
} from '../../src/domain/calendar.js';

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
