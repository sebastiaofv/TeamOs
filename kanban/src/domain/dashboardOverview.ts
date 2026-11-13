import type { BoardData, Task } from './types';
import { dashboardPlanning, dashboardTasks } from './dashboard';
import { controlPending, controlRecords, gateControlProgress } from './projectControl';
import { phaseDescendants, planningProgress } from './phaseTree';
import { applyTimelineEventToState, getBoardTimelineData, reconstructBoardStateFromTimeline } from './timeline';
import { createBoardAnalysisCache, createBoardAnalysisSnapshot, createBoardStateSnapshot } from './serialize';
import { areSerializableValuesEqual } from './serializable';
import { statusCategory, withWorkflowReadCache } from './workflow';
import { effectivePlanning, isPlanningUnit, workitemType } from './workitems';

export const DASHBOARD_SECTIONS = ['projectOverview', 'activeSprint', 'projectStatistics', 'started', 'completedInPeriod', 'currentlyInProgress', 'openRisks', 'deliverables', 'decisions'] as const;
export type DashboardSection = typeof DASHBOARD_SECTIONS[number];

/** End dates include the entire UTC day. Never use today's state before the first observation. */
export function dashboardSnapshot(data: BoardData, end: string, currentDate: string) {
    if (end >= currentDate) return { data, index: null };
    const timeline = getBoardTimelineData(data);
    if (!timeline?.events[0]?.snapshot?.board || timeline.events[0].at.slice(0, 10) > end) return null;
    const index = timeline.events.findLastIndex((event) => event.at.slice(0, 10) <= end);
    if (index < 0) return null;
    const snapshot = reconstructBoardStateFromTimeline(data, index);
    return { data: { ...snapshot, extensions: { ...snapshot.extensions, timeline: { ...timeline, events: timeline.events.slice(0, index + 1) } } }, index };
}

/** Stories and Tasks independent of a Story, matching Table's planning units. */
export function dashboardReportable(data: BoardData, task: Task): boolean {
    return workitemType(task) === 'story' || (workitemType(task) === 'task' && isPlanningUnit(data, task));
}

export function dashboardStatistics(data: BoardData, phaseId: string) {
    const tasks = dashboardTasks(data, phaseId);
    return (['story', 'task', 'bug'] as const).map((type) => {
        const members = tasks.filter((task) => workitemType(task) === type && (type !== 'task' || isPlanningUnit(data, task)));
        return { type, tasks: members, categories: (['completed', 'in-progress', 'pending', 'cancelled'] as const).map((category) => ({
            category, tasks: members.filter((task) => {
                const actual = statusCategory(task.status, data, task);
                return category === 'pending' ? actual === 'backlog' || actual === 'to-do' : actual === category;
            })
        })) };
    });
}

const PERIOD_TRANSITION_KINDS = new Set(['task.status.changed', 'task.updated', 'task.created', 'board.workitems.updated']);
const taskKey = (task: Task) => `${task.id}\u0000${task.createdAt}`;
/** First row per identity, matching `Array.find` on the same list. */
function tasksByKey(tasks: Task[]) {
    const rows = new Map<string, Task>();
    for (const task of tasks) if (!rows.has(taskKey(task))) rows.set(taskKey(task), task);
    return rows;
}

type ReplayBoard = NonNullable<ReturnType<typeof applyTimelineEventToState>>;
type RawTask = { id?: unknown; createdAt?: unknown; status?: unknown; type?: unknown };
const STATUS_INPUTS = ['workflow', 'functionalWorkflow', 'workflowTypes'] as const;
const rawTasks = (state: ReplayBoard) => (Array.isArray(state.board?.tasks) ? state.board.tasks : []) as RawTask[];
const rawKey = (task: RawTask) => `${String(task?.id)}\u0000${String(task?.createdAt)}`;

/** Conservative: false only when every workitem keeps its identity, status and type and
 * nothing that maps a saved status to a normalized one changed, so normalizing both
 * boards cannot reveal a transition. Replay shares unchanged containers, so this is
 * usually a few reference checks. */
function mayChangeStatuses(before: ReplayBoard, after: ReplayBoard): boolean {
    if (before === after) return false;
    if ((before.meta as { schemaVersion?: unknown } | undefined)?.schemaVersion !== (after.meta as { schemaVersion?: unknown } | undefined)?.schemaVersion) return true;
    for (const key of STATUS_INPUTS) {
        const a = before.extensions?.[key], b = after.extensions?.[key];
        if (a !== b && !areSerializableValuesEqual(a, b)) return true;
    }
    const previous = rawTasks(before), next = rawTasks(after);
    if (previous === next) return false;
    const rows = new Map<string, RawTask>();
    for (const task of previous) if (!rows.has(rawKey(task))) rows.set(rawKey(task), task);
    return next.some((task) => {
        const old = rows.get(rawKey(task));
        return old !== task && (!old || old.status !== task?.status || old.type !== task?.type);
    });
}

/** Count actual status changes, not baseline contents, workflow edits, or restores.
 * Rows use their state at the end date; deleted items retain their last recorded detail.
 * Once loaded, histories hold thousands of events: the raw replay walks all of them, but
 * only events that can change a status in the period are compared, on analysis boards,
 * and each reported row's final state is normalized once. */
export function dashboardPeriodWorkitems(source: BoardData, endData: BoardData, phaseId: string, start: string, end: string) {
    return withWorkflowReadCache(() => {
        const timeline = getBoardTimelineData(source);
        const result = { started: [] as Task[], completed: [] as Task[], availableFrom: timeline?.events[0]?.at.slice(0, 10) || null, available: Boolean(timeline?.events[0]?.snapshot?.board), contexts: new Map<number, BoardData>() };
        if (!result.available || !timeline) return result;
        const started = new Map<number, Task>();
        const completed = new Map<number, Task>();
        // Keep raw replay separate: normalizing a legacy baseline derives a people
        // catalog that must not be fed into later events introducing new members.
        let replay: Parameters<typeof applyTimelineEventToState>[0] = timeline.events[0].snapshot;
        // The state before each event, normalized only on demand. Transitions compare
        // analysis boards, which share unchanged workitems between consecutive states.
        const analysis = createBoardAnalysisCache();
        let previousState = replay;
        let previous: { data: BoardData; rows?: Map<string, Task> } | undefined;
        let previousIsBaseline = true;
        const inScope = (data: BoardData) => {
            if (!phaseId) return () => true;
            const phases = phaseDescendants(data.extensions.roadmap?.phases || [], phaseId);
            return (task: Task) => phases.has(effectivePlanning(data, task, 'phaseId'));
        };
        // Raw state holding each tracked workitem's latest detail up to the end date.
        const detail = new Map<number, NonNullable<typeof replay>>();
        for (let index = 1; index < timeline.events.length; index++) {
            const event = timeline.events[index];
            const date = event.at.slice(0, 10);
            replay = applyTimelineEventToState(replay, event) || replay;
            const transition = date >= start && date <= end && PERIOD_TRANSITION_KINDS.has(event.kind)
                && (event.kind === 'task.created' || previousIsBaseline || !previousState || !replay || mayChangeStatuses(previousState, replay));
            let next: BoardData | undefined;
            if (transition) {
                previous ??= { data: previousIsBaseline ? reconstructBoardStateFromTimeline(source, 0) : createBoardAnalysisSnapshot(previousState, analysis) };
                const before = previous.data;
                const beforeRows = previous.rows ??= tasksByKey(before.board.tasks);
                const after = next = createBoardAnalysisSnapshot(replay, analysis);
                const scoped = inScope(after);
                // Same conditions as filtering scope and reportability first, cheapest first.
                for (const task of after.board.tasks) {
                    const old = beforeRows.get(taskKey(task));
                    if ((!old && event.kind !== 'task.created') || old?.status === task.status) continue;
                    if (!scoped(task) || !dashboardReportable(after, task)) continue;
                    const beforeCategory = old ? statusCategory(old.status, before, old) : null;
                    const afterCategory = statusCategory(task.status, after, task);
                    if (beforeCategory === afterCategory) continue;
                    if (afterCategory === 'in-progress') started.set(task.id, task);
                    if (afterCategory === 'completed') completed.set(task.id, task);
                }
            }
            // Tracked rows follow their latest recorded detail up to the end date. Only the
            // raw state is noted here; each distinct final state is normalized once below.
            if (date <= end && (started.size > 0 || completed.size > 0) && replay) {
                for (const task of replay.board?.tasks || []) {
                    if (started.has(task.id as number) || completed.has(task.id as number)) detail.set(task.id as number, replay);
                }
            }
            previousState = replay;
            previous = next && { data: next };
            previousIsBaseline = false;
        }
        const latest = new Map<object, BoardData>();
        for (const [id, state] of detail) {
            let snapshot = latest.get(state);
            if (!snapshot) latest.set(state, snapshot = createBoardStateSnapshot(state));
            for (const task of snapshot.board.tasks) {
                if (task.id !== id) continue;
                if (started.has(id)) started.set(id, task);
                if (completed.has(id)) completed.set(id, task);
            }
            result.contexts.set(id, snapshot);
        }
        const endRows = tasksByKey(endData.board.tasks);
        const endScope = new Set(dashboardTasks(endData, phaseId).map((row) => row.id));
        const rows = (members: Map<number, Task>) => [...members.values()].flatMap((task) => {
            const atEnd = endRows.get(taskKey(task));
            if (atEnd && !endScope.has(atEnd.id)) return [];
            return [atEnd || task];
        });
        result.started = rows(started); result.completed = rows(completed);
        return result;
    });
}

export function dashboardOverviewPlanning(data: BoardData, phaseId: string, end: string) {
    const scoped = new Set(dashboardTasks(data, phaseId).map((task) => task.id));
    const planning = dashboardPlanning(data, '', end).filter((group) => !phaseId || (group.kind === 'phases' ? phaseDescendants(data.extensions.roadmap?.phases || [], group.item.id).has(phaseId) || phaseDescendants(data.extensions.roadmap?.phases || [], phaseId).has(group.item.id) : group.tasks.some((task) => scoped.has(task.id)))).map((original) => {
        const tasks = original.tasks.filter((task) => scoped.has(task.id));
        const group = { ...original, tasks, progress: planningProgress(tasks, data) };
        const ids = group.kind === 'phases' ? phaseDescendants(data.extensions.roadmap?.phases || [], group.item.id) : new Set([group.item.id]);
        const percent = gateControlProgress(data, group.kind, ids, group.progress.percent);
        const pendingDeliverable = controlRecords(data).some((record) => record.kind === 'deliverables' && record.status !== 'accepted' && record.related[group.kind === 'phases' ? 'phaseIds' : 'milestoneIds'].some((id) => ids.has(id)));
        const open = group.progress.eligible > group.progress.completed || pendingDeliverable || (group.kind === 'milestones' && group.progress.percent === null);
        const date = group.kind === 'phases' ? group.item.endDate : group.item.dueDate;
        return { ...group, progress: { ...group.progress, percent }, open, overdue: Boolean(date && date < end && open) };
    });
    const phases = planning.filter((group) => group.kind === 'phases' && !group.item.parentId && group.item.startDate && group.item.startDate <= end && group.open)
        .sort((a, b) => a.item.startDate!.localeCompare(b.item.startDate!));
    const milestones = planning.filter((group) => group.kind === 'milestones' && group.open && group.item.dueDate).sort((a, b) => a.item.dueDate!.localeCompare(b.item.dueDate!));
    const next = milestones.find((group) => group.item.dueDate! >= end);
    return { phases, milestones: [...milestones.filter((group) => group.overdue), ...(next ? [next] : [])] };
}

export function dashboardControl(data: BoardData, phaseId: string, start: string, end: string) {
    const phases = phaseId ? phaseDescendants(data.extensions.roadmap?.phases || [], phaseId) : null;
    const records = controlRecords(data).filter((record) => record.createdAt.slice(0, 10) <= end && (!phases || record.related.phaseIds.some((id) => phases.has(id))));
    return {
        risks: records.filter((record) => record.kind === 'risks' && record.status !== 'closed'),
        decisions: records.filter((record) => record.kind === 'decisions' && controlPending(record)),
        deliverables: records.filter((record) => record.kind === 'deliverables' && (controlPending(record) || Boolean(record.deliveredDate && record.deliveredDate >= start && record.deliveredDate <= end)))
    };
}
