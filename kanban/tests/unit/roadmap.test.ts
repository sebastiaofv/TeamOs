import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect, vi } from 'vitest';
import {
  addRoadmapDays,
  createEmptyRoadmapExtension,
  formatRoadmapAxisDate,
  formatRoadmapDateRange,
  getRoadmapDatePosition,
  getRoadmapDayDiff,
  getRoadmapEntityConfig,
  getRoadmapItemDateBounds,
  normalizeRoadmapDate,
  normalizeRoadmapRef,
  parseRoadmapIsoDate,
  slugifyRoadmapEntityId,
  getRoadmapItemTitle,
  getRoadmapTaskFieldTasks,
  normalizeRoadmapItems,
  compareRoadmapItemsByDate,
  getRoadmapAxisTicks,
  getRoadmapTimelinePlacement,
  getRoadmapTodayMarker,
  getVisibleRoadmapDateRange,
  normalizeRoadmapExtension,
  clearInvalidRoadmapTaskRefs,
  getRoadmapExtension,
  getRoadmapExtensionObject
} from '../../src/domain/roadmap';
import { ROADMAP_VERSION, ROADMAP_EXTENSION_KEY } from '../../src/domain/constants';

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
    expect(Number.isNaN(result!.getTime())).toBe(true);
  });
});

describe('createEmptyRoadmapExtension', () => {
  it('returns an empty roadmap extension shape with the current version', () => {
    expect(createEmptyRoadmapExtension()).toEqual({
      version: ROADMAP_VERSION,
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
    expect(formatRoadmapDateRange(fromAny('x'))).toBe('');
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

  it('returns an empty string for a malformed or impossible date string', () => {
    expect(normalizeRoadmapDate('2024-1-1')).toBe('');
    expect(normalizeRoadmapDate('2024/01/01')).toBe('');
    expect(normalizeRoadmapDate('2024-02-30')).toBe('');
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
    expect(result!.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns null when the month is out of range', () => {
    expect(parseRoadmapIsoDate('2024-13-01')).toBeNull();
  });

  it('returns null when the day is out of range for its month', () => {
    expect(parseRoadmapIsoDate('2024-02-30')).toBeNull();
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
    expect(slugifyRoadmapEntityId('Task', [fromAny({ notId: 'x' })])).toBe('task');
    expect(slugifyRoadmapEntityId('Task', null)).toBe('task');
  });
});

describe('getRoadmapItemDateBounds', () => {
  it('returns null for non-object or nullish input', () => {
    expect(getRoadmapItemDateBounds(null)).toBeNull();
    expect(getRoadmapItemDateBounds(undefined)).toBeNull();
    expect(getRoadmapItemDateBounds(fromAny('2024-01-01'))).toBeNull();
  });

  it('treats dueDate as a single-point bound (start === end)', () => {
    const result = getRoadmapItemDateBounds({ dueDate: '2024-03-15' });
    expect(result!.start).toEqual(result!.end);
    expect(result!.start.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('returns null when dueDate is present but not a valid ISO date', () => {
    expect(getRoadmapItemDateBounds({ dueDate: 'not-a-date' })).toBeNull();
    expect(getRoadmapItemDateBounds({ dueDate: '15/03/2024' })).toBeNull();
  });

  it('dueDate takes precedence over startDate/endDate when both are present', () => {
    const result = getRoadmapItemDateBounds({
      dueDate: '2024-03-15',
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    });
    expect(result!.start.toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(result!.end.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('builds a range from startDate/endDate when already in order', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-01', endDate: '2024-03-10' });
    expect(result!.start.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(result!.end.toISOString()).toBe('2024-03-10T00:00:00.000Z');
  });

  it('returns null when startDate is after endDate', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-10', endDate: '2024-03-01' });
    expect(result).toBeNull();
  });

  it('returns a degenerate single-point range when startDate and endDate are equal', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-05', endDate: '2024-03-05' });
    expect(result!.start.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(result!.end.toISOString()).toBe('2024-03-05T00:00:00.000Z');
  });

  it('returns null when only one of startDate/endDate is present', () => {
    expect(getRoadmapItemDateBounds({ startDate: '2024-03-01' })).toBeNull();
    expect(getRoadmapItemDateBounds({ endDate: '2024-03-01' })).toBeNull();
  });

  it('returns null when startDate or endDate is not a valid ISO date', () => {
    expect(getRoadmapItemDateBounds({ startDate: 'bogus', endDate: '2024-03-01' })).toBeNull();
    expect(getRoadmapItemDateBounds({ startDate: '2024-03-01', endDate: 'bogus' })).toBeNull();
  });

  it('returns null when the item has neither dueDate nor a startDate/endDate pair', () => {
    expect(getRoadmapItemDateBounds({})).toBeNull();
    expect(getRoadmapItemDateBounds({ title: 'Untitled' })).toBeNull();
  });
});

describe('getRoadmapDatePosition', () => {
  const range = {
    start: parseRoadmapIsoDate('2024-03-01'),
    end: parseRoadmapIsoDate('2024-03-11')
  };

  it('returns 0 when date is not a Date instance', () => {
    expect(getRoadmapDatePosition('2024-03-05', fromAny(range))).toBe(0);
    expect(getRoadmapDatePosition(null, fromAny(range))).toBe(0);
  });

  it('returns 0 for an Invalid Date', () => {
    expect(getRoadmapDatePosition(new Date('bogus'), fromAny(range))).toBe(0);
  });

  it('returns 0 when range is missing start or end', () => {
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), {})).toBe(0);
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), { start: range.start! })).toBe(0);
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), null)).toBe(0);
  });

  it('positions the range start at 0', () => {
    expect(getRoadmapDatePosition(range.start, fromAny(range))).toBe(0);
  });

  it('positions the range end at 100', () => {
    expect(getRoadmapDatePosition(range.end, fromAny(range))).toBe(100);
  });

  it('positions the midpoint at 50 (10-day span)', () => {
    const mid = parseRoadmapIsoDate('2024-03-06');
    expect(getRoadmapDatePosition(mid, fromAny(range))).toBe(50);
  });

  it('clamps a date before range.start to position 0', () => {
    const before = parseRoadmapIsoDate('2024-02-15');
    expect(getRoadmapDatePosition(before, fromAny(range))).toBe(0);
  });

  it('clamps a date after range.end to position 100', () => {
    const after = parseRoadmapIsoDate('2024-04-01');
    expect(getRoadmapDatePosition(after, fromAny(range))).toBe(100);
  });

  it('uses an explicit range.totalDays instead of re-deriving it from start/end', () => {
    const withExplicitTotal = { start: range.start, end: range.end, totalDays: 4 };
    const twoIn = parseRoadmapIsoDate('2024-03-03');
    // offsetDays = getRoadmapDayDiff(start, twoIn) = 2; totalDays = 4 -> 50%.
    expect(getRoadmapDatePosition(twoIn, fromAny(withExplicitTotal))).toBe(50);
  });

  it('treats a zero-day range (start === end) as a single-point range (totalDays floors at 1)', () => {
    const singlePoint = { start: range.start, end: range.start };
    expect(getRoadmapDatePosition(range.start, fromAny(singlePoint))).toBe(0);
  });
});

describe('getRoadmapItemTitle', () => {
  const roadmap = {
    milestones: [{ id: 'm1', title: 'Launch' }, { id: 'm2', title: '' }],
    phases: [{ id: 'p1', title: 'Build' }]
  };

  it('returns the title of the matching item for the given kind', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', 'm1')).toBe('Launch');
    expect(getRoadmapItemTitle(fromAny(roadmap), 'phases', 'p1')).toBe('Build');
  });

  it('returns an empty string for an unrecognized kind', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), fromAny('bogus'), 'm1')).toBe('');
  });

  it('returns an empty string for a blank or non-string refId', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', '')).toBe('');
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', null)).toBe('');
  });

  it('returns an empty string when no item matches refId', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', 'missing')).toBe('');
  });

  it('returns an empty string when the matched item has a falsy title', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', 'm2')).toBe('');
  });

  it('treats a non-array itemsKey value as an empty list', () => {
    expect(getRoadmapItemTitle(fromPartial({ milestones: fromAny(null) }), 'milestones', 'm1')).toBe('');
    expect(getRoadmapItemTitle(fromPartial({}), 'sprints', 's1')).toBe('');
  });

  it('normalizes (trims) refId before matching', () => {
    expect(getRoadmapItemTitle(fromAny(roadmap), 'milestones', '  m1  ')).toBe('Launch');
  });
});

describe('getRoadmapTaskFieldTasks', () => {
  const boardData = {
    board: {
      tasks: [
        { id: 1, milestoneId: 'm1' },
        { id: 2, milestoneId: 'm2' },
        { id: 3, milestoneId: 'm1' },
        null
      ]
    }
  };

  it('returns tasks whose field matches the normalized refId', () => {
    expect(getRoadmapTaskFieldTasks(boardData, 'milestoneId', 'm1')).toEqual([
      { id: 1, milestoneId: 'm1' },
      { id: 3, milestoneId: 'm1' }
    ]);
  });

  it('returns an empty array for a blank or non-string refId', () => {
    expect(getRoadmapTaskFieldTasks(boardData, 'milestoneId', '')).toEqual([]);
    expect(getRoadmapTaskFieldTasks(boardData, 'milestoneId', null)).toEqual([]);
  });

  it('returns an empty array when boardData has no task list', () => {
    expect(getRoadmapTaskFieldTasks({}, 'milestoneId', 'm1')).toEqual([]);
    expect(getRoadmapTaskFieldTasks(null, 'milestoneId', 'm1')).toEqual([]);
  });

  it('skips falsy task entries without throwing', () => {
    expect(getRoadmapTaskFieldTasks(boardData, 'milestoneId', 'nonexistent')).toEqual([]);
  });

  it('normalizes (trims) refId before comparing', () => {
    expect(getRoadmapTaskFieldTasks(boardData, 'milestoneId', '  m2  ')).toEqual([
      { id: 2, milestoneId: 'm2' }
    ]);
  });
});

describe('normalizeRoadmapItems', () => {
  it('returns null for non-array input', () => {
    expect(normalizeRoadmapItems(null, ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems({}, ['dueDate'], ['dueDate'])).toBeNull();
  });

  it('returns an empty array for an empty input array', () => {
    expect(normalizeRoadmapItems([], ['dueDate'], ['dueDate'])).toEqual([]);
  });

  it('normalizes a valid single-date-key item (milestone shape), trimming id and title', () => {
    const result = normalizeRoadmapItems(
      [{ id: '  m1  ', title: '  Launch  ', dueDate: '2024-01-01' }],
      ['dueDate'],
      ['dueDate']
    );
    expect(result).toEqual([{ id: 'm1', title: 'Launch', dueDate: '2024-01-01' }]);
  });

  it('normalizes a valid range-shaped item (phase/sprint shape) with two date keys', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'p1', title: 'Build', startDate: '2024-01-01', endDate: '2024-02-01' }],
      ['startDate', 'endDate'],
      ['startDate', 'endDate']
    );
    expect(result).toEqual([{ id: 'p1', title: 'Build', startDate: '2024-01-01', endDate: '2024-02-01' }]);
  });

  it('preserves input order across multiple valid items', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'a', title: 'A', dueDate: '2024-01-01' }, { id: 'b', title: 'B', dueDate: '2024-02-01' }],
      ['dueDate'],
      ['dueDate']
    );
    expect(result!.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns null when any entry is not a plain object (null, array, or primitive)', () => {
    expect(normalizeRoadmapItems([null], ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems([[]], ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems(['x'], ['dueDate'], ['dueDate'])).toBeNull();
  });

  it('returns null when id or title is missing, blank, or non-string', () => {
    expect(normalizeRoadmapItems([{ title: 'Launch', dueDate: '2024-01-01' }], ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems([{ id: 'm1', dueDate: '2024-01-01' }], ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems([{ id: '  ', title: 'Launch', dueDate: '2024-01-01' }], ['dueDate'], ['dueDate'])).toBeNull();
    expect(normalizeRoadmapItems([{ id: 1, title: 'Launch', dueDate: '2024-01-01' }], ['dueDate'], ['dueDate'])).toBeNull();
  });

  it('returns null when an item has a key outside id/title/dateKeys', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'm1', title: 'Launch', dueDate: '2024-01-01', extra: 'nope' }],
      ['dueDate'],
      ['dueDate']
    );
    expect(result).toBeNull();
  });

  it('returns null on a duplicate id within the list', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'm1', title: 'A', dueDate: '2024-01-01' }, { id: 'm1', title: 'B', dueDate: '2024-02-01' }],
      ['dueDate'],
      ['dueDate']
    );
    expect(result).toBeNull();
  });

  it('returns null when a present date key fails ISO-date normalization', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'm1', title: 'Launch', dueDate: 'not-a-date' }],
      ['dueDate'],
      ['dueDate']
    );
    expect(result).toBeNull();
  });

  it('returns null for an impossible or reversed range', () => {
    expect(normalizeRoadmapItems(
      [{ id: 'p1', title: 'Build', startDate: '2024-02-30', endDate: '2024-03-01' }],
      ['startDate', 'endDate'],
      ['startDate', 'endDate']
    )).toBeNull();
    expect(normalizeRoadmapItems(
      [{ id: 'p1', title: 'Build', startDate: '2024-03-10', endDate: '2024-03-01' }],
      ['startDate', 'endDate'],
      ['startDate', 'endDate']
    )).toBeNull();
  });

  it('returns null when a required date key is absent from the item', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'p1', title: 'Build', startDate: '2024-01-01' }],
      ['startDate', 'endDate'],
      ['startDate', 'endDate']
    );
    expect(result).toBeNull();
  });

  it('omits an optional (non-required) date key entirely when absent from the item', () => {
    const result = normalizeRoadmapItems(
      [{ id: 'm1', title: 'Launch' }],
      ['dueDate'],
      []
    );
    expect(result).toEqual([{ id: 'm1', title: 'Launch' }]);
  });
});

describe('compareRoadmapItemsByDate', () => {
  it('sorts by start date when both items have bounds and different starts', () => {
    const earlier = { title: 'Earlier', dueDate: '2024-01-01' };
    const later = { title: 'Later', dueDate: '2024-02-01' };
    expect(compareRoadmapItemsByDate(earlier, later)).toBeLessThan(0);
    expect(compareRoadmapItemsByDate(later, earlier)).toBeGreaterThan(0);
  });

  it('breaks a tied start date by end date', () => {
    const shorter = { title: 'Shorter', startDate: '2024-01-01', endDate: '2024-01-05' };
    const longer = { title: 'Longer', startDate: '2024-01-01', endDate: '2024-01-10' };
    expect(compareRoadmapItemsByDate(shorter, longer)).toBeLessThan(0);
  });

  it('returns 0 for two items with identical bounds and identical titles', () => {
    const a = { title: 'Same', dueDate: '2024-03-01' };
    const b = { title: 'Same', dueDate: '2024-03-01' };
    expect(compareRoadmapItemsByDate(a, b)).toBe(0);
  });

  it('falls back to title comparison when both items have identical bounds but different titles', () => {
    const a = { title: 'Alpha', dueDate: '2024-03-01' };
    const b = { title: 'Beta', dueDate: '2024-03-01' };
    expect(compareRoadmapItemsByDate(a, b)).toBeLessThan(0);
  });

  it('orders an item with bounds before an item with no date bounds', () => {
    const withDate = { title: 'Zzz', dueDate: '2024-01-01' };
    const withoutDate = { title: 'Aaa' };
    expect(compareRoadmapItemsByDate(withDate, withoutDate)).toBe(-1);
    expect(compareRoadmapItemsByDate(withoutDate, withDate)).toBe(1);
  });

  it('falls back to title comparison (localeCompare) when neither item has date bounds', () => {
    expect(compareRoadmapItemsByDate({ title: 'Aaa' }, { title: 'Bbb' })).toBeLessThan(0);
    expect(compareRoadmapItemsByDate({}, {})).toBe(0);
  });

  it('treats a missing title as an empty string for the fallback comparison', () => {
    expect(compareRoadmapItemsByDate({}, { title: 'Aaa' })).toBeLessThan(0);
  });
});

describe('getRoadmapAxisTicks', () => {
  it('returns an empty array when range.start or range.end is missing', () => {
    expect(getRoadmapAxisTicks(null)).toEqual([]);
    expect(getRoadmapAxisTicks({})).toEqual([]);
    expect(getRoadmapAxisTicks({ start: parseRoadmapIsoDate('2024-01-01')! })).toEqual([]);
  });

  it('produces two boundary ticks (0% and 100%) for a zero-length range', () => {
    const point = parseRoadmapIsoDate('2024-06-15');
    const ticks = getRoadmapAxisTicks({ start: point!, end: point! });
    expect(ticks).toEqual([
      { label: 'Jun 15', position: 0 },
      { label: 'Jun 16', position: 100 }
    ]);
  });

  it('treats an inverted range (end before start) the same as a zero-length range, since day-diff clamps to 0', () => {
    const start = parseRoadmapIsoDate('2024-06-20')!;
    const end = parseRoadmapIsoDate('2024-06-10')!;
    const ticks = getRoadmapAxisTicks({ start, end });
    expect(ticks).toEqual([
      { label: 'Jun 20', position: 0 },
      { label: 'Jun 21', position: 100 }
    ]);
  });

  it('caps at 5 evenly spaced ticks for a wide range', () => {
    const start = parseRoadmapIsoDate('2024-01-01')!;
    const end = parseRoadmapIsoDate('2024-06-01')!;
    const ticks = getRoadmapAxisTicks({ start, end });
    expect(ticks.length).toBe(5);
    expect(ticks[0]).toEqual({ label: 'Jan 01', position: 0 });
    expect(ticks[ticks.length - 1].position).toBe(100);
  });

  it('skips a tick whose formatted label duplicates an earlier tick (a range spanning exactly one year)', () => {
    // 2023 is not a leap year, so start + 365 days lands on the same
    // month/day one year later -- the 5th tick's "Jan 01" label collides
    // with the 1st tick's, so it is skipped and only 4 ticks are returned.
    const start = parseRoadmapIsoDate('2023-01-01')!;
    const end = parseRoadmapIsoDate('2024-01-01')!;
    const ticks = getRoadmapAxisTicks({ start, end, totalDays: getRoadmapDayDiff(start, end) });
    expect(ticks).toEqual([
      { label: 'Jan 01', position: 0 },
      { label: 'Apr 02', position: 24.93150684931507 },
      { label: 'Jul 03', position: 50.136986301369866 },
      { label: 'Oct 02', position: 75.06849315068493 }
    ]);
  });
});

describe('getRoadmapTimelinePlacement', () => {
  const range = { start: parseRoadmapIsoDate('2024-06-01'), end: parseRoadmapIsoDate('2024-06-30'), totalDays: 29 };

  it('returns null when the item has no resolvable date bounds', () => {
    expect(getRoadmapTimelinePlacement({}, fromAny(range))).toBeNull();
    expect(getRoadmapTimelinePlacement(null, fromAny(range))).toBeNull();
  });

  it('returns null when range.start or range.end is missing', () => {
    expect(getRoadmapTimelinePlacement({ dueDate: '2024-06-05' }, {})).toBeNull();
    expect(getRoadmapTimelinePlacement({ dueDate: '2024-06-05' }, null)).toBeNull();
  });

  it('gives a point item (dueDate) zero width, placed at its date position', () => {
    const placement = getRoadmapTimelinePlacement({ dueDate: '2024-06-15' }, fromAny(range));
    expect(placement!.width).toBe(0);
    expect(placement!.point).toBeCloseTo(48.275862068965516);
    expect(placement!.left).toBeCloseTo(48.275862068965516);
  });

  it('spans the full range (left 0, width 100) for an item covering the whole range', () => {
    const placement = getRoadmapTimelinePlacement({ startDate: '2024-06-01', endDate: '2024-06-30' }, fromAny(range));
    expect(placement).toEqual({ left: 0, width: 100, point: 100 });
  });

  it('clamps a point item sitting exactly at the range start to left 0, width 0', () => {
    const placement = getRoadmapTimelinePlacement({ dueDate: '2024-06-01' }, fromAny(range));
    expect(placement).toEqual({ left: 0, width: 0, point: 0 });
  });

  it('clamps a point item sitting exactly at the range end to left 100, width 0', () => {
    const placement = getRoadmapTimelinePlacement({ dueDate: '2024-06-30' }, fromAny(range));
    expect(placement).toEqual({ left: 100, width: 0, point: 100 });
  });

  it('clamps an item entirely before the range start to left 0, width 0', () => {
    const placement = getRoadmapTimelinePlacement({ dueDate: '2024-05-01' }, fromAny(range));
    expect(placement).toEqual({ left: 0, width: 0, point: 0 });
  });
});

describe('getRoadmapTodayMarker', () => {
  it('returns null when range.start or range.end is missing', () => {
    expect(getRoadmapTodayMarker(null)).toBeNull();
    expect(getRoadmapTodayMarker({})).toBeNull();
    expect(getRoadmapTodayMarker({ start: parseRoadmapIsoDate('2024-01-01')! })).toBeNull();
  });

  it('returns a marker with the current position when today falls inside the range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      const range = { start: parseRoadmapIsoDate('2024-06-14'), end: parseRoadmapIsoDate('2024-06-20') };
      expect(getRoadmapTodayMarker(fromAny(range))).toEqual({
        iso: '2024-06-15',
        position: 16.666666666666664
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('places the marker at position 0 when today equals range.start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      const range = { start: parseRoadmapIsoDate('2024-06-15'), end: parseRoadmapIsoDate('2024-06-20') };
      expect(getRoadmapTodayMarker(fromAny(range))).toEqual({ iso: '2024-06-15', position: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('places the marker at position 100 when today equals range.end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      const range = { start: parseRoadmapIsoDate('2024-06-10'), end: parseRoadmapIsoDate('2024-06-15') };
      expect(getRoadmapTodayMarker(fromAny(range))).toEqual({ iso: '2024-06-15', position: 100 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when today falls before the visible range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 1, 10, 0, 0));
    try {
      const range = { start: parseRoadmapIsoDate('2024-06-10'), end: parseRoadmapIsoDate('2024-06-20') };
      expect(getRoadmapTodayMarker(fromAny(range))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when today falls after the visible range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 6, 1, 10, 0, 0));
    try {
      const range = { start: parseRoadmapIsoDate('2024-06-10'), end: parseRoadmapIsoDate('2024-06-20') };
      expect(getRoadmapTodayMarker(fromAny(range))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getVisibleRoadmapDateRange', () => {
  it('falls back to a 14-day range centered on today when there are no items at all', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      const range = getVisibleRoadmapDateRange(fromPartial({}));
      expect(range.start).toEqual(parseRoadmapIsoDate('2024-06-08'));
      expect(range.end).toEqual(parseRoadmapIsoDate('2024-06-22'));
      expect(range.totalDays).toBe(14);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the same empty-range default for a null/undefined roadmap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 10, 0, 0));
    try {
      expect(getVisibleRoadmapDateRange(null)).toEqual(getVisibleRoadmapDateRange(undefined));
    } finally {
      vi.useRealTimers();
    }
  });

  it('widens a single-day range (one item, dueDate) by one day on each side', () => {
    const roadmap = { milestones: [{ id: 'm1', title: 'Launch', dueDate: '2024-06-15' }] };
    const range = getVisibleRoadmapDateRange(fromAny(roadmap));
    expect(range.start).toEqual(parseRoadmapIsoDate('2024-06-14'));
    expect(range.end).toEqual(parseRoadmapIsoDate('2024-06-16'));
    expect(range.totalDays).toBe(2);
  });

  it('does not widen a single item that already spans more than one day', () => {
    const roadmap = { phases: [{ id: 'p1', title: 'Phase 1', startDate: '2024-06-01', endDate: '2024-06-10' }] };
    const range = getVisibleRoadmapDateRange(fromAny(roadmap));
    expect(range.start).toEqual(parseRoadmapIsoDate('2024-06-01'));
    expect(range.end).toEqual(parseRoadmapIsoDate('2024-06-10'));
    expect(range.totalDays).toBe(9);
  });

  it('spans the min start to the max end across milestones, phases, and sprints', () => {
    const roadmap = {
      milestones: [{ id: 'm1', title: 'M', dueDate: '2024-01-10' }],
      phases: [{ id: 'p1', title: 'P', startDate: '2024-02-01', endDate: '2024-02-20' }],
      sprints: [{ id: 's1', title: 'S', startDate: '2024-06-01', endDate: '2024-06-14' }]
    };
    const range = getVisibleRoadmapDateRange(fromAny(roadmap));
    expect(range.start).toEqual(parseRoadmapIsoDate('2024-01-10'));
    expect(range.end).toEqual(parseRoadmapIsoDate('2024-06-14'));
    expect(range.totalDays).toBe(
      getRoadmapDayDiff(parseRoadmapIsoDate('2024-01-10'), parseRoadmapIsoDate('2024-06-14'))
    );
  });

  it('ignores items whose bounds cannot be resolved (e.g. malformed dates)', () => {
    const roadmap = {
      milestones: [{ id: 'm1', title: 'Bad' }],
      phases: [{ id: 'p1', title: 'Good', startDate: '2024-03-01', endDate: '2024-03-05' }]
    };
    const range = getVisibleRoadmapDateRange(fromAny(roadmap));
    expect(range.start).toEqual(parseRoadmapIsoDate('2024-03-01'));
    expect(range.end).toEqual(parseRoadmapIsoDate('2024-03-05'));
  });
});

describe('normalizeRoadmapExtension', () => {
  it('returns null for non-object input', () => {
    expect(normalizeRoadmapExtension(null)).toBeNull();
    expect(normalizeRoadmapExtension(undefined)).toBeNull();
    expect(normalizeRoadmapExtension('nope')).toBeNull();
  });

  it('returns null for an array, even though typeof is object', () => {
    expect(normalizeRoadmapExtension([])).toBeNull();
  });

  it('returns null when version does not match ROADMAP_VERSION', () => {
    const value = { version: ROADMAP_VERSION + 1, milestones: [], phases: [], sprints: [] };
    expect(normalizeRoadmapExtension(value)).toBeNull();
  });

  it('returns null when a required top-level key is missing', () => {
    const value = { version: ROADMAP_VERSION, milestones: [], phases: [] };
    expect(normalizeRoadmapExtension(value)).toBeNull();
  });

  it('returns null when there is an unexpected extra top-level key', () => {
    const value = { version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [], extra: true };
    expect(normalizeRoadmapExtension(value)).toBeNull();
  });

  it('returns null when milestones contains an invalid item (missing dueDate)', () => {
    const value = {
      version: ROADMAP_VERSION,
      milestones: [{ id: 'm1', title: 'Launch' }],
      phases: [],
      sprints: []
    };
    expect(normalizeRoadmapExtension(value)).toBeNull();
  });

  it('returns null when phases contains an invalid item (missing endDate)', () => {
    const value = {
      version: ROADMAP_VERSION,
      milestones: [],
      phases: [{ id: 'p1', title: 'Phase 1', startDate: '2024-01-01' }],
      sprints: []
    };
    expect(normalizeRoadmapExtension(value)).toBeNull();
  });

  it('normalizes and stamps ROADMAP_VERSION for a valid extension', () => {
    const value = {
      version: ROADMAP_VERSION,
      milestones: [{ id: 'm1', title: 'Launch', dueDate: '2024-06-15' }],
      phases: [{ id: 'p1', title: 'Phase 1', startDate: '2024-01-01', endDate: '2024-02-01' }],
      sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14' }]
    };
    expect(normalizeRoadmapExtension(value)).toEqual({
      version: ROADMAP_VERSION,
      milestones: [{ id: 'm1', title: 'Launch', dueDate: '2024-06-15' }],
      phases: [{ id: 'p1', title: 'Phase 1', startDate: '2024-01-01', endDate: '2024-02-01' }],
      sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14' }]
    });
  });

  it('accepts a version value coercible to the expected number (e.g. a numeric string)', () => {
    const value = { version: String(ROADMAP_VERSION), milestones: [], phases: [], sprints: [] };
    const result = normalizeRoadmapExtension(value);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(ROADMAP_VERSION);
  });
});

const VALID_ROADMAP = {
  version: ROADMAP_VERSION,
  milestones: [{ id: 'm1', title: 'Launch', dueDate: '2024-06-15' }],
  phases: [{ id: 'p1', title: 'Phase 1', startDate: '2024-01-01', endDate: '2024-02-01' }],
  sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14' }]
};

describe('clearInvalidRoadmapTaskRefs', () => {
  it('returns non-object input unchanged (including null and arrays)', () => {
    expect(clearInvalidRoadmapTaskRefs(null as any, VALID_ROADMAP)).toBeNull();
    expect(clearInvalidRoadmapTaskRefs(undefined as any, VALID_ROADMAP)).toBeUndefined();
    const arr: unknown[] = [];
    expect(clearInvalidRoadmapTaskRefs(arr as any, VALID_ROADMAP)).toBe(arr);
  });

  it('returns the task unchanged when the roadmap itself does not normalize', () => {
    const task = { phaseId: 'p1', milestoneId: 'm1', sprintId: 's1' };
    expect(clearInvalidRoadmapTaskRefs(task, null)).toBe(task);
    expect(task).toEqual({ phaseId: 'p1', milestoneId: 'm1', sprintId: 's1' });
  });

  it('keeps refs that point at existing roadmap entities', () => {
    const task = { phaseId: 'p1', milestoneId: 'm1', sprintId: 's1' };
    const result = clearInvalidRoadmapTaskRefs(task, VALID_ROADMAP);
    expect(result).toBe(task);
    expect(result).toEqual({ phaseId: 'p1', milestoneId: 'm1', sprintId: 's1' });
  });

  it('clears each ref that points at a roadmap entity that no longer exists', () => {
    const task = { phaseId: 'gone-phase', milestoneId: 'gone-milestone', sprintId: 'gone-sprint' };
    const result = clearInvalidRoadmapTaskRefs(task, VALID_ROADMAP);
    expect(result).toEqual({ phaseId: '', milestoneId: '', sprintId: '' });
  });

  it('clears only the invalid ref, leaving valid refs on sibling fields intact', () => {
    const task = { phaseId: 'p1', milestoneId: 'gone-milestone', sprintId: 's1' };
    const result = clearInvalidRoadmapTaskRefs(task, VALID_ROADMAP);
    expect(result).toEqual({ phaseId: 'p1', milestoneId: '', sprintId: 's1' });
  });

  it('leaves an already-empty ref alone rather than touching it', () => {
    const task = { phaseId: '', milestoneId: 'm1', sprintId: '' };
    const result = clearInvalidRoadmapTaskRefs(task, VALID_ROADMAP);
    expect(result).toEqual({ phaseId: '', milestoneId: 'm1', sprintId: '' });
  });

  it('mutates and returns the same object reference', () => {
    const task = { phaseId: 'gone' };
    const result = clearInvalidRoadmapTaskRefs(task, VALID_ROADMAP);
    expect(result).toBe(task);
  });
});

describe('getRoadmapExtension', () => {
  it('returns null when boardData has no extensions', () => {
    expect(getRoadmapExtension({})).toBeNull();
    expect(getRoadmapExtension(null)).toBeNull();
    expect(getRoadmapExtension(undefined)).toBeNull();
  });

  it('returns null when extensions has no roadmap key', () => {
    expect(getRoadmapExtension({ extensions: {} })).toBeNull();
  });

  it('returns the normalized roadmap extension when present and valid', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: VALID_ROADMAP } };
    expect(getRoadmapExtension(boardData)).toEqual(VALID_ROADMAP);
  });

  it('returns null when the stored roadmap extension is malformed', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: { version: ROADMAP_VERSION, milestones: [] } } };
    expect(getRoadmapExtension(boardData)).toBeNull();
  });
});

describe('getRoadmapExtensionObject', () => {
  it('returns null for non-object boardData without create', () => {
    expect(getRoadmapExtensionObject(null)).toBeNull();
    expect(getRoadmapExtensionObject(fromAny('nope'))).toBeNull();
  });

  it('returns null when there are no extensions and create is not requested', () => {
    expect(getRoadmapExtensionObject({})).toBeNull();
  });

  it('returns the normalized roadmap extension in place when present and valid, without create', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: VALID_ROADMAP } };
    const result = getRoadmapExtensionObject(boardData);
    expect(result).toEqual(VALID_ROADMAP);
    expect(boardData.extensions[ROADMAP_EXTENSION_KEY]).toBe(result);
  });

  it('returns null when the stored roadmap extension is malformed and create is not requested', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: { bogus: true } } };
    expect(getRoadmapExtensionObject(boardData)).toBeNull();
  });

  it('builds the extensions chain and creates an empty roadmap extension when create is true and nothing exists', () => {
    const boardData: any = {};
    const result = getRoadmapExtensionObject(boardData, { create: true });
    expect(result).toEqual({ version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [] });
    expect(boardData.extensions[ROADMAP_EXTENSION_KEY]).toBe(result);
  });

  it('replaces a malformed roadmap extension with an empty one when create is true', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: { bogus: true } } };
    const result = getRoadmapExtensionObject(boardData, { create: true });
    expect(result).toEqual({ version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [] });
  });

  it('does not touch an already-valid roadmap extension when create is true', () => {
    const boardData = { extensions: { [ROADMAP_EXTENSION_KEY]: VALID_ROADMAP } };
    const result = getRoadmapExtensionObject(boardData, { create: true });
    expect(result).toEqual(VALID_ROADMAP);
  });
});
