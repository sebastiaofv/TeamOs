import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createAppStore as createStore } from '../../src/features/portfolio/state/store';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createPortfolioControlActions } from '../../src/features/portfolio/commands/portfolioControls';

function createBoard(id: string, title: string, options: { sprints?: any[]; handle?: any; sourceKey?: string } = {}) {
    const data = createEmptyProjectData(title);
    data.board.tasks.push(fromPartial({
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
    }));
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
        ...(options.sourceKey ? { sourceKey: options.sourceKey } : {}),
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
    const store = createStore(fromAny(state));

    const updateUrlState = vi.fn();
    const primeProjectFiles = vi.fn();
    const clearTimeline = vi.fn();
    const closeContexts = vi.fn();
    const forgetFileState = vi.fn();
    const actions = createPortfolioControlActions({
        store,

        updateUrlState,
        primeProjectFiles,
        clearPortfolioTimelineSelection: clearTimeline,
        closePortfolioContextsForProject: closeContexts,
        forgetFileState,
        ...overrides
    });
    return {
        actions,
        store,

        updateUrlState,
        primeProjectFiles,
        clearTimeline,
        closeContexts,
        forgetFileState
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

    it('owns board ordering, selection, and removal cleanup', async () => {
        const first = createBoard('p1', 'Zeta');
        const second = createBoard('p2', 'Alpha');
        const { actions, store, primeProjectFiles, clearTimeline, closeContexts, forgetFileState } = createActions();

        await actions.appendPortfolioRecords([first, second], { selectBoardId: 'p1' });

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['p2', 'p1']);
        expect(store.getState().selectedPortfolioBoardId).toBe('p1');
        expect(store.getState().portfolioTasks).toHaveLength(2);
        expect(primeProjectFiles).toHaveBeenCalledWith([first, second]);

        store.setState({
            portfolioBulkSelectionByBoardId: { p1: [1], p2: [1] },
            selectedPortfolioCardRef: { boardId: 'p1', taskId: 1 },
            hoveredPortfolioCardRef: { boardId: 'p1', taskId: 1 },
            portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 },
            projectSaveStateById: fromAny(new Map([['p1', {}]]))
        });

        actions.removePortfolioBoard('p1');

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['p2']);
        expect(store.getState().selectedPortfolioBoardId).toBe('');
        expect(store.getState().portfolioBulkSelectionByBoardId).toEqual({ p2: [1] });
        expect(store.getState().selectedPortfolioCardRef).toBe(null);
        expect(store.getState().hoveredPortfolioCardRef).toBe(null);
        expect(store.getState().projectSaveStateById.has('p1')).toBe(false);
        expect(forgetFileState).toHaveBeenCalledWith('p1');
        expect(clearTimeline).toHaveBeenCalledWith();
        expect(closeContexts).toHaveBeenCalledWith('p1');
    });

    it('does not append a file that is already open in the portfolio', async () => {
        const sharedHandle = {
            name: 'shared.board.json',
            isSameEntry: vi.fn(async (other: any) => other?.name === 'shared.board.json')
        };
        const existing = createBoard('existing', 'Existing', { handle: sharedHandle });
        const duplicate = createBoard('duplicate', 'Duplicate', {
            handle: { name: 'shared.board.json', isSameEntry: sharedHandle.isSameEntry }
        });
        const other = createBoard('other', 'Other', {
            handle: { name: 'other.board.json', isSameEntry: vi.fn(async () => false) }
        });
        const { actions, store, primeProjectFiles } = createActions();
        store.setState({ portfolioBoards: [existing] });

        await actions.appendPortfolioRecords([duplicate, other]);

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['existing', 'other']);
        expect(primeProjectFiles).toHaveBeenCalledWith([other]);
    });

    it('does not append the same read-only dropped file twice', async () => {
        const existing = createBoard('existing', 'Existing', { handle: null, sourceKey: '["shared.board.json",42,123]' });
        const duplicate = createBoard('duplicate', 'Duplicate', { handle: null, sourceKey: '["shared.board.json",42,123]' });
        const other = createBoard('other', 'Other', { handle: null, sourceKey: '["other.board.json",42,123]' });
        const { actions, store, primeProjectFiles } = createActions();
        store.setState({ portfolioBoards: [existing] });

        await actions.appendPortfolioRecords([duplicate, other]);

        expect(store.getState().portfolioBoards.map((board) => board.id)).toEqual(['existing', 'other']);
        expect(primeProjectFiles).toHaveBeenCalledWith([other]);
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
