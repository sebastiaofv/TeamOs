import type { BoardData, Task } from '@/domain/types';
import { executionProgress, planWorkitems, getProjectPlan } from '@/domain/projectPlan';
import { getRoadmapExtension } from '@/domain/roadmap';
import { dependencyBlockedKeys, refKey, taskRef } from '@/domain/relations';
import { isTaskCompleted } from '@/domain/workflow';

export type ProjectMetric = 'open' | 'completed' | 'blocked' | 'overdue' | 'unassigned';
export function isCurrentPlanPhase(data: BoardData, phaseId: string, today: string): boolean {
    const phase = getRoadmapExtension(data)?.phases.find((phase) => phase.id === phaseId), actual = getProjectPlan(data).phases[phaseId]?.actual;
    if (actual?.end) return false;
    if (actual?.start) return actual.start <= today;
    return Boolean(phase?.startDate && phase.endDate && phase.startDate <= today && phase.endDate >= today);
}
export function buildProjectDashboard(data: BoardData, loadedBoards: readonly BoardData[], today: string) {
    const progress = executionProgress(data), blockedKeys = dependencyBlockedKeys(loadedBoards);
    const metrics: Record<ProjectMetric, Task[]> = {
        open: progress.eligible.filter((task) => !isTaskCompleted(data, task)),
        completed: progress.completed,
        blocked: progress.eligible.filter((task) => task.blocked || blockedKeys.has(refKey(taskRef(data, task.id)))),
        overdue: progress.eligible.filter((task) => !isTaskCompleted(data, task) && task.dueDate && task.dueDate < today),
        unassigned: progress.eligible.filter((task) => !task.assigneeId && !task.assignees.length)
    };
    const roadmap = getRoadmapExtension(data);
    const groups = (['phases', 'milestones'] as const).flatMap((kind) => (roadmap?.[kind] || []).map((item) => ({
        kind, item, ...executionProgress(data, planWorkitems(data, kind, item.id)), current: kind === 'phases' && isCurrentPlanPhase(data, item.id, today)
    })));
    return { progress, metrics, groups };
}
