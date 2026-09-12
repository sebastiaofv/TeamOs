import { describe, it, expect } from 'vitest';
import {
  getTimelineExtensionObject,
  createEmptyTimelineData,
  createTimelineEventId,
  formatTimelineValue,
  buildTaskTimelineChanges,
  normalizeTimelineChanges,
  buildTaskTimelineEvent,
  normalizeTimelineEvent,
  applyTimelineEventToState,
  normalizeTimelineExtension,
  captureTaskTimelineSnapshot,
  getBoardTimelineData
} from '../../src/domain/timeline.js';
import { TIMELINE_VERSION, ROADMAP_VERSION } from '../../src/domain/constants.js';

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

const VALID_EVENT = {
  id: 'evt_1',
  at: '2024-03-01T00:00:00.000Z',
  kind: 'task.created',
  entityType: 'task',
  entityId: '1'
};

describe('normalizeTimelineExtension', () => {
  it('returns null for non-object input, including null/undefined', () => {
    expect(normalizeTimelineExtension(null)).toBeNull();
    expect(normalizeTimelineExtension(undefined)).toBeNull();
    expect(normalizeTimelineExtension('x')).toBeNull();
  });

  it('returns null for an array, even though typeof is object', () => {
    expect(normalizeTimelineExtension([])).toBeNull();
  });

  it('returns null when version does not match TIMELINE_VERSION', () => {
    expect(normalizeTimelineExtension({ version: TIMELINE_VERSION + 1, events: [] })).toBeNull();
  });

  it('returns null when events is missing or not an array', () => {
    expect(normalizeTimelineExtension({ version: TIMELINE_VERSION })).toBeNull();
    expect(normalizeTimelineExtension({ version: TIMELINE_VERSION, events: 'nope' })).toBeNull();
  });

  it('returns null when any event in the list fails to normalize', () => {
    const value = { version: TIMELINE_VERSION, events: [VALID_EVENT, { bogus: true }] };
    expect(normalizeTimelineExtension(value)).toBeNull();
  });

  it('stamps TIMELINE_VERSION and defaults baselineEventId to the first event id when absent', () => {
    const value = { version: TIMELINE_VERSION, events: [VALID_EVENT] };
    expect(normalizeTimelineExtension(value)).toEqual({
      version: TIMELINE_VERSION,
      baselineEventId: 'evt_1',
      events: [normalizeTimelineEvent(VALID_EVENT)]
    });
  });

  it('preserves an explicit, trimmed baselineEventId over the first-event fallback', () => {
    const secondEvent = { ...VALID_EVENT, id: 'evt_2' };
    const value = {
      version: TIMELINE_VERSION,
      baselineEventId: '  evt_2  ',
      events: [VALID_EVENT, secondEvent]
    };
    expect(normalizeTimelineExtension(value).baselineEventId).toBe('evt_2');
  });

  it('falls back to the first event id when baselineEventId is blank', () => {
    const value = { version: TIMELINE_VERSION, baselineEventId: '   ', events: [VALID_EVENT] };
    expect(normalizeTimelineExtension(value).baselineEventId).toBe('evt_1');
  });

  it('defaults baselineEventId to an empty string when events is empty and baselineEventId is absent', () => {
    const value = { version: TIMELINE_VERSION, events: [] };
    expect(normalizeTimelineExtension(value)).toEqual({
      version: TIMELINE_VERSION,
      baselineEventId: '',
      events: []
    });
  });

  it('accepts a version value coercible to the expected number (e.g. a numeric string)', () => {
    const value = { version: String(TIMELINE_VERSION), events: [] };
    expect(normalizeTimelineExtension(value).version).toBe(TIMELINE_VERSION);
  });
});

describe('applyTimelineEventToState', () => {
  it('returns state unchanged (same reference, not cloned) when state or event is falsy', () => {
    const state = { board: { tasks: [] } };
    expect(applyTimelineEventToState(null, VALID_EVENT)).toBeNull();
    expect(applyTimelineEventToState(state, null)).toBe(state);
    expect(applyTimelineEventToState(undefined, VALID_EVENT)).toBeUndefined();
  });

  it('board.restored with a snapshot returns a deep clone of the snapshot, ignoring the rest of state', () => {
    const state = { board: { tasks: [{ id: 1 }], columns: [], settings: {} } };
    const snapshot = { board: { tasks: [{ id: 99 }], columns: [], settings: { theme: 'dark' } } };
    const event = { kind: 'board.restored', snapshot };
    const result = applyTimelineEventToState(state, event);
    expect(result).toEqual(snapshot);
    expect(result).not.toBe(snapshot);
    expect(result.board.tasks).not.toBe(snapshot.board.tasks);
  });

  it('board.restored without a snapshot falls through and returns a normalized clone of state instead', () => {
    const state = { board: { tasks: [{ id: 1 }] } };
    const result = applyTimelineEventToState(state, { kind: 'board.restored' });
    expect(result).toEqual({ board: { tasks: [{ id: 1 }], columns: [], settings: {} } });
    expect(result).not.toBe(state);
  });

  it('task.created adds the snapshot task, and replaces any existing task sharing its id', () => {
    const state = { board: { tasks: [{ id: 1, title: 'Old' }] } };
    const event = { kind: 'task.created', entityId: '1', snapshot: { id: 1, title: 'New' } };
    const result = applyTimelineEventToState(state, event);
    expect(result.board.tasks).toEqual([{ id: 1, title: 'New' }]);
  });

  it('task.created without a snapshot is a no-op (falls through to unmatched, returns normalized state)', () => {
    const state = { board: { tasks: [{ id: 1, title: 'Old' }] } };
    const result = applyTimelineEventToState(state, { kind: 'task.created', entityId: '1' });
    expect(result.board.tasks).toEqual([{ id: 1, title: 'Old' }]);
  });

  it('task.deleted removes the task matching entityId', () => {
    const state = { board: { tasks: [{ id: 1 }, { id: 2 }] } };
    const result = applyTimelineEventToState(state, { kind: 'task.deleted', entityId: '1' });
    expect(result.board.tasks).toEqual([{ id: 2 }]);
  });

  it.each(['task.updated', 'task.status.changed', 'task.archived', 'task.restored'])(
    '%s applies each changed field\'s "after" value onto the matching task',
    (kind) => {
      const state = { board: { tasks: [{ id: 1, title: 'Old', status: 'doing' }] } };
      const event = {
        kind,
        entityId: '1',
        changes: {
          title: { before: 'Old', after: 'New' },
          status: { before: 'doing', after: 'done' }
        }
      };
      const result = applyTimelineEventToState(state, event);
      expect(result.board.tasks[0]).toEqual({ id: 1, title: 'New', status: 'done' });
    }
  );

  it('task.updated is a no-op when no task matches entityId', () => {
    const state = { board: { tasks: [{ id: 2, title: 'Keep' }] } };
    const event = { kind: 'task.updated', entityId: '1', changes: { title: { before: 'a', after: 'b' } } };
    const result = applyTimelineEventToState(state, event);
    expect(result.board.tasks).toEqual([{ id: 2, title: 'Keep' }]);
  });

  it('task.updated is a no-op when event.changes is missing', () => {
    const state = { board: { tasks: [{ id: 1, title: 'Keep' }] } };
    const result = applyTimelineEventToState(state, { kind: 'task.updated', entityId: '1' });
    expect(result.board.tasks).toEqual([{ id: 1, title: 'Keep' }]);
  });

  it('board.settings.updated merges each changed field\'s "after" value into board.settings', () => {
    const state = { board: { tasks: [], settings: { theme: 'light', wipLimit: 3 } } };
    const event = {
      kind: 'board.settings.updated',
      changes: { theme: { before: 'light', after: 'dark' } }
    };
    const result = applyTimelineEventToState(state, event);
    expect(result.board.settings).toEqual({ theme: 'dark', wipLimit: 3 });
  });

  it('board.settings.updated without changes is a no-op on settings', () => {
    const state = { board: { tasks: [], settings: { theme: 'light' } } };
    const result = applyTimelineEventToState(state, { kind: 'board.settings.updated' });
    expect(result.board.settings).toEqual({ theme: 'light' });
  });

  it('board.columns.updated prefers event.changes.columns.after when present', () => {
    const state = { board: { tasks: [], columns: [{ id: 'todo' }] } };
    const event = {
      kind: 'board.columns.updated',
      changes: { columns: { before: [{ id: 'todo' }], after: [{ id: 'doing' }] } },
      snapshot: { board: { columns: [{ id: 'ignored' }] } }
    };
    const result = applyTimelineEventToState(state, event);
    expect(result.board.columns).toEqual([{ id: 'doing' }]);
  });

  it('board.columns.updated falls back to event.snapshot.board.columns when changes.columns is absent', () => {
    const state = { board: { tasks: [], columns: [{ id: 'todo' }] } };
    const event = {
      kind: 'board.columns.updated',
      snapshot: { board: { columns: [{ id: 'from-snapshot' }] } }
    };
    const result = applyTimelineEventToState(state, event);
    expect(result.board.columns).toEqual([{ id: 'from-snapshot' }]);
  });

  it('board.columns.updated with neither changes.columns nor a snapshot leaves columns as-is', () => {
    const state = { board: { tasks: [], columns: [{ id: 'todo' }] } };
    const result = applyTimelineEventToState(state, { kind: 'board.columns.updated' });
    expect(result.board.columns).toEqual([{ id: 'todo' }]);
  });

  it('roadmap.bulk-assigned creates the roadmap extension, upserts the sprint, and assigns sprintId to the named tasks', () => {
    const state = { board: { tasks: [{ id: 1 }, { id: 2 }, { id: 3 }] } };
    const event = {
      kind: 'roadmap.bulk-assigned',
      meta: {
        sprint: { id: 's1', title: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14' },
        taskIds: [1, 3]
      }
    };
    const result = applyTimelineEventToState(state, event);
    expect(result.extensions.roadmap.sprints).toEqual([
      { id: 's1', title: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14' }
    ]);
    expect(result.board.tasks.map((t) => t.sprintId)).toEqual(['s1', undefined, 's1']);
  });

  it('roadmap.bulk-assigned replaces an existing sprint sharing the same id instead of duplicating it', () => {
    const state = {
      board: { tasks: [] },
      extensions: {
        roadmap: {
          version: ROADMAP_VERSION,
          milestones: [],
          phases: [],
          sprints: [{ id: 's1', title: 'Old Sprint', startDate: '2024-01-01', endDate: '2024-01-07' }]
        }
      }
    };
    const event = {
      kind: 'roadmap.bulk-assigned',
      meta: { sprint: { id: 's1', title: 'New Sprint', startDate: '2024-01-01', endDate: '2024-01-14' } }
    };
    const result = applyTimelineEventToState(state, event);
    expect(result.extensions.roadmap.sprints).toEqual([
      { id: 's1', title: 'New Sprint', startDate: '2024-01-01', endDate: '2024-01-14' }
    ]);
  });

  it('roadmap.bulk-assigned still creates an empty roadmap extension but skips sprint work when meta.sprint has no id', () => {
    const state = { board: { tasks: [{ id: 1 }] } };
    const result = applyTimelineEventToState(state, { kind: 'roadmap.bulk-assigned', meta: {} });
    expect(result.extensions.roadmap).toEqual({ version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [] });
    expect(result.board.tasks[0].sprintId).toBeUndefined();
  });

  it('roadmap.updated with a snapshot returns a deep clone of the snapshot', () => {
    const state = { board: { tasks: [] } };
    const snapshot = { board: { tasks: [{ id: 5 }], columns: [], settings: {} }, extensions: { roadmap: null } };
    const result = applyTimelineEventToState(state, { kind: 'roadmap.updated', snapshot });
    expect(result).toEqual(snapshot);
    expect(result).not.toBe(snapshot);
  });

  it('roadmap.updated without a snapshot returns the normalized state unchanged', () => {
    const state = { board: { tasks: [{ id: 1 }] } };
    const result = applyTimelineEventToState(state, { kind: 'roadmap.updated' });
    expect(result.board.tasks).toEqual([{ id: 1 }]);
  });

  it('an unrecognized event kind leaves state untouched aside from normalizing board.tasks/columns/settings', () => {
    const state = { board: { tasks: [{ id: 1 }] } };
    const result = applyTimelineEventToState(state, { kind: 'something.unknown', entityId: '1' });
    expect(result).toEqual({ board: { tasks: [{ id: 1 }], columns: [], settings: {} } });
    expect(result).not.toBe(state);
  });

  it('does not mutate the input state object', () => {
    const state = { board: { tasks: [{ id: 1, title: 'Old' }] } };
    const event = { kind: 'task.updated', entityId: '1', changes: { title: { before: 'Old', after: 'New' } } };
    applyTimelineEventToState(state, event);
    expect(state.board.tasks[0].title).toBe('Old');
  });
});

describe('getTimelineExtensionObject', () => {
  it('returns null for a board with no timeline extension when create is false', () => {
    expect(getTimelineExtensionObject({ extensions: {} })).toBeNull();
  });

  it('creates and returns an empty timeline when create is true', () => {
    const board = { extensions: {} };
    const tl = getTimelineExtensionObject(board, { create: true });
    expect(tl).not.toBeNull();
    expect(board.extensions.timeline).toBe(tl);
  });

  it('normalizes and returns an existing timeline extension', () => {
    const board = { extensions: { timeline: { version: 1, baselineEventId: 'b1', events: [] } } };
    const tl = getTimelineExtensionObject(board);
    expect(tl).not.toBeNull();
    expect(tl.events).toEqual([]);
  });
});

describe('captureTaskTimelineSnapshot', () => {
  const boardWithTask = (taskOverrides = {}) => ({
    board: {
      tasks: [
        { id: 1, title: 'Task One', status: 'backlog', ...taskOverrides }
      ]
    },
    extensions: {}
  });

  it('returns null when the task is not found on the board', () => {
    expect(captureTaskTimelineSnapshot(boardWithTask(), 999)).toBeNull();
  });

  it('returns null when boardData itself has no tasks list', () => {
    expect(captureTaskTimelineSnapshot({}, 1)).toBeNull();
  });

  it('returns a normalized snapshot of the task when found', () => {
    const snapshot = captureTaskTimelineSnapshot(boardWithTask({ priority: 'URGENT' }), 1);
    expect(snapshot).not.toBeNull();
    expect(snapshot.id).toBe(1);
    expect(snapshot.title).toBe('Task One');
    // normalizePriority drops an unrecognized value to null.
    expect(snapshot.priority).toBeNull();
  });

  it('omits statusChangedAt, since it is captured with includeStatusChangedAt: false', () => {
    const snapshot = captureTaskTimelineSnapshot(boardWithTask({ statusChangedAt: '2026-01-01T00:00:00.000Z' }), 1);
    expect('statusChangedAt' in snapshot).toBe(false);
  });

  it('falls back to getTaskAttachments when the task has no attachments array of its own', () => {
    const board = boardWithTask();
    board.extensions = {
      teamOsKanban: {
        taskAttachments: { 'task:1': [{ id: 'legacy-1', name: 'legacy.png', dataUrl: 'data:image/png;base64,AA==', sizeBytes: 2 }] }
      }
    };
    const snapshot = captureTaskTimelineSnapshot(board, 1);
    expect(snapshot.attachments).toHaveLength(1);
    expect(snapshot.attachments[0].id).toBe('legacy-1');
  });

  it('resolves roadmap task refs against the board roadmap extension, dropping refs that do not exist', () => {
    const board = boardWithTask({ milestoneId: 'does-not-exist' });
    board.extensions = { roadmap: { version: 1, milestones: [], phases: [], sprints: [] } };
    const snapshot = captureTaskTimelineSnapshot(board, 1);
    expect(snapshot.milestoneId).toBe('');
  });
});

describe('getBoardTimelineData', () => {
  it('returns null when boardData has no extensions object', () => {
    expect(getBoardTimelineData({})).toBeNull();
  });

  it('returns null when boardData is null/undefined', () => {
    expect(getBoardTimelineData(null)).toBeNull();
    expect(getBoardTimelineData(undefined)).toBeNull();
  });

  it('returns null when extensions exists but has no timeline key', () => {
    expect(getBoardTimelineData({ extensions: {} })).toBeNull();
  });

  it('returns null when the timeline extension present fails normalization', () => {
    expect(getBoardTimelineData({ extensions: { timeline: 'garbage' } })).toBeNull();
  });

  it('returns the normalized timeline extension when present and valid', () => {
    const board = {
      extensions: {
        timeline: {
          version: TIMELINE_VERSION,
          baselineEventId: 'evt_1',
          events: [{
            id: 'evt_1',
            at: '2026-01-01T00:00:00.000Z',
            kind: 'board.baseline',
            entityType: 'board',
            entityId: 'board',
            summary: 'Baseline snapshot created'
          }]
        }
      }
    };
    const timeline = getBoardTimelineData(board);
    expect(timeline).not.toBeNull();
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0].id).toBe('evt_1');
  });
});
