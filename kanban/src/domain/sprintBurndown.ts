import type { BoardData, Task } from './types';
import { iterateBoardTimeline } from './timeline';
import { createBoardAnalysisCache, createBoardAnalysisSnapshot } from './serialize';
import { getSprintStatus } from './roadmap';
import { isPlanningUnit } from './workitems';
import { statusCategory } from './workflow';
import { sprintTaskKey } from './sprintExecution';

export type BurndownPoint = { date: string; ideal: number; actual: number | null };
export type SprintBurndown = { points: BurndownPoint[]; added: Task[] | null; removed: Task[] | null; contexts: Map<number, BoardData> };
const dayMs = 86400000;
const dateTime = (date: string | undefined) => date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;

/** Allocation at each observation owns remaining scope; participation must not restore removed work. */
export function* sprintBurndownSteps(data: BoardData, sprintId: string, today: string) {
    const closure = data.extensions.sprintResults?.closures.find(entry => entry.sprintId === sprintId);
    const sprint = closure?.sprint || data.extensions.roadmap?.sprints.find(entry => entry.id === sprintId);
    const start = dateTime(sprint?.startDate), end = dateTime(sprint?.endDate);
    const contexts = new Map<number, BoardData>();
    const unavailable: SprintBurndown = { points: [], added: null, removed: null, contexts };
    if (!sprint || getSprintStatus(sprint) === 'done' && !closure) return unavailable;
    const until = closure ? Date.parse(closure.closedAt) : dateTime(today) + dayMs - 1;
    const daily = new Map<string, number>(), added = new Map<string, Task>(), removed = new Map<string, Task>();
    let active = false, previousStatus: string | undefined, initial: number | null = null;
    const analysis = createBoardAnalysisCache();
    let previousPoint: { snapshot: BoardData } | undefined;
    let previousMembers = new Map<string, Task>();
    for (const observation of iterateBoardTimeline(data, (event, index) => index === 0 || Boolean(event.snapshot?.board || event.checkpoint) || event.kind === 'roadmap.updated' || event.kind.startsWith('task.') && !event.kind.startsWith('task.comment.') || ['workflow.updated', 'board.workitems.updated', 'board.restored', 'board.reconciled', 'board.project.updated'].includes(event.kind) || Boolean(event.patch?.some(operation => ['workitems', 'workflow', 'functionalWorkflow', 'workflowTypes', 'roadmap.sprints'].includes(operation.at))), ['project', 'roadmap', 'workflow', 'functionalWorkflow', 'workflowTypes'])) {
        const { event, index } = observation;
        yield index;
        if (Date.parse(event.at) > until) continue;
        const snapshot = createBoardAnalysisSnapshot(observation.state, analysis);
        const observed = snapshot.extensions.roadmap?.sprints.find(entry => entry.id === sprintId);
        const status = observed && getSprintStatus(observed);
        const members = snapshot.board.tasks.filter(task => task.sprintId === sprintId && isPlanningUnit(snapshot, task));
        const current = new Map(members.map(task => [sprintTaskKey(task), task]));
        if (!active && status === 'active' && previousStatus !== 'active' && index > 0) {
            active = true;
            initial = members.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
        } else if (active && status === 'active') {
            for (const [key, task] of current) if (!previousMembers.has(key)) {
                const context = observation.snapshot;
                added.set(key, context.board.tasks.find(member => sprintTaskKey(member) === key)!);
                contexts.set(task.id, context);
            }
            for (const [key, task] of previousMembers) if (!current.has(key) && previousPoint) {
                const context = previousPoint.snapshot;
                removed.set(key, context.board.tasks.find(member => sprintTaskKey(member) === key)!);
                contexts.set(task.id, context);
            }
        }
        if (active && status === 'active') {
            const remaining = members.reduce((sum, task) => sum + (['testing', 'completed'].includes(statusCategory(task.status, snapshot, task)) ? 0 : task.storyPoints ?? 0), 0);
            daily.set(new Date(event.at).toISOString().slice(0, 10), remaining);
        }
        previousStatus = status;
        previousMembers = current;
        previousPoint = observation;
    }
    if (initial === null) return unavailable;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { points: [], added: [...added.values()], removed: [...removed.values()], contexts };
    const planned = closure?.initialPlan?.plannedPoints ?? initial;
    const points: BurndownPoint[] = [];
    let remaining = initial;
    const observations = [...daily].sort(([a], [b]) => a.localeCompare(b));
    let observation = 0;
    for (let time = start; time <= end; time += dayMs) {
        const date = new Date(time).toISOString().slice(0, 10);
        while (observation < observations.length && observations[observation][0] <= date) remaining = observations[observation++][1];
        points.push({ date, ideal: end === start ? planned : planned * (end - time) / (end - start), actual: time <= until ? remaining : null });
        yield points.length;
    }
    return { points, added: [...added.values()], removed: [...removed.values()], contexts };
}

export function sprintBurndown(data: BoardData, sprintId: string, today: string): SprintBurndown {
    const steps = sprintBurndownSteps(data, sprintId, today);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
}
