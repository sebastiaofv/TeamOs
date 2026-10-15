import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { buildDrilldownTree, planDrilldownTasks, unassociatedPlanTasks } from '../../src/features/portfolio/queries/planDrilldown';

it('includes direct workitems and unique inherited descendants, leaving unclassified items reachable', () => {
    const data = createEmptyProjectData('Drilldown');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Epic', workitemType: 'epic', phaseId: 'p' }), normalizeTask({ id: 2, title: 'Story', workitemType: 'story', parentId: 1 }), normalizeTask({ id: 3, title: 'Task', parentId: 2, phaseId: 'p', sprintId: 'cross' }), normalizeTask({ id: 4, title: 'Unclassified' }), normalizeTask({ id: 5, title: 'Archived', parentId: 2, archived: true })];
    const result = planDrilldownTasks(data, 'phases', 'p');
    expect(result.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
    const tree = buildDrilldownTree(result.tasks, result.directIds);
    expect(tree).toHaveLength(1); expect(tree[0].children[0].direct).toBe(false);
    expect(tree[0].children[0].children[0].task.id).toBe(3);
    expect(unassociatedPlanTasks(data).map((t) => t.id)).toEqual([4]);
    expect(planDrilldownTasks(data, 'phases', 'p', true).tasks.map((t) => t.id)).toEqual([1, 2, 3, 5]);
});
