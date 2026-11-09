import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { createHistoryWriter, eventFromFile, eventToFile } from '../../src/domain/projectHistoryFormat';
import { appendTimelineEvent, applyTimelineEventToState, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { createBoardStateSnapshot } from '../../src/domain/serialize';
import { newControlRecord, saveControlRecord } from '../../src/domain/projectControl';
import type { BoardData, TimelineEvent } from '../../src/domain/types';

function fixture() {
    const data = createEmptyProjectData('Replay', 'RPL');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task', status: 'backlog', createdAt: data.meta.createdAt, updatedAt: data.meta.updatedAt })];
    ensureBoardTimelineBaseline(data);
    return data;
}

function convertTimeline(data: BoardData) {
    const writer = createHistoryWriter(undefined);
    data.extensions.timeline!.events = data.extensions.timeline!.events.map((event) => eventFromFile(eventToFile(event, writer)) as TimelineEvent);
    data.extensions.projectStorage = { version: 1, baselineEventId: data.extensions.timeline!.baselineEventId };
}

describe('volume checkpoints', () => {
    it.each(['sprintResults', 'sprintParticipation'] as const)('replays a %s event promoted to a checkpoint', (field) => {
        const data = fixture();
        const writer = createHistoryWriter(undefined);
        const baseline = eventToFile(data.extensions.timeline!.events[0], writer);
        const initial = eventFromFile(baseline).snapshot as BoardData;
        writer.patchBytes = writer.checkpointBytes;
        const after = field === 'sprintResults'
            ? { version: 1, credits: [{ taskKey: 'k1', taskId: 1, sprintId: 's1', storyPoints: 5, at: data.meta.createdAt }], closures: [] }
            : { version: 1, entries: [{ sprintId: 's1', task: data.board.tasks[0], at: data.meta.createdAt }] };
        const event: TimelineEvent = { id: 'sprint-update', at: data.meta.createdAt, kind: field === 'sprintResults' ? 'sprint.results.updated' : 'sprint.participation.updated', entityType: 'board', entityId: 'board', summary: 'Sprint', changes: { [field]: { before: null, after } } };
        const disk = eventToFile(event, writer);
        expect(disk).toHaveProperty('checkpoint');
        expect(applyTimelineEventToState(initial, eventFromFile(disk) as TimelineEvent)?.extensions?.[field]).toEqual(after);
    });

    it('checkpoints ordinary workitem changes and retains creation evidence', () => {
        const data = fixture();
        for (let index = 0; index < 40; index++) appendTimelineEvent(data, { id: `edit-${index}`, kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Edit', changes: { description: { before: `${index - 1}`, after: `${index} ${'é'.repeat(500)}` } } });
        const writer = createHistoryWriter(undefined);
        const stored = data.extensions.timeline!.events.map((event) => eventToFile(event, writer));
        expect(stored.slice(1).some((event) => event.checkpoint)).toBe(true);
        writer.patchBytes = writer.checkpointBytes;
        const task = { ...data.board.tasks[0], id: 2, title: 'Created task' };
        const created = eventToFile({ id: 'created', kind: 'task.created', at: data.meta.createdAt, entityType: 'task', entityId: '2', summary: 'Created', snapshot: task }, writer);
        expect(created).toHaveProperty('checkpoint');
        expect(created.task).toMatchObject({ id: 2, title: 'Created task' });
        expect(eventFromFile(created).snapshot).toMatchObject({ id: 2 });
    });

    it('reconstructs from the nearest checkpoint without applying earlier changes again', () => {
        const data = fixture();
        appendTimelineEvent(data, { id: 'older', kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Older', changes: { description: { before: '', after: 'Earlier' } } });
        data.board.tasks[0].description = 'Checkpoint';
        appendTimelineEvent(data, { id: 'checkpoint', kind: 'board.restored', entityType: 'board', entityId: 'board', summary: 'Checkpoint', snapshot: createBoardStateSnapshot(data) });
        appendTimelineEvent(data, { id: 'newer', kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Newer', changes: { description: { before: 'Checkpoint', after: 'Latest' } } });
        convertTimeline(data);
        const older = data.extensions.timeline!.events[1];
        const changes = older.changes;
        let reads = 0;
        Object.defineProperty(older, 'changes', { enumerable: true, get: () => { reads++; return changes; } });
        expect(reconstructBoardStateFromTimeline(data, 3).board.tasks[0].description).toBe('Latest');
        expect(reads).toBe(0);
    });
});

describe('Project Control historical publication', () => {
    it.each(['2026-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'])('uses sequence for equal or out-of-order timestamps (%s)', (commentAt) => {
        const data = fixture();
        const record = saveControlRecord(data, { ...newControlRecord('risks'), title: 'Risk' }, 'Ana');
        appendTimelineEvent(data, { id: 'record-created', at: '2026-01-01T00:00:00.000Z', kind: 'board.control.updated', entityType: 'board', entityId: record.id, summary: 'Create', snapshot: createBoardStateSnapshot(data) });
        data.extensions.projectControl!.records[0].comments.push({ id: 'later-comment', at: commentAt, author: { name: 'Ana', kind: 'local' }, text: 'Future', images: [] });
        appendTimelineEvent(data, { id: 'record-comment', at: commentAt, kind: 'board.control.comment', entityType: 'board', entityId: record.id, summary: 'Comment', snapshot: createBoardStateSnapshot(data) });
        const original = [1, 2].map((index) => reconstructBoardStateFromTimeline(data, index).extensions.projectControl!.records[0]);
        convertTimeline(data);
        for (const [position, index] of [1, 2].entries()) {
            const observed = reconstructBoardStateFromTimeline(data, index).extensions.projectControl!.records[0];
            expect(observed.comments).toEqual(original[position].comments);
            expect(observed.history).toEqual(original[position].history);
        }
        expect(reconstructBoardStateFromTimeline(data, 1).extensions.projectControl!.records[0].comments).toEqual([]);
    });
});

it('does not start reconstruction from a partial legacy columns snapshot', () => {
    const data = fixture();
    appendTimelineEvent(data, { id: 'columns', kind: 'board.columns.updated', entityType: 'board', entityId: 'board', summary: 'Columns', changes: { columns: { before: data.board.columns, after: data.board.columns } }, snapshot: { board: { columns: data.board.columns } } as never });
    expect(reconstructBoardStateFromTimeline(data, 1).board.tasks.map((task) => task.id)).toEqual([1]);
});

it('retains control comment bodies and proven membership through restore and legacy conversion', async () => {
    const { convertLegacyProject, archivesFromRecordHistory } = await import('../../src/domain/projectHistoryFormat');
    const { fromProjectFile } = await import('../../src/domain/projectFormat');
    const { attachHistoryArchives } = await import('../../src/infrastructure/persistence/projectDirectory');
    const data = fixture();
    const risk = saveControlRecord(data, { ...newControlRecord('risks'), title: 'Restored risk' }, 'Ana');
    risk.comments.push({ id: 'c1', at: data.meta.createdAt, author: { name: 'Ana', kind: 'local' }, text: 'First', images: [] });
    appendTimelineEvent(data, { id: 'risk-created', kind: 'board.control.updated', entityType: 'board', entityId: risk.id, summary: 'Risk', snapshot: createBoardStateSnapshot(data) });
    risk.comments.push({ id: 'c2', at: data.meta.createdAt, author: { name: 'Ana', kind: 'local' }, text: 'Second', images: [] });
    appendTimelineEvent(data, { id: 'risk-comment', kind: 'board.control.comment', entityType: 'board', entityId: risk.id, summary: 'Comment', snapshot: createBoardStateSnapshot(data) });
    let restored = reconstructBoardStateFromTimeline(data, 1);
    restored.extensions.timeline = data.extensions.timeline;
    appendTimelineEvent(restored, { id: 'restore-one', kind: 'board.restored', entityType: 'board', entityId: 'board', summary: 'One comment', snapshot: createBoardStateSnapshot(restored) });
    restored = reconstructBoardStateFromTimeline(restored, 0);
    restored.extensions.timeline = data.extensions.timeline;
    appendTimelineEvent(restored, { id: 'restore-empty', kind: 'board.restored', entityType: 'board', entityId: 'board', summary: 'No records', snapshot: createBoardStateSnapshot(restored) });
    const expected = restored.extensions.timeline!.events.map((_, index) => reconstructBoardStateFromTimeline(restored, index).extensions.projectControl?.records || []);
    const converted = convertLegacyProject({ project: restored, events: restored.extensions.timeline!.events, archives: {}, projectHash: 'h1' });
    expect(converted.project.comments.filter((comment) => (comment.subject as { type: string }).type === 'control').map((comment) => comment.id)).toEqual(['c1', 'c2']);
    const reopened = fromProjectFile(converted.project);
    const raw = JSON.parse(converted.historyText);
    reopened.extensions.timeline = { version: 1, baselineEventId: raw.baselineEventId, events: raw.events.map(eventFromFile) };
    attachHistoryArchives(reopened, archivesFromRecordHistory(raw.recordHistory));
    for (const [index, records] of expected.entries()) {
        const actual = reconstructBoardStateFromTimeline(reopened, index).extensions.projectControl?.records || [];
        expect(actual.map((record) => ({ id: record.id, comments: record.comments, history: record.history })), `event ${index}`).toEqual(records.map((record) => ({ id: record.id, comments: record.comments, history: record.history })));
    }
});

it('keeps active comment membership distinct from retained historical bodies after reopening', async () => {
    const { fromProjectFile, toProjectFile } = await import('../../src/domain/projectFormat');
    const { retainControlContext } = await import('../../src/domain/controlHistory');
    const data = fixture();
    const record = saveControlRecord(data, { ...newControlRecord('risks'), title: 'Risk' }, 'Ana');
    record.comments.push({ id: 'c1', at: data.meta.createdAt, author: { name: 'Ana', kind: 'local' }, text: 'First', images: [] });
    appendTimelineEvent(data, { id: 'first', kind: 'board.control.updated', entityType: 'board', entityId: record.id, summary: 'First', snapshot: createBoardStateSnapshot(data) });
    record.comments.push({ id: 'c2', at: data.meta.createdAt, author: { name: 'Ana', kind: 'local' }, text: 'Second', images: [] });
    const restored = reconstructBoardStateFromTimeline(data, 1);
    retainControlContext(restored, data);
    const file = toProjectFile(restored);
    expect(file.comments).toHaveLength(2);
    expect(fromProjectFile(file).extensions.projectControl!.records[0].comments.map((comment) => comment.id)).toEqual(['c1']);
    const invalid = structuredClone(file);
    invalid.comments[1].at = 'invalid';
    expect(() => fromProjectFile(invalid)).toThrow();
});

it('does not expand an explicit historical record-history membership when attaching archives', async () => {
    const { retainControlContext } = await import('../../src/domain/controlHistory');
    const { attachHistoryArchives } = await import('../../src/infrastructure/persistence/projectDirectory');
    const data = fixture();
    const first = saveControlRecord(data, { ...newControlRecord('risks'), title: 'First' }, 'Ana');
    appendTimelineEvent(data, { id: 'first', kind: 'board.control.updated', entityType: 'board', entityId: first.id, summary: 'First', snapshot: createBoardStateSnapshot(data) });
    saveControlRecord(data, { ...first, title: 'Second' }, 'Ana');
    const restored = reconstructBoardStateFromTimeline(data, 1);
    const expected = restored.extensions.projectControl!.records[0].history;
    retainControlContext(restored, data);
    attachHistoryArchives(restored, { [`control:${first.id}`]: { history: data.extensions.projectControl!.records[0].history } });
    expect(restored.extensions.projectControl!.records[0].history).toEqual(expected);
});
