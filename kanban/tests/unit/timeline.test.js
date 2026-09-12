import { describe, it, expect } from 'vitest';
import {
  createEmptyTimelineData,
  createTimelineEventId,
  formatTimelineValue,
  buildTaskTimelineChanges,
  normalizeTimelineChanges
} from '../../src/domain/timeline.js';
import { TIMELINE_VERSION } from '../../src/domain/constants.js';

describe('createEmptyTimelineData', () => {
  it('returns a fresh empty timeline shape at the current version', () => {
    expect(createEmptyTimelineData()).toEqual({
      version: TIMELINE_VERSION,
      baselineEventId: '',
      events: []
    });
  });

  it('returns a new object/array each call, not a shared reference', () => {
    const a = createEmptyTimelineData();
    const b = createEmptyTimelineData();
    expect(a).not.toBe(b);
    expect(a.events).not.toBe(b.events);
    a.events.push('x');
    expect(b.events).toEqual([]);
  });
});

describe('createTimelineEventId', () => {
  it('matches the evt_<timestamp>_<random> shape', () => {
    expect(createTimelineEventId()).toMatch(/^evt_\d+_[0-9a-z]{1,6}$/);
  });

  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createTimelineEventId()));
    expect(ids.size).toBe(200);
  });
});

describe('formatTimelineValue', () => {
  it('renders undefined as (unset)', () => {
    expect(formatTimelineValue(undefined)).toBe('(unset)');
  });

  it('renders null as the literal string "null"', () => {
    expect(formatTimelineValue(null)).toBe('null');
  });

  it('renders an empty string as (empty)', () => {
    expect(formatTimelineValue('')).toBe('(empty)');
  });

  it('renders a non-empty string as-is', () => {
    expect(formatTimelineValue('In Progress')).toBe('In Progress');
  });

  it('stringifies numbers, including 0', () => {
    expect(formatTimelineValue(0)).toBe('0');
    expect(formatTimelineValue(42)).toBe('42');
  });

  it('stringifies booleans, including false', () => {
    expect(formatTimelineValue(false)).toBe('false');
    expect(formatTimelineValue(true)).toBe('true');
  });

  it('pretty-prints objects and arrays via JSON.stringify(value, null, 2)', () => {
    expect(formatTimelineValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
    expect(formatTimelineValue(['x', 'y'])).toBe(JSON.stringify(['x', 'y'], null, 2));
  });
});

describe('buildTaskTimelineChanges', () => {
  it('returns null when there are no differences between the two tasks', () => {
    const task = { title: 'Ship it', status: 'doing', tags: ['a'] };
    expect(buildTaskTimelineChanges(task, { ...task, tags: ['a'] })).toBeNull();
  });

  it('returns null when both tasks are null/undefined', () => {
    expect(buildTaskTimelineChanges(null, undefined)).toBeNull();
  });

  it('reports a single changed field as {before, after}', () => {
    const before = { title: 'Old title', status: 'doing' };
    const after = { title: 'New title', status: 'doing' };
    expect(buildTaskTimelineChanges(before, after)).toEqual({
      title: { before: 'Old title', after: 'New title' }
    });
  });

  it('reports every field that differs when multiple fields change', () => {
    const before = { title: 'A', status: 'doing', priority: 'low' };
    const after = { title: 'B', status: 'done', priority: 'low' };
    expect(buildTaskTimelineChanges(before, after)).toEqual({
      title: { before: 'A', after: 'B' },
      status: { before: 'doing', after: 'done' }
    });
  });

  it('only inspects the fixed field list, ignoring unlisted fields like id/createdAt', () => {
    const before = { id: 1, createdAt: '2024-01-01', title: 'Same' };
    const after = { id: 2, createdAt: '2024-02-02', title: 'Same' };
    expect(buildTaskTimelineChanges(before, after)).toBeNull();
  });

  it('compares nested array values by content, not by reference', () => {
    const before = { assignees: ['Ada', 'Grace'] };
    const after = { assignees: ['Ada', 'Grace'] };
    expect(buildTaskTimelineChanges(before, after)).toBeNull();
  });

  it('treats a different element order in an array field as a change', () => {
    const before = { tags: ['a', 'b'] };
    const after = { tags: ['b', 'a'] };
    expect(buildTaskTimelineChanges(before, after)).toEqual({
      tags: { before: ['a', 'b'], after: ['b', 'a'] }
    });
  });

  it('treats differing key order within an object field as a change (JSON.stringify is key-order sensitive)', () => {
    const before = { checklist: [{ text: 'a', done: false }] };
    const after = { checklist: [{ done: false, text: 'a' }] };
    expect(buildTaskTimelineChanges(before, after)).toEqual({
      checklist: {
        before: [{ text: 'a', done: false }],
        after: [{ done: false, text: 'a' }]
      }
    });
  });

  it('deep-clones before/after values so later mutation of the source task does not affect the result', () => {
    const before = { checklist: [{ text: 'a', done: false }] };
    const after = { checklist: [{ text: 'a', done: true }] };
    const changes = buildTaskTimelineChanges(before, after);
    after.checklist[0].done = false;
    expect(changes.checklist.after).toEqual([{ text: 'a', done: true }]);
  });

  it('treats a missing field on one side as undefined and reports the change', () => {
    const before = {};
    const after = { blocked: true };
    expect(buildTaskTimelineChanges(before, after)).toEqual({
      blocked: { before: undefined, after: true }
    });
  });
});

describe('normalizeTimelineChanges', () => {
  it('returns null for non-object input', () => {
    expect(normalizeTimelineChanges(null)).toBeNull();
    expect(normalizeTimelineChanges(undefined)).toBeNull();
    expect(normalizeTimelineChanges('x')).toBeNull();
    expect(normalizeTimelineChanges(42)).toBeNull();
  });

  it('returns null for an array', () => {
    expect(normalizeTimelineChanges([])).toBeNull();
  });

  it('returns null for an empty object', () => {
    expect(normalizeTimelineChanges({})).toBeNull();
  });

  it('returns null when a field value is not an object (missing before/after shape)', () => {
    expect(normalizeTimelineChanges({ title: 'not an object' })).toBeNull();
  });

  it('returns null when a field value is an array instead of a {before, after} object', () => {
    expect(normalizeTimelineChanges({ title: ['before', 'after'] })).toBeNull();
  });

  it('returns null when a field value is missing the "before" key', () => {
    expect(normalizeTimelineChanges({ title: { after: 'New' } })).toBeNull();
  });

  it('returns null when a field value is missing the "after" key', () => {
    expect(normalizeTimelineChanges({ title: { before: 'Old' } })).toBeNull();
  });

  it('normalizes a well-formed single-field change, cloning before/after', () => {
    expect(normalizeTimelineChanges({ title: { before: 'Old', after: 'New' } })).toEqual({
      title: { before: 'Old', after: 'New' }
    });
  });

  it('normalizes multiple fields at once', () => {
    const input = {
      title: { before: 'Old', after: 'New' },
      status: { before: 'doing', after: 'done' }
    };
    expect(normalizeTimelineChanges(input)).toEqual(input);
  });

  it('preserves explicit undefined/null before or after values', () => {
    expect(normalizeTimelineChanges({ blocked: { before: undefined, after: true } })).toEqual({
      blocked: { before: undefined, after: true }
    });
    expect(normalizeTimelineChanges({ dueDate: { before: '2024-01-01', after: null } })).toEqual({
      dueDate: { before: '2024-01-01', after: null }
    });
  });

  it('deep-clones nested before/after values rather than aliasing the input', () => {
    const nested = { text: 'a', done: false };
    const input = { checklist: { before: [nested], after: [] } };
    const result = normalizeTimelineChanges(input);
    nested.done = true;
    expect(result.checklist.before).toEqual([{ text: 'a', done: false }]);
  });
});
