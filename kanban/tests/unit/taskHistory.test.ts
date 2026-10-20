import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask, nextTaskIdForBoard } from '../../src/domain/task';
import { appendTimelineEvent, captureTaskTimelineSnapshot, ensureBoardTimelineBaseline, recordTaskTimelineEvent, reconstructBoardStateFromTimeline, recordBoardRestoreTimelineEvent } from '../../src/domain/timeline';
import { projectTaskHistory } from '../../src/domain/taskHistory';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { reserveTaskIdentities } from '../../src/domain/taskIdentity';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { createAppStore } from '../../src/features/portfolio/state/store';
import type { Task, BoardData, TaskRelation } from '../../src/domain/types';

const stamp = '2026-10-19T10:00:00.000Z';
function setup() {
    const data = createEmptyProjectData('History');
    data.board.tasks = [1, 2, 3, 4, 5].map((id) => normalizeTask({ id, title: `Task ${id}`, createdAt: stamp, updatedAt: stamp, status: 'to-do' }));
    return data;
}
function update(data: BoardData, id: number, values: Partial<Task>) {
    ensureBoardTimelineBaseline(data);
    const before = captureTaskTimelineSnapshot(data, id);
    Object.assign(data.board.tasks.find((task) => task.id === id)!, values);
    return recordTaskTimelineEvent(data, before, captureTaskTimelineSnapshot(data, id))!;
}

describe('workitem history projection', () => {
    it('ignores relation-array ordering and never renders corrupt legacy attachment payloads', () => {
        const data = setup();
        const before: TaskRelation[] = [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 1, targetId: 3, kind: 'related' }];
        data.extensions.taskRelations = { version: 1, relations: before }; ensureBoardTimelineBaseline(data);
        appendTimelineEvent(data, { kind: 'task.relations.updated', entityType: 'task', entityId: '1', summary: 'Reordered only', changes: { relations: { before, after: [before[1], before[0]] } } });
        expect(projectTaskHistory(data, data.board.tasks[0]).entries).toEqual([]);
        appendTimelineEvent(data, { kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Partial legacy attachments', changes: { attachments: { before: [], after: [null, 'data:image/png;base64,SECRET'] } } });
        expect(JSON.stringify(projectTaskHistory(data, data.board.tasks[0]).entries)).not.toContain('SECRET');
    });
    it('does not silently attach a reintroduced current row to a deleted recorded lifecycle', () => {
        const data = setup(); ensureBoardTimelineBaseline(data);
        const old = data.board.tasks[0];
        recordTaskTimelineEvent(data, old, null);
        const history = projectTaskHistory(data, old);
        expect(history.ambiguous).toBe(true); expect(history.entries).toEqual([]);
    });
    it('has no fabricated creation or recording boundary for files without a timeline', () => {
        const data = setup();
        expect(projectTaskHistory(data, data.board.tasks[0]).entries).toEqual([]);
        expect(projectTaskHistory(data, data.board.tasks[0]).availableFrom).toBeUndefined();
        ensureBoardTimelineBaseline(data);
        expect(projectTaskHistory(data, data.board.tasks[0])).toMatchObject({ entries: [], baselineOnly: true });
    });
    it('keeps multi-field saves together, never groups legacy events by timestamp, and respects a sequence cutoff', () => {
        const data = setup();
        const first = update(data, 1, { title: 'Updated', description: 'Clarified', priority: 'high' });
        const second = update(data, 1, { status: 'done' });
        first.at = stamp; second.at = stamp;
        const history = projectTaskHistory(data, data.board.tasks[0]);
        expect(history.entries).toHaveLength(2);
        expect(history.entries[0].categories).toContain('status');
        expect(history.entries[1].changes.map((change) => change.field)).toEqual(['title', 'description', 'priority']);
        const selected = reconstructBoardStateFromTimeline(data, 1);
        expect(projectTaskHistory(data, selected.board.tasks[0], 1).entries).toHaveLength(1);
        const original = JSON.stringify(data); projectTaskHistory(data, data.board.tasks[0]); expect(JSON.stringify(data)).toBe(original);
    });
    it('captures operation IDs and historical names without inferring authors from participants', async () => {
        const data = setup(); data.board.tasks[0].assignees = ['Ana']; data.board.tasks[0].responsible = 'Ana';
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'History', handle: {}, data })] });
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn: vi.fn() });
        await actions.movePortfolioTaskToStatus('p', 1, 'done');
        const current = store.getState().portfolioBoards[0].data;
        const event = current.extensions.timeline!.events.at(-1)!;
        expect(event.meta?.operationId).toBeTruthy();
        current.board.columns.find((column) => column.status === 'done')!.title = 'Renamed now';
        const entry = projectTaskHistory(current, current.board.tasks[0]).entries[0];
        expect(entry.author).toBeUndefined();
        expect(entry.changes[0].after).toMatchObject({ id: 'done', label: 'done', historical: true });
    });
    it('attributes legacy relation changes to exactly the changed endpoints, in the correct direction', () => {
        const data = setup();
        const before: TaskRelation[] = [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 4, targetId: 5, kind: 'related' }];
        const after: TaskRelation[] = [{ sourceId: 1, targetId: 3, kind: 'blocks' }, before[1]];
        data.extensions.taskRelations = { version: 1, relations: before }; ensureBoardTimelineBaseline(data);
        data.extensions.taskRelations = { version: 1, relations: after };
        appendTimelineEvent(data, { kind: 'task.relations.updated', entityType: 'task', entityId: '1', summary: 'Relations updated', changes: { relations: { before, after } }, meta: { taskIds: [1, 2, 3, 4, 5] } });
        expect(projectTaskHistory(data, data.board.tasks[3]).entries).toHaveLength(0);
        expect(projectTaskHistory(data, data.board.tasks[4]).entries).toHaveLength(0);
        const removed = projectTaskHistory(data, data.board.tasks[1]).entries[0];
        expect(removed.changes[0].before).toEqual([{ direction: 'blockedBy', id: 1, title: 'Task 1' }]);
        expect(removed.changes[0].after).toEqual([]);
        expect(projectTaskHistory(data, data.board.tasks[2]).entries[0].categories).toEqual(['relations']);
    });
    it('projects bulk assignment and grouping deletion only to workitems actually changed', () => {
        const data = setup();
        const sprint = { id: 's', title: 'Sprint at date', startDate: '2026-10-01', endDate: '2026-10-30' };
        data.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [sprint] };
        data.board.tasks[0].sprintId = 's'; ensureBoardTimelineBaseline(data);
        data.board.tasks[1].sprintId = 's';
        appendTimelineEvent(data, { kind: 'roadmap.bulk-assigned', entityType: 'board', entityId: 'board', summary: 'Bulk', meta: { sprint, taskIds: [1, 2] } });
        expect(projectTaskHistory(data, data.board.tasks[0]).entries).toHaveLength(0);
        expect(projectTaskHistory(data, data.board.tasks[1]).entries[0]).toMatchObject({ bulk: true });
        data.extensions.roadmap.sprints = []; data.board.tasks[0].sprintId = ''; data.board.tasks[1].sprintId = '';
        appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Sprint deleted', snapshot: createBoardStateSnapshot(data) });
        expect(projectTaskHistory(data, data.board.tasks[0]).entries[0].changes[0]).toMatchObject({ field: 'sprintId', before: { id: 's', label: 'Sprint at date', historical: true }, after: '' });
    });
    it('includes planner blocks, archive/unarchive and restore effects without rendering attachment payloads', () => {
        const data = setup(); ensureBoardTimelineBaseline(data);
        const original = createBoardStateSnapshot(data);
        update(data, 1, { archived: true, attachments: [fromPartial({ id: 'a', name: 'image.png', mime: 'image/png', sizeBytes: 3, kind: 'image', dataUrl: 'data:image/png;base64,SECRET', createdAt: stamp })] });
        appendTimelineEvent(data, { kind: 'planner.block.added', entityType: 'task', entityId: '1', summary: 'Plan', changes: { block: { before: null, after: { id: 'b', taskId: 1, date: '2026-10-19', start: '09:00', end: '10:00' } } } });
        const timeline = data.extensions.timeline!;
        data.board = original.board; data.extensions = { ...original.extensions, timeline };
        recordBoardRestoreTimelineEvent(data, timeline.events[0]);
        const entries = projectTaskHistory(data, data.board.tasks[0]).entries;
        expect(entries[0].categories).toContain('restore');
        expect(entries.some((entry) => entry.categories.includes('planning'))).toBe(true);
        expect(JSON.stringify(entries)).not.toContain('SECRET');
    });
    it('separates proven legacy lifecycles and flags ambiguous restores without merging them', () => {
        const data = setup(); ensureBoardTimelineBaseline(data);
        const old = captureTaskTimelineSnapshot(data, 1)!;
        update(data, 1, { title: 'Old lifecycle' });
        data.board.tasks = data.board.tasks.filter((task) => task.id !== 1); recordTaskTimelineEvent(data, old, null);
        const fresh = normalizeTask({ ...old, title: 'New lifecycle', createdAt: '2026-10-20T10:00:00Z' });
        data.board.tasks.push(fresh); recordTaskTimelineEvent(data, null, fresh);
        expect(projectTaskHistory(data, fresh).entries).toHaveLength(1);
        expect(projectTaskHistory(data, fresh).entries[0].kinds).toEqual(['task.created']);
        const ambiguous = setup(); ensureBoardTimelineBaseline(ambiguous);
        const snapshot = createBoardStateSnapshot(ambiguous);
        recordTaskTimelineEvent(ambiguous, null, ambiguous.board.tasks[0]);
        appendTimelineEvent(ambiguous, { kind: 'board.restored', entityType: 'board', entityId: 'board', summary: 'Restore ambiguous', snapshot });
        expect(projectTaskHistory(ambiguous, ambiguous.board.tasks[0]).ambiguous).toBe(true);
    });
    it('preserves local authors and groups only explicit operation IDs', () => {
        const data = setup();
        const first = update(data, 1, { priority: 'high' }); first.meta = { operationId: 'op', author: { name: 'Explicit Ana', kind: 'local' } };
        const second = update(data, 1, { description: 'Second event of same operation' }); second.meta = { operationId: 'op' };
        const entries = projectTaskHistory(data, data.board.tasks[0]).entries;
        expect(entries).toHaveLength(1); expect(entries[0].eventIds).toHaveLength(2); expect(entries[0].author).toBe('Explicit Ana');
    });
    it('reserves identities after deletion, save/reopen and restoring an older snapshot', () => {
        const data = setup(); ensureBoardTimelineBaseline(data);
        const baseline = createBoardStateSnapshot(data);
        data.board.tasks.push(normalizeTask({ id: 9, title: 'Highest', createdAt: stamp })); recordTaskTimelineEvent(data, null, data.board.tasks.at(-1));
        const removed = data.board.tasks.pop()!; recordTaskTimelineEvent(data, removed, null);
        const reopened = serializeBoardDataFromObject(data);
        expect(nextTaskIdForBoard({ data: reopened })).toBe(10);
        baseline.extensions.timeline = reopened.extensions.timeline; reserveTaskIdentities(baseline, reopened);
        expect(nextTaskIdForBoard({ data: serializeBoardDataFromObject(baseline) })).toBe(10);
    });
    it('validates all manual and compatibility fixtures', () => {
        for (const file of ['test-board/us-6.board.json', 'tests/fixtures/us-6-partial.board.json', 'tests/fixtures/us-6-reused-id.board.json']) {
            const data = JSON.parse(readFileSync(file, 'utf8')); validateBoardData(data); validateBoardData(serializeBoardDataFromObject(data));
        }
    });
    it('presents partial legacy evidence without inventing prior labels or values', () => {
        const data = JSON.parse(readFileSync('tests/fixtures/us-6-partial.board.json', 'utf8'));
        const history = projectTaskHistory(data, data.board.tasks[0]);
        expect(history.entries).toHaveLength(2);
        expect(history.entries[0].partial).toBe(true);
        expect(history.entries[1].changes[0].before).toMatchObject({ id: 'to-do', historical: false, label: 'Current Ready' });
    });
});
