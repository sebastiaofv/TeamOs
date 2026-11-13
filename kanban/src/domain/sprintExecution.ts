import type { BoardData, SprintClosure, Task } from './types';
import { getSprintStatus } from './roadmap';
import { iterateBoardTimeline } from './timeline';
import { statusCategory, withWorkflowReadCache } from './workflow';
import { isPlanningUnit, sprintMembers } from './workitems';

export const sprintTaskKey = (task: Task) => `${task.id}:${task.createdAt}`;
export const median = (values: readonly number[]): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Weekdays elapsed between UTC dates: same-day work is zero; weekends are excluded. */
export function businessDaysBetween(start: string, end: string): number | null {
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) < Date.parse(start)) return null;
    const first = new Date(`${new Date(start).toISOString().slice(0, 10)}T00:00:00Z`), last = new Date(`${new Date(end).toISOString().slice(0, 10)}T00:00:00Z`);
    const days = Math.round((last.getTime() - first.getTime()) / 86400000);
    let count = Math.floor(days / 7) * 5;
    for (let day = 0; day < days % 7; day++) {
        const weekday = (first.getUTCDay() + day) % 7;
        if (weekday !== 0 && weekday !== 6) count++;
    }
    return count;
}

export type SprintCycle = { key: string; task: Task; points: number | null; days: number; testingAt: string };
export type SprintExecutionRow = { tasks: Task[]; context: BoardData; cycles: SprintCycle[]; medianCycleTime: number | null; rework: Task[] | null; reworkPercent: number | null };
export function sprintClosureContext(data: BoardData, closure: SprintClosure): BoardData {
    return { ...data, board: { ...data.board, tasks: closure.tasks }, extensions: { ...data.extensions, workflow: closure.workflow, functionalWorkflow: closure.functionalWorkflow, workflowTypes: closure.workflowTypes } };
}

/** One history replay supplies both cycle times and regressions. Closure snapshots remain immutable. */
export function sprintExecution(data: BoardData) {
    return withWorkflowReadCache(() => {
        const transitions: { key: string; at: string; category: string }[] = [];
        const first = new Map<string, { started?: string; testing?: string }>();
        const unknownStart = new Set<string>(), unknownTesting = new Set<string>();
        let previous: BoardData | undefined;
        for (const { snapshot, event } of iterateBoardTimeline(data, (event, index) => index === 0 || Boolean(event.snapshot?.board || event.checkpoint) || event.kind.startsWith('task.') && !event.kind.startsWith('task.comment.') || ['workflow.updated', 'board.workitems.updated', 'board.restored', 'board.reconciled', 'board.project.updated'].includes(event.kind) || Boolean(event.patch?.some(operation => operation.at === 'workitems' || operation.at === 'workflow')), ['project', 'workflow', 'functionalWorkflow', 'workflowTypes'])) {
            if (!previous) for (const task of snapshot.board.tasks) {
                const category = statusCategory(task.status, snapshot, task);
                if (['in-progress', 'testing', 'completed'].includes(category)) unknownStart.add(sprintTaskKey(task));
                if (['testing', 'completed'].includes(category)) unknownTesting.add(sprintTaskKey(task));
            }
            if (previous && ['task.status.changed', 'task.updated', 'task.created', 'board.workitems.updated'].includes(event.kind)) {
                const old = new Map(previous.board.tasks.map(task => [sprintTaskKey(task), task]));
                for (const task of snapshot.board.tasks) {
                    const key = sprintTaskKey(task), before = old.get(key);
                    if ((!before && event.kind !== 'task.created') || before?.status === task.status) continue;
                    const category = statusCategory(task.status, snapshot, task);
                    if (before && statusCategory(before.status, previous, before) === category) continue;
                    transitions.push({ key, at: event.at, category });
                    const times = first.get(key) || {};
                    if (category === 'in-progress' && !times.started) times.started = event.at;
                    if (category === 'testing' && !times.testing) times.testing = event.at;
                    first.set(key, times);
                }
            }
            previous = snapshot;
        }
        const closures = [...data.extensions.sprintResults?.closures || []].sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
        const sprints = new Map<string, SprintExecutionRow>();
        const baselineAt = data.extensions.timeline?.events[0]?.snapshot?.board ? data.extensions.timeline.events[0].at : null;
        const cyclesFor = (tasks: Task[], until: number) => tasks.flatMap(task => {
            const key = sprintTaskKey(task), times = first.get(key);
            if (unknownStart.has(key) || unknownTesting.has(key) || !times?.started || !times.testing || Date.parse(times.testing) > until) return [];
            const days = businessDaysBetween(times.started, times.testing);
            return days === null ? [] : [{ key, task, points: task.storyPoints ?? null, days, testingAt: times.testing }];
        });
        for (const closure of closures) {
            const context = sprintClosureContext(data, closure);
            const tasks = closure.tasks.filter(task => isPlanningUnit(context, task));
            const cycles = cyclesFor(tasks, Date.parse(closure.closedAt));
            sprints.set(closure.sprintId, { tasks, context, cycles, medianCycleTime: median(cycles.map(cycle => cycle.days)),
                rework: baselineAt && Date.parse(baselineAt) <= Date.parse(closure.closedAt) ? [] : null, reworkPercent: null });
        }
        // A new closure replaces the previous pending cycle, even if the new result is Done.
        const pending = new Map<string, string>();
        const events = [
            ...closures.map(closure => ({ at: closure.closedAt, closure, transition: undefined })),
            ...transitions.map(transition => ({ at: transition.at, transition, closure: undefined }))
        ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || Number(Boolean(a.closure)) - Number(Boolean(b.closure)));
        for (const event of events) {
            if (event.closure) {
                const row = sprints.get(event.closure.sprintId)!;
                for (const task of row.tasks) {
                    const key = sprintTaskKey(task);
                    pending.delete(key);
                    if (statusCategory(task.status, row.context, task) === 'testing') pending.set(key, event.closure.sprintId);
                }
            } else if (event.transition?.category === 'in-progress') {
                const id = pending.get(event.transition.key);
                if (!id) continue;
                const row = sprints.get(id)!;
                const task = row.tasks.find(task => sprintTaskKey(task) === event.transition!.key)!;
                if (row.rework && !row.rework.some(member => sprintTaskKey(member) === event.transition!.key)) row.rework.push(task);
                pending.delete(event.transition.key);
            }
        }
        for (const row of sprints.values()) row.reworkPercent = row.rework && row.tasks.length ? row.rework.length / row.tasks.length * 100 : null;
        const cycles = [...new Map([...sprints.values()].flatMap(row => row.cycles).map(cycle => [cycle.key, cycle])).values()];
        const medianRework = median([...sprints.values()].flatMap(row => row.rework ? [row.rework.length] : []));
        // Open Sprints use current participation but never manufacture closure or rework data.
        for (const sprint of data.extensions.roadmap?.sprints || []) if (!sprints.has(sprint.id) && getSprintStatus(sprint) !== 'done') {
            const tasks = sprintMembers(data, sprint.id).filter(task => isPlanningUnit(data, task));
            const cycles = cyclesFor(tasks, Infinity);
            sprints.set(sprint.id, { tasks, context: data, cycles, medianCycleTime: median(cycles.map(cycle => cycle.days)), rework: null, reworkPercent: null });
        }
        return { sprints, cycles, medianRework };
    });
}
