// The state is split by ownership so view behavior can stay separate from the
// persisted board model.

import type {
    BoardRecord,
    CalendarDisplayMode,
    CalendarView,
    CardRef,
    DialogName,
    DialogPropsByName,
    PortfolioFilters,
    PortfolioRow,
    PortfolioSortKey,
    PortfolioTimelineViewModel,
    PlannerMode,
    PortfolioViewMode,
    ProjectSaveState,
    RoadmapEntityMode,
    SortDir
} from '@/features/portfolio/types';
import type { TaskStatus, RoadmapKind } from '@/domain/types';
import type { AppMessage } from '@/app/types';
import type { Language, Theme } from '@/shared/types/ui';
import type { TableSort } from '@/features/portfolio/table/tableModel';
import { DEFAULT_PORTFOLIO_FILTERS } from '@/domain/portfolioFilters';

export type EditContext = { boardId: string; taskId: number };
export type CreateContext = { boardId: string; status: TaskStatus };
export type DetailContext = { boardId: string; taskId: number; readOnly: boolean; historyEventIndex?: number };
export type RoadmapEntityContext = { boardId: string; kind: RoadmapKind; itemId: string; mode: RoadmapEntityMode; unplannedTaskIds?: number[] };
export type TimelineSelection = { boardId: string; eventIndex: number | null };

export type PortfolioSlice = {
    portfolioBoards: BoardRecord[];
    nextPortfolioProjectColorSeed: number;
    portfolioTasks: PortfolioRow[];
    portfolioVisibleRows: PortfolioRow[];
    selectedPortfolioBoardId: string;
    selectedPortfolioViewMode: PortfolioViewMode;
    portfolioFilters: PortfolioFilters;
    portfolioTableSortByBoardId: Record<string, TableSort>;
    portfolioSortKey: PortfolioSortKey;
    portfolioSortDir: SortDir;
    portfolioEditContext: EditContext | null;
    portfolioCreateContext: CreateContext | null;
    portfolioDetailContext: DetailContext | null;
    roadmapEntityContext: RoadmapEntityContext | null;
    portfolioBulkSelectionByBoardId: Record<string, number[]>;
    selectedPortfolioCardRef: CardRef | null;
    hoveredPortfolioCardRef: CardRef | null;
    suppressPortfolioCardClickUntil: number;
    portfolioRoadmapExpandedRowsByBoardId: Record<string, Record<string, boolean>>;
    portfolioCalendarView: CalendarView;
    portfolioCalendarDisplayMode: CalendarDisplayMode;
    portfolioCalendarYear: number | null;
    portfolioCalendarMonth: number | null;
    // '' shows today; the planner date is view state and never saved to files.
    portfolioPlannerDate: string;
    portfolioPlannerMode: PlannerMode;
};

export type BoardSlice = {
    portfolioTimelineView: PortfolioTimelineViewModel | null;
    portfolioTimelineSelection: TimelineSelection;
    portfolioTimelineExpandedByBoardId: Record<string, boolean>;
};

export type UiSlice = {
    undoAction: (() => unknown) | null;
    undoToast: { message: string } | null;
    activeTheme: Theme;
    activeLanguage: Language;
    activeDialog: DialogName | null;
    dialogProps: DialogPropsByName[DialogName] | null;
    appMessage: AppMessage | null;
};

export type FilesSlice = {
    projectSaveStateById: Map<string, ProjectSaveState>;
};

export type AppState = PortfolioSlice & BoardSlice & UiSlice & FilesSlice;

export function createPortfolioSlice(): PortfolioSlice {
    return {
        portfolioBoards: [],
        nextPortfolioProjectColorSeed: 0,
        portfolioTasks: [],
        portfolioVisibleRows: [],
        selectedPortfolioBoardId: '',
        selectedPortfolioViewMode: 'board',
        portfolioTableSortByBoardId: {},
        portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, statuses: [] },
        portfolioSortKey: 'priority',
        portfolioSortDir: 'asc',
        portfolioEditContext: null,
        portfolioCreateContext: null,
        portfolioDetailContext: null,
        roadmapEntityContext: null,
        portfolioBulkSelectionByBoardId: {},
        selectedPortfolioCardRef: null,
        hoveredPortfolioCardRef: null,
        suppressPortfolioCardClickUntil: 0,
        portfolioRoadmapExpandedRowsByBoardId: {},
        portfolioCalendarView: 'year',
        portfolioCalendarDisplayMode: 'calendar',
        portfolioCalendarYear: null,
        portfolioCalendarMonth: null,
        portfolioPlannerDate: '',
        portfolioPlannerMode: 'day'
    };
}

export function createBoardSlice(): BoardSlice {
    return {
        portfolioTimelineView: null,
        portfolioTimelineSelection: { boardId: '', eventIndex: null },
        portfolioTimelineExpandedByBoardId: {}
    };
}

export function createUiSlice(): UiSlice {
    return {
        undoAction: null,
        undoToast: null,
        activeTheme: 'light',
        activeLanguage: 'en',
        activeDialog: null,
        dialogProps: null,
        // The open in-app alert/confirm/prompt (actions/appMessages.ts). Kept
        // apart from activeDialog so it can stack above an open dialog.
        appMessage: null
    };
}

export function createFilesSlice(): FilesSlice {
    return {
        projectSaveStateById: new Map()
    };
}
