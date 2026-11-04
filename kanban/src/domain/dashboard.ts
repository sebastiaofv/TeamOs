import type { BoardData, RoadmapItem, Task } from './types';
import { effectivePlanning, consultSprintParticipation, workitemType } from './workitems';
import { phaseDescendants, planningProgress } from './phaseTree';
import { statusCategory, workflowKind } from './workflow';
import { getDependencyBlockedTaskIds } from './taskRelations';
import { getSprintCalendarStatus } from './roadmap';
import { getSprintCatalog } from './sprintCatalog';
import { getBoardTimelineData, reconstructBoardStateFromTimeline } from './timeline';

/** Dashboard scopes are independent of Board/Table presentation filters and include archives. */
export function dashboardTasks(data: BoardData, phaseId = ''): Task[] {
    if (!phaseId) return data.board.tasks;
    const phases = phaseDescendants(data.extensions.roadmap?.phases || [], phaseId);
    return data.board.tasks.filter((task) => phases.has(effectivePlanning(data, task, 'phaseId')));
}

export function dashboardMetrics(data: BoardData, tasks: readonly Task[], asOf: string) {
    const parents = new Set(data.board.tasks.map((task) => task.parentId));
    const leaves = tasks.filter((task) => !parents.has(task.id));
    const category = (task: Task) => statusCategory(task.status, data, task);
    const stateKey = (task: Task) => data.extensions.functionalWorkflow ? `${workflowKind(task)}:${task.status}` : task.status;
    const eligible = leaves.filter((task) => category(task) !== 'cancelled');
    const completed = eligible.filter((task) => category(task) === 'completed');
    const open = eligible.filter((task) => category(task) !== 'completed');
    const dependencies = getDependencyBlockedTaskIds(data);
    const deadlines = eligible.filter((task) => task.dueDate);
    return {
        tasks: [...tasks], leaves, eligible, completed, open,
        progress: planningProgress(tasks, data),
        inProgress: open.filter((task) => category(task) === 'in-progress'),
        pending: open.filter((task) => category(task) !== 'in-progress'),
        blocked: open.filter((task) => task.blocked || dependencies.has(task.id)),
        overdue: deadlines.length ? open.filter((task) => task.dueDate && task.dueDate < asOf) : null,
        unassigned: eligible.filter((task) => !task.responsible),
        undated: eligible.filter((task) => !task.dueDate),
        cancelled: leaves.filter((task) => category(task) === 'cancelled'),
        states: [...new Set(tasks.map(stateKey))].map((id) => ({ id, tasks: tasks.filter((task) => stateKey(task) === id) })),
        types: (['story', 'task', 'bug', 'epic'] as const).map((type) => ({ type, tasks: tasks.filter((task) => workitemType(task) === type) })),
        team: [...new Set(tasks.map((task) => task.responsible))].sort().map((name) => {
            const members = tasks.filter((task) => task.responsible === name);
            return { name, tasks: members, completed: members.filter((task) => category(task) === 'completed'), inProgress: members.filter((task) => category(task) === 'in-progress'), pending: members.filter((task) => !['completed', 'cancelled', 'in-progress'].includes(category(task))) };
        })
    };
}

export function dashboardPlanning(data: BoardData, phaseId: string, asOf: string) {
    const tasks = dashboardTasks(data, phaseId);
    const allowedPhases = phaseId ? phaseDescendants(data.extensions.roadmap?.phases || [], phaseId) : null;
    const group = (kind: 'phases' | 'milestones', item: RoadmapItem) => {
        const descendants = kind === 'phases' ? phaseDescendants(data.extensions.roadmap?.phases || [], item.id) : null;
        const members = tasks.filter((task) => kind === 'phases'
            ? descendants!.has(effectivePlanning(data, task, 'phaseId'))
            : effectivePlanning(data, task, 'milestoneId') === item.id);
        const progress = planningProgress(members, data);
        const end = kind === 'phases' ? item.endDate : item.dueDate;
        return { kind, item, tasks: members, progress,
            current: kind === 'phases' && Boolean(item.startDate && end && item.startDate <= asOf && asOf <= end),
            executing: kind === 'phases' && members.some((task) => statusCategory(task.status, data, task) === 'in-progress'),
            overdue: end && progress.percent !== null ? end < asOf && progress.percent < 100 : null
        };
    };
    return [
        ...(data.extensions.roadmap?.phases || []).filter((item) => !allowedPhases || allowedPhases.has(item.id)).map((item) => group('phases', item)),
        ...(data.extensions.roadmap?.milestones || []).filter((item) => !phaseId || tasks.some((task) => effectivePlanning(data, task, 'milestoneId') === item.id)).map((item) => group('milestones', item))
    ];
}

/** Participation is evidence of membership, never a frozen Sprint closure result. */
export function dashboardSprints(data: BoardData, phaseId: string, asOf: string) {
    const catalog = getSprintCatalog(data);
    return (data.extensions.roadmap?.sprints || []).map((item) => {
        const participation = consultSprintParticipation(data, item.id);
        const tasks = dashboardTasks(participation.boardData, phaseId);
        const metrics = dashboardMetrics(participation.boardData, tasks, asOf);
        return { item, number: catalog.entries.find((entry) => entry.sprintId === item.id)?.number,
            status: getSprintCalendarStatus(item, asOf), data: participation.boardData, tasks, metrics };
    });
}

/** Only recorded instants are returned. No interpolation or invented daily observations. */
export function dashboardHistory(data: BoardData, phaseId: string, from: string, to: string) {
    const timeline = getBoardTimelineData(data);
    if (!timeline?.events[0]?.snapshot?.board) return [];
    return (timeline?.events || []).flatMap((event, index) => {
        const date = event.at.slice(0, 10);
        if ((from && date < from) || (to && date > to)) return [];
        const snapshot = reconstructBoardStateFromTimeline(data, index);
        return [{ index, at: event.at, data: snapshot, metrics: dashboardMetrics(snapshot, dashboardTasks(snapshot, phaseId), date) }];
    });
}

/** Changes are evidenced by consecutive saved states during the planned Sprint dates. */
export function dashboardSprintScopeChanges(data: BoardData, sprintId: string, phaseId = '') {
    const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === sprintId);
    const events = getBoardTimelineData(data)?.events || [];
    const changes: { at: string; kind: 'added' | 'removed'; tasks: Task[]; data: BoardData }[] = [];
    if (!sprint?.startDate || !sprint.endDate || events.length < 2) return changes;
    let before = reconstructBoardStateFromTimeline(data, 0);
    for (let index = 1; index < events.length; index++) {
        const event = events[index];
        const after = reconstructBoardStateFromTimeline(data, index);
        if (event.at.slice(0, 10) >= sprint.startDate && event.at.slice(0, 10) <= sprint.endDate) {
            const previous = dashboardTasks(before, phaseId).filter((task) => task.sprintId === sprintId);
            const next = dashboardTasks(after, phaseId).filter((task) => task.sprintId === sprintId);
            // Phase-only changes do not count as Sprint scope changes.
            const added = next.filter((task) => !before.board.tasks.some((old) => old.id === task.id && old.sprintId === sprintId));
            const removed = previous.filter((task) => !after.board.tasks.some((current) => current.id === task.id && current.sprintId === sprintId));
            if (added.length) changes.push({ at: event.at, kind: 'added', tasks: added, data: after });
            if (removed.length) changes.push({ at: event.at, kind: 'removed', tasks: removed, data: before });
        }
        before = after;
    }
    return changes;
}
