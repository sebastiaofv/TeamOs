import { create } from 'zustand';
import { createBoardSlice, createFilesSlice, createPortfolioSlice, createUiSlice } from './slices.js';
import { derivePortfolioState } from './portfolioViewState.js';

// All writes use this setter, including external actions and file reloads.
// Persisted records are immutable snapshots; derived fields are read-only caches.
export function createAppStore(initial = {}) {
    return create((set, get, api) => {
        api.setState = (partial, replace = false) => {
            const previous = get();
            const changes = typeof partial === 'function' ? partial(previous) : partial;
            if (Object.is(changes, previous)) return;
            const next = replace ? changes : { ...previous, ...changes };
            set(derivePortfolioState(next, previous), true);
        };
        return derivePortfolioState({
            ...createPortfolioSlice(),
            ...createBoardSlice(),
            ...createUiSlice(),
            ...createFilesSlice(),
            ...initial
        });
    });
}

export const useAppStore = createAppStore();

export function getPortfolioBoardRecord(boardId) {
    return useAppStore.getState().portfolioBoards.find((board) => board.id === boardId) || null;
}
