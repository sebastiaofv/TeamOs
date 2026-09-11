import { describe, it, expect } from 'vitest';
import {
  addRoadmapDays,
  createEmptyRoadmapExtension,
  formatRoadmapAxisDate,
  formatRoadmapDateRange,
  getRoadmapDayDiff,
  getRoadmapEntityConfig,
  normalizeRoadmapDate,
  normalizeRoadmapRef,
  parseRoadmapIsoDate,
  slugifyRoadmapEntityId
} from '../../src/domain/roadmap.js';

describe('addRoadmapDays', () => {
  it('returns null when date is not a Date instance', () => {
    expect(addRoadmapDays('2024-01-01', 1)).toBeNull();
    expect(addRoadmapDays(null, 1)).toBeNull();
  });

  it('returns null when date is an Invalid Date', () => {
    expect(addRoadmapDays(new Date('bogus'), 1)).toBeNull();
  });

  it('adds a positive number of days, rolling over a month boundary', () => {
    const result = addRoadmapDays(new Date('2024-01-31T00:00:00Z'), 1);
    expect(result.toISOString()).toBe('2024-02-01T00:00:00.000Z');
  });

  it('subtracts days for a negative offset', () => {
    const result = addRoadmapDays(new Date('2024-01-31T00:00:00Z'), -1);
    expect(result.toISOString()).toBe('2024-01-30T00:00:00.000Z');
  });

  it('returns an Invalid Date (not null) when days is not numeric', () => {
    // Number(undefined) is NaN, so date.getTime() + NaN = NaN: the function's
    // own guard only checks `date`, not the computed result, so this is a
    // genuine Invalid Date object rather than null.
    const result = addRoadmapDays(new Date('2024-01-31T00:00:00Z'), undefined);
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });
});

describe('createEmptyRoadmapExtension', () => {
  it('returns an empty roadmap extension shape with the current version', () => {
    expect(createEmptyRoadmapExtension()).toEqual({
      version: 1,
      milestones: [],
      phases: [],
      sprints: []
    });
  });

  it('returns fresh arrays on each call', () => {
    const a = createEmptyRoadmapExtension();
    const b = createEmptyRoadmapExtension();
    expect(a.milestones).not.toBe(b.milestones);
  });
});

describe('formatRoadmapAxisDate', () => {
  it('returns an empty string for a non-Date or Invalid Date', () => {
    expect(formatRoadmapAxisDate('2024-01-01')).toBe('');
    expect(formatRoadmapAxisDate(new Date('bogus'))).toBe('');
  });

  it('formats as "Mon DD" using UTC month/day, zero-padded', () => {
    expect(formatRoadmapAxisDate(new Date('2024-01-05T00:00:00Z'))).toBe('Jan 05');
  });

  it('formats December correctly (last month index)', () => {
    expect(formatRoadmapAxisDate(new Date('2024-12-31T00:00:00Z'))).toBe('Dec 31');
  });
});

describe('formatRoadmapDateRange', () => {
  it('returns an empty string for a non-object item', () => {
    expect(formatRoadmapDateRange(null)).toBe('');
    expect(formatRoadmapDateRange('x')).toBe('');
  });

  it('prefers dueDate when present', () => {
    expect(formatRoadmapDateRange({ dueDate: '2024-01-01', startDate: '2024-01-01', endDate: '2024-02-01' }))
      .toBe('Due 2024-01-01');
  });

  it('falls back to a start/end range when dueDate is absent', () => {
    expect(formatRoadmapDateRange({ startDate: '2024-01-01', endDate: '2024-02-01' }))
      .toBe('2024-01-01 to 2024-02-01');
  });

  it('returns an empty string when neither dueDate nor a full range is present', () => {
    expect(formatRoadmapDateRange({})).toBe('');
    expect(formatRoadmapDateRange({ startDate: '2024-01-01' })).toBe('');
  });
});

describe('getRoadmapDayDiff', () => {
  it('returns 0 when start or end is not a valid Date', () => {
    expect(getRoadmapDayDiff('x', new Date())).toBe(0);
    expect(getRoadmapDayDiff(new Date(), 'x')).toBe(0);
    expect(getRoadmapDayDiff(new Date('bogus'), new Date())).toBe(0);
  });

  it('counts whole days between two dates, crossing a month boundary', () => {
    const start = new Date('2024-01-31T00:00:00Z');
    const end = new Date('2024-02-01T00:00:00Z');
    expect(getRoadmapDayDiff(start, end)).toBe(1);
  });

  it('handles the leap-year February boundary correctly', () => {
    const start = new Date('2024-02-28T00:00:00Z');
    const end = new Date('2024-03-01T00:00:00Z');
    expect(getRoadmapDayDiff(start, end)).toBe(2);
  });

  it('handles the non-leap-year February boundary correctly', () => {
    const start = new Date('2023-02-28T00:00:00Z');
    const end = new Date('2023-03-01T00:00:00Z');
    expect(getRoadmapDayDiff(start, end)).toBe(1);
  });

  it('clamps a negative difference (end before start) to 0', () => {
    const start = new Date('2024-02-01T00:00:00Z');
    const end = new Date('2024-01-31T00:00:00Z');
    expect(getRoadmapDayDiff(start, end)).toBe(0);
  });

  it('returns 0 for the same instant', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(getRoadmapDayDiff(d, d)).toBe(0);
  });
});

describe('getRoadmapEntityConfig', () => {
  it('returns the milestone config, dateMode "single"', () => {
    expect(getRoadmapEntityConfig('milestones')).toEqual({
      label: 'Milestone',
      singular: 'milestone',
      dateMode: 'single',
      dateLabel: 'Due Date',
      taskField: 'milestoneId',
      itemsKey: 'milestones'
    });
  });

  it('returns the phase config, dateMode "range", no dateLabel', () => {
    expect(getRoadmapEntityConfig('phases')).toEqual({
      label: 'Phase',
      singular: 'phase',
      dateMode: 'range',
      taskField: 'phaseId',
      itemsKey: 'phases'
    });
  });

  it('returns the sprint config, dateMode "range", no dateLabel', () => {
    expect(getRoadmapEntityConfig('sprints')).toEqual({
      label: 'Sprint',
      singular: 'sprint',
      dateMode: 'range',
      taskField: 'sprintId',
      itemsKey: 'sprints'
    });
  });

  it('returns null for an unrecognized kind', () => {
    expect(getRoadmapEntityConfig('bogus')).toBeNull();
    expect(getRoadmapEntityConfig(undefined)).toBeNull();
  });
});

describe('normalizeRoadmapDate', () => {
  it('returns an empty string for a non-string value', () => {
    expect(normalizeRoadmapDate(20240101)).toBe('');
    expect(normalizeRoadmapDate(null)).toBe('');
    expect(normalizeRoadmapDate(undefined)).toBe('');
  });

  it('returns the trimmed value when it matches YYYY-MM-DD', () => {
    expect(normalizeRoadmapDate('  2024-01-01  ')).toBe('2024-01-01');
  });

  it('returns an empty string for a malformed date string', () => {
    expect(normalizeRoadmapDate('2024-1-1')).toBe('');
    expect(normalizeRoadmapDate('2024/01/01')).toBe('');
    expect(normalizeRoadmapDate('not-a-date')).toBe('');
  });
});

describe('normalizeRoadmapRef', () => {
  it('returns an empty string for a non-string value', () => {
    expect(normalizeRoadmapRef(42)).toBe('');
    expect(normalizeRoadmapRef(null)).toBe('');
  });

  it('trims a string value', () => {
    expect(normalizeRoadmapRef('  abc  ')).toBe('abc');
  });
});

describe('parseRoadmapIsoDate', () => {
  it('returns null for a non-string or malformed value', () => {
    expect(parseRoadmapIsoDate(20240101)).toBeNull();
    expect(parseRoadmapIsoDate('2024-1-1')).toBeNull();
    expect(parseRoadmapIsoDate(null)).toBeNull();
  });

  it('parses a well-formed ISO date as UTC midnight', () => {
    const result = parseRoadmapIsoDate('2024-01-01');
    expect(result.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns null when the month is out of range', () => {
    expect(parseRoadmapIsoDate('2024-13-01')).toBeNull();
  });

  it('rolls over a day that is out of range for its month rather than rejecting it', () => {
    // The function only checks the regex shape and Number.isNaN(getTime()); it
    // does not validate calendar correctness, so the JS Date constructor's
    // own rollover behavior applies (Feb 30 becomes Mar 1).
    const result = parseRoadmapIsoDate('2024-02-30');
    expect(result.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });
});

describe('slugifyRoadmapEntityId', () => {
  it('slugifies the title', () => {
    expect(slugifyRoadmapEntityId('My Milestone!', [])).toBe('my-milestone');
  });

  it('falls back to "item" for a blank title', () => {
    expect(slugifyRoadmapEntityId('', [])).toBe('item');
    expect(slugifyRoadmapEntityId('   ', [])).toBe('item');
  });

  it('appends a numeric suffix on collision with an existing id, starting at 2', () => {
    expect(slugifyRoadmapEntityId('My Milestone!', [{ id: 'my-milestone' }])).toBe('my-milestone-2');
  });

  it('keeps incrementing the suffix until it finds a free slug', () => {
    expect(slugifyRoadmapEntityId('Sprint 1', [{ id: 'sprint-1' }, { id: 'sprint-1-2' }])).toBe('sprint-1-3');
  });

  it('excludes currentId from the collision check, allowing a no-op rename', () => {
    expect(slugifyRoadmapEntityId('Sprint 1', [{ id: 'sprint-1' }], 'sprint-1')).toBe('sprint-1');
  });

  it('ignores items without an id and a non-array items argument', () => {
    // Note: the function's `.map((item) => item.id)` has no null-guard on
    // individual items (matches the pre-extraction original), so an item
    // list containing a bare `null` would throw here rather than being
    // skipped -- only object entries lacking an `id` are tolerated.
    expect(slugifyRoadmapEntityId('Task', [{ notId: 'x' }])).toBe('task');
    expect(slugifyRoadmapEntityId('Task', null)).toBe('task');
  });
});
