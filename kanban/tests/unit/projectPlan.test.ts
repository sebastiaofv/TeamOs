import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { executionProgress, planWorkitems, validatePhaseHierarchy } from '../../src/domain/projectPlan';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('uses leaf phases and unique eligible workitems for progress', () => {
    const data = createEmptyProjectData('Plan');
    data.extensions.roadmap = { version: 1, phases: [{ id: 'parent', title: 'Plan', startDate: '2026-01-01', endDate: '2026-12-31' }, { id: 'leaf', title: 'Build', startDate: '2026-01-01', endDate: '2026-12-31' }], sprints: [], milestones: [] };
    data.extensions.projectPlan = { version: 1, phases: { leaf: { parentId: 'parent' } } };
    data.board.tasks = [normalizeTask({ id: 1, title: 'Story', workitemType: 'story', phaseId: 'leaf' }), normalizeTask({ id: 2, title: 'Child', parentId: 1, status: 'done' }), normalizeTask({ id: 3, title: 'Other', phaseId: 'leaf' })];
    validatePhaseHierarchy(data);
    const progress = executionProgress(data, planWorkitems(data, 'phases', 'parent'));
    expect(progress.percent).toBe(50);
    expect(progress.eligible.map((t) => t.id)).toEqual([2, 3]);
    expect(executionProgress(data, []).percent).toBeNull();
    expect(serializeBoardDataFromObject(data).extensions.projectPlan).toEqual(data.extensions.projectPlan);
    data.board.tasks[2].phaseId = 'parent';
    expect(() => validatePhaseHierarchy(data)).toThrow(/leaf phase/);
});
