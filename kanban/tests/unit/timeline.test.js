import { describe, it, expect } from 'vitest';
import {
  createEmptyTimelineData,
  createTimelineEventId,
  formatTimelineValue,
  buildTaskTimelineChanges,
  normalizeTimelineChanges,
  buildTaskTimelineEvent,
  normalizeTimelineEvent
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

describe('buildTaskTimelineEvent', () => {
  it('returns null when both beforeTask and afterTask are absent', () => {
    expect(buildTaskTimelineEvent(null, undefined)).toBeNull();
    expect(buildTaskTimelineEvent(undefined, null)).toBeNull();
  });

  it('returns a task.created event with a snapshot when there is no beforeTask', () => {
    const afterTask = { id: 5, title: 'Ship it', status: 'to-do' };
    const event = buildTaskTimelineEvent(null, afterTask);
    expect(event).toEqual({
      kind: 'task.created',
      entityType: 'task',
      entityId: '5',
      summary: 'Task created: Ship it',
      snapshot: afterTask
    });
  });

  it('falls back to "Task <id>" in the summary when the created task has a blank title', () => {
    const afterTask = { id: 7, title: '   ' };
    const event = buildTaskTimelineEvent(null, afterTask);
    expect(event.summary).toBe('Task created: Task 7');
  });

  it('deep-clones the snapshot on task.created so later mutation of afterTask does not affect it', () => {
    const afterTask = { id: 5, title: 'Ship it', checklist: [{ text: 'a', done: false }] };
    const event = buildTaskTimelineEvent(null, afterTask);
    afterTask.checklist[0].done = true;
    expect(event.snapshot.checklist).toEqual([{ text: 'a', done: false }]);
  });

  it('returns a task.deleted event with a snapshot when there is no afterTask', () => {
    const beforeTask = { id: 9, title: 'Old task', status: 'done' };
    const event = buildTaskTimelineEvent(beforeTask, null);
    expect(event).toEqual({
      kind: 'task.deleted',
      entityType: 'task',
      entityId: '9',
      summary: 'Task deleted: Old task',
      snapshot: beforeTask
    });
  });

  it('returns null when both tasks are present but nothing tracked has changed', () => {
    const task = { id: 1, title: 'Same', status: 'doing' };
    expect(buildTaskTimelineEvent(task, { ...task })).toBeNull();
  });

  it('returns a task.archived event when archived is the only changed field and it became true', () => {
    const before = { id: 3, title: 'Widget', archived: false };
    const after = { id: 3, title: 'Widget', archived: true };
    expect(buildTaskTimelineEvent(before, after)).toEqual({
      kind: 'task.archived',
      entityType: 'task',
      entityId: '3',
      summary: 'Task archived: Widget',
      changes: { archived: { before: false, after: true } }
    });
  });

  it('returns a task.restored event when archived is the only changed field and it became false', () => {
    const before = { id: 3, title: 'Widget', archived: true };
    const after = { id: 3, title: 'Widget', archived: false };
    expect(buildTaskTimelineEvent(before, after)).toEqual({
      kind: 'task.restored',
      entityType: 'task',
      entityId: '3',
      summary: 'Task restored: Widget',
      changes: { archived: { before: true, after: false } }
    });
  });

  it('returns a task.status.changed event when status is the only changed field', () => {
    const before = { id: 4, title: 'Widget', status: 'doing' };
    const after = { id: 4, title: 'Widget', status: 'done' };
    expect(buildTaskTimelineEvent(before, after)).toEqual({
      kind: 'task.status.changed',
      entityType: 'task',
      entityId: '4',
      summary: 'Status changed: Widget',
      changes: { status: { before: 'doing', after: 'done' } }
    });
  });

  it('returns a generic task.updated event for a single changed field other than archived/status', () => {
    const before = { id: 6, title: 'Old title', status: 'doing' };
    const after = { id: 6, title: 'New title', status: 'doing' };
    expect(buildTaskTimelineEvent(before, after)).toEqual({
      kind: 'task.updated',
      entityType: 'task',
      entityId: '6',
      summary: 'Task updated: New title',
      changes: { title: { before: 'Old title', after: 'New title' } }
    });
  });

  it('returns a generic task.updated event when multiple fields change at once, even including archived or status', () => {
    const before = { id: 8, title: 'A', status: 'doing', archived: false };
    const after = { id: 8, title: 'B', status: 'done', archived: true };
    const event = buildTaskTimelineEvent(before, after);
    expect(event.kind).toBe('task.updated');
    expect(event.summary).toBe('Task updated: B');
    expect(Object.keys(event.changes).sort()).toEqual(['archived', 'status', 'title']);
  });

  it('falls back the summary title to "Task <id>" when the (unchanged) title is blank on both sides', () => {
    const before = { id: 2, title: '', status: 'doing' };
    const after = { id: 2, title: '', status: 'done' };
    // title is blank on both sides, so it is not itself a changed field --
    // only status changes, keeping this on the task.status.changed branch --
    // but taskTitle (derived from taskRef = afterTask) still falls back to
    // "Task <id>" since afterTask.title is blank.
    expect(buildTaskTimelineEvent(before, after).summary).toBe('Status changed: Task 2');
  });
});

describe('normalizeTimelineEvent', () => {
  const baseValid = {
    id: 'evt_1',
    at: '2024-03-01T00:00:00.000Z',
    kind: 'task.created',
    entityType: 'task',
    entityId: '42'
  };

  it('returns null for non-object input', () => {
    expect(normalizeTimelineEvent(null)).toBeNull();
    expect(normalizeTimelineEvent(undefined)).toBeNull();
    expect(normalizeTimelineEvent('nope')).toBeNull();
  });

  it('returns null for an array, even though typeof is object', () => {
    expect(normalizeTimelineEvent([])).toBeNull();
  });

  it('returns null when id is missing or blank', () => {
    expect(normalizeTimelineEvent({ ...baseValid, id: undefined })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, id: '   ' })).toBeNull();
  });

  it('returns null when at is missing or an unparseable timestamp', () => {
    expect(normalizeTimelineEvent({ ...baseValid, at: undefined })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, at: 'not-a-date' })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, at: 12345 })).toBeNull();
  });

  it('returns null when kind is missing or blank', () => {
    expect(normalizeTimelineEvent({ ...baseValid, kind: undefined })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, kind: '   ' })).toBeNull();
  });

  it('returns null when entityType is missing or not "board"/"task"', () => {
    expect(normalizeTimelineEvent({ ...baseValid, entityType: undefined })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, entityType: 'project' })).toBeNull();
  });

  it('returns null when entityId is missing or blank', () => {
    expect(normalizeTimelineEvent({ ...baseValid, entityId: undefined })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, entityId: '   ' })).toBeNull();
  });

  it('accepts entityType "board"', () => {
    const event = normalizeTimelineEvent({ ...baseValid, entityType: 'board', entityId: 'b1' });
    expect(event.entityType).toBe('board');
  });

  it('trims id, kind, entityId, and summary', () => {
    const event = normalizeTimelineEvent({
      ...baseValid,
      id: '  evt_1  ',
      kind: '  task.created  ',
      entityId: '  42  ',
      summary: '  Created  '
    });
    expect(event.id).toBe('evt_1');
    expect(event.kind).toBe('task.created');
    expect(event.entityId).toBe('42');
    expect(event.summary).toBe('Created');
  });

  it('defaults summary to kind when summary is missing or blank', () => {
    expect(normalizeTimelineEvent({ ...baseValid, summary: undefined }).summary).toBe('task.created');
    expect(normalizeTimelineEvent({ ...baseValid, summary: '   ' }).summary).toBe('task.created');
  });

  it('returns exactly the required fields for a sparse valid event (no changes/snapshot/meta)', () => {
    const event = normalizeTimelineEvent(baseValid);
    expect(Object.keys(event).sort()).toEqual(['at', 'entityId', 'entityType', 'id', 'kind', 'summary'].sort());
    expect(event).toEqual({
      id: 'evt_1',
      at: baseValid.at,
      kind: 'task.created',
      entityType: 'task',
      entityId: '42',
      summary: 'task.created'
    });
  });

  it('returns null when changes is present but invalid', () => {
    expect(normalizeTimelineEvent({ ...baseValid, changes: {} })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, changes: 'nope' })).toBeNull();
  });

  it('includes normalized changes when valid', () => {
    const event = normalizeTimelineEvent({
      ...baseValid,
      changes: { title: { before: 'a', after: 'b' } }
    });
    expect(event.changes).toEqual({ title: { before: 'a', after: 'b' } });
  });

  it('returns null when snapshot is present but not a plain object (e.g. an array)', () => {
    expect(normalizeTimelineEvent({ ...baseValid, snapshot: [] })).toBeNull();
    expect(normalizeTimelineEvent({ ...baseValid, snapshot: 'nope' })).toBeNull();
  });

  it('clones snapshot when valid (not the same reference)', () => {
    const snapshot = { title: 'Task', nested: { a: 1 } };
    const event = normalizeTimelineEvent({ ...baseValid, snapshot });
    expect(event.snapshot).toEqual(snapshot);
    expect(event.snapshot).not.toBe(snapshot);
  });

  it('returns null when meta is present but not a plain object (e.g. an array)', () => {
    expect(normalizeTimelineEvent({ ...baseValid, meta: [] })).toBeNull();
  });

  it('clones meta when valid (not the same reference)', () => {
    const meta = { source: 'import' };
    const event = normalizeTimelineEvent({ ...baseValid, meta });
    expect(event.meta).toEqual(meta);
    expect(event.meta).not.toBe(meta);
  });
});
