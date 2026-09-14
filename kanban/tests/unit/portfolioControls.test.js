import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board.js';
import { createPortfolioControlActions } from '../../src/actions/portfolioControls.js';

function createStore(initial) {
    let state = initial;
    return {
        getState: () => state,
        setState: (partial) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        }
    };
}

function createBoard(id, title, options = {}) {
    const data = createEmptyProjectData(title);
    data.board.tasks.push({
        id: 1,
        title: `${title} task`,
        description: '',
        status: 'backlog',
        archived: false,
        checklist: [],
        assignees: [],
        tags: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
    });
    if (options.sprints) {
        data.extensions.roadmap = {
            version: 1,
            phases: [],
            milestones: [],
            sprints: options.sprints
        };
    }
    return {
        id,
        colorSeed: 0,
        handle: options.handle === undefined ? {} : options.handle,
        fileName: `${id}.board.json`,
        title,
        data
    };
}

function createActions(overrides = {}) {
    const state = {
        portfolioBoards: [],
        portfolioBulkSelectionByBoardId: {},
        portfolioTimelineSelection: { boardId: '', eventIndex: null },
        selectedPortfolioBoardId: '',
        selectedPortfolioViewMode: 'board',
        selectedPortfolioCardRef: null,
        hoveredPortfolioCardRef: null,
        projectSaveStateById: new Map(),
        projectFileStateById: new Map(),
        portfolioFilters: {
            search: '',
            archive: 'active',
            blocked: 'all',
            assignee: '',
            priority: '',
            effort: ''
        },
        portfolioSortKey: 'priority',
        portfolioSortDir: 'asc'
    };
    const store = createStore(state);
    const notify = vi.fn();
    const updateUrlState = vi.fn();
    const primeProjectFiles = vi.fn();
    const clearTimeline = vi.fn();
    const closeContexts = vi.fn();
    const actions = createPortfolioControlActions({
        store,
        notify,
        updateUrlState,
        primeProjectFiles,
        clearPortfolioTimelineSelection: clearTimeline,
        closePortfolioContextsForProject: closeContexts,
        ...overrides
    });
    return {
        actions,
        store,
        notify,
        updateUrlState,
        primeProjectFiles,
        clearTimeline,
        closeContexts
    };
}

describe('portfolio control actions', () => {
    it('normalizes filters, sort, view mode, and reset state through the store', () => {
        const { actions, store } = createActions();
        store.setState({ portfolioBoards: [createBoard('p1', 'Project')] });

        actions.setPortfolioFilter('blocked', 'unexpected');
        actions.setPortfolioFilter('priority', 'high');
        actions.setPortfolioSort('name');
        actions.setPortfolioViewMode('calendar');

        expect(store.getState().portfolioFilters.blocked).toBe('all');
        expect(store.getState().portfolioFilters.priority).toBe('high');
        expect(store.getState().portfolioSortKey).toBe('task');
        expect(store.getState().selectedPortfolioViewMode).toBe('calendar');

        actions.resetPortfolioFilters();

        expect(store.getState().portfolioFilters).toEqual({
            search: '',
            archive: 'active',
            blocked: 'all',
            assignee: '',
            priority: '',
            effort: ''
        });
        expect(store.getState().portfolioSortKey).toBe('priority');
        expect(store.getState().portfolioSortDir).toBe('asc');
        expect(store.getState().portfolioVisibleRows).toHaveLength(1);
    });

    it('owns board ordering, selection, and removal cleanup', () => {
        const first = createBoard('p1', 'Zeta');
        const second = createBoard('p2', 'Alpha');
        const { actions, store, primeProjectFiles, clearTimeline, closeContexts } = createActions();

        actions.appendPortfolioRecords([first, second], { selectBoardId: 'p1' });

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['p2', 'p1']);
        expect(store.getState().selectedPortfolioBoardId).toBe('p1');
        expect(store.getState().portfolioTasks).toHaveLength(2);
        expect(primeProjectFiles).toHaveBeenCalledWith([first, second]);

        store.setState({
            portfolioBulkSelectionByBoardId: { p1: [1], p2: [1] },
            selectedPortfolioCardRef: { boardId: 'p1', taskId: 1 },
            hoveredPortfolioCardRef: { boardId: 'p1', taskId: 1 },
            portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 },
            projectSaveStateById: new Map([['p1', {}]]),
            projectFileStateById: new Map([['p1', {}]])
        });

        actions.removePortfolioBoard('p1');

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['p2']);
        expect(store.getState().selectedPortfolioBoardId).toBe('');
        expect(store.getState().portfolioBulkSelectionByBoardId).toEqual({ p2: [1] });
        expect(store.getState().selectedPortfolioCardRef).toBe(null);
        expect(store.getState().hoveredPortfolioCardRef).toBe(null);
        expect(store.getState().projectSaveStateById.has('p1')).toBe(false);
        expect(store.getState().projectFileStateById.has('p1')).toBe(false);
        expect(clearTimeline).toHaveBeenCalledWith();
        expect(closeContexts).toHaveBeenCalledWith('p1');
    });

    it('only opens sprint actions for a valid selected bulk task set', () => {
        const board = createBoard('p1', 'Project', {
            sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2026-01-01', endDate: '2026-01-07' }]
        });
        const createSprintModal = vi.fn();
        const assignSprintModal = vi.fn();
        const { actions, store } = createActions({
            openCreateSprintModal: createSprintModal,
            openAssignSprintModal: assignSprintModal
        });
        store.setState({
            portfolioBoards: [board],
            selectedPortfolioBoardId: 'p1',
            portfolioBulkSelectionByBoardId: { p1: [1] }
        });

        actions.openCreateSprintFromSelection('p1');
        actions.openAssignSprintFromSelection('p1');

        expect(createSprintModal).toHaveBeenCalledWith('p1');
        expect(assignSprintModal).toHaveBeenCalledWith('p1');
    });
});
