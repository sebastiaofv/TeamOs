import {
    comparePortfolioRows,
    createPortfolioProjectColor,
    normalizePortfolioSortDir,
    normalizePortfolioSortKey
} from '../domain/board.js';
import { EFFORT_BUCKETS } from '../domain/constants.js';
import {
    comparePortfolioCalendarItems,
    normalizeDueDate
} from '../domain/calendar.js';
import {
    createEmptyRoadmapExtension,
    formatRoadmapDateRange,
    getRoadmapAxisTicks,
    getRoadmapEntityConfig,
    getRoadmapItemDateBounds,
    getRoadmapExtension,
    getVisibleRoadmapDateRange
} from '../domain/roadmap.js';
import {
    getBoardTimelineData,
    reconstructBoardStateFromTimeline
} from '../domain/timeline.js';
import {
    normalizeAssignee,
    normalizePortfolioBlockedFilter,
    normalizeTask,
    taskHasAssignee
} from '../domain/task.js';
import { createBoardStateSnapshot } from '../domain/serialize.js';

export const DEFAULT_PORTFOLIO_FILTERS = Object.freeze({
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    priority: '',
    effort: ''
});

function getBoardRecord(state, boardId) {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .find((board) => board?.id === boardId) || null;
}

function getBoardStatusMap(boardData) {
    return Object.fromEntries(
        (boardData?.board?.columns || []).map((column) => [column.status, column.title])
    );
}

export function buildPortfolioTasks(state) {
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

export function buildPortfolioRowsFromBoardData(state, boardRecord, boardData, options = {}) {
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

function normalizePortfolioFilterValue(name, value) {
    if (name === 'search') return String(value || '');
    if (name === 'archive') return ['active', 'all', 'archived'].includes(value) ? value : 'active';
    if (name === 'blocked') return normalizePortfolioBlockedFilter(value || 'all');
    if (name === 'assignee') return normalizeAssignee(value || '');
    if (name === 'priority') return ['', 'high', 'medium', 'low'].includes(value) ? value : '';
    if (name === 'effort') return ['', ...EFFORT_BUCKETS].includes(value) ? value : '';
    return DEFAULT_PORTFOLIO_FILTERS[name];
}

export function normalizePortfolioFilters(state) {
    const current = { ...DEFAULT_PORTFOLIO_FILTERS, ...(state?.portfolioFilters || {}) };
    const next = Object.fromEntries(
        Object.keys(DEFAULT_PORTFOLIO_FILTERS).map((key) => [key, normalizePortfolioFilterValue(key, current[key])])
    );
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

export function getFilteredSortedPortfolioRows(state, options = {}) {
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

export function buildPortfolioTimelineViewModel(state) {
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

function getTimelineSelectionIndex(state, boardId, timeline) {
    if (!boardId || !timeline?.events?.length) return null;
    const maxIndex = timeline.events.length - 1;
    const selection = state?.portfolioTimelineSelection || {};
    if (selection.boardId !== boardId || !Number.isInteger(selection.eventIndex)) {
        return maxIndex;
    }
    return Math.max(0, Math.min(maxIndex, selection.eventIndex));
}

export function getSelectedPortfolioTimelineView(state) {
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

    const selectedIndex = getTimelineSelectionIndex(state, boardId, timeline);
    return {
        boardRecord,
        timeline,
        selectedIndex,
        selectedEvent: timeline.events[selectedIndex] || null,
        isPreview: selectedIndex < timeline.events.length - 1,
        projectedBoard: reconstructBoardStateFromTimeline(boardRecord.data, selectedIndex)
    };
}

export function buildPortfolioRoadmapView(state) {
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

function getRoadmapExtensionOrEmpty(boardData) {
    return getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
}

function getCalendarBoardSources(state) {
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

function getBoardColor(boardRecord) {
    return boardRecord?.projectColor || createPortfolioProjectColor(boardRecord?.colorSeed || 0);
}

function createPortfolioCalendarItem(input) {
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

function buildPortfolioCalendarItems(state) {
    const items = [];
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
        ['milestones', 'phases', 'sprints'].forEach((kind) => {
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

function getCalendarPeriod(items, state) {
    const years = (Array.isArray(items) ? items : [])
        .flatMap((item) => [item?.bounds?.start?.getUTCFullYear(), item?.bounds?.end?.getUTCFullYear()])
        .filter(Number.isFinite);
    const fallbackYear = years.length > 0 ? Math.min(...years) : new Date().getUTCFullYear();
    const year = Number.isInteger(state?.portfolioCalendarYear)
        ? state.portfolioCalendarYear
        : fallbackYear;

    const defaultDate = (Array.isArray(items) ? items : [])
        .find((item) => item?.bounds?.start)?.bounds?.start || new Date();
    const month = Number.isInteger(state?.portfolioCalendarMonth)
        && state.portfolioCalendarMonth >= 0
        && state.portfolioCalendarMonth <= 11
        ? state.portfolioCalendarMonth
        : defaultDate.getUTCMonth();

    return {
        year,
        month,
        view: ['year', 'month'].includes(state?.portfolioCalendarView)
            ? state.portfolioCalendarView
            : 'year',
        displayMode: ['calendar', 'heatmap'].includes(state?.portfolioCalendarDisplayMode)
            ? state.portfolioCalendarDisplayMode
            : 'calendar'
    };
}

export function buildPortfolioCalendarViewModel(state) {
    const items = buildPortfolioCalendarItems(state);
    const period = getCalendarPeriod(items, state);
    return {
        items,
        aggregate: !state?.selectedPortfolioBoardId,
        ...period
    };
}
