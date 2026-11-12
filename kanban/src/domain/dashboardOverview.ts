import type { BoardData, Task } from './types';
import { dashboardPlanning, dashboardSprints, dashboardTasks } from './dashboard';
import { controlPending, controlRecords, gateControlProgress } from './projectControl';
import { phaseDescendants, planningProgress } from './phaseTree';
import { applyTimelineEventToState, getBoardTimelineData, iterateBoardTimeline, reconstructBoardStateFromTimeline } from './timeline';
import { createBoardStateSnapshot } from './serialize';
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

/** Count actual status changes, not baseline contents, workflow edits, or restores.
 * Rows use their state at the end date; deleted items retain their last recorded detail. */
export function dashboardPeriodWorkitems(source: BoardData, endData: BoardData, phaseId: string, start: string, end: string) {
    return withWorkflowReadCache(() => {
        const timeline = getBoardTimelineData(source);
        const createdInPeriod = (context: BoardData) => dashboardTasks(context, phaseId).filter((task) => workitemType(task) === 'story' && task.createdAt.slice(0, 10) >= start && task.createdAt.slice(0, 10) <= end);
        const created = new Map(createdInPeriod(endData).map((task) => [task.id, task]));
        const result = { created: [...created.values()], started: [] as Task[], completed: [] as Task[], testing: [] as Task[], availableFrom: timeline?.events[0]?.at.slice(0, 10) || null, available: Boolean(timeline?.events[0]?.snapshot?.board), startedAt: new Map<number, string>(), completedAt: new Map<number, string>(), testingAt: new Map<number, string>(), contexts: new Map<number, BoardData>() };
        if (!result.available || !timeline) return result;
        const started = new Map<number, Task>();
        const completed = new Map<number, Task>();
        const testing = new Map<number, Task>();
        // Keep raw replay separate: normalizing a legacy baseline derives a people
        // catalog that must not be fed into later events introducing new members.
        let replay: Parameters<typeof applyTimelineEventToState>[0] = timeline.events[0].snapshot;
        let previous = reconstructBoardStateFromTimeline(source, 0);
        if (timeline.events[0].at.slice(0, 10) <= end) for (const task of createdInPeriod(previous)) {
            created.set(task.id, task); result.contexts.set(task.id, previous);
        }
        for (let index = 1; index < timeline.events.length; index++) {
            const event = timeline.events[index];
            const date = event.at.slice(0, 10);
            replay = applyTimelineEventToState(replay, event) || replay;
            const next = createBoardStateSnapshot(replay);
            if (date <= end) for (const task of createdInPeriod(next)) {
                created.set(task.id, task); result.contexts.set(task.id, next);
            }
            if (date >= start && date <= end && ['task.status.changed', 'task.updated', 'task.created', 'board.workitems.updated'].includes(event.kind)) {
                const scoped = dashboardTasks(next, phaseId);
                for (const task of scoped.filter((task) => dashboardReportable(next, task))) {
                    const before = previous.board.tasks.find((old) => old.id === task.id && old.createdAt === task.createdAt);
                    if ((!before && event.kind !== 'task.created') || before?.status === task.status) continue;
                    const beforeCategory = before ? statusCategory(before.status, previous, before) : null;
                    const afterCategory = statusCategory(task.status, next, task);
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
            for (const task of next.board.tasks) {
                if (date <= end && (started.has(task.id) || completed.has(task.id) || testing.has(task.id))) {
                    if (started.has(task.id)) started.set(task.id, task);
                    if (completed.has(task.id)) completed.set(task.id, task);
                    if (testing.has(task.id)) testing.set(task.id, task);
                    result.contexts.set(task.id, next);
                }
            }
            previous = next;
        }
        const endRows = (members: Map<number, Task>, context = endData) => [...members.values()].flatMap((task) => {
            const atEnd = context.board.tasks.find((row) => row.id === task.id && row.createdAt === task.createdAt);
            if (atEnd && (!dashboardReportable(context, atEnd) || !dashboardTasks(context, phaseId).some((row) => row.id === atEnd.id))) return [];
            return [atEnd || task];
        });
        result.created = [...created.values()].map((task) => endData.board.tasks.find((row) => row.id === task.id && row.createdAt === task.createdAt) || task);
        result.started = endRows(started); result.completed = endRows(completed);
        // Testing is a period event; show the current status even after the item leaves Testing.
        result.testing = endRows(testing, source);
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
