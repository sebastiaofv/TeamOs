import { fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { deriveTaskHistory } from '../../src/domain/taskHistory';
import type { Attachment, BoardData, DayPlanBlock, Task, TimelineEvent } from '../../src/domain/types';
import * as timeline from '../../src/domain/timeline';

const AT = '2026-10-09T10:00:00.000Z';

function task(overrides: Partial<Task> = {}): Task {
    return {
        id: 1, title: 'Original', description: '', status: 'backlog', assignees: [], tags: [],
        blocked: false, blockerReason: '', checklist: [], attachments: [], archived: false,
        dueDate: '', priority: null, effort: null, phaseId: '', milestoneId: '', sprintId: '',
        createdAt: AT, updatedAt: AT, ...overrides
    };
}

function snapshot(tasks: Task[], extensions: BoardData['extensions'] = {}): BoardData {
    return fromPartial<BoardData>({
        board: {
            tasks, columns: [{ status: 'backlog', title: 'Backlog at the time' }, { status: 'doing', title: 'In progress' }, { status: 'done', title: 'Complete' }],
            settings: { title: 'Project' }
        }, extensions
    });
}

function event(id: string, kind: string, values: Partial<TimelineEvent> = {}): TimelineEvent {
    return { id, kind, at: AT, entityType: 'task', entityId: '1', summary: kind, ...values };
}

function baseline(tasks: Task[] = [task()], extensions: BoardData['extensions'] = {}): TimelineEvent {
    return event('baseline', 'board.baseline', { entityType: 'board', entityId: 'board', snapshot: snapshot(tasks, extensions) });
}

function project(events: TimelineEvent[], current = task()): BoardData {
    const board = snapshot([current]);
    board.extensions.timeline = { version: 1, baselineEventId: events[0]?.id || '', events };
    return board;
}

function block(overrides: Partial<DayPlanBlock> = {}): DayPlanBlock {
    return { id: 'block-1', taskId: 1, date: '2026-10-09', start: '09:00', end: '10:00', ...overrides };
}

function planning(blocks: DayPlanBlock[]): BoardData['extensions'] {
    return { dayPlanner: { version: 1, blocks } };
}

function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
}

describe('deriveTaskHistory', () => {
    it('is read-only, including normalization of the timeline and nested values', () => {
        const opened = task({ checklist: [{ text: 'Ship', done: true }] });
        const events = [baseline(), event('edit', 'task.updated', { changes: { checklist: { before: [], after: opened.checklist } } })];
        const board = project(events, opened);
        const originalTimeline = board.extensions.timeline;
        const original = JSON.stringify(board);
        freeze(board);
        freeze(opened);
        const history = deriveTaskHistory(board, opened);
        expect(JSON.stringify(board)).toBe(original);
        expect(board.extensions.timeline).toBe(originalTimeline);
        expect(history.entries[0].changes[0].after.value).not.toBe(opened.checklist);
        expect(history.entries[0].changes[0].after.label).toContain('Ship (completed)');
    });

    it('groups business fields, supports specific status events and displays inverse edits normally', () => {
        const opened = task();
        const history = deriveTaskHistory(project([
            baseline(),
            event('grouped', 'task.updated', { changes: {
                title: { before: 'Original', after: 'Edited' }, status: { before: 'backlog', after: 'doing' },
                updatedAt: { before: AT, after: '2026-10-10T00:00:00Z' }, statusChangedAt: { before: undefined, after: AT }
            } }),
            event('state', 'task.status.changed', { changes: { status: { before: 'doing', after: 'done' } } }),
            event('inverse', 'task.updated', { changes: { title: { before: 'Edited', after: 'Original' }, status: { before: 'done', after: 'backlog' } } })
        ]), opened);
        expect(history.entries.map((entry) => entry.id)).toEqual(['inverse', 'state', 'grouped', 'baseline']);
        const grouped = history.entries[2];
        expect(grouped.kind).toBe('task.updated');
        expect(grouped.changes.map((change) => change.field)).toEqual(['title', 'status']);
        expect(grouped.changes[1]).toEqual({ field: 'status', before: { known: true, value: 'backlog', label: 'Backlog at the time' }, after: { known: true, value: 'doing', label: 'In progress' } });
        expect(history.entries[1].kind).toBe('task.status.changed');
        expect(history.entries[0].kind).toBe('task.updated');
    });

    it('distinguishes a known initial state from creation without using createdAt as a date', () => {
        const history = deriveTaskHistory(project([baseline()]), task());
        expect(history.entries).toHaveLength(1);
        expect(history.entries[0]).toMatchObject({ kind: 'task.initial', at: AT, incomplete: true });
        expect(history.entries[0].changes.find((change) => change.field === 'title')).toEqual({ field: 'title', before: { known: false, value: undefined }, after: { known: true, value: 'Original' } });
        expect(history.earlierHistoryUnavailable).toBe(true);
        expect(history.incomplete).toBe(true);
    });

    it('returns no invented records for an imported task with no timeline', () => {
        const opened = task({ createdAt: '2000-01-01T00:00:00Z' });
        expect(deriveTaskHistory(snapshot([opened]), opened)).toEqual({ entries: [], earlierHistoryUnavailable: true, incomplete: true, asOf: null });
        expect(deriveTaskHistory(project([], opened), opened).entries).toEqual([]);
    });

    it('records explicit creation and archive/restore actions without reporting an earlier gap', () => {
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('archive', 'task.archived', { changes: { archived: { before: false, after: true } } }),
            event('unarchive', 'task.restored', { changes: { archived: { before: true, after: false } } })
        ]), task());
        expect(history.entries.map((entry) => entry.kind)).toEqual(['task.restored', 'task.archived', 'task.created']);
        expect(history.entries[2].changes.find((change) => change.field === 'title')?.before.known).toBe(true);
        expect(history.incomplete).toBe(false);
        expect(history.earlierHistoryUnavailable).toBe(false);
    });

    it('shows only demonstrable creation values when the creation snapshot is sparse', () => {
        const sparse = fromPartial<Task>({ id: 1, title: 'Original' });
        const history = deriveTaskHistory(project([baseline([]), event('create', 'task.created', { snapshot: sparse })]), task());
        expect(history.entries[0]).toMatchObject({ kind: 'task.created', incomplete: true });
        expect(history.entries[0].changes.map((change) => change.field)).toEqual(['title']);
        expect(history.earlierHistoryUnavailable).toBe(false);
        expect(history.incomplete).toBe(true);
    });

    it('ignores no-ops, automatic timestamps, board-only changes and other tasks', () => {
        const history = deriveTaskHistory(project([
            baseline([task(), task({ id: 2 })]),
            event('noop', 'task.updated', { changes: { title: { before: 'Original', after: 'Original' } } }),
            event('automatic', 'task.updated', { changes: { updatedAt: { before: AT, after: '2026-10-10T00:00:00Z' } } }),
            event('other', 'task.updated', { entityId: '2', changes: { title: { before: 'Original', after: 'Other' } } }),
            event('settings', 'board.settings.updated', { entityType: 'board', entityId: 'board', changes: { title: { before: 'Project', after: 'Renamed' } } }),
            event('columns', 'board.columns.updated', { entityType: 'board', entityId: 'board', changes: { columns: { before: [], after: [{ status: 'backlog', title: 'Renamed backlog' }] } } }),
            event('other-block', 'planner.block.added', { entityType: 'board', entityId: 'board', changes: { block: { before: null, after: block({ taskId: 2 }) } } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['baseline']);
    });

    it('derives bulk sprint assignment and phase deletion from adjacent board states with historical labels', () => {
        const original = task({ phaseId: 'p1' });
        const opened = task({ phaseId: '', sprintId: 's1' });
        const extensions = { roadmap: { version: 1, phases: [{ id: 'p1', title: 'Discovery' }], milestones: [], sprints: [] } };
        const afterDeletion = snapshot([opened], { roadmap: { version: 1, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Launch' }] } });
        const history = deriveTaskHistory(project([
            baseline([original], extensions),
            event('bulk', 'roadmap.bulk-assigned', { entityType: 'board', entityId: 'board', meta: { sprint: { id: 's1', title: 'Launch' }, taskIds: [1, 2] } }),
            event('delete-phase', 'roadmap.updated', { entityType: 'board', entityId: 'board', snapshot: afterDeletion })
        ], opened), opened);
        expect(history.entries[0]).toMatchObject({ id: 'delete-phase', kind: 'roadmap.updated', changes: [{ field: 'phaseId', before: { known: true, value: 'p1', label: 'Discovery (p1)' }, after: { known: true, value: '' } }] });
        expect(history.entries[1]).toMatchObject({ id: 'bulk', kind: 'roadmap.bulk-assigned', changes: [{ field: 'sprintId', before: { known: true, value: '' }, after: { known: true, value: 's1', label: 'Launch (s1)' } }] });
    });

    it('ignores bulk and roadmap operations that do not affect this task', () => {
        const history = deriveTaskHistory(project([
            baseline([task(), task({ id: 2 })]),
            event('bulk-other', 'roadmap.bulk-assigned', { entityType: 'board', entityId: 'board', meta: { sprint: { id: 's1', title: 'Launch' }, taskIds: [2] } }),
            event('roadmap-only', 'roadmap.updated', { entityType: 'board', entityId: 'board', snapshot: snapshot([task(), task({ id: 2, sprintId: 's1' })]) })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['baseline']);
    });

    it('captures reference labels from each event context instead of applying the current label to all entries', () => {
        const original = task({ phaseId: 'p1' });
        const opened = task();
        const roadmap = (title: string): BoardData['extensions'] => ({ roadmap: { version: 1, phases: [{ id: 'p1', title, startDate: '2026-10-01', endDate: '2026-10-10' }], milestones: [], sprints: [] } });
        const history = deriveTaskHistory(project([
            baseline([original], roadmap('Original phase')),
            event('rename', 'roadmap.updated', { entityType: 'board', entityId: 'board', snapshot: snapshot([original], roadmap('Renamed phase')) }),
            event('unlink', 'task.updated', { changes: { phaseId: { before: 'p1', after: '' } } })
        ], opened), opened);
        expect(history.entries.map((entry) => entry.id)).toEqual(['unlink', 'baseline']);
        expect(history.entries[0].changes[0].before.label).toBe('Renamed phase (p1)');
        expect(history.entries[1].changes.find((change) => change.field === 'phaseId')?.after.label).toBe('Original phase (p1)');
    });

    it('projects planner additions, moves, duration changes and removal as array-valued planning', () => {
        const added = block();
        const moved = block({ date: '2026-10-10', start: '10:00', end: '11:00' });
        const resized = block({ date: '2026-10-10', start: '10:00', end: '12:00' });
        const history = deriveTaskHistory(project([
            baseline(),
            event('add', 'planner.block.added', { entityType: 'board', entityId: 'board', changes: { block: { before: null, after: added } } }),
            event('move', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: added, after: moved } } }),
            event('resize', 'planner.block.resized', { entityType: 'board', entityId: 'board', changes: { block: { before: moved, after: resized } } }),
            event('remove', 'planner.block.removed', { entityType: 'board', entityId: 'board', changes: { block: { before: resized, after: null } } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['remove', 'resize', 'move', 'add', 'baseline']);
        expect(history.entries[0].changes[0]).toMatchObject({ field: 'planning', before: { known: true, value: [resized] }, after: { known: true, value: [] } });
        expect(history.entries[1].changes[0].after.label).toContain('2h');
        expect(history.entries[2].changes[0].after.value).toEqual([moved]);
        expect(history.entries[3].changes[0].before.value).toEqual([]);
    });

    it('labels the missing predecessor of a planner move instead of claiming an empty before inventory', () => {
        const moved = block({ start: '11:00', end: '12:00' });
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('move', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: block(), after: moved } } })
        ]), task());
        expect(history.entries[0]).toMatchObject({ id: 'move', incomplete: true, changes: [{ field: 'planning', before: { known: false }, after: { known: true, value: [moved] } }] });
        expect(history.incomplete).toBe(true);
    });

    it('records explicit reassignment of a planner block from another task', () => {
        const history = deriveTaskHistory(project([
            baseline([task(), task({ id: 2 })], planning([block({ taskId: 2 })])),
            event('assign', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: block({ taskId: 2 }), after: block() } } })
        ]), task());
        expect(history.entries[0].changes[0]).toMatchObject({ field: 'planning', before: { known: true, value: [] }, after: { known: true, value: [block()] } });
    });

    it('groups restored task and multiple planner block changes in one restore entry', () => {
        const first = block();
        const second = block({ id: 'block-2', start: '14:00', end: '15:00' });
        const history = deriveTaskHistory(project([
            baseline([task()], planning([first, second])),
            event('edit', 'task.updated', { changes: { title: { before: 'Original', after: 'Edited' } } }),
            event('remove', 'planner.block.removed', { entityType: 'board', entityId: 'board', changes: { block: { before: first, after: null } } }),
            event('move', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: second, after: { ...second, date: '2026-10-10' } } } }),
            event('restore', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([task()], planning([first, second])), meta: { fromEventId: 'baseline' } })
        ]), task());
        expect(history.entries[0].kind).toBe('board.restored');
        expect(history.entries[0].changes.map((change) => change.field)).toEqual(['title', 'planning']);
        expect(history.entries[0].changes[1].after.value).toEqual([first, second]);
        expect(history.entries[0].changes[0].before.value).toBe('Edited');
        expect(history.entries[0].incomplete).toBe(false);
    });

    it('does not report planner or full snapshot restore no-ops', () => {
        const history = deriveTaskHistory(project([
            baseline([task()], planning([block()])),
            event('noop-block', 'planner.block.moved', { changes: { block: { before: block(), after: block() } } }),
            event('noop-restore', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([task()], planning([block()])), meta: { fromEventId: 'baseline' } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['baseline']);
    });

    it('marks a restore identity gap without inventing changes when its snapshot is an observable no-op', () => {
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('restore', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([task()]) })
        ]), task());
        expect(history.entries).toEqual([]);
        expect(history.incomplete).toBe(true);
        expect(history.earlierHistoryUnavailable).toBe(true);
    });

    it('uses timeline array order even with equal and backwards timestamps', () => {
        const opened = task({ title: 'Third' });
        const history = deriveTaskHistory(project([
            baseline(),
            event('first', 'task.updated', { at: '2026-10-10T10:00:00Z', changes: { title: { before: 'Original', after: 'First' } } }),
            event('second', 'task.updated', { at: '2020-01-01T00:00:00Z', changes: { title: { before: 'First', after: 'Second' } } }),
            event('third', 'task.updated', { at: '2020-01-01T00:00:00Z', changes: { title: { before: 'Second', after: 'Third' } } })
        ], opened), opened);
        expect(history.entries.map((entry) => entry.id)).toEqual(['third', 'second', 'first', 'baseline']);
    });

    it('limits historical queries inclusively and rejects a snapshot from a different context', () => {
        const current = task({ title: 'Current' });
        const past = task({ title: 'Past' });
        const board = project([
            baseline(), event('past', 'task.updated', { changes: { title: { before: 'Original', after: 'Past' } } }),
            event('current', 'task.updated', { changes: { title: { before: 'Past', after: 'Current' } } })
        ], current);
        const history = deriveTaskHistory(board, past, { eventIndex: 1.9 });
        expect(history.entries.map((entry) => entry.id)).toEqual(['past', 'baseline']);
        expect(history.asOf).toEqual({ eventId: 'past', at: AT });
        expect(deriveTaskHistory(board, current, { eventIndex: 1 }).entries).toEqual([]);
        expect(deriveTaskHistory(board, past).entries).toEqual([]);
    });

    it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 99])('normalizes non-finite/current indices (%s) without reporting historical context', (eventIndex) => {
        const opened = task({ title: 'Changed' });
        const board = project([baseline(), event('change', 'task.updated', { changes: { title: { before: 'Original', after: 'Changed' } } })], opened);
        expect(deriveTaskHistory(board, opened, { eventIndex }).asOf).toBeNull();
        expect(deriveTaskHistory(board, opened, { eventIndex }).entries[0].id).toBe('change');
    });

    it('clamps negative historical indices to the initial event', () => {
        const board = project([baseline(), event('later', 'task.created', { entityId: '2', snapshot: task({ id: 2 }) })]);
        expect(deriveTaskHistory(board, task(), { eventIndex: -10 }).asOf).toEqual({ eventId: 'baseline', at: AT });
        expect(deriveTaskHistory(board, task(), { eventIndex: 0 }).entries.map((entry) => entry.id)).toEqual(['baseline']);
    });

    it('separates reused numeric IDs even when title and createdAt are identical', () => {
        const board = project([
            baseline([]), event('old-create', 'task.created', { snapshot: task() }),
            event('old-edit', 'task.updated', { changes: { status: { before: 'backlog', after: 'done' } } }),
            event('old-delete', 'task.deleted', { snapshot: task({ status: 'done' }) }),
            event('new-create', 'task.created', { snapshot: task() }),
            event('new-edit', 'task.updated', { changes: { status: { before: 'backlog', after: 'doing' } } })
        ], task({ status: 'doing' }));
        const history = deriveTaskHistory(board, task({ status: 'doing' }));
        expect(history.entries.map((entry) => entry.id)).toEqual(['new-edit', 'new-create']);
        expect(history.incomplete).toBe(false);
        expect(history.earlierHistoryUnavailable).toBe(false);
        expect(deriveTaskHistory(board, task({ status: 'done' }), { eventIndex: 2 }).entries.map((entry) => entry.id)).toEqual(['old-edit', 'old-create']);
    });

    it('treats another explicit creation as a boundary even when a delete record is missing', () => {
        const history = deriveTaskHistory(project([
            baseline(), event('old-edit', 'task.updated', { changes: { title: { before: 'Original', after: 'Old' } } }),
            event('replacement', 'task.created', { snapshot: task() })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['replacement']);
    });

    it('recovers the old lifecycle using restore provenance without leaking the replacement task', () => {
        const old = task({ title: 'Old', status: 'doing' });
        const history = deriveTaskHistory(project([
            baseline([]), event('old-create', 'task.created', { snapshot: task({ title: 'Old' }) }),
            event('old-edit', 'task.status.changed', { changes: { status: { before: 'backlog', after: 'doing' } } }),
            event('delete', 'task.deleted', { snapshot: old }),
            event('new-create', 'task.created', { snapshot: task({ title: 'Different task' }) }),
            event('new-edit', 'task.updated', { changes: { title: { before: 'Different task', after: 'Another title' } } }),
            event('recover', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([old]), meta: { fromEventId: 'old-edit' } })
        ], old), old);
        expect(history.entries.map((entry) => entry.id)).toEqual(['recover', 'delete', 'old-edit', 'old-create']);
        expect(history.entries[0].changes.find((change) => change.field === 'title')).toMatchObject({ before: { known: true, value: undefined }, after: { known: true, value: 'Old' } });
        expect(JSON.stringify(history)).not.toContain('Another title');
        expect(JSON.stringify(history)).not.toContain('Different task');
        expect(history.incomplete).toBe(false);
    });

    it.each([undefined, 'missing', 'future', 'delete'])('marks unknown/broken restore provenance (%s) without claiming another incarnation history', (sourceId) => {
        const restored = task({ title: 'Old' });
        const history = deriveTaskHistory(project([
            baseline([]), event('old-create', 'task.created', { snapshot: restored }),
            event('delete', 'task.deleted', { snapshot: restored }),
            event('new-create', 'task.created', { snapshot: task({ title: 'New' }) }),
            event('ambiguous', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([restored]), ...(sourceId ? { meta: { fromEventId: sourceId } } : {}) })
        ], restored), restored);
        expect(history.entries.map((entry) => entry.id)).toEqual(['ambiguous']);
        expect(history.entries[0].changes.every((change) => !change.before.known)).toBe(true);
        expect(history.earlierHistoryUnavailable).toBe(true);
        expect(history.incomplete).toBe(true);
    });

    it('does not trust restore metadata when the recovered snapshot disagrees with its source', () => {
        const restored = task({ title: 'Unexpected' });
        const history = deriveTaskHistory(project([
            baseline(), event('restore', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([restored]), meta: { fromEventId: 'baseline' } })
        ], restored), restored);
        expect(history.entries.map((entry) => entry.id)).toEqual(['restore']);
        expect(history.incomplete).toBe(true);
        expect(history.entries[0].changes.find((change) => change.field === 'title')?.before.known).toBe(false);
    });

    it('does not attach orphan planning blocks or their later edits to a reused ID', () => {
        const orphan = block();
        const newBlock = block({ id: 'new-block' });
        const moved = block({ start: '11:00', end: '12:00' });
        const history = deriveTaskHistory(project([
            baseline([task()], planning([orphan])),
            event('delete', 'task.deleted', { snapshot: task() }),
            event('replacement', 'task.created', { snapshot: task() }),
            event('orphan-move', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: orphan, after: moved } } }),
            event('new-block', 'planner.block.added', { entityType: 'board', entityId: 'board', changes: { block: { before: null, after: newBlock } } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['new-block', 'replacement']);
        expect(history.entries[0].changes[0].before.value).toEqual([]);
        expect(history.entries[0].changes[0].after.value).toEqual([newBlock]);
        expect(history.entries[1].changes.some((change) => change.field === 'planning')).toBe(false);
    });

    it('retains planner ownership tombstones after a block disappears before ID reuse', () => {
        const moved = block({ start: '11:00', end: '12:00' });
        const history = deriveTaskHistory(project([
            baseline([task()], planning([block()])),
            event('remove', 'planner.block.removed', { entityType: 'board', entityId: 'board', changes: { block: { before: block(), after: null } } }),
            event('delete', 'task.deleted', { snapshot: task() }),
            event('new', 'task.created', { snapshot: task() }),
            event('late-orphan', 'planner.block.moved', { entityType: 'board', entityId: 'board', changes: { block: { before: block(), after: moved } } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['new']);
        expect(history.entries[0].changes.some((change) => change.field === 'planning')).toBe(false);
    });

    it('recovers only planning owned by the old lifecycle, including orphan ownership in the source frame', () => {
        const old = task({ title: 'Old' });
        const fresh = task({ title: 'New' });
        const history = deriveTaskHistory(project([
            baseline([old], planning([block()])),
            event('delete', 'task.deleted', { snapshot: old }),
            event('new', 'task.created', { snapshot: fresh }),
            event('new-block', 'planner.block.added', { entityType: 'board', entityId: 'board', changes: { block: { before: null, after: block({ id: 'fresh-block' }) } } }),
            event('restore-new', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([fresh], planning([block(), block({ id: 'fresh-block' })])), meta: { fromEventId: 'new-block' } }),
            event('restore-old', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([old], planning([block()])), meta: { fromEventId: 'baseline' } })
        ], old), old);
        expect(history.entries.map((entry) => entry.id)).toEqual(['restore-old', 'delete', 'baseline']);
        expect(history.entries[0].changes.find((change) => change.field === 'planning')).toMatchObject({ before: { value: [] }, after: { value: [block()] } });
        expect(JSON.stringify(history)).not.toContain('fresh-block');
    });

    it('marks unavailable fields in sparse snapshots instead of filling them from the opened task', () => {
        const sparse = fromPartial<Task>({ id: 1, title: 'Original', createdAt: AT });
        const opened = task({ priority: 'high' });
        const history = deriveTaskHistory(project([
            baseline([sparse]), event('priority', 'task.updated', { changes: { priority: { before: undefined, after: 'high' } } })
        ], opened), opened);
        expect(history.entries[0].changes).toEqual([{ field: 'priority', before: { known: false, value: undefined }, after: { known: true, value: 'high' } }]);
        expect(history.entries[0].incomplete).toBe(true);
        expect(history.entries[1].changes.map((change) => change.field)).toEqual(['title']);
    });

    it('preserves direct field evidence when the earlier baseline is missing', () => {
        const opened = task({ title: 'Changed' });
        const history = deriveTaskHistory(project([
            event('edit', 'task.updated', { changes: { title: { before: 'Original', after: 'Changed' } } })
        ], opened), opened);
        expect(history.entries[0]).toMatchObject({ kind: 'task.updated', incomplete: true, changes: [{ field: 'title', before: { known: true, value: 'Original' }, after: { known: true, value: 'Changed' } }] });
        expect(history.earlierHistoryUnavailable).toBe(true);
        expect(history.incomplete).toBe(true);
    });

    it('flags unsupported task events and inconsistent before evidence as gaps', () => {
        const opened = task({ title: 'Changed' });
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('unknown', 'task.future-edit'),
            event('edit', 'task.updated', { changes: { title: { before: 'Unrecorded', after: 'Changed' } } })
        ], opened), opened);
        expect(history.entries.map((entry) => entry.id)).toEqual(['edit', 'create']);
        expect(history.incomplete).toBe(true);
        expect(history.entries[0].incomplete).toBe(true);
        expect(history.entries[0].changes[0].before.value).toBe('Unrecorded');
        expect(history.earlierHistoryUnavailable).toBe(false);
    });

    it('recovers a recorded direct change even when missing earlier events make replay appear unchanged', () => {
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('edit', 'task.updated', { changes: { title: { before: 'Unrecorded', after: 'Original' } } })
        ]), task());
        expect(history.entries[0]).toMatchObject({ id: 'edit', incomplete: true, changes: [{ field: 'title', before: { known: true, value: 'Unrecorded' }, after: { known: true, value: 'Original' } }] });
        expect(history.incomplete).toBe(true);
    });

    it('does not assert history across malformed lifecycle boundaries or absent restore snapshots', () => {
        const malformed = event('invalid-create', 'task.created', { at: 'invalid', snapshot: task() });
        expect(deriveTaskHistory(project([baseline(), malformed]), task()).entries).toEqual([]);
        const missingRestore = event('restore', 'board.restored', { entityType: 'board', entityId: 'board', meta: { fromEventId: 'baseline' } });
        expect(deriveTaskHistory(project([baseline(), missingRestore]), task()).entries).toEqual([]);
    });

    it('retains valid records surrounding invalid events without changing historical array indices', () => {
        const opened = task({ title: 'Changed' });
        const board = project([
            baseline(), event('bad', 'task.updated', { at: 'invalid' }),
            event('edit', 'task.updated', { changes: { title: { before: 'Original', after: 'Changed' } } }),
            event('later', 'task.created', { entityId: '2', snapshot: task({ id: 2 }) })
        ], opened);
        const history = deriveTaskHistory(board, opened, { eventIndex: 2 });
        expect(history.entries.map((entry) => entry.id)).toEqual(['edit', 'baseline']);
        expect(history.asOf).toEqual({ eventId: 'edit', at: AT });
        expect(history.incomplete).toBe(true);
    });

    it('rejects duplicate event IDs as restore provenance', () => {
        const opened = task({ title: 'Changed' });
        const history = deriveTaskHistory(project([
            baseline(), event('baseline', 'task.updated', { changes: { title: { before: 'Original', after: 'Changed' } } }),
            event('restore', 'board.restored', { entityType: 'board', entityId: 'board', snapshot: snapshot([opened]), meta: { fromEventId: 'baseline' } })
        ], opened), opened);
        expect(history.entries).toEqual([]);
        expect(history.incomplete).toBe(true);
    });

    it('does not turn malformed unrelated records into gaps in a fully known lifecycle', () => {
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('invalid-other-task', 'task.updated', { entityId: '2', at: 'invalid' }),
            event('invalid-settings', 'board.settings.updated', { entityType: 'board', entityId: 'board', at: 'invalid' }),
            event('invalid-other-planning', 'planner.block.added', { entityType: 'board', entityId: 'board', at: 'invalid', changes: { block: { before: null, after: block({ taskId: 2 }) } } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['create']);
        expect(history.incomplete).toBe(false);
    });

    it('marks unreplayable targeted indirect records as gaps without inventing changes', () => {
        const history = deriveTaskHistory(project([
            baseline([]), event('create', 'task.created', { snapshot: task() }),
            event('missing-sprint', 'roadmap.bulk-assigned', { entityType: 'board', entityId: 'board', meta: { taskIds: [1] } })
        ]), task());
        expect(history.entries.map((entry) => entry.id)).toEqual(['create']);
        expect(history.incomplete).toBe(true);
        expect(history.earlierHistoryUnavailable).toBe(false);
    });

    it('preserves attachment names/IDs and checklist descriptions without exposing binary attachment values', () => {
        const attachment: Attachment = { id: 'a1', name: 'diagram.png', mime: 'image/png', sizeBytes: 42, kind: 'image', dataUrl: 'data:image/png;base64,SECRET', createdAt: AT };
        const opened = task({ attachments: [attachment], checklist: [{ text: 'Ship', done: true }] });
        const history = deriveTaskHistory(project([
            baseline(), event('edit', 'task.updated', { changes: { attachments: { before: [], after: [attachment] }, checklist: { before: [], after: opened.checklist } } })
        ], opened), opened);
        const attachments = history.entries[0].changes.find((change) => change.field === 'attachments');
        expect(attachments?.after.label).toBe('diagram.png (a1)');
        expect(JSON.stringify(history)).not.toContain('SECRET');
        expect(history.entries[0].changes.find((change) => change.field === 'checklist')?.after.label).toBe('Ship (completed)');
    });

    it('retains attachment content replacements as business changes while withholding the content', () => {
        const before: Attachment = { id: 'a1', name: 'diagram.png', mime: 'image/png', sizeBytes: 42, kind: 'image', dataUrl: 'data:image/png;base64,OLD', createdAt: AT };
        const after = { ...before, dataUrl: 'data:image/png;base64,NEW' };
        const opened = task({ attachments: [after] });
        const history = deriveTaskHistory(project([
            baseline([task({ attachments: [before] })]), event('replace', 'task.updated', { changes: { attachments: { before: [before], after: [after] } } })
        ], opened), opened);
        expect(history.entries[0]).toMatchObject({ id: 'replace', changes: [{ field: 'attachments' }] });
        expect(JSON.stringify(history)).not.toContain('base64');
    });

    it('replays each action once and never reconstructs the board separately at each index', () => {
        const apply = vi.spyOn(timeline, 'applyTimelineEventToState');
        const reconstruct = vi.spyOn(timeline, 'reconstructBoardStateFromTimeline');
        try {
            const events = [baseline([]), event('create', 'task.created', { snapshot: task() }), ...Array.from({ length: 30 }, (_, index) => event(`settings-${index}`, 'board.settings.updated', { entityType: 'board', entityId: 'board', changes: { title: { before: 'A', after: 'B' } } }))];
            deriveTaskHistory(project(events), task());
            expect(apply).toHaveBeenCalledTimes(31);
            expect(reconstruct).not.toHaveBeenCalled();
        } finally {
            apply.mockRestore();
            reconstruct.mockRestore();
        }
    });
});
