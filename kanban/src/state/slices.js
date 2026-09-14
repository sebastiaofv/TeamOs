// The state is split by ownership so view behavior can stay separate from the
// persisted board model.

export function createPortfolioSlice() {
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
        portfolioDragContext: null,
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

export function createBoardSlice() {
    return {
        pendingNewTaskStatus: null,
        portfolioTimelineView: null,
        portfolioTimelineSelection: { boardId: '', eventIndex: null },
        portfolioTimelineDragState: { active: false, boardId: '' },
        portfolioTimelineExpandedByBoardId: {},
        portfolioTimelineListScrollTopByBoardId: {}
    };
}

export function createUiSlice() {
    return {
        undoAction: null,
        undoTimer: null,
        undoToast: null,
        activeTheme: 'light',
        ShortcutRegistry: [],
        activeDialog: null,
        dialogProps: null
    };
}

export function createFilesSlice() {
    return {
        projectSaveStateById: new Map(),
        projectFileStateById: new Map(),
        projectWatchTimerId: null,
        projectWatchRunning: false,
        projectWatchListenersBound: false
    };
}
