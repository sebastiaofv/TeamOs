import type { BoardRecord, PortfolioFilters } from '../types';
import type { AppState } from './slices';
import {
    createPortfolioProjectColor,
    normalizePortfolioViewMode,
    portfolioProjectColorKey
} from '../domain/board';
import {
    buildPortfolioTasks,
    buildPortfolioTimelineViewModel,
    getFilteredSortedPortfolioRows,
    normalizePortfolioFilters
} from '../selectors/portfolioViews';

type DerivedState = Pick<AppState, 'portfolioTasks' | 'portfolioFilters' | 'portfolioVisibleRows' | 'portfolioTimelineView'>;

function syncPortfolioProjectColors(state: AppState): BoardRecord[] {
    const original = Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [];
    const boards = original.map((board) => ({ ...board }));
    const usedSeeds = new Set<number>();
    let nextSeed = 0;

    boards.forEach((board) => {
        if (!board) return;
        const seed = typeof board.colorSeed === 'number' && Number.isInteger(board.colorSeed) && board.colorSeed >= 0
            ? board.colorSeed
            : null;
        if (seed === null || usedSeeds.has(seed)) {
            board.colorSeed = null;
            return;
        }
        usedSeeds.add(seed);
        nextSeed = Math.max(nextSeed, seed + 1);
    });

    boards.forEach((board) => {
        if (!board || Number.isInteger(board.colorSeed)) return;
        while (usedSeeds.has(nextSeed)) nextSeed += 1;
        board.colorSeed = nextSeed;
        usedSeeds.add(nextSeed);
        nextSeed += 1;
    });

    const usedColorKeys = new Set<string>();
    boards
        .filter(Boolean)
        .slice()
        .sort((a, b) => (a.colorSeed as number) - (b.colorSeed as number))
        .forEach((board) => {
            let offset = 0;
            let color = createPortfolioProjectColor(board.colorSeed, offset);
            let key = portfolioProjectColorKey(color);
            while (usedColorKeys.has(key)) {
                offset += 1;
                color = createPortfolioProjectColor(board.colorSeed, offset);
                key = portfolioProjectColorKey(color);
            }
            board.projectColor = color;
            usedColorKeys.add(key);
        });

    return boards.map((board, index) => (
        board.colorSeed === original[index].colorSeed
        && portfolioProjectColorKey(board.projectColor) === portfolioProjectColorKey(original[index].projectColor || {})
            ? original[index] : board
    ));
}

function normalizeSelection(state: AppState) {
    const boards = Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [];
    const selectedBoardId = boards.some((board) => board?.id === state?.selectedPortfolioBoardId)
        ? state.selectedPortfolioBoardId
        : '';
    let viewMode = normalizePortfolioViewMode(state?.selectedPortfolioViewMode);
    if (boards.length === 0) viewMode = 'board';
    if (viewMode === 'roadmap' && !selectedBoardId) viewMode = 'board';
    if (viewMode === 'calendar' && boards.length === 0) viewMode = 'board';
    return { selectedBoardId, viewMode };
}

// `previous` is empty on the first build, where every input counts as changed,
// so its cached projections are only read once they exist.
export function buildPortfolioDerivedState(state: AppState, previous: Partial<AppState> = {}): DerivedState {
    const changed = (...keys: (keyof AppState)[]) => keys.some((key) => state[key] !== previous[key]);
    const portfolioTasks = changed('portfolioBoards') ? buildPortfolioTasks(state) : previous.portfolioTasks!;
    const filters = changed('portfolioBoards', 'portfolioFilters')
        ? normalizePortfolioFilters({ ...state, portfolioTasks }) : previous.portfolioFilters!;
    const portfolioFilters = previous.portfolioFilters
        && (Object.keys(filters) as (keyof PortfolioFilters)[]).every((key) => filters[key] === previous.portfolioFilters![key])
        ? previous.portfolioFilters : filters;
    const normalized = { ...state, portfolioTasks, portfolioFilters };
    return {
        portfolioTasks,
        portfolioFilters,
        portfolioVisibleRows: changed('portfolioBoards', 'selectedPortfolioBoardId', 'portfolioFilters',
            'portfolioSortKey', 'portfolioSortDir', 'portfolioTimelineSelection')
            ? getFilteredSortedPortfolioRows(normalized) : previous.portfolioVisibleRows!,
        portfolioTimelineView: changed('portfolioBoards', 'selectedPortfolioBoardId',
            'portfolioTimelineSelection', 'portfolioTimelineExpandedByBoardId')
            ? buildPortfolioTimelineViewModel(normalized) : previous.portfolioTimelineView!
    };
}

// Derived fields are published atomically with their inputs. Unrelated UI or
// save-status changes retain the existing projections and board identities.
export function derivePortfolioState(state: AppState, previous: Partial<AppState> = {}): AppState {
    const boardsChanged = state.portfolioBoards !== previous.portfolioBoards;
    const portfolioBoards = boardsChanged ? syncPortfolioProjectColors(state) : state.portfolioBoards;
    const next: AppState = { ...state, portfolioBoards };
    const { selectedBoardId, viewMode } = normalizeSelection(next);
    next.selectedPortfolioBoardId = selectedBoardId;
    next.selectedPortfolioViewMode = viewMode;
    const inputs: (keyof AppState)[] = [
        'portfolioBoards', 'selectedPortfolioBoardId', 'portfolioFilters',
        'portfolioSortKey', 'portfolioSortDir', 'portfolioTimelineSelection',
        'portfolioTimelineExpandedByBoardId'
    ];
    if (inputs.some((key) => next[key] !== previous[key])) {
        Object.assign(next, buildPortfolioDerivedState(next, previous));
    }
    return next;
}
