import type { BoardData, Task } from './types';
import { dashboardPlanning, dashboardSprints, dashboardTasks } from './dashboard';
import { controlPending, controlRecords, gateControlProgress } from './projectControl';
import { phaseDescendants, planningProgress } from './phaseTree';
import { applyTimelineEventToState, getBoardTimelineData, iterateBoardTimeline, reconstructBoardStateFromTimeline } from './timeline';
import { createBoardAnalysisCache, createBoardAnalysisSnapshot, createBoardStateSnapshot } from './serialize';
import { areSerializableValuesEqual } from './serializable';
import { defaultWorkflow, WORKFLOW_CATEGORIES, statusCategory, withWorkflowReadCache } from './workflow';
import { effectivePlanning, isPlanningUnit, transferDescendants, workitemProgress, workitemType } from './workitems';
import { getSprintCalendarStatus, getSprintStatus } from './roadmap';
import { developmentCompleted, sprintPointSummary } from './sprintResults';

export { DASHBOARD_WIDGETS as DASHBOARD_SECTIONS, type DashboardWidget as DashboardSection } from './dashboardActivityLayout';

/** End dates include the entire UTC day. Never use today's state before the first observation. */
export function dashboardSnapshot(data: BoardData, end: string, currentDate: string) {
    if (end >= currentDate) return { data, index: null };
    const timeline = getBoardTimelineData(data);
    if (!timeline?.events[0]?.snapshot?.board || timeline.events[0].at.slice(0, 10) > end) return null;
    const index = timeline.events.findLastIndex((event) => event.at.slice(0, 10) <= end);
    if (index < 0) return null;
    const snapshot = reconstructBoardStateFromTimeline(data, index);
    // Legacy snapshots have no lifecycle status. Import normalization uses today,
    // but historical consultation must infer that status at the selected end date.
    const events = timeline.events.slice(0, index + 1);
    for (const sprint of snapshot.extensions.roadmap?.sprints || []) {
        const event = events.findLast((event) => event.meta?.sprint?.id === sprint.id || event.snapshot?.extensions?.roadmap?.sprints?.some((item) => item.id === sprint.id));
        const recorded = event?.meta?.sprint?.id === sprint.id ? event.meta.sprint : event?.snapshot?.extensions?.roadmap?.sprints?.find((item) => item.id === sprint.id);
        if (recorded && !recorded.status) sprint.status = getSprintCalendarStatus(sprint, end);
    }
    return { data: { ...snapshot, extensions: { ...snapshot.extensions, timeline: { ...timeline, events: timeline.events.slice(0, index + 1) } } }, index };
}

/** User Stories, Bugs and independent Tasks; children never duplicate their parent. */
export function dashboardReportable(data: BoardData, task: Task): boolean {
    return ['story', 'bug'].includes(workitemType(task)) || (workitemType(task) === 'task' && isPlanningUnit(data, task));
}

export function dashboardInProgress(data: BoardData) {
    return dashboardTasks(data).filter((task) => dashboardReportable(data, task) && statusCategory(task.status, data, task) === 'in-progress');
}

export function dashboardStatistics(data: BoardData, phaseId: string) {
    return withWorkflowReadCache(() => {
        const tasks = dashboardTasks(data, phaseId);
        return (['story', 'task', 'bug'] as const).map((type) => {
            const members = tasks.filter((task) => workitemType(task) === type && (type !== 'task' || isPlanningUnit(data, task)));
            return { type, tasks: members, states: WORKFLOW_CATEGORIES.map((category) => ({
                id: category, category, color: defaultWorkflow().states.find((state) => state.category === category)!.color,
                tasks: members.filter((task) => statusCategory(task.status, data, task) === category)
            })) };
        });
    });
}

/** Active at the report end or closed within the inclusive period. Closure data preserves the final roster and metrics. */
export function dashboardActiveSprints(data: BoardData, end: string, start = end) {
    return dashboardSprints(data, '', end).filter((sprint) => {
        const status = getSprintStatus(sprint.item, end);
        if (status === 'active') return true;
        const closure = data.extensions.sprintResults?.closures.find((entry) => entry.sprintId === sprint.item.id);
        // Legacy Sprints without closure observations retain their calendar completion date.
        const completedOn = closure?.closedAt.slice(0, 10) || sprint.item.endDate;
        return status === 'done' && Boolean(completedOn && completedOn >= start && completedOn <= end);
    }).map((sprint) => {
        const closed = getSprintStatus(sprint.item, end) === 'done';
        const units = sprint.tasks.filter((task) => isPlanningUnit(sprint.data, task) && statusCategory(task.status, sprint.data, task) !== 'cancelled');
        const completed = units.filter((task) => statusCategory(task.status, sprint.data, task) === 'completed');
        const points = sprintPointSummary(data, sprint.item.id);
        const completedPoints = data.board.tasks.filter((task) => task.sprintId === sprint.item.id && developmentCompleted(data, task)).reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
        return { ...sprint, units, stories: sprint.tasks.filter((task) => workitemType(task) === 'story'),
            closed, points: { ...points, completed: closed && points.completed !== null ? points.completed : completedPoints }, percent: units.length ? completed.length / units.length * 100 : null,
            overdue: Boolean(sprint.item.endDate && sprint.item.endDate < end) };
    });
}

export function dashboardEpics(data: BoardData) {
    return data.board.tasks.filter((task) => workitemType(task) === 'epic' && ['in-progress', 'testing', 'completed'].includes(statusCategory(task.status, data, task)))
        .map((task) => {
            const units = transferDescendants(data, task.id).filter((child) => isPlanningUnit(data, child));
            return { task, progress: workitemProgress(data, task.id), points: {
                total: units.reduce((sum, child) => sum + (child.storyPoints ?? 0), 0),
                completed: units.filter((child) => developmentCompleted(data, child)).reduce((sum, child) => sum + (child.storyPoints ?? 0), 0)
            } };
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
        const createdInPeriod = (context: BoardData) => dashboardTasks(context, phaseId).filter((task) => workitemType(task) === 'story' && task.createdAt.slice(0, 10) >= start && task.createdAt.slice(0, 10) <= end);
        const created = new Map(createdInPeriod(endData).map((task) => [task.id, task]));
        const result = { created: [...created.values()], testing: [] as Task[], startedAt: new Map<number, string>(), completedAt: new Map<number, string>(), testingAt: new Map<number, string>(), started: [] as Task[], completed: [] as Task[], availableFrom: timeline?.events[0]?.at.slice(0, 10) || null, available: Boolean(timeline?.events[0]?.snapshot?.board), contexts: new Map<number, BoardData>() };
        if (!result.available || !timeline) return result;
        const started = new Map<number, Task>();
        const completed = new Map<number, Task>();
        const testing = new Map<number, Task>();
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
        if (timeline.events[0].at.slice(0, 10) <= end) {
            const baseline = reconstructBoardStateFromTimeline(source, 0);
            previous = { data: baseline };
            for (const task of createdInPeriod(baseline)) {
                created.set(task.id, task); result.contexts.set(task.id, baseline);
            }
        }
        for (let index = 1; index < timeline.events.length; index++) {
            const event = timeline.events[index];
            const date = event.at.slice(0, 10);
            replay = applyTimelineEventToState(replay, event) || replay;
            const transition = date >= start && date <= end && PERIOD_TRANSITION_KINDS.has(event.kind)
                && (event.kind === 'task.created' || previousIsBaseline || !previousState || !replay || mayChangeStatuses(previousState, replay));
            // Creation is independent of status transitions and remains visible after deletion.
            // Scan analysis boards, retaining full presentation snapshots only for final rows.
            let next: BoardData | undefined;
            if (date <= end) {
                next = createBoardAnalysisSnapshot(replay, analysis);
                for (const task of createdInPeriod(next)) created.set(task.id, task);
            }
            if (transition) {
                previous ??= { data: previousIsBaseline ? reconstructBoardStateFromTimeline(source, 0) : createBoardAnalysisSnapshot(previousState, analysis) };
                const before = previous.data;
                const beforeRows = previous.rows ??= tasksByKey(before.board.tasks);
                const after = next ??= createBoardAnalysisSnapshot(replay, analysis);
                const scoped = inScope(after);
                // Same conditions as filtering scope and reportability first, cheapest first.
                for (const task of after.board.tasks) {
                    const old = beforeRows.get(taskKey(task));
                    if ((!old && event.kind !== 'task.created') || old?.status === task.status) continue;
                    if (!scoped(task) || !dashboardReportable(after, task)) continue;
                    const beforeCategory = old ? statusCategory(old.status, before, old) : null;
                    const afterCategory = statusCategory(task.status, after, task);
                    if (beforeCategory === afterCategory) continue;
                    if (['in-progress', 'testing'].includes(afterCategory) && !['in-progress', 'testing'].includes(beforeCategory || '')) {
                        started.set(task.id, task);
                        if (!result.startedAt.has(task.id)) result.startedAt.set(task.id, event.at);
                    }
                    if (afterCategory === 'testing') {
                        testing.set(task.id, task);
                        if (!result.testingAt.has(task.id)) result.testingAt.set(task.id, event.at);
                    }
                    if (afterCategory === 'completed') {
                        completed.set(task.id, task);
                        if (!result.completedAt.has(task.id)) result.completedAt.set(task.id, event.at);
                    }
                }
            }
            // Tracked rows follow their latest recorded detail up to the end date. Only the
            // raw state is noted here; each distinct final state is normalized once below.
            if (date <= end && (created.size > 0 || started.size > 0 || completed.size > 0 || testing.size > 0) && replay) {
                for (const task of replay.board?.tasks || []) {
                    if (created.has(task.id as number) || started.has(task.id as number) || completed.has(task.id as number) || testing.has(task.id as number)) detail.set(task.id as number, replay);
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
                if (created.has(id)) created.set(id, task);
                if (testing.has(id)) testing.set(id, task);
                if (started.has(id)) started.set(id, task);
                if (completed.has(id)) completed.set(id, task);
            }
            result.contexts.set(id, snapshot);
        }
        const endRows = tasksByKey(endData.board.tasks), currentRows = tasksByKey(source.board.tasks);
        const endScope = new Set(dashboardTasks(endData, phaseId).map((row) => row.id));
        const currentScope = new Set(dashboardTasks(source, phaseId).map((row) => row.id));
        const rows = (members: Map<number, Task>, context = endData) => [...members.values()].flatMap((task) => {
            const atEnd = (context === endData ? endRows : currentRows).get(taskKey(task));
            if (atEnd && (!dashboardReportable(context, atEnd) || !(context === endData ? endScope : currentScope).has(atEnd.id))) return [];
            return [atEnd || task];
        });
        result.created = [...created.values()].map((task) => endRows.get(taskKey(task)) || task);
        result.started = rows(started); result.completed = rows(completed);
        // Testing is a period event; show the current status even after the item leaves Testing.
        result.testing = rows(testing, source);
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
        const open = (group.kind === 'phases' && group.progress.associated === 0) || group.progress.eligible > group.progress.completed || pendingDeliverable || (group.kind === 'milestones' && group.progress.percent === null);
        const date = group.kind === 'phases' ? group.item.endDate : group.item.dueDate;
        return { ...group, progress: { ...group.progress, percent }, open, overdue: Boolean(date && date < end && open) };
    });
    const phases = planning.filter((group) => group.kind === 'phases' && !group.item.parentId)
        .map((group) => {
            const started = group.tasks.some((task) => ['in-progress', 'testing', 'completed'].includes(statusCategory(task.status, data, task)));
            return { ...group, started, situation: group.progress.percent === 100 ? 'completed' as const : group.overdue ? 'overdue' as const : !started && Boolean(group.item.startDate && group.item.startDate < end) ? 'late' as const : 'onTarget' as const };
        })
        .sort((a, b) => (a.item.startDate || '').localeCompare(b.item.startDate || '') || a.item.id.localeCompare(b.item.id));
    const milestones = planning.filter((group) => group.kind === 'milestones')
        .sort((a, b) => (a.item.dueDate || '9999').localeCompare(b.item.dueDate || '9999') || a.item.id.localeCompare(b.item.id));
    return { phases, milestones };
}

/** Completion dates come from recorded progress transitions, never the planned due date.
 * A completed baseline has an unknown completion date until it reopens and completes again. */
export function dashboardMilestones(data: BoardData, end: string, milestones = dashboardOverviewPlanning(data, '', end).milestones) {
    return withWorkflowReadCache(() => {
        const completed = milestones.filter((group) => group.progress.percent === 100);
        const delayed = milestones.filter((group) => group.progress.percent !== 100 && group.overdue);
        const remaining = milestones.filter((group) => group.progress.percent !== 100);
        const completedIds = new Set(completed.map((group) => group.item.id));
        const completedAt = new Map<string, string>();
        let previous = new Set<string>();
        if (completedIds.size) for (const { snapshot, event, index } of iterateBoardTimeline(data, (event) => event.at.slice(0, 10) <= end, ['project', 'workflow', 'functionalWorkflow', 'workflowTypes', 'roadmap', 'projectControl'])) {
            // This widget needs completion transitions for these milestones only.
            // Rebuilding every phase and milestone at every event is quadratic on native histories.
            const members = new Map<string, Task[]>();
            for (const task of snapshot.board.tasks) {
                const id = effectivePlanning(snapshot, task, 'milestoneId');
                if (completedIds.has(id)) {
                    const group = members.get(id) || [];
                    group.push(task); members.set(id, group);
                }
            }
            const current = new Set((snapshot.extensions.roadmap?.milestones || []).filter(item => {
                if (!completedIds.has(item.id)) return false;
                const tasks = members.get(item.id) || [];
                return gateControlProgress(snapshot, 'milestones', new Set([item.id]), planningProgress(tasks, snapshot).percent) === 100;
            }).map(item => item.id));
            for (const id of completedIds) {
                if (!current.has(id)) completedAt.delete(id);
                else if (index > 0 && !previous.has(id)) completedAt.set(id, event.at);
            }
            previous = current;
        }
        const latest = completed.filter((group) => completedAt.has(group.item.id))
            .sort((a, b) => completedAt.get(b.item.id)!.localeCompare(completedAt.get(a.item.id)!) || a.item.id.localeCompare(b.item.id))[0];
        const age = latest ? (Date.parse(end) - Date.parse(completedAt.get(latest.item.id)!.slice(0, 10))) / 86_400_000 : Infinity;
        const next = remaining.find((group) => !group.overdue);
        const relevant = new Set([...delayed.map((group) => group.item.id),
            ...(latest && age >= 0 && age <= 10 ? [latest.item.id] : []), ...(next ? [next.item.id] : [])]);
        return { summary: { completed: completed.length, delayed: delayed.length, remaining: remaining.length },
            visible: milestones.filter((group) => relevant.has(group.item.id)) };
    });
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
