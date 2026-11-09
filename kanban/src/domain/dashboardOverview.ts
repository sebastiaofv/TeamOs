import type { BoardData, Task } from './types';
import { dashboardPlanning, dashboardSprints, dashboardTasks } from './dashboard';
import { controlPending, controlRecords, gateControlProgress } from './projectControl';
import { phaseDescendants, planningProgress } from './phaseTree';
import { applyTimelineEventToState, getBoardTimelineData, reconstructBoardStateFromTimeline } from './timeline';
import { createBoardStateSnapshot } from './serialize';
import { getWorkflow, statusCategory, withWorkflowReadCache } from './workflow';
import { isPlanningUnit, workitemProgress, workitemType } from './workitems';
import { getSprintCalendarStatus, getSprintStatus } from './roadmap';
import { developmentCompleted, sprintPointSummary } from './sprintResults';

export const DASHBOARD_SECTIONS = ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'workitemStatus', 'epics', 'started', 'completedInPeriod', 'currentlyInProgress', 'openRisks', 'deliverables', 'decisions'] as const;
export type DashboardSection = typeof DASHBOARD_SECTIONS[number];

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

/** Stories and Tasks independent of a Story, matching Table's planning units. */
export function dashboardReportable(data: BoardData, task: Task): boolean {
    return workitemType(task) === 'story' || (workitemType(task) === 'task' && isPlanningUnit(data, task));
}

export function dashboardStatistics(data: BoardData, phaseId: string) {
    const tasks = dashboardTasks(data, phaseId);
    return (['story', 'task', 'bug'] as const).map((type) => {
        const members = tasks.filter((task) => workitemType(task) === type && (type !== 'task' || isPlanningUnit(data, task)));
        const states = getWorkflow(data, { type }).states;
        return { type, tasks: members, states: states.map((state) => ({
            ...state, tasks: members.filter((task) => task.status === state.id)
        })) };
    });
}

/** Follow the lifecycle for explicit Sprints, including those still active after their deadline. */
export function dashboardActiveSprints(data: BoardData, end: string) {
    return dashboardSprints(data, '', end).filter((sprint) => getSprintStatus(sprint.item, end) === 'active').map((sprint) => {
        const units = sprint.tasks.filter((task) => isPlanningUnit(sprint.data, task) && statusCategory(task.status, sprint.data, task) !== 'cancelled');
        const completed = units.filter((task) => statusCategory(task.status, sprint.data, task) === 'completed');
        const points = sprintPointSummary(data, sprint.item.id);
        const completedPoints = data.board.tasks.filter((task) => task.sprintId === sprint.item.id && developmentCompleted(data, task)).reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
        return { ...sprint, units, stories: sprint.tasks.filter((task) => workitemType(task) === 'story'),
            points: { ...points, completed: completedPoints }, percent: units.length ? completed.length / units.length * 100 : null,
            overdue: Boolean(sprint.item.endDate && sprint.item.endDate < end) };
    });
}

export function dashboardEpics(data: BoardData) {
    return data.board.tasks.filter((task) => workitemType(task) === 'epic' && ['in-progress', 'testing', 'completed'].includes(statusCategory(task.status, data, task)))
        .map((task) => ({ task, progress: workitemProgress(data, task.id) }));
}

/** Count actual status changes, not baseline contents, workflow edits, or restores.
 * Rows use their state at the end date; deleted items retain their last recorded detail. */
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
        let previous = reconstructBoardStateFromTimeline(source, 0);
        for (let index = 1; index < timeline.events.length; index++) {
            const event = timeline.events[index];
            const date = event.at.slice(0, 10);
            replay = applyTimelineEventToState(replay, event) || replay;
            const next = createBoardStateSnapshot(replay);
            if (date >= start && date <= end && ['task.status.changed', 'task.updated', 'task.created', 'board.workitems.updated'].includes(event.kind)) {
                const scoped = dashboardTasks(next, phaseId);
                for (const task of scoped.filter((task) => dashboardReportable(next, task))) {
                    const before = previous.board.tasks.find((old) => old.id === task.id && old.createdAt === task.createdAt);
                    if ((!before && event.kind !== 'task.created') || before?.status === task.status) continue;
                    const beforeCategory = before ? statusCategory(before.status, previous, before) : null;
                    const afterCategory = statusCategory(task.status, next, task);
                    if (beforeCategory === afterCategory) continue;
                    if (afterCategory === 'in-progress') started.set(task.id, task);
                    if (afterCategory === 'completed') completed.set(task.id, task);
                }
            }
            for (const task of next.board.tasks) {
                if (date <= end && (started.has(task.id) || completed.has(task.id))) {
                    if (started.has(task.id)) started.set(task.id, task);
                    if (completed.has(task.id)) completed.set(task.id, task);
                    result.contexts.set(task.id, next);
                }
            }
            previous = next;
        }
        const endRows = (members: Map<number, Task>) => [...members.values()].flatMap((task) => {
            const atEnd = endData.board.tasks.find((row) => row.id === task.id && row.createdAt === task.createdAt);
            if (atEnd && !dashboardTasks(endData, phaseId).some((row) => row.id === atEnd.id)) return [];
            return [atEnd || task];
        });
        result.started = endRows(started); result.completed = endRows(completed);
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
    const phases = planning.filter((group) => group.kind === 'phases' && group.open)
        .map((group) => {
            const started = group.tasks.some((task) => ['in-progress', 'testing', 'completed'].includes(statusCategory(task.status, data, task)));
            return { ...group, started, situation: group.overdue ? 'overdue' as const : !started && Boolean(group.item.startDate && group.item.startDate < end) ? 'late' as const : 'onTarget' as const };
        })
        .filter((group) => group.started || Boolean(group.item.startDate && group.item.startDate <= end))
        .sort((a, b) => (a.item.startDate || '').localeCompare(b.item.startDate || '') || a.item.id.localeCompare(b.item.id));
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
