import type { BoardData, Task } from './types';
import { getMaintenanceConfig, projectApplication } from './applications';
import { getWorkflow, getTaskWorkflow } from './workflow';
import { getProjectInfo } from './project';
import { getRoadmapExtension } from './roadmap';
import { collectDescendants, groupBy, nowIso } from './util';
import { taskWorkContext, type WorkContext } from './workitems';

export type MaintenanceOrigin = { projectId: string; phaseId: string; milestoneId: string; sprintId: string; status: string; parentId: number | null };
export { taskWorkContext, type WorkContext } from './workitems';
export function workitemSubtree(data: BoardData, rootId: number): Task[] {
    const children = groupBy(data.board.tasks, (task) => task.parentId);
    const included = collectDescendants(data.board.tasks.filter((task) => task.id === rootId), (task) => children.get(task.id) || []);
    return data.board.tasks.filter((task) => included.has(task));
}
export function moveWorkitemContext(data: BoardData, taskId: number, target: WorkContext, mapping: Record<string, string>): number[] {
    const root = data.board.tasks.find((task) => task.id === taskId), app = projectApplication(data);
    if (!root || taskWorkContext(root) === target) throw new Error('Choose a workitem in the other context.');
    if (target === 'maintenance' && (!getMaintenanceConfig(data)?.enabled || !app)) throw new Error('Enable application maintenance first.');
    const tasks = workitemSubtree(data, taskId);
    const workflow = target === 'maintenance' ? getMaintenanceConfig(data)?.workflow || getWorkflow(data) : getWorkflow(data);
    const valid = new Set(workflow.states.map((state) => state.id));
    for (const task of tasks) {
        const restore = target === 'project' ? task.maintenanceOrigin?.status : undefined;
        const status = mapping[task.status] || (restore && valid.has(restore) ? restore : valid.has(task.status) ? task.status : '');
        if (!valid.has(status)) throw new Error('Map every source state to a destination workflow state.');
        if (target === 'maintenance') {
            task.maintenanceOrigin = { projectId: getProjectInfo(data).id, phaseId: task.phaseId, milestoneId: task.milestoneId, sprintId: task.sprintId, status: task.status, parentId: task.parentId || null };
            task.applicationId = app!.id; task.phaseId = ''; task.milestoneId = ''; task.sprintId = '';
        } else {
            const origin = task.maintenanceOrigin, roadmap = getRoadmapExtension(data);
            task.phaseId = origin?.phaseId && roadmap?.phases.some((phase) => phase.id === origin.phaseId) ? origin.phaseId : '';
            task.milestoneId = origin?.milestoneId && roadmap?.milestones.some((item) => item.id === origin.milestoneId) ? origin.milestoneId : '';
            task.sprintId = origin?.sprintId && roadmap?.sprints.some((item) => item.id === origin.sprintId) ? origin.sprintId : '';
        }
        task.workContext = target; task.status = status; task.updatedAt = nowIso();
    }
    const oldParent = target === 'project' ? root.maintenanceOrigin?.parentId : null;
    root.parentId = oldParent && data.board.tasks.some((task) => task.id === oldParent && taskWorkContext(task) === target) ? oldParent : null;
    return tasks.map((task) => task.id);
}
export function contextWorkflow(data: BoardData, context: WorkContext) { return getTaskWorkflow(data, { workContext: context }); }
