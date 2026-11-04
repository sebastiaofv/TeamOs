import type { BoardData, RoadmapItem, SprintResults, Task } from './types';
import { childrenOf, isPlanningUnit, isTerminal, sprintMembers, workitemType } from './workitems';
import { getSprintStatus, normalizeRoadmapItems } from './roadmap';
import { getWorkflow, parseWorkflow, statusCategory } from './workflow';
import { hasExactKeys, isRecord, normalizeTimestamp, nowIso } from './util';

export const STORY_POINT_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;
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
        if (!hasExactKeys(closure, ['sprint', 'sprintId', 'closedAt', 'tasks', 'workflow', 'functionalWorkflow', 'plannedPoints', 'completedIds', 'carryOverIds', 'velocity']) || typeof closure.sprintId !== 'string' || !closure.sprintId || sprintIds.has(closure.sprintId) || !normalizeTimestamp(closure.closedAt) || !Array.isArray(closure.tasks) || !points(closure.plannedPoints) || !points(closure.velocity) || !ids(closure.completedIds) || !ids(closure.carryOverIds)) return invalid();
        if (!isRecord(closure.sprint) || closure.sprint.id !== closure.sprintId || !normalizeRoadmapItems([closure.sprint], ['startDate', 'endDate'], ['startDate', 'endDate'], true, false, true)) return invalid();
        sprintIds.add(closure.sprintId);
        parseWorkflow(closure.workflow); parseWorkflow(closure.functionalWorkflow);
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

/** Freeze before returning planning units to Backlog. Child Task states are never reset. */
export function closeSprint(data: BoardData, sprintId: string, finalSprint?: RoadmapItem): void {
    const results = data.extensions.sprintResults ||= { version: 1, credits: [], closures: [] };
    if (results.closures.some((closure) => closure.sprintId === sprintId)) return;
    const sprint = finalSprint || data.extensions.roadmap?.sprints.find((item) => item.id === sprintId);
    if (!sprint) throw new Error('Sprint not found.');
    const tasks = structuredClone(sprintMembers(data, sprintId));
    const snapshot = { ...data, board: { ...data.board, tasks } };
    const units = tasks.filter((task) => isPlanningUnit(snapshot, task));
    const carryOverIds = units.filter((task) => !isTerminal(snapshot, task)).map((task) => task.id);
    const timestamp = nowIso();
    results.closures.push({ sprint: structuredClone({ ...sprint, status: 'done' }), sprintId, closedAt: timestamp, tasks, workflow: structuredClone(getWorkflow(data)), functionalWorkflow: structuredClone(getWorkflow(data, 'functional')),
        plannedPoints: units.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0), completedIds: units.filter((task) => developmentCompleted(snapshot, task)).map((task) => task.id), carryOverIds,
        velocity: results.credits.filter((credit) => credit.sprintId === sprintId).reduce((sum, credit) => sum + credit.storyPoints, 0) });
    // Freeze all recorded rows, including children and workitems that left earlier.
    const entries = data.extensions.sprintParticipation?.entries || [];
    data.extensions.sprintParticipation = { version: 1, entries: [...entries.filter((entry) => entry.sprintId !== sprintId), ...tasks.map((task) => ({ sprintId, task: structuredClone(task), at: timestamp }))] };
    for (const task of data.board.tasks) {
        if (task.sprintId !== sprintId || isTerminal(data, task)) continue;
        if (carryOverIds.includes(task.id)) {
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
