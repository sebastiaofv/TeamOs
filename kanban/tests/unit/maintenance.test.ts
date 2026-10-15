import { expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { getProjectInfo } from '../../src/domain/project';
import { enableMaintenance } from '../../src/domain/applications';
import { moveWorkitemContext, workitemSubtree } from '../../src/domain/maintenance';
import { executionProgress } from '../../src/domain/projectPlan';
import { applyMaintenanceWorkflow, getTaskWorkflow } from '../../src/domain/workflow';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('moves a subtree without duplicating IDs or losing planning and restores it on return', () => {
    const data = createEmptyProjectData('Project'); data.extensions.project = { ...getProjectInfo(data), product: 'App' };
    data.extensions.roadmap = { version: 1, phases: [{ id: 'p', title: 'Phase', startDate: '2026-01-01', endDate: '2026-12-31' }], milestones: [], sprints: [] };
    data.board.tasks = [normalizeTask({ id: 1, title: 'Story', workitemType: 'story', phaseId: 'p' }), normalizeTask({ id: 2, title: 'Task', parentId: 1, status: 'done' }), normalizeTask({ id: 3, title: 'Another task' })];
    enableMaintenance(data);
    expect(workitemSubtree(data, 1).map((task) => task.id)).toEqual([1, 2]);
    moveWorkitemContext(data, 1, 'maintenance', {});
    expect(data.board.tasks).toHaveLength(3);
    expect(executionProgress(data).eligible.map((task) => task.id)).toEqual([3]);
    expect(executionProgress(data, data.board.tasks, 'maintenance').eligible.map((task) => task.id)).toEqual([2]);
    expect(data.board.tasks[0].phaseId).toBe('');
    expect(data.board.tasks[0].maintenanceOrigin?.phaseId).toBe('p');
    moveWorkitemContext(data, 1, 'project', {});
    expect(data.board.tasks[0].phaseId).toBe('p');
    expect(data.board.tasks[1].parentId).toBe(1);
    const reopened = serializeBoardDataFromObject(data); validateBoardData(reopened);
    expect(reopened.board.tasks).toEqual(data.board.tasks);
});

it('supports a distinct maintenance workflow with explicit source-state mapping', () => {
    const data = createEmptyProjectData('Project'); data.extensions.project = { ...getProjectInfo(data), product: 'App' };
    data.board.tasks = [normalizeTask({ id: 1, title: 'Bug', workitemType: 'bug', status: 'doing' })];
    enableMaintenance(data);
    applyMaintenanceWorkflow(data, { version: 1, initialStateId: 'wf_triage', states: [{ id: 'wf_triage', name: 'Triage', color: '#123456', category: 'not-started' }, { id: 'wf_fixed', name: 'Fixed', color: '#123456', category: 'completed' }], transitions: [{ from: 'wf_triage', to: 'wf_fixed' }] }, {});
    expect(() => moveWorkitemContext(data, 1, 'maintenance', {})).toThrow(/Map every/);
    moveWorkitemContext(data, 1, 'maintenance', { doing: 'wf_triage' });
    expect(getTaskWorkflow(data, data.board.tasks[0]).initialStateId).toBe('wf_triage');
    validateBoardData(serializeBoardDataFromObject(data));
});
