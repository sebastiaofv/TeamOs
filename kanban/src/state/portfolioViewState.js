// Derived portfolio state is a store transition, not a rendering callback.
// Keeping this boundary here lets actions and React components share the same
// view state without depending on a boot-time renderer.

import {
    createPortfolioProjectColor,
    normalizePortfolioViewMode,
    portfolioProjectColorKey
} from '../domain/board.js';
import {
    buildPortfolioTasks,
    buildPortfolioTimelineViewModel,
    getFilteredSortedPortfolioRows,
    normalizePortfolioFilters
} from '../selectors/portfolioViews.js';
import { notifyAppStateChanged, useAppStore } from './store.js';

function syncPortfolioProjectColors(state) {
    const boards = Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [];
    const usedSeeds = new Set();
    let nextSeed = 0;

    boards.forEach((board) => {
        if (!board) return;
        const seed = Number.isInteger(board.colorSeed) && board.colorSeed >= 0
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

    const usedColorKeys = new Set();
    boards
        .filter(Boolean)
        .slice()
        .sort((a, b) => a.colorSeed - b.colorSeed)
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

    return nextSeed;
}

function normalizeSelection(state) {
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

export function buildPortfolioDerivedState(state) {
    const portfolioTasks = buildPortfolioTasks(state);
    const normalizedState = {
        ...state,
        portfolioTasks,
        portfolioFilters: normalizePortfolioFilters({ ...state, portfolioTasks })
    };
    return {
        portfolioTasks,
        portfolioVisibleRows: getFilteredSortedPortfolioRows(normalizedState),
        portfolioTimelineView: buildPortfolioTimelineViewModel(normalizedState),
        portfolioFilters: normalizedState.portfolioFilters
    };
}

export function refreshPortfolioState({ store = useAppStore, notify = store === useAppStore ? notifyAppStateChanged : () => {} } = {}) {
    const state = store.getState();
    const { selectedBoardId, viewMode } = normalizeSelection(state);
    const nextState = {
        ...state,
        selectedPortfolioBoardId: selectedBoardId,
        selectedPortfolioViewMode: viewMode
    };
    const next = buildPortfolioDerivedState(nextState);
    const nextSeed = syncPortfolioProjectColors(state);

    store.setState({
        portfolioBoards: Array.isArray(state.portfolioBoards) ? [...state.portfolioBoards] : [],
        nextPortfolioProjectColorSeed: nextSeed,
        selectedPortfolioBoardId: selectedBoardId,
        selectedPortfolioViewMode: viewMode,
        ...next
    });
    notify();
    return {
        ...next,
        selectedPortfolioBoardId: selectedBoardId,
        selectedPortfolioViewMode: viewMode
    };
}
