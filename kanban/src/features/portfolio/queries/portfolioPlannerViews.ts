// Day planner view model: tray groups from the visible rows and per-day
// blocks from every project in scope.

import type { BoardData, Effort, Priority, ProjectColor, Task, TaskStatus } from '@/domain/types';
import type { BoardRecord, PlannerMode } from '@/features/portfolio/types';
import { createPortfolioProjectColor } from '@/domain/board';
import {
    PLANNER_WORK_END,
    PLANNER_WORK_START,
    getDayPlannerBlocks,
    getPlannerWeekDates,
    layoutPlannerBlocks,
    plannerMinutes
} from '@/domain/dayPlanner';
import { statusCategory } from '@/domain/workflow';
import { DEFAULT_PORTFOLIO_FILTERS, taskMatchesPortfolioFilters } from '@/domain/portfolioFilters';
import type { SelectorState } from './portfolioRowViews';
import { getSelectedPortfolioTimelineView, isBoardInHistoricalPreview } from './portfolioTimelineViews';

export type PlannerTrayItem = {
    boardId: string;
    taskId: number;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    effort: Effort | null;
    color: ProjectColor;
    canDrag: boolean;
    planned: boolean;
};
export type PlannerTrayGroup = { boardId: string; boardTitle: string; color: ProjectColor; items: PlannerTrayItem[] };
export type PlannerBlockView = {
    id: string;
    boardId: string;
    boardTitle: string;
    taskId: number;
    title: string;
    date: string;
    start: string;
    end: string;
    startMinutes: number;
    endMinutes: number;
    color: ProjectColor;
    done: boolean;
    archived: boolean;
    canEdit: boolean;
    column: number;
    columns: number;
};
export type PlannerDayView = { date: string; isToday: boolean; blocks: PlannerBlockView[] };
export type PlannerViewModel = {
    mode: PlannerMode;
    date: string;
    today: string;
    days: PlannerDayView[];
    plannedMinutes: number;
    capacityMinutes: number;
    trayGroups: PlannerTrayGroup[];
};

const boardColor = (board: BoardRecord): ProjectColor => board.projectColor || createPortfolioProjectColor(board.colorSeed || 0);
const boardTitle = (board: BoardRecord): string => board.title || board.fileName;

function buildDayBlocks(state: SelectorState, boards: BoardRecord[], dates: Set<string>): PlannerBlockView[] {
    // A project previewed at an earlier timeline event shows the plan as it was then.
    const timelineView = getSelectedPortfolioTimelineView(state);
    const previewData = (board: BoardRecord): BoardData => (
        timelineView?.isPreview && timelineView.projectedBoard && timelineView.boardRecord.id === board.id
            ? timelineView.projectedBoard
            : board.data
    );
    return boards.flatMap((board) => {
        const data = previewData(board);
        const tasks = new Map<number, Task>(data.board.tasks.map((task) => [Number(task.id), task]));
        const canEdit = Boolean(board.handle) && !isBoardInHistoricalPreview(state, board.id);
        return getDayPlannerBlocks(data).flatMap((block) => {
            const task = tasks.get(block.taskId);
            if (!task || !dates.has(block.date)
                || !taskMatchesPortfolioFilters(task, { ...DEFAULT_PORTFOLIO_FILTERS, ...state?.portfolioFilters }, data)) return [];
            return [{
                ...block,
                boardId: board.id,
                boardTitle: boardTitle(board),
                title: task.title,
                startMinutes: plannerMinutes(block.start),
                endMinutes: plannerMinutes(block.end),
                color: boardColor(board),
                done: statusCategory(task.status, data) === 'completed',
                archived: Boolean(task.archived),
                canEdit,
                column: 0,
                columns: 1
            }];
        });
    });
}

export function buildPortfolioPlannerViewModel(
    state: SelectorState,
    { today, trayStatuses }: { today: string; trayStatuses: readonly TaskStatus[] }
): PlannerViewModel {
    const mode: PlannerMode = state?.portfolioPlannerMode === 'week' ? 'week' : 'day';
    const date = state?.portfolioPlannerDate || today;
    const dates = mode === 'week' ? getPlannerWeekDates(date) : [date];
    const allBoards = Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [];
    const selectedId = state?.selectedPortfolioBoardId || '';
    const boards = selectedId ? allBoards.filter((board) => board.id === selectedId) : allBoards;

    const blocks = buildDayBlocks(state, boards, new Set(dates));
    const days: PlannerDayView[] = dates.map((day) => {
        const dayBlocks = blocks.filter((block) => block.date === day);
        const layout = layoutPlannerBlocks(dayBlocks);
        return {
            date: day,
            isToday: day === today,
            blocks: dayBlocks
                .map((block) => ({ ...block, ...(layout.get(block.id) || { column: 0, columns: 1 }) }))
                .sort((a, b) => a.startMinutes - b.startMinutes || a.column - b.column)
        };
    });

    const plannedKeys = new Set(blocks.map((block) => `${block.boardId}:${block.taskId}`));
    const statusSet = new Set(trayStatuses);
    const groups = new Map<string, PlannerTrayGroup>();
    (Array.isArray(state?.portfolioVisibleRows) ? state.portfolioVisibleRows : []).forEach((row) => {
        const status = row.task.status;
        const board = allBoards.find((entry) => entry.id === row.boardId);
        if (!board) return;
        const category = statusCategory(status, row.boardData || board.data);
        const trayStatus = ({ backlog: 'backlog', 'to-do': 'to-do', 'in-progress': 'doing', completed: 'done', cancelled: 'cancelled' })[category];
        if (!statusSet.has(trayStatus)) return;
        let group = groups.get(board.id);
        if (!group) {
            group = { boardId: board.id, boardTitle: boardTitle(board), color: boardColor(board), items: [] };
            groups.set(board.id, group);
        }
        const taskId = Number(row.taskId ?? row.task.id);
        group.items.push({
            boardId: board.id,
            taskId,
            title: row.task.title,
            status,
            priority: row.task.priority,
            effort: row.task.effort,
            color: group.color,
            canDrag: Boolean(row.canMutate) && !row.historical,
            planned: plannedKeys.has(`${board.id}:${taskId}`)
        });
    });
    const trayGroups = allBoards.map((board) => groups.get(board.id)).filter((group): group is PlannerTrayGroup => Boolean(group));

    return {
        mode,
        date,
        today,
        days,
        plannedMinutes: blocks.reduce((sum, block) => sum + block.endMinutes - block.startMinutes, 0),
        capacityMinutes: (PLANNER_WORK_END - PLANNER_WORK_START) * dates.length,
        trayGroups
    };
}
