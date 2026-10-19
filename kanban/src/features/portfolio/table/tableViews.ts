import type { BoardData, RoadmapItem, SprintIdentity } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { getSprintCatalog } from '@/domain/sprintCatalog';

export type TableView = 'all' | 'unplanned' | 'sprints';
export type SprintCalendarStatus = 'planned' | 'active' | 'done';

/** A sprint owns its roster, not the live task's single sprintId. A future
 * closure adapter can provide immutable rows and boardData for each sprint,
 * including the same task in several rosters, without changing the renderer.
 */
export type SprintTableRoster = {
    sprint: RoadmapItem;
    rows: PortfolioRow[];
    boardData: BoardData;
    source: 'current' | 'closure';
    identity?: SprintIdentity;
};
export type SprintTableGroup = SprintTableRoster & {
    status: SprintCalendarStatus;
    total: number;
    completed: number;
    completeness: number | null;
    number: number;
    createdAt: string | null;
};

export function unplannedTableRows(rows: PortfolioRow[]): PortfolioRow[] {
    return rows.filter(({ task }) => task.status !== 'done' && !task.sprintId);
}

/** Compatibility adapter for today's schema; historical membership belongs in a future adapter. */
export function currentSprintRosters(boardData: BoardData, rows: PortfolioRow[]): SprintTableRoster[] {
    const identities = new Map(getSprintCatalog(boardData).entries.map((entry) => [entry.sprintId, entry]));
    const members = new Map<string, PortfolioRow[]>();
    rows.forEach((row) => {
        const group = members.get(row.task.sprintId) || [];
        group.push(row);
        members.set(row.task.sprintId, group);
    });
    return (boardData.extensions.roadmap?.sprints || []).map((sprint) => ({
        sprint, boardData, source: 'current', rows: members.get(sprint.id) || [], identity: identities.get(sprint.id)
    }));
}

export function buildSprintTableGroups(rosters: SprintTableRoster[], today: string): SprintTableGroup[] {
    return rosters.map((roster, index): SprintTableGroup => {
        const rows = [...new Map(roster.rows.map((row) => [row.taskId, row])).values()];
        const completed = rows.filter(({ task }) => task.status === 'done').length;
        const status = roster.source === 'closure' || (roster.sprint.endDate && roster.sprint.endDate < today)
            ? 'done' : roster.sprint.startDate && roster.sprint.startDate > today ? 'planned' : 'active';
        return {
            ...roster, rows: roster.source === 'closure' ? rows.map((row) => ({ ...row, historical: true, canMutate: false, boardData: roster.boardData })) : rows,
            status, completed, total: rows.length, completeness: rows.length ? completed / rows.length * 100 : null,
            number: roster.identity?.number ?? index + 1, createdAt: roster.identity?.createdAt ?? null
        };
    }).sort((a, b) => {
        const aCreated = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
        return aCreated === bCreated ? b.number - a.number : bCreated - aCreated;
    });
}
