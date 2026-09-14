// The state is split by ownership so view behavior can stay separate from the
// persisted board model.

import type {
    AppMessage,
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
    PortfolioViewMode,
    ProjectSaveState,
    RoadmapEntityMode,
    RoadmapKind,
    SortDir,
    TaskStatus,
    Theme
} from '../types';

export type EditContext = { boardId: string; taskId: number };
export type CreateContext = { boardId: string; status: TaskStatus };
export type DetailContext = { boardId: string; taskId: number; readOnly: boolean };
export type RoadmapEntityContext = { boardId: string; kind: RoadmapKind; itemId: string; mode: RoadmapEntityMode };
export type TimelineSelection = { boardId: string; eventIndex: number | null };

export type PortfolioSlice = {
    portfolioBoards: BoardRecord[];
    nextPortfolioProjectColorSeed: number;
    portfolioTasks: PortfolioRow[];
    portfolioVisibleRows: PortfolioRow[];
    selectedPortfolioBoardId: string;
    selectedPortfolioViewMode: PortfolioViewMode;
    portfolioFilters: PortfolioFilters;
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
        portfolioFilters: {
            search: '',
            archive: 'active',
            blocked: 'all',
            assignee: '',
            priority: '',
            effort: ''
        },
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
        portfolioCalendarMonth: null
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
