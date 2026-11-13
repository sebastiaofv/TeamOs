import { sprintInitialPlan, sprintStartScopes } from './sprintAnalytics';
import type { BoardData, RoadmapItem, SprintResults, Task } from './types';
import { childrenOf, hasPendingWork, isPlanningUnit, isTerminal, sprintMembers, workitemType } from './workitems';
import { getSprintStatus, normalizeRoadmapItems } from './roadmap';
import { functionalWorkitemTypes, getWorkflow, parseWorkflow, parseWorkflowTypes, statusCategory } from './workflow';
import { hasExactKeys, isRecord, normalizeTimestamp, nowIso } from './util';

/** Fibonacci scale offered for estimates; None (no estimate) is the default. */
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13] as const;
const points = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const ids = (value: unknown): value is number[] => Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id > 0) && new Set(value).size === value.length;

/** Results are additive file data; unsupported or malformed versions must never be silently dropped. */
export function parseSprintResults(value: unknown): SprintResults | undefined {
    if (value === undefined) return undefined;
    const invalid = () => { throw new Error('Invalid extensions.sprintResults.'); };
    if (!hasExactKeys(value, ['version', 'credits', 'closures']) || value.version !== 1 || !Array.isArray(value.credits) || !Array.isArray(value.closures)) return invalid();
    const creditKeys = new Set<string>();
    for (const credit of value.credits) {
        if (!hasExactKeys(credit, ['taskKey', 'taskId', 'sprintId', 'storyPoints', 'at']) || typeof credit.taskKey !== 'string' || !credit.taskKey || creditKeys.has(credit.taskKey) || typeof credit.taskId !== 'number' || !Number.isSafeInteger(credit.taskId) || credit.taskId < 1 || typeof credit.sprintId !== 'string' || !credit.sprintId || !points(credit.storyPoints) || !normalizeTimestamp(credit.at)) return invalid();
        creditKeys.add(credit.taskKey);
    }
    const sprintIds = new Set<string>();
    for (const closure of value.closures) {
        if (!hasExactKeys(closure, [...(isRecord(closure) && 'initialPlan' in closure ? ['initialPlan'] : []), 'sprint', 'sprintId', 'closedAt', 'tasks', 'workflow', 'functionalWorkflow', ...(isRecord(closure) && 'workflowTypes' in closure ? ['workflowTypes'] : []), 'plannedPoints', 'completedIds', 'carryOverIds', 'velocity']) || typeof closure.sprintId !== 'string' || !closure.sprintId || sprintIds.has(closure.sprintId) || !normalizeTimestamp(closure.closedAt) || !Array.isArray(closure.tasks) || !points(closure.plannedPoints) || !points(closure.velocity) || !ids(closure.completedIds) || !ids(closure.carryOverIds)) return invalid();
        if ('initialPlan' in closure && (!hasExactKeys(closure.initialPlan, ['plannedPoints', 'completedPlannedPoints']) || !points(closure.initialPlan.plannedPoints) || !points(closure.initialPlan.completedPlannedPoints) || closure.initialPlan.completedPlannedPoints > closure.initialPlan.plannedPoints)) return invalid();
        if (!isRecord(closure.sprint) || closure.sprint.id !== closure.sprintId || !normalizeRoadmapItems([closure.sprint], ['startDate', 'endDate'], ['startDate', 'endDate'], true, false, true)) return invalid();
        sprintIds.add(closure.sprintId);
        parseWorkflow(closure.workflow); parseWorkflow(closure.functionalWorkflow);
        if ('workflowTypes' in closure) parseWorkflowTypes(closure.workflowTypes);
        const taskIds = new Set<number>();
        for (const task of closure.tasks) {
            if (!isRecord(task) || !Number.isSafeInteger(task.id) || typeof task.id !== 'number' || task.id < 1 || taskIds.has(task.id) || typeof task.title !== 'string' || typeof task.status !== 'string' || (task.storyPoints != null && !points(task.storyPoints))) return invalid();
            taskIds.add(task.id);
        }
        if (![...closure.completedIds, ...closure.carryOverIds].every((id) => taskIds.has(id))) return invalid();
    }
    return structuredClone(value) as SprintResults;
}

/** Development completion is independent of functional acceptance. Cancelled children are not Done. */
export function developmentCompleted(data: BoardData, task: Task): boolean {
    if (!isPlanningUnit(data, task)) return false;
    const children = workitemType(task) === 'story' ? childrenOf(data, task.id) : [];
    return children.length ? children.every((child) => statusCategory(child.status, data, child) === 'completed')
        : statusCategory(task.status, data, task) === 'completed';
}

/** Award once, when the completion condition first becomes true in an active Sprint. */
export function recordSprintCredits(data: BoardData, previous: BoardData): void {
    const results = data.extensions.sprintResults || { version: 1, credits: [], closures: [] };
    const credited = new Set(results.credits.map((credit) => credit.taskKey));
    const creditedIds = new Set(results.credits.map((credit) => credit.taskId));
    const previousById = new Map(previous.board.tasks.map((task) => [task.id, task]));
    for (const task of data.board.tasks) {
        const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === task.sprintId);
        if (!sprint || getSprintStatus(sprint) !== 'active' || results.closures.some((closure) => closure.sprintId === sprint.id)) continue;
        const key = task.permanentId || `task:${task.id}`;
        const before = previousById.get(task.id);
        if (credited.has(key) || creditedIds.has(task.id) || !developmentCompleted(data, task) || (before && developmentCompleted(previous, before))) continue;
        results.credits.push({ taskKey: key, taskId: task.id, sprintId: sprint.id, storyPoints: task.storyPoints ?? 0, at: nowIso() });
        credited.add(key); creditedIds.add(task.id);
    }
    if (results.credits.length || results.closures.length) data.extensions.sprintResults = results;
}

/** Current workitems that lose their Sprint allocation on closure. */
function sprintUnallocatedWorkitems(data: BoardData, sprintId: string): Task[] {
    return data.board.tasks.filter((task) => task.sprintId === sprintId && (isPlanningUnit(data, task) ? hasPendingWork(data, task) : !isTerminal(data, task)));
}

/** Freeze before returning planning units to Backlog. Task state resets are governed by the Sprint automation. */
export function closeSprint(data: BoardData, sprintId: string, finalSprint?: RoadmapItem): void {
    const results = data.extensions.sprintResults ||= { version: 1, credits: [], closures: [] };
    if (results.closures.some((closure) => closure.sprintId === sprintId)) return;
    const sprint = finalSprint || data.extensions.roadmap?.sprints.find((item) => item.id === sprintId);
    if (!sprint) throw new Error('Sprint not found.');
    const tasks = structuredClone(sprintMembers(data, sprintId));
    const snapshot = { ...data, board: { ...data.board, tasks } };
    const units = tasks.filter((task) => isPlanningUnit(snapshot, task));
    // A Story whose Tasks are all finished keeps its status and is not carried over, even while it awaits validation.
    const carryOverIds = units.filter((task) => hasPendingWork(snapshot, task)).map((task) => task.id);
    const timestamp = nowIso();
    const completedIds = units.filter((task) => developmentCompleted(snapshot, task)).map((task) => task.id);
    const initialPlan = sprintInitialPlan(sprintStartScopes(data, new Map([[sprintId, timestamp]])).get(sprintId), completedIds);
    results.closures.push({ ...(initialPlan ? { initialPlan } : {}), sprint: structuredClone({ ...sprint, status: 'done' }), sprintId, closedAt: timestamp, tasks, workflow: structuredClone(getWorkflow(data)), functionalWorkflow: structuredClone(getWorkflow(data, 'functional')), workflowTypes: { version: 1, functional: functionalWorkitemTypes(data) },
        plannedPoints: units.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0), completedIds, carryOverIds,
        velocity: results.credits.filter((credit) => credit.sprintId === sprintId).reduce((sum, credit) => sum + credit.storyPoints, 0) });
    // The closure now owns the roster, so participation keeps only Sprints still open.
    const entries = (data.extensions.sprintParticipation?.entries || []).filter((entry) => entry.sprintId !== sprintId);
    if (entries.length) data.extensions.sprintParticipation = { version: 1, entries };
    else delete data.extensions.sprintParticipation;
    for (const task of sprintUnallocatedWorkitems(data, sprintId)) {
        if (carryOverIds.includes(task.id) && workitemType(task) !== 'task') {
            const workflow = getWorkflow(data, task);
            const backlog = workflow.states.find((state) => state.id === workflow.references.backlog) || workflow.states.find((state) => state.category === 'backlog');
            if (!backlog) throw new Error('A Backlog workflow state is required to finish this Sprint.');
            task.status = backlog.id;
            task.statusChangedAt = timestamp;
            delete task.acceptance;
        }
        task.sprintId = '';
        task.updatedAt = timestamp;
    }
}

export type SprintPointSummary = { planned: number; capacity: number | null; completed: number | null };

/** Planned Story Points against capacity; a closed Sprint reports the values
 * frozen at closure, including the Story Points actually completed. */
export function sprintPointSummary(data: BoardData, sprintId: string): SprintPointSummary {
    const closure = data.extensions.sprintResults?.closures.find((entry) => entry.sprintId === sprintId);
    if (closure) return { planned: closure.plannedPoints, capacity: closure.sprint.capacity ?? null, completed: closure.velocity };
    const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === sprintId);
    const planned = data.board.tasks.filter((task) => task.sprintId === sprintId && isPlanningUnit(data, task)).reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
    return { planned, capacity: sprint?.capacity ?? null, completed: null };
}

/** Starting a Sprint moves its workitems, and their descendants, from the
 * Backlog category to the first To do state of their own workflow. Workitems
 * already in To do or a later category are left unchanged. */
export function startSprint(data: BoardData, sprintId: string): number[] {
    const members = data.board.tasks.filter((task) => task.sprintId === sprintId);
    const scope = new Map(members.map((task) => [task.id, task]));
    const queue = [...members];
    while (queue.length) for (const child of childrenOf(data, queue.shift()!.id)) if (!scope.has(child.id)) { scope.set(child.id, child); queue.push(child); }
    const timestamp = nowIso();
    const moved: number[] = [];
    for (const task of scope.values()) {
        if (statusCategory(task.status, data, task) !== 'backlog') continue;
        const target = getWorkflow(data, task).states.find((state) => state.category === 'to-do');
        if (!target) continue;
        task.status = target.id;
        task.statusChangedAt = timestamp;
        task.updatedAt = timestamp;
        moved.push(task.id);
    }
    return moved;
}
