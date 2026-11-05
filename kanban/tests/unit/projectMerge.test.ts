import { readFileSync } from 'node:fs';
import { buildComment, getComments } from '../../src/domain/comments';
import { ensureBoardTimelineBaseline, appendTimelineEvent } from '../../src/domain/timeline';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { cloneSerializable } from '../../src/domain/serializable';
import { mergeProject } from '../../src/domain/projectMerge';

function versions() {
    let base = createEmptyProjectData('Merge');
    base.board.tasks = [1, 2].map((id) => normalizeTask({ id, permanentId: `item-${id}`, title: `Task ${id}`, status: 'backlog' }));
    base = serializeBoardDataFromObject(base);
    return { base, local: cloneSerializable(base), external: cloneSerializable(base) };
}

describe('three-way project merge', () => {
    it('merges independent workitems and independent fields of the same workitem without mutating inputs', () => {
        const { base, local, external } = versions();
        local.board.tasks[0].title = 'Local title';
        external.board.tasks[0].description = 'External description';
        external.board.tasks[1].title = 'External title';
        const original = JSON.stringify({ base, local, external });
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.board.tasks[0]).toMatchObject({ title: 'Local title', description: 'External description' });
        expect(result.merged.board.tasks[1].title).toBe('External title');
        expect(JSON.stringify({ base, local, external })).toBe(original);
    });
    it('compares permanent identities even when workitems are reordered', () => {
        const { base, local, external } = versions();
        local.board.tasks.reverse(); local.board.tasks[0].title = 'Second';
        external.board.tasks[0].title = 'First';
        expect(mergeProject(base, local, external).merged.board.tasks.map((t) => t.title)).toEqual(['Second', 'First']);
    });
    it('returns all three values when the same field changes differently', () => {
        const { base, local, external } = versions();
        local.board.tasks[0].title = 'Mine'; external.board.tasks[0].title = 'Theirs';
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0]).toMatchObject({ path: 'board.tasks[item-1].title', base: 'Task 1', local: 'Mine', external: 'Theirs' });
        const resolved = mergeProject(base, local, external, { decisions: { [result.conflicts[0].key]: 'external' } });
        expect(resolved.conflicts).toEqual([]);
        expect(resolved.merged.board.tasks[0].title).toBe('Theirs');
    });
    it.each(['local', 'external'] as const)('detects deletion versus an edit on the %s side', (side) => {
        const { base, local, external } = versions();
        const mine = side === 'local' ? local : external;
        const theirs = side === 'local' ? external : local;
        mine.board.tasks[0].title = 'Edited'; theirs.board.tasks.shift();
        expect(mergeProject(base, local, external).conflicts[0].reason).toBe('delete-edit');
    });
    it('accepts identical edits, one-sided additions and deletion of an unchanged entity', () => {
        const { base, local, external } = versions();
        local.board.tasks[0].title = external.board.tasks[0].title = 'Same';
        external.board.tasks.pop();
        local.extensions.roadmap = { version: 1, phases: [{ id: 'phase', title: 'Phase', startDate: '2026-11-01', endDate: '2026-11-05' }], milestones: [], sprints: [] };
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.board.tasks).toHaveLength(1);
        expect(result.merged.extensions.roadmap?.phases).toHaveLength(1);
    });
    it('unions append-only events and sprint participations by identity', () => {
        const { base, local, external } = versions();
        const event = (id: string) => ({ id, kind: 'task.updated', at: base.meta.createdAt, entityType: 'task' as const, entityId: '1', summary: id });
        base.extensions.timeline = { version: 1, baselineEventId: 'baseline', events: [{ ...event('baseline'), kind: 'board.baseline', entityType: 'board', entityId: 'board' }] };
        local.extensions.timeline = { ...base.extensions.timeline, events: [...base.extensions.timeline.events, event('mine')] };
        external.extensions.timeline = { ...base.extensions.timeline, events: [...base.extensions.timeline.events, event('theirs')] };
        local.extensions.sprintParticipation = { version: 1, entries: [{ sprintId: 'a', task: local.board.tasks[0], at: base.meta.createdAt }] };
        external.extensions.sprintParticipation = { version: 1, entries: [{ sprintId: 'b', task: external.board.tasks[1], at: base.meta.createdAt }] };
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.extensions.timeline?.events.map((e) => e.id)).toEqual(['baseline', 'mine', 'theirs']);
        expect(result.merged.extensions.sprintParticipation?.entries).toHaveLength(2);
    });
    it('unions concurrent published comments with their canonical events', () => {
        const { base, local, external } = versions();
        for (const [data, id] of [[local, 'mine'], [external, 'theirs']] as const) {
            ensureBoardTimelineBaseline(data);
            const comment = buildComment(data, 1, { id, text: id, author: id, images: [] }, { writable: true, historical: false });
            data.extensions.conversations = { version: 1, entries: [comment] };
            appendTimelineEvent(data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '1', summary: id,
                meta: { commentId: id, workitemKey: comment.workitemKey } });
        }
        expect(local.extensions.timeline!.baselineEventId).toBe(external.extensions.timeline!.baselineEventId);
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]); validateBoardData(result.merged);
        expect(getComments(result.merged).map((comment) => comment.id)).toEqual(['mine', 'theirs']);
    });
    it('does not silently union new append-only entries from a regressed file', () => {
        const { base, local, external } = versions();
        external.extensions.sprintParticipation = { version: 1, entries: [{ sprintId: 'old', task: external.board.tasks[0], at: base.meta.createdAt }] };
        expect(mergeProject(base, local, external, { regression: true }).conflicts.length).toBeGreaterThan(0);
    });
    it('requires acknowledgement even for a replacement with identical normalized content at an equal revision', () => {
        const { base, local, external } = versions();
        const result = mergeProject(base, local, external, { regression: true });
        expect(result.conflicts[0].reason).toBe('regression');
        expect(mergeProject(base, local, external, { regression: true, decisions: { [result.conflicts[0].key]: 'external' } }).conflicts).toEqual([]);
    });
    it('turns incompatible hierarchy changes into an explicit integrity conflict', () => {
        const { base, local, external } = versions();
        base.extensions.roadmap = { version: 1, phases: ['a', 'b'].map((id) => ({ id, title: id, startDate: '2026-11-01', endDate: '2026-11-05' })), milestones: [], sprints: [] };
        local.extensions.roadmap = cloneSerializable(base.extensions.roadmap); external.extensions.roadmap = cloneSerializable(base.extensions.roadmap);
        local.extensions.roadmap.phases[0].parentId = 'b'; external.extensions.roadmap.phases[1].parentId = 'a';
        validateBoardData(local); validateBoardData(external);
        expect(mergeProject(base, local, external).conflicts.some((c) => c.reason === 'integrity')).toBe(true);
    });
    it('never automatically accepts collisions in project-local workitem numbers', () => {
        const { base, local, external } = versions();
        local.board.tasks.push({ ...cloneSerializable(local.board.tasks[0]), id: 3, permanentId: 'new-local' });
        external.board.tasks.push({ ...cloneSerializable(external.board.tasks[0]), id: 3, permanentId: 'new-external' });
        expect(mergeProject(base, local, external).conflicts.some((c) => c.reason === 'integrity')).toBe(true);
    });
    it('merges workflow and settings fields and treats rollback differences as conflicts', () => {
        const { base, local, external } = versions();
        local.extensions.project!.description = 'Local'; external.extensions.workflow!.states[0].name = 'External backlog'; external.board.columns[0].title = 'External backlog';
        expect(mergeProject(base, local, external).conflicts).toEqual([]);
        expect(mergeProject(base, local, external, { regression: true }).conflicts.length).toBeGreaterThan(0);
    });
    it('treats meta.revision as optional, preserving it across serialization and snapshots', () => {
        const { base } = versions();
        validateBoardData(base);
        base.meta.revision = 4;
        const serialized = serializeBoardDataFromObject(base);
        expect(serialized.meta.revision).toBe(4); validateBoardData(serialized);
        for (const revision of [-1, 1.5, '1', null]) expect(() => validateBoardData({ ...base, meta: { ...base.meta, revision } })).toThrow('revision');
    });
    it('rejects dangling relations introduced by independently valid edits', () => {
        const { base, local, external } = versions();
        local.board.tasks.pop();
        external.extensions.taskRelations = { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }] };
        validateBoardData(local); validateBoardData(external);
        local.extensions.project!.description = 'Independent local setting';
        external.board.tasks[0].title = 'Independent external title';
        const result = mergeProject(base, local, external);
        expect(result.conflicts.some((c) => c.reason === 'integrity')).toBe(true);
        const integrity = result.conflicts.find((c) => c.reason === 'integrity')!;
        const resolved = mergeProject(base, local, external, { decisions: { [integrity.key]: 'external' } });
        expect(resolved.conflicts).toEqual([]); validateBoardData(resolved.merged);
        expect(resolved.merged.extensions.project!.description).toBe('Independent local setting');
        expect(resolved.merged.board.tasks[0].title).toBe('Independent external title');
    });
});


describe('US-28 manual fixture', () => {
    it('validates and round-trips stable identities and the revision', () => {
        const fixture: unknown = JSON.parse(readFileSync('test-board/us-28.board.json', 'utf8'));
        validateBoardData(fixture);
        const saved = serializeBoardDataFromObject(fixture);
        validateBoardData(saved);
        expect(saved.meta.revision).toBe(0);
        expect(saved.board.tasks.map((task) => task.permanentId)).toEqual(fixture.board.tasks.map((task) => task.permanentId));
        delete saved.meta.revision;
        validateBoardData(saved);
    });
});
