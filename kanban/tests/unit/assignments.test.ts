import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { getProjectInfo } from '../../src/domain/project';
import { assignmentNeedsReview, reconcileAssignments } from '../../src/domain/assignments';

it('migrates names to stable IDs and preserves multiple legacy names for explicit review', () => {
    const legacy = createEmptyProjectData('Team');
    legacy.board.tasks = [normalizeTask({ id: 1, title: 'Single', assignees: ['Ana'] }), normalizeTask({ id: 2, title: 'Multiple', assignees: ['Ana', 'Rui'] })];
    const data = serializeBoardDataFromObject(legacy), team = getProjectInfo(data).team;
    expect(data.board.tasks[0].assigneeId).toBe(team.find((m) => m.name === 'Ana')!.id);
    expect(data.board.tasks[1].assignees).toEqual(['Ana', 'Rui']);
    expect(assignmentNeedsReview(data, data.board.tasks[1])).toBe(true);
    const next = structuredClone(data);
    next.board.tasks[1].assigneeId = team[0].id; next.board.tasks[1].assignees = [team[0].name];
    reconcileAssignments(next, data);
    expect(next.board.tasks[1].legacyAssignees).toEqual(['Ana', 'Rui']);
});

it('rejects outsiders and inactive assignments but preserves existing inactive responsibility', () => {
    const legacy = createEmptyProjectData('Team');
    legacy.board.tasks = [normalizeTask({ id: 1, title: 'Single', assignees: ['Ana'] })];
    const data = serializeBoardDataFromObject(legacy), next = structuredClone(data);
    getProjectInfo(next).team[0].active = false;
    expect(() => reconcileAssignments(next, data)).not.toThrow();
    expect(assignmentNeedsReview(next, next.board.tasks[0])).toBe(true);
    next.board.tasks.push(normalizeTask({ id: 2, title: 'New', assignees: ['Ana'] }));
    expect(() => reconcileAssignments(next, data)).toThrow(/active/);
});
