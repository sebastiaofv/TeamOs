import type {
    BoardRecord,
    PortfolioCalendarItem,
    PortfolioCalendarViewModel
} from '@/features/portfolio/types';
import type { ProjectColor } from '@/domain/types';
import { getBoardRecord, type SelectorState } from './portfolioRowViews';
import {
    comparePortfolioCalendarItems,
    normalizeDueDate
} from '@/domain/calendar';
import {
    createPortfolioProjectColor
} from '@/domain/board';
import { getRoadmapItemDateBounds } from '@/domain/roadmap';
import { workitemType } from '@/domain/workitems';

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
        taskId: input.taskId === null || input.taskId === undefined ? null : input.taskId,
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
        if (workitemType(row.task) !== 'task') return;
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
