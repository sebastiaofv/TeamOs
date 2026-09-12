// Application state, exported as `appState`.
//
// Named `appState` rather than `state` on purpose: the legacy UI file already has
// 10 local variables called `state` (project save/file records). A bare `state`
// import is shadowed by those, which produced a temporal-dead-zone
// ReferenceError the first time this extraction was attempted.
//
// These were module-level `let` bindings in the original single-file app. ES
// module imports are read-only live bindings, so a consumer cannot reassign an
// imported `let` -- and 24 of these are reassigned. Holding them as properties
// of one exported object keeps every read and write working exactly as before,
// which is what let the full Playwright suite stay green through the move.
//
// The shape is deliberately Zustand-compatible: a plain object you read from and
// assign to. Adopting a store library later is a re-wrap, not a redesign.
//
// Nothing here is pure logic. Pure logic lives in src/domain/.

export const appState = {

    // --- Portfolio: loaded boards and derived rows ---
    portfolioBoards: [],
    nextPortfolioProjectColorSeed: 0,
    portfolioTasks: [],
    selectedPortfolioBoardId: '',
    selectedPortfolioViewMode: 'board',

    // --- Portfolio: sorting and filters ---
    portfolioSortKey: 'priority',
    portfolioSortDir: 'asc',

    // --- Portfolio: editing contexts ---
    portfolioEditContext: null,
    portfolioCreateContext: null,
    portfolioDetailContext: null,
    roadmapEntityContext: null,

    // --- Portfolio: selection and drag ---
    portfolioBulkSelectionByBoardId: {},
    portfolioDragContext: null,
    selectedPortfolioCardRef: null,
    hoveredPortfolioCardRef: null,
    suppressPortfolioCardClickUntil: 0,

    // --- Task modal ---
    pendingNewTaskStatus: null,
    taskModalAttachmentDraft: [],
    taskModalAttachmentMessages: [],
    taskChecklistDragState: { activeIndex: -1, targetIndex: -1, targetPlacement: '' },

    // --- Timeline view ---
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    portfolioTimelineDragState: { active: false, boardId: '' },
    portfolioTimelineExpandedByBoardId: {},
    portfolioTimelineListScrollTopByBoardId: {},

    // --- Roadmap view ---
    portfolioRoadmapExpandedRowsByBoardId: {},

    // --- Calendar view ---
    portfolioCalendarView: 'year',
    portfolioCalendarDisplayMode: 'calendar',
    portfolioCalendarYear: null,
    portfolioCalendarMonth: null,

    // --- Shell: theme, shortcuts, undo ---
    undoAction: null,
    undoTimer: null,
    activeTheme: 'light',
    ShortcutRegistry: [],

    // --- Persistence: save and file-watch state ---
    projectSaveStateById: new Map(),
    projectFileStateById: new Map(),
    projectWatchTimerId: null,
    projectWatchRunning: false,
    projectWatchListenersBound: false,
};

// Selectors -- derived reads over the state above.

export function getPortfolioBoardRecord(boardId) {
    return appState.portfolioBoards.find(board => board.id === boardId) || null;
}
