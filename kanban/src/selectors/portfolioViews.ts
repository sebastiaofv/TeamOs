import type {
    BoardData,
    BoardRecord,
    PortfolioCalendarItem,
    PortfolioCalendarViewModel,
    PortfolioFilters,
    PortfolioRoadmapViewModel,
    PortfolioRow,
    PortfolioTimelineViewModel,
    ProjectColor,
    RoadmapExtension,
    TimelineEvent,
    TimelineExtension
} from '../types';
import type { AppState } from '../state/slices';
import {
    comparePortfolioRows,
    createPortfolioProjectColor,
    normalizePortfolioSortDir,
    normalizePortfolioSortKey
} from '../domain/board';
import {
    comparePortfolioCalendarItems,
    normalizeDueDate
} from '../domain/calendar';
import {
    createEmptyRoadmapExtension,
    formatRoadmapDateRange,
    getRoadmapAxisTicks,
    getRoadmapEntityConfig,
    getRoadmapItemDateBounds,
    getRoadmapExtension,
    getVisibleRoadmapDateRange
} from '../domain/roadmap';
import {
    getBoardTimelineData,
    reconstructBoardStateFromTimeline
} from '../domain/timeline';
import {
    normalizeAssignee,
    normalizePortfolioBlockedFilter,
    normalizeTask,
    taskHasAssignee
} from '../domain/task';
import { createBoardStateSnapshot } from '../domain/serialize';
import { DEFAULT_PORTFOLIO_FILTERS, normalizePortfolioFilterSet } from '../domain/portfolioFilters';

// Selectors accept any slice of the store: components pass the fields they
// subscribe to.
export type SelectorState = Partial<AppState> | null | undefined;

export type PortfolioTimelineSelectionView = {
    boardRecord: BoardRecord;
    timeline: TimelineExtension | null;
    selectedIndex: number | null;
    selectedEvent: TimelineEvent | null;
    isPreview: boolean;
    projectedBoard: BoardData | null;
};

type CalendarItemInput = {
    id: string;
    kind: string;
    boardId: string;
    boardTitle: string;
    boardFileName: string;
    projectColor: ProjectColor;
    title: string;
    subtitle: string;
    taskId?: number;
    roadmapKind?: string;
    historical: boolean;
    dueDate?: string;
    startDate?: string;
    endDate?: string;
};

function getBoardRecord(state: SelectorState, boardId: string | null | undefined): BoardRecord | null {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .find((board) => board?.id === boardId) || null;
}

function getBoardStatusMap(boardData: BoardData | null | undefined): Record<string, string> {
    return Object.fromEntries(
        (boardData?.board?.columns || []).map((column) => [column.status, column.title])
    );
}

export function buildPortfolioTasks(state: SelectorState): PortfolioRow[] {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : []).flatMap((board, boardIndex) => {
        if (!board?.data?.board) return [];
        const statusMap = getBoardStatusMap(board.data);
        return (board.data.board.tasks || []).map((task, taskIndex) => ({
            boardIndex,
            boardId: board.id,
            taskId: task.id,
            taskIndex,
            boardTitle: board.title,
            boardFileName: board.fileName,
            columnTitle: statusMap[task.status] || task.status,
            canMutate: Boolean(board.handle),
            task: normalizeTask(task)
        }));
    });
}

export function buildPortfolioRowsFromBoardData(
    state: SelectorState,
    boardRecord: BoardRecord | null | undefined,
    boardData: unknown,
    options: { canMutate?: boolean; historical?: boolean } = {}
): PortfolioRow[] {
    if (!boardRecord || !boardData) return [];
    const normalizedBoard = createBoardStateSnapshot(boardData);
    const statusMap = getBoardStatusMap(normalizedBoard);
    const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
    const historical = Boolean(options.historical);
    return (normalizedBoard.board.tasks || []).map((task, taskIndex) => ({
        boardIndex: (state?.portfolioBoards || []).findIndex((board) => board.id === boardRecord.id),
        boardId: boardRecord.id,
        taskId: task.id,
        taskIndex,
        boardTitle: boardRecord.title,
        boardFileName: boardRecord.fileName,
        columnTitle: statusMap[task.status] || task.status,
        canMutate,
        historical,
        task: normalizeTask(task)
    }));
}

// Normalized filters for the current state; an assignee filter that matches no
// loaded task is dropped.
export function normalizePortfolioFilters(state: SelectorState): PortfolioFilters {
    const next = normalizePortfolioFilterSet(state?.portfolioFilters);
    if ((state?.portfolioBoards || []).length > 0 && next.assignee) {
        const names = new Set(
            (state?.portfolioTasks || buildPortfolioTasks(state))
                .flatMap((item) => item?.task?.assignees || [])
                .map((name) => normalizeAssignee(name))
                .filter(Boolean)
        );
        if (![...names].some((name) => name.toLowerCase() === next.assignee.toLowerCase())) {
            next.assignee = '';
        }
    }
    return next;
}

export function getFilteredSortedPortfolioRows(state: SelectorState, options: { sourceRows?: PortfolioRow[] } = {}): PortfolioRow[] {
    const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(state?.portfolioFilters || {}) };
    const search = String(filters.search || '').trim().toLowerCase();
    const priorityFilter = filters.priority || '';
    const assigneeFilter = normalizeAssignee(filters.assignee || '');
    const blockedFilter = normalizePortfolioBlockedFilter(filters.blocked || 'all');
    const effortFilter = filters.effort || '';
    const archiveFilter = filters.archive || 'active';
    const sortBy = normalizePortfolioSortKey(state?.portfolioSortKey);
    const sortDir = normalizePortfolioSortDir(state?.portfolioSortDir);
    const timelineView = getSelectedPortfolioTimelineView(state);
    const sourceRows = options.sourceRows
        || ((timelineView?.isPreview && timelineView.projectedBoard)
            ? buildPortfolioRowsFromBoardData(state, timelineView.boardRecord, timelineView.projectedBoard, {
                canMutate: false,
                historical: true
            })
            : (Array.isArray(state?.portfolioTasks) ? state.portfolioTasks : buildPortfolioTasks(state)));

    return sourceRows
        .filter((item) => {
            const task = item.task;
            if (state?.selectedPortfolioBoardId && item.boardId !== state.selectedPortfolioBoardId) return false;
            if (archiveFilter === 'active' && task.archived) return false;
            if (archiveFilter === 'archived' && !task.archived) return false;
            if (priorityFilter && task.priority !== priorityFilter) return false;
            if (assigneeFilter && !taskHasAssignee(task, assigneeFilter)) return false;
            if (blockedFilter === 'blocked' && !task.blocked) return false;
            if (blockedFilter === 'unblocked' && task.blocked) return false;
            if (effortFilter && task.effort !== effortFilter) return false;
            if (search && !String(task.title || '').toLowerCase().includes(search)) return false;
            return true;
        })
        .sort((a, b) => comparePortfolioRows(a, b, sortBy, sortDir));
}

export function buildPortfolioTimelineViewModel(state: SelectorState): PortfolioTimelineViewModel | null {
    const timelineView = getSelectedPortfolioTimelineView(state);
    if (!timelineView?.boardRecord) return null;
    return {
        boardId: timelineView.boardRecord.id,
        boardTitle: timelineView.boardRecord.title || timelineView.boardRecord.fileName || 'Selected Project',
        boardFileName: timelineView.boardRecord.fileName || '',
        hasHandle: Boolean(timelineView.boardRecord.handle),
        timeline: timelineView.timeline,
        selectedIndex: timelineView.selectedIndex,
        selectedEvent: timelineView.selectedEvent,
        isPreview: timelineView.isPreview,
        isExpanded: state?.portfolioTimelineExpandedByBoardId?.[timelineView.boardRecord.id] === true
    };
}

function getTimelineSelectionIndex(state: SelectorState, boardId: string, timeline: TimelineExtension | null): number | null {
    if (!boardId || !timeline?.events?.length) return null;
    const maxIndex = timeline.events.length - 1;
    const selection: Partial<AppState['portfolioTimelineSelection']> = state?.portfolioTimelineSelection || {};
    if (selection.boardId !== boardId || !Number.isInteger(selection.eventIndex)) {
        return maxIndex;
    }
    return Math.max(0, Math.min(maxIndex, selection.eventIndex as number));
}

// True while the board's timeline is scrubbed back to an earlier event, which
// makes the board read-only.
export function isBoardInHistoricalPreview(state: SelectorState, boardId: string | null | undefined): boolean {
    if (!boardId) return false;
    const timeline = getBoardTimelineData(getBoardRecord(state, boardId)?.data);
    if (!timeline || timeline.events.length === 0) return false;
    return (getTimelineSelectionIndex(state, boardId, timeline) as number) < timeline.events.length - 1;
}

// Bulk-selected task ids for a board, ignoring ids whose task no longer exists.
export function getPortfolioBulkTaskIds(state: SelectorState, boardId: string): number[] {
    const board = getBoardRecord(state, boardId);
    if (!board) return [];
    const taskIds = new Set((board.data?.board?.tasks || []).map((task) => Number(task.id)));
    return (state?.portfolioBulkSelectionByBoardId?.[boardId] || [])
        .filter((taskId) => taskIds.has(Number(taskId)));
}

export function getSelectedPortfolioTimelineView(state: SelectorState): PortfolioTimelineSelectionView | null {
    const boardId = state?.selectedPortfolioBoardId || '';
    if (!boardId) return null;

    const boardRecord = getBoardRecord(state, boardId);
    if (!boardRecord) return null;

    const timeline = getBoardTimelineData(boardRecord.data);
    if (!timeline || timeline.events.length === 0) {
        return {
            boardRecord,
            timeline: null,
            selectedIndex: null,
            selectedEvent: null,
            isPreview: false,
            projectedBoard: null
        };
    }

    const selectedIndex = getTimelineSelectionIndex(state, boardId, timeline) as number;
    return {
        boardRecord,
        timeline,
        selectedIndex,
        selectedEvent: timeline.events[selectedIndex] || null,
        isPreview: selectedIndex < timeline.events.length - 1,
        projectedBoard: reconstructBoardStateFromTimeline(boardRecord.data, selectedIndex)
    };
}

export function buildPortfolioRoadmapView(state: SelectorState): PortfolioRoadmapViewModel | null {
    const timelineView = getSelectedPortfolioTimelineView(state);
    const board = timelineView?.boardRecord || getBoardRecord(state, state?.selectedPortfolioBoardId);
    if (!board) return null;

    const boardData = timelineView?.isPreview
        ? (timelineView.projectedBoard || board.data || null)
        : (board.data || timelineView?.projectedBoard || null);
    const roadmap = getRoadmapExtensionOrEmpty(boardData);
    const range = getVisibleRoadmapDateRange(roadmap);

    return {
        boardId: board.id,
        boardTitle: board.title || board.fileName || 'Selected Project',
        boardFileName: board.fileName || '',
        boardData,
        roadmap,
        range,
        axisTicks: getRoadmapAxisTicks(range),
        historical: Boolean(timelineView?.isPreview)
    };
}

function getRoadmapExtensionOrEmpty(boardData: BoardData | null | undefined): RoadmapExtension {
    return getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
}

function getCalendarBoardSources(state: SelectorState): { boardRecord: BoardRecord; boardData: BoardData; historical: boolean }[] {
    const selectedBoardId = state?.selectedPortfolioBoardId || '';
    if (selectedBoardId) {
        const timelineView = getSelectedPortfolioTimelineView(state);
        const boardRecord = timelineView?.boardRecord || getBoardRecord(state, selectedBoardId);
        const boardData = timelineView?.isPreview
            ? (timelineView.projectedBoard || boardRecord?.data || null)
            : (boardRecord?.data || timelineView?.projectedBoard || null);
        return boardRecord && boardData
            ? [{ boardRecord, boardData, historical: Boolean(timelineView?.isPreview) }]
            : [];
    }

    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .filter((board) => board?.data)
        .map((boardRecord) => ({ boardRecord, boardData: boardRecord.data, historical: false }));
}

function getBoardColor(boardRecord: BoardRecord | null | undefined): ProjectColor {
    return boardRecord?.projectColor || createPortfolioProjectColor(boardRecord?.colorSeed || 0);
}

function createPortfolioCalendarItem(input: CalendarItemInput): PortfolioCalendarItem | null {
    const bounds = getRoadmapItemDateBounds(input);
    if (!bounds) return null;
    const boardTitle = input.boardTitle || input.boardFileName || 'Project';
    return {
        id: input.id,
        kind: input.kind,
        boardId: input.boardId,
        boardTitle,
        title: input.title || '',
        subtitle: input.subtitle || '',
        taskId: input.taskId || null,
        roadmapKind: input.roadmapKind || '',
        projectColor: input.projectColor || createPortfolioProjectColor(0),
        historical: Boolean(input.historical),
        isRange: bounds.start.getTime() !== bounds.end.getTime(),
        bounds
    };
}

function buildPortfolioCalendarItems(state: SelectorState): PortfolioCalendarItem[] {
    const items: PortfolioCalendarItem[] = [];
    const rows = Array.isArray(state?.portfolioVisibleRows) ? state.portfolioVisibleRows : [];

    rows.forEach((row) => {
        const dueDate = normalizeDueDate(row?.task?.dueDate);
        if (!dueDate) return;
        const boardRecord = getBoardRecord(state, row.boardId);
        const item = createPortfolioCalendarItem({
            id: `task:${row.boardId}:${row.taskId}`,
            kind: 'task',
            boardId: row.boardId,
            boardTitle: row.boardTitle,
            boardFileName: row.boardFileName,
            projectColor: getBoardColor(boardRecord),
            title: row.task?.title || `Task ${row.taskId}`,
            subtitle: dueDate,
            taskId: row.taskId,
            dueDate,
            historical: Boolean(row.historical)
        });
        if (item) items.push(item);
    });

    getCalendarBoardSources(state).forEach(({ boardRecord, boardData, historical }) => {
        const roadmap = getRoadmapExtensionOrEmpty(boardData);
        (['milestones', 'phases', 'sprints'] as const).forEach((kind) => {
            const config = getRoadmapEntityConfig(kind);
            const records = Array.isArray(roadmap?.[kind]) ? roadmap[kind] : [];
            records.forEach((entry) => {
                const item = createPortfolioCalendarItem({
                    id: `${kind}:${boardRecord.id}:${entry.id}`,
                    kind: config?.singular || kind,
                    roadmapKind: kind,
                    boardId: boardRecord.id,
                    boardTitle: boardRecord.title,
                    boardFileName: boardRecord.fileName,
                    projectColor: getBoardColor(boardRecord),
                    title: entry.title || '',
                    subtitle: formatRoadmapDateRange(entry),
                    dueDate: entry.dueDate,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    historical
                });
                if (item) items.push(item);
            });
        });
    });

    return items.sort(comparePortfolioCalendarItems);
}

function getCalendarPeriod(items: PortfolioCalendarItem[], state: SelectorState): Omit<PortfolioCalendarViewModel, 'items' | 'aggregate'> {
    const years = (Array.isArray(items) ? items : [])
        .flatMap((item) => [item?.bounds?.start?.getUTCFullYear(), item?.bounds?.end?.getUTCFullYear()])
        .filter((year): year is number => Number.isFinite(year));
    const fallbackYear = years.length > 0 ? Math.min(...years) : new Date().getUTCFullYear();
    const calendarYear = state?.portfolioCalendarYear;
    const year = typeof calendarYear === 'number' && Number.isInteger(calendarYear)
        ? calendarYear
        : fallbackYear;

    const defaultDate = (Array.isArray(items) ? items : [])
        .find((item) => item?.bounds?.start)?.bounds?.start || new Date();
    const calendarMonth = state?.portfolioCalendarMonth;
    const month = typeof calendarMonth === 'number'
        && Number.isInteger(calendarMonth)
        && calendarMonth >= 0
        && calendarMonth <= 11
        ? calendarMonth
        : defaultDate.getUTCMonth();

    const calendarView = state?.portfolioCalendarView;
    const displayMode = state?.portfolioCalendarDisplayMode;
    return {
        year,
        month,
        view: calendarView === 'year' || calendarView === 'month'
            ? calendarView
            : 'year',
        displayMode: displayMode === 'calendar' || displayMode === 'heatmap'
            ? displayMode
            : 'calendar'
    };
}

export function buildPortfolioCalendarViewModel(state: SelectorState): PortfolioCalendarViewModel {
    const items = buildPortfolioCalendarItems(state);
    const period = getCalendarPeriod(items, state);
    return {
        items,
        aggregate: !state?.selectedPortfolioBoardId,
        ...period
    };
}
