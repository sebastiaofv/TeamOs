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
        portfolioDragOverStatus: '',
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
        portfolioTimelineView: null,
        portfolioTimelineSelection: { boardId: '', eventIndex: null },
        portfolioTimelineExpandedByBoardId: {}
    };
}

export function createUiSlice() {
    return {
        undoAction: null,
        undoToast: null,
        activeTheme: 'light',
        activeDialog: null,
        dialogProps: null,
        // The open in-app alert/confirm/prompt (actions/appMessages.js). Kept
        // apart from activeDialog so it can stack above an open dialog.
        appMessage: null
    };
}

export function createFilesSlice() {
    return {
        projectSaveStateById: new Map()
    };
}
