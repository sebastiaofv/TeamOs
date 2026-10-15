import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { buildProjectDashboard, isCurrentPlanPhase } from '../../src/features/portfolio/queries/projectDashboard';
import { getWorkflow } from '../../src/domain/workflow';

it('computes verifiable leaf-only semantic metrics for exactly one project', () => {
    const data = createEmptyProjectData('Project');
    const workflow = getWorkflow(data);
    workflow.states.push({ id: 'wf_cancelled', name: 'Cancelled', category: 'cancelled', color: '#777777' });
    data.extensions.workflow = workflow;
    data.extensions.roadmap = { version: 1, phases: [{ id: 'p', title: 'Build', startDate: '2026-01-01', endDate: '2026-12-31' }], milestones: [], sprints: [] };
    data.board.tasks = [normalizeTask({ id: 1, title: 'Story', workitemType: 'story', phaseId: 'p' }), normalizeTask({ id: 2, title: 'Done', parentId: 1, status: 'done' }), normalizeTask({ id: 3, title: 'Late', parentId: 1, blocked: true, blockerReason: 'External', dueDate: '2026-01-01', assignees: ['Ana'] }), normalizeTask({ id: 4, title: 'Open', phaseId: 'p' }), normalizeTask({ id: 5, title: 'Cancelled', status: 'wf_cancelled' }), normalizeTask({ id: 6, title: 'Archived', status: 'done', archived: true })];
    const model = buildProjectDashboard(data, [data], '2026-06-01');
    expect(model.progress.eligible.map((task) => task.id)).toEqual([2, 3, 4]);
    expect(model.metrics.open.map((task) => task.id)).toEqual([3, 4]);
    expect(model.metrics.overdue.map((task) => task.id)).toEqual([3]);
    expect(model.metrics.blocked.map((task) => task.id)).toEqual([3]);
    expect(model.groups[0].percent).toBeCloseTo(100 / 3);
    expect(isCurrentPlanPhase(data, 'p', '2026-06-01')).toBe(true);
    data.extensions.projectPlan = { version: 1, phases: { p: { parentId: '', actual: { start: '2026-01-01', end: '2026-02-01' } } } };
    expect(isCurrentPlanPhase(data, 'p', '2026-06-01')).toBe(false);
});
