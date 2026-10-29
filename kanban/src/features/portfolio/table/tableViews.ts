import { getWorkflow } from '@/domain/workflow';
import { isPlanningUnit, eligibleSprint, consultSprintParticipation, type SprintParticipation } from '@/domain/workitems';
import type { BoardData, RoadmapItem, SprintIdentity } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { getSprintCatalog } from '@/domain/sprintCatalog';
import { getSprintCalendarStatus, type SprintCalendarStatus } from '@/domain/roadmap';
import { statusCategory } from '@/domain/workflow';

export type TableView = 'all' | 'unplanned' | 'sprints' | 'epics' | 'stories' | 'independent';
export type { SprintCalendarStatus } from '@/domain/roadmap';

/** A sprint owns its roster, not the live task's single sprintId. A future
 * closure adapter can provide immutable rows and boardData for each sprint,
 * including the same task in several rosters, without changing the renderer.
 */
export type SprintTableRoster = {
    sprint: RoadmapItem;
    rows: PortfolioRow[];
    boardData: BoardData;
    source: 'current' | 'closure';
    participation?: SprintParticipation;
    identity?: SprintIdentity;
};
export type SprintTableGroup = SprintTableRoster & {
    status: SprintCalendarStatus;
    total: number;
    completed: number;
    cancelled: number;
    completeness: number | null;
    number: number;
    createdAt: string | null;
};

export function unplannedTableRows(rows: PortfolioRow[]): PortfolioRow[] {
    return rows.filter(({ task, boardData }) => !['completed', 'cancelled'].includes(statusCategory(task.status, boardData, task)) && (!boardData || isPlanningUnit(boardData, task)) && (!task.sprintId || Boolean(boardData && !eligibleSprint(boardData, task.sprintId))));
}

/** Use recorded participation for both planning rows and their participating children. */
export function currentSprintRosters(boardData: BoardData, rows: PortfolioRow[]): SprintTableRoster[] {
    const identities = new Map(getSprintCatalog(boardData).entries.map((entry) => [entry.sprintId, entry]));
    return (boardData.extensions.roadmap?.sprints || []).map((sprint) => {
        const rosterSource = { ...boardData, board: { ...boardData.board, tasks: [...new Map([...rows.map((row) => row.task), ...boardData.board.tasks].map((task) => [task.id, task])).values()] } };
        const participation = consultSprintParticipation(rosterSource, sprint.id);
        const snapshot = participation.boardData;
        const rosterRows = participation.members.map((task): PortfolioRow => {
            const current = rows.find((row) => row.taskId === task.id);
            return { boardIndex: current?.boardIndex || 0, boardId: current?.boardId || '', taskId: task.id, taskIndex: current?.taskIndex ?? -1, boardTitle: boardData.board.settings.title, boardFileName: current?.boardFileName || '', canMutate: Boolean(current?.canMutate) && participation.isCurrent(task.id) && !current?.historical, historical: !participation.isCurrent(task.id) || !current || current.historical, columnTitle: getWorkflow(boardData, task).states.find((state) => state.id === task.status)?.name, boardData: snapshot, task };
        });
        return { sprint, boardData: snapshot, participation, source: 'current', rows: rosterRows, identity: identities.get(sprint.id) };
    });
}

export function buildSprintTableGroups(rosters: SprintTableRoster[], today: string): SprintTableGroup[] {
    return rosters.map((roster, index): SprintTableGroup => {
        const rows = [...new Map(roster.rows.map((row) => [row.taskId, row])).values()];
        const planningRows = rows.filter(({ task }) => isPlanningUnit(roster.boardData, task));
        const completed = planningRows.filter(({ task }) => statusCategory(task.status, roster.boardData, task) === 'completed').length;
        const cancelled = planningRows.filter(({ task }) => statusCategory(task.status, roster.boardData, task) === 'cancelled').length;
        const eligible = planningRows.length - cancelled;
        const status = roster.source === 'closure' ? 'done' : getSprintCalendarStatus(roster.sprint, today);
        return {
            ...roster, rows: roster.source === 'closure' ? rows.map((row) => ({ ...row, historical: true, canMutate: false, boardData: roster.boardData })) : rows,
            status, completed, cancelled, total: planningRows.length, completeness: eligible ? completed / eligible * 100 : null,
            number: roster.identity?.number ?? index + 1, createdAt: roster.identity?.createdAt ?? null
        };
    }).sort((a, b) => {
        const aCreated = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
        return aCreated === bCreated ? b.number - a.number : bCreated - aCreated;
    });
}
