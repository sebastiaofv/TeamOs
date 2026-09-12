import { describe, it, expect } from 'vitest';
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
  normalizeRoadmapItems
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

describe('getRoadmapItemDateBounds', () => {
  it('returns null for non-object or nullish input', () => {
    expect(getRoadmapItemDateBounds(null)).toBeNull();
    expect(getRoadmapItemDateBounds(undefined)).toBeNull();
    expect(getRoadmapItemDateBounds('2024-01-01')).toBeNull();
  });

  it('treats dueDate as a single-point bound (start === end)', () => {
    const result = getRoadmapItemDateBounds({ dueDate: '2024-03-15' });
    expect(result.start).toEqual(result.end);
    expect(result.start.toISOString()).toBe('2024-03-15T00:00:00.000Z');
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
    expect(result.start.toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('builds a range from startDate/endDate when already in order', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-01', endDate: '2024-03-10' });
    expect(result.start.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2024-03-10T00:00:00.000Z');
  });

  it('swaps startDate/endDate when start is after end', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-10', endDate: '2024-03-01' });
    expect(result.start.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2024-03-10T00:00:00.000Z');
  });

  it('returns a degenerate single-point range when startDate and endDate are equal', () => {
    const result = getRoadmapItemDateBounds({ startDate: '2024-03-05', endDate: '2024-03-05' });
    expect(result.start.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2024-03-05T00:00:00.000Z');
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
    expect(getRoadmapDatePosition('2024-03-05', range)).toBe(0);
    expect(getRoadmapDatePosition(null, range)).toBe(0);
  });

  it('returns 0 for an Invalid Date', () => {
    expect(getRoadmapDatePosition(new Date('bogus'), range)).toBe(0);
  });

  it('returns 0 when range is missing start or end', () => {
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), {})).toBe(0);
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), { start: range.start })).toBe(0);
    expect(getRoadmapDatePosition(parseRoadmapIsoDate('2024-03-05'), null)).toBe(0);
  });

  it('positions the range start at 0', () => {
    expect(getRoadmapDatePosition(range.start, range)).toBe(0);
  });

  it('positions the range end at 100', () => {
    expect(getRoadmapDatePosition(range.end, range)).toBe(100);
  });

  it('positions the midpoint at 50 (10-day span)', () => {
    const mid = parseRoadmapIsoDate('2024-03-06');
    expect(getRoadmapDatePosition(mid, range)).toBe(50);
  });

  it('clamps a date before range.start to position 0', () => {
    const before = parseRoadmapIsoDate('2024-02-15');
    expect(getRoadmapDatePosition(before, range)).toBe(0);
  });

  it('clamps a date after range.end to position 100', () => {
    const after = parseRoadmapIsoDate('2024-04-01');
    expect(getRoadmapDatePosition(after, range)).toBe(100);
  });

  it('uses an explicit range.totalDays instead of re-deriving it from start/end', () => {
    const withExplicitTotal = { start: range.start, end: range.end, totalDays: 4 };
    const twoIn = parseRoadmapIsoDate('2024-03-03');
    // offsetDays = getRoadmapDayDiff(start, twoIn) = 2; totalDays = 4 -> 50%.
    expect(getRoadmapDatePosition(twoIn, withExplicitTotal)).toBe(50);
  });

  it('treats a zero-day range (start === end) as a single-point range (totalDays floors at 1)', () => {
    const singlePoint = { start: range.start, end: range.start };
    expect(getRoadmapDatePosition(range.start, singlePoint)).toBe(0);
  });
});

describe('getRoadmapItemTitle', () => {
  const roadmap = {
    milestones: [{ id: 'm1', title: 'Launch' }, { id: 'm2', title: '' }],
    phases: [{ id: 'p1', title: 'Build' }]
  };

  it('returns the title of the matching item for the given kind', () => {
    expect(getRoadmapItemTitle(roadmap, 'milestones', 'm1')).toBe('Launch');
    expect(getRoadmapItemTitle(roadmap, 'phases', 'p1')).toBe('Build');
  });

  it('returns an empty string for an unrecognized kind', () => {
    expect(getRoadmapItemTitle(roadmap, 'bogus', 'm1')).toBe('');
  });

  it('returns an empty string for a blank or non-string refId', () => {
    expect(getRoadmapItemTitle(roadmap, 'milestones', '')).toBe('');
    expect(getRoadmapItemTitle(roadmap, 'milestones', null)).toBe('');
  });

  it('returns an empty string when no item matches refId', () => {
    expect(getRoadmapItemTitle(roadmap, 'milestones', 'missing')).toBe('');
  });

  it('returns an empty string when the matched item has a falsy title', () => {
    expect(getRoadmapItemTitle(roadmap, 'milestones', 'm2')).toBe('');
  });

  it('treats a non-array itemsKey value as an empty list', () => {
    expect(getRoadmapItemTitle({ milestones: null }, 'milestones', 'm1')).toBe('');
    expect(getRoadmapItemTitle({}, 'sprints', 's1')).toBe('');
  });

  it('normalizes (trims) refId before matching', () => {
    expect(getRoadmapItemTitle(roadmap, 'milestones', '  m1  ')).toBe('Launch');
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
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
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
