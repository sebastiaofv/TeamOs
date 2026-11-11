import { describe, expect, it } from 'vitest';
import { normalizeTimelineEvent } from '../../src/domain/timelineSchema';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { createBoardStateSnapshot } from '../../src/domain/serialize';
import { fromProjectFile, toProjectFile, toProjectCheckpoint } from '../../src/domain/projectFormat';
import { newControlRecord, saveControlRecord } from '../../src/domain/projectControl';
import { applyProjectPatch, diffProjectState } from '../../src/domain/projectPatch';

function assignedProject() {
    const data = createEmptyProjectData('Rename', 'RNM');
    data.extensions.project!.members = [{ id: 'ana', name: 'Ana' }];
    data.board.tasks = [normalizeTask({ id: 1, title: 'Assigned task', status: 'to-do', assignees: ['Ana'], responsible: 'Ana', createdAt: data.meta.createdAt, updatedAt: data.meta.updatedAt })];
    saveControlRecord(data, { ...newControlRecord('risks'), title: 'Owned risk', owner: 'Ana', assignees: ['Ana'] }, 'Ana');
    return fromProjectFile(toProjectFile(data));
}

describe('project patch replay', () => {
    it('replays member renames in assignments without mutating earlier observations or author labels', () => {
        const current = assignedProject();
        const file = structuredClone(toProjectFile(current));
        (file.project.members as { id: string; name: string }[])[0].name = 'Ana Silva';
        const target = fromProjectFile(file);
        const ops = diffProjectState(toProjectCheckpoint(current), toProjectCheckpoint(target));
        const replayed = applyProjectPatch(current, ops);
        expect(() => createBoardStateSnapshot(replayed)).not.toThrow();
        expect(replayed.board.tasks[0]).toMatchObject({ assignees: ['Ana Silva'], responsible: 'Ana Silva' });
        expect(replayed.extensions.projectControl!.records[0]).toMatchObject({ owner: 'Ana Silva', assignees: ['Ana Silva'] });
        expect(current.board.tasks[0].assignees).toEqual(['Ana']);
        expect(current.extensions.projectControl!.records[0].owner).toBe('Ana');
        expect(toProjectFile(replayed)).toEqual(toProjectFile(target));
    });

    it.each([false, true])('replaces the unknown-extension subset, including complete removal (%s)', (keepOne) => {
        const before = assignedProject();
        before.extensions.customReport = { enabled: true };
        before.extensions.customTheme = 'blue';
        const after = structuredClone(before);
        delete after.extensions.customReport;
        if (!keepOne) delete after.extensions.customTheme;
        const result = applyProjectPatch(before, diffProjectState(toProjectCheckpoint(before), toProjectCheckpoint(after)));
        expect(result.extensions).not.toHaveProperty('customReport');
        expect(result.extensions.project).toEqual(before.extensions.project);
        expect(toProjectFile(result)).toEqual(toProjectFile(after));
        expect(before.extensions.customReport).toEqual({ enabled: true });
    });

    it('applies mixed bulk edits, deletion, insertion and explicit ordering by identity', () => {
        const before = assignedProject();
        before.board.tasks = Array.from({ length: 100 }, (_, index) => ({ ...before.board.tasks[0], id: index + 1, permanentId: `p${index + 1}` }));
        const after = structuredClone(before);
        after.board.tasks = after.board.tasks.slice(1).reverse().map((task) => ({ ...task, priority: 'high' }));
        after.board.tasks.splice(15, 0, { ...before.board.tasks[0], id: 101, permanentId: 'p101' });
        const result = applyProjectPatch(before, diffProjectState(toProjectCheckpoint(before), toProjectCheckpoint(after)));
        expect(toProjectFile(result)).toEqual(toProjectFile(after));
        expect(before.board.tasks[0].id).toBe(1);
    });
});

describe('patch validation at the history boundary', () => {
    const event = (patch: unknown) => normalizeTimelineEvent({ id: 'bad', at: '2026-11-09T00:00:00Z', kind: 'board.control.updated', entityType: 'board', entityId: 'board', patch });
    it.each([
        [{ op: 'upsert', at: 'unknown.path', key: '1', value: {} }],
        [{ op: 'unknown', at: 'workitems', key: '1' }],
        [{ op: 'set', at: 'workitems', value: [] }],
        [{ op: 'set', at: 'project', value: null }],
        [{ op: 'remove', at: 'workitems' }],
        [{ op: 'order', at: 'workitems', keys: ['1', '1'] }],
        [{ op: 'upsert', at: 'workitems', key: '1', value: { id: 1 } }],
        [{ op: 'set', at: 'extensions', value: { project: {} } }],
        [{ op: 'set', at: 'workflow', value: { technical: {}, functional: {} } }],
        [{ op: 'upsert', at: 'roadmap.sprintParticipation', key: 's:1', value: { sprintId: 's', task: null, at: 'invalid' } }]
    ])('rejects malformed operations before replay: %j', (op) => {
        expect(event([op])).toBeNull();
    });

    it('rejects an upsert whose payload has a different identity or invalid timestamp', () => {
        const task = toProjectFile(assignedProject()).workitems[0];
        expect(event([{ op: 'upsert', at: 'workitems', key: '99', value: task }])).toBeNull();
        for (const invalid of [{ dueDate: {} }, { attachments: [null] }, { parentId: '1' }, { phaseId: 3 }]) {
            expect(event([{ op: 'upsert', at: 'workitems', key: '1', value: { ...task, ...invalid } }])).toBeNull();
        }
        expect(event([{ op: 'upsert', at: 'workitems', key: '1', value: { ...task, statusChangedAt: 'invalid' } }])).toBeNull();
    });

    it('accepts the actual diff contract, including ordering and removal', () => {
        const before = assignedProject();
        const after = structuredClone(before);
        after.board.tasks[0].description = 'Edited';
        after.extensions.custom = { value: 3 };
        expect(event(diffProjectState(toProjectCheckpoint(before), toProjectCheckpoint(after)))).not.toBeNull();
    });
});

it('accepts colored Phase patches supported by the Roadmap contract', () => {
    const event = normalizeTimelineEvent({ id: 'phase', at: '2026-11-09T00:00:00Z', kind: 'roadmap.updated', entityType: 'board', entityId: 'board', patch: [{ op: 'upsert', at: 'roadmap.phases', key: 'phase', value: { id: 'phase', title: 'Phase', startDate: '2026-01-01', endDate: '2026-01-02', color: '#2563eb' } }] });
    expect(event).not.toBeNull();
});
