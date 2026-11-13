import type { BoardData, RoadmapItem, Task } from './types';
import { effectivePlanning, consultSprintParticipation, workitemType } from './workitems';
import { phaseDescendants, planningProgress } from './phaseTree';
import { statusCategory, workflowKind, withWorkflowReadCache } from './workflow';
import { getDependencyBlockedTaskIds } from './taskRelations';
import { getSprintCalendarStatus } from './roadmap';
import { getSprintCatalog } from './sprintCatalog';
import { iterateBoardTimeline, reconstructBoardStateFromTimeline } from './timeline';
import { createBoardAnalysisCache, createBoardAnalysisSnapshot } from './serialize';

/** Dashboard scopes are independent of Board/Table presentation filters and include archives. */
export function dashboardTasks(data: BoardData, phaseId = ''): Task[] {
    if (!phaseId) return data.board.tasks;
    const phases = phaseDescendants(data.extensions.roadmap?.phases || [], phaseId);
    return data.board.tasks.filter((task) => phases.has(effectivePlanning(data, task, 'phaseId')));
}

export function dashboardMetrics(data: BoardData, tasks: readonly Task[], asOf: string, additionalDependencies: ReadonlySet<number> = new Set()) {
    return withWorkflowReadCache(() => {
        const parents = new Set(data.board.tasks.map((task) => task.parentId));
        const leaves = tasks.filter((task) => !parents.has(task.id));
        const category = (task: Task) => statusCategory(task.status, data, task);
        const stateKey = (task: Task) => data.extensions.functionalWorkflow ? `${workflowKind(task)}:${task.status}` : task.status;
        const eligible = leaves.filter((task) => category(task) !== 'cancelled');
        const completed = eligible.filter((task) => category(task) === 'completed');
        const open = eligible.filter((task) => category(task) !== 'completed');
        const dependencies = new Set([...getDependencyBlockedTaskIds(data), ...additionalDependencies]);
        const deadlines = eligible.filter((task) => task.dueDate);
        return {
            tasks: [...tasks], leaves, eligible, completed, open,
            progress: planningProgress(tasks, data),
            inProgress: open.filter((task) => category(task) === 'in-progress'),
            pending: open.filter((task) => category(task) !== 'in-progress'),
            blocked: tasks.filter((task) => !['completed', 'cancelled'].includes(category(task)) && (task.blocked || dependencies.has(task.id))),
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
    });
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

function* dashboardObservations(data: BoardData, phaseId: string, from: string, to: string) {
    const include = (event: { at: string }) => {
        const date = event.at.slice(0, 10);
        return (!from || date >= from) && (!to || date <= to);
    };
    for (const { event, index, snapshot } of iterateBoardTimeline(data, include)) yield {
        index, at: event.at,
        // Complete historical details are reconstructed only on consultation.
        get data() { return reconstructBoardStateFromTimeline(data, index); },
        metrics: dashboardMetrics(snapshot, dashboardTasks(snapshot, phaseId), event.at.slice(0, 10))
    };
}

/** Only recorded instants are returned. No interpolation or invented daily observations. */
export function dashboardHistory(data: BoardData, phaseId: string, from: string, to: string) {
    return withWorkflowReadCache(() => Array.from(dashboardObservations(data, phaseId, from, to)));
}

// These edits cannot change leaf membership, workflow category or phase scope.
const NON_METRIC_TASK_FIELDS = new Set(['title', 'description', 'assignees', 'responsible', 'tags', 'blocked', 'blockerReason', 'checklist', 'attachments', 'archived', 'dueDate', 'priority', 'effort', 'storyPoints', 'pullRequests', 'objective', 'scope', 'businessValue', 'acceptanceCriteria', 'stepsToReproduce', 'expectedResult', 'actualResult', 'severity', 'environment', 'acceptance']);

/** `dashboardMetrics` completed, open and progress, without the lists nothing here reads. */
function historyCounts(data: BoardData, phaseId: string) {
    const tasks = dashboardTasks(data, phaseId);
    const parents = new Set(data.board.tasks.map((task) => task.parentId));
    let completed = 0, open = 0;
    for (const task of tasks) {
        if (parents.has(task.id)) continue;
        const category = statusCategory(task.status, data, task);
        if (category === 'completed') completed++;
        else if (category !== 'cancelled') open++;
    }
    return { completed, open, percent: planningProgress(tasks, data).percent };
}

/** The visible history table needs counts, not E copies of all N workitems.
 * Canonical positions remain available for full historical navigation. */
export function dashboardHistorySummary(data: BoardData, phaseId: string, from: string, to: string) {
    return withWorkflowReadCache(() => {
        const rows: { index: number; at: string; completed: number; open: number; percent: number | null }[] = [];
        let counts: Pick<typeof rows[number], 'completed' | 'open' | 'percent'> | undefined;
        let dirty = true;
        // Counts read only statuses, hierarchy and phase scope: analysis boards share
        // unchanged workitems, so a status change costs far less than a full snapshot.
        const analysis = createBoardAnalysisCache();
        for (const point of iterateBoardTimeline(data)) {
            const event = point.event;
            if (!(event.kind === 'task.updated' && !event.snapshot && !event.checkpoint && event.changes && Object.keys(event.changes).every((field) => NON_METRIC_TASK_FIELDS.has(field)))) dirty = true;
            const date = event.at.slice(0, 10);
            if ((from && date < from) || (to && date > to)) continue;
            if (!counts || dirty) {
                counts = historyCounts(createBoardAnalysisSnapshot(point.state, analysis), phaseId);
                dirty = false;
            }
            rows.push({ index: point.index, at: event.at, ...counts });
        }
        return rows;
    });
}

/** Changes are evidenced by consecutive saved states during the planned Sprint dates.
 * Membership is compared on analysis boards; full snapshots are built only for the
 * states whose rows are reported, since loaded histories hold thousands of events. */
export function dashboardSprintScopeChanges(data: BoardData, sprintId: string, phaseId = '') {
    return withWorkflowReadCache(() => {
        const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === sprintId);
        const changes: { at: string; kind: 'added' | 'removed'; tasks: Task[]; data: BoardData }[] = [];
        if (!sprint?.startDate || !sprint.endDate) return changes;
        const analysis = createBoardAnalysisCache();
        // Same rows, in board order, as filtering phase scope first and then the Sprint.
        const members = (board: BoardData) => {
            const phases = phaseId ? phaseDescendants(board.extensions.roadmap?.phases || [], phaseId) : null;
            return board.board.tasks.filter((task) => task.sprintId === sprintId && (!phases || phases.has(effectivePlanning(board, task, 'phaseId'))));
        };
        const sprintIds = (board: BoardData) => new Set(board.board.tasks.filter((task) => task.sprintId === sprintId).map((task) => task.id));
        let previousPoint: { snapshot: BoardData; state: unknown } | undefined;
        let previousBoard: BoardData | undefined;
        for (const point of iterateBoardTimeline(data)) {
            const { event, index } = point;
            let afterBoard: BoardData | undefined;
            if (previousPoint && event.at.slice(0, 10) >= sprint.startDate && event.at.slice(0, 10) <= sprint.endDate) {
                const before = previousBoard ??= createBoardAnalysisSnapshot(previousPoint.state, analysis);
                const after = afterBoard = createBoardAnalysisSnapshot(point.state, analysis);
                // Phase-only changes do not count as Sprint scope changes.
                const beforeIds = sprintIds(before), afterIds = sprintIds(after);
                const added = new Set(members(after).filter((task) => !beforeIds.has(task.id)).map((task) => task.id));
                const removed = new Set(members(before).filter((task) => !afterIds.has(task.id)).map((task) => task.id));
                if (added.size) changes.push({ at: event.at, kind: 'added', tasks: members(point.snapshot).filter((task) => added.has(task.id)), get data() { return reconstructBoardStateFromTimeline(data, index); } });
                if (removed.size) changes.push({ at: event.at, kind: 'removed', tasks: members(previousPoint.snapshot).filter((task) => removed.has(task.id)), get data() { return reconstructBoardStateFromTimeline(data, index - 1); } });
            }
            previousPoint = point;
            previousBoard = afterBoard;
        }
        return changes;
    });
}
