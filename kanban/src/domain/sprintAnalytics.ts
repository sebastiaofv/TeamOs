import type { BoardData, SprintClosure, Task } from './types';
import { iterateBoardTimeline } from './timeline';
import { getSprintStatus } from './roadmap';
import { isPlanningUnit } from './workitems';

export type SprintInitialPlan = { plannedPoints: number; completedPlannedPoints: number };

/** A baseline already in progress is not evidence of the initial commitment. */
export function sprintStartWorkitems(data: BoardData, closedAt: ReadonlyMap<string, string> = new Map()) {
    const scopes = new Map<string, { tasks: Task[]; context: BoardData }>();
    let previous = new Map<string, string>();
    // Native history replays every patch, but only Sprint-changing observations need normalization.
    for (const { snapshot, index, event } of iterateBoardTimeline(data, (entry, index) => index === 0 || Boolean(entry.snapshot?.board || entry.checkpoint) || entry.kind === 'roadmap.updated' || Boolean(entry.patch?.some(operation => operation.at === 'roadmap.sprints')), ['project', 'workflow', 'functionalWorkflow', 'workflowTypes', 'roadmap'])) {
        const sprints = snapshot.extensions.roadmap?.sprints || [];
        for (const sprint of sprints) {
            if (closedAt.has(sprint.id) && event.at > closedAt.get(sprint.id)!) continue;
            if (getSprintStatus(sprint) !== 'active' || previous.get(sprint.id) === 'active' || scopes.has(sprint.id)) continue;
            if (index > 0) scopes.set(sprint.id, { context: snapshot, tasks: snapshot.board.tasks.filter(task => task.sprintId === sprint.id && isPlanningUnit(snapshot, task)) });
        }
        previous = new Map(sprints.map(sprint => [sprint.id, getSprintStatus(sprint)]));
    }
    return scopes;
}

export function sprintStartScopes(data: BoardData, closedAt: ReadonlyMap<string, string> = new Map()): Map<string, Map<number, number>> {
    return new Map([...sprintStartWorkitems(data, closedAt)].map(([id, scope]) => [id, new Map(scope.tasks.map(task => [task.id, task.storyPoints ?? 0]))]));
}

export function sprintInitialPlan(scope: ReadonlyMap<number, number> | undefined, completedIds: readonly number[]): SprintInitialPlan | undefined {
    if (!scope) return undefined;
    const completed = new Set(completedIds);
    return { plannedPoints: [...scope.values()].reduce((sum, value) => sum + value, 0),
        completedPlannedPoints: [...scope].reduce((sum, [id, value]) => sum + (completed.has(id) ? value : 0), 0) };
}

export type SprintAnalyticsRow = {
    id: string; title: string; startDate: string; closedAt: string;
    planned: number | null; completed: number | null; capacity: number | null;
    predictability: number | null; utilization: number | null; carryover: number | null;
};
const percentage = (value: number | null, total: number | null) => value !== null && total !== null && total > 0 ? value / total * 100 : null;
const average = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
};

/** Closure records own historical results, even if the Sprint or workitems are later edited/deleted. */
export function allSprintAnalytics(data: BoardData) {
    const closures = data.extensions.sprintResults?.closures || [];
    const scopes = closures.some(closure => !closure.initialPlan) ? sprintStartScopes(data, new Map(closures.map(closure => [closure.sprintId, closure.closedAt]))) : new Map<string, Map<number, number>>();
    const rows: SprintAnalyticsRow[] = closures.map((closure: SprintClosure) => {
        const initial = closure.initialPlan || sprintInitialPlan(scopes.get(closure.sprintId), closure.completedIds);
        const planned = initial?.plannedPoints ?? null;
        const capacity = closure.sprint.capacity ?? null;
        const carryoverIds = new Set(closure.carryOverIds);
        return { id: closure.sprintId, title: closure.sprint.title, startDate: closure.sprint.startDate || closure.closedAt, closedAt: closure.closedAt,
            planned, completed: closure.velocity, capacity,
            predictability: percentage(initial?.completedPlannedPoints ?? null, planned), utilization: percentage(planned, capacity),
            carryover: closure.tasks.reduce((sum, task) => sum + (carryoverIds.has(task.id) ? task.storyPoints ?? 0 : 0), 0) };
    });
    // Older Done Sprints without a closure remain visible, with explicit gaps rather than live estimates.
    for (const sprint of data.extensions.roadmap?.sprints || []) if (getSprintStatus(sprint) === 'done' && !rows.some(row => row.id === sprint.id)) {
        rows.push({ id: sprint.id, title: sprint.title, startDate: sprint.startDate || sprint.endDate || '', closedAt: sprint.endDate || '',
            planned: null, completed: null, capacity: null, predictability: null, utilization: null, carryover: null });
    }
    rows.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.closedAt.localeCompare(b.closedAt) || a.id.localeCompare(b.id));
    return { rows, summary: { velocity: average(rows.map(row => row.completed)), predictability: average(rows.map(row => row.predictability)),
        utilization: average(rows.map(row => row.utilization)), carryover: average(rows.map(row => row.carryover)) },
    incomplete: rows.some(row => [row.planned, row.completed, row.capacity, row.predictability, row.utilization, row.carryover].some(value => value === null)) };
}
