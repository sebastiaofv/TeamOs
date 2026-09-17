import type {
    BoardRecord,
    PortfolioCalendarItem,
    PortfolioCalendarViewModel
} from '@/features/portfolio/types';
import type { BoardData, ProjectColor } from '@/domain/types';
import { getBoardRecord, type SelectorState } from './portfolioRowViews';
import { getSelectedPortfolioTimelineView } from './portfolioTimelineViews';
import {
    comparePortfolioCalendarItems,
    normalizeDueDate
} from '@/domain/calendar';
import {
    createPortfolioProjectColor
} from '@/domain/board';
import {
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapItemDateBounds,
    getRoadmapExtension
} from '@/domain/roadmap';

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
        const roadmap = getRoadmapExtension(boardData);
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
                    subtitle: formatRoadmapDateRange(entry, state?.activeLanguage || 'en'),
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
