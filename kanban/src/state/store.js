import { create } from 'zustand';
import { createBoardSlice, createFilesSlice, createPortfolioSlice, createUiSlice } from './slices.js';

// Zustand is the source of truth for application state. Runtime code reads
// through `useAppStore.getState()` and state-changing actions use `setState()`;
// nested board mutations are followed by the normal store notification tick.
export const useAppStore = create((set) => ({
    ...createPortfolioSlice(),
    ...createBoardSlice(),
    ...createUiSlice(),
    ...createFilesSlice(),
    version: 0,
    notify: () => set((state) => ({ version: state.version + 1 }))
}));

// Nested board records are still mutated by the persistence/mutation runtime.
// These small store-level helpers keep those mutations observable without a
// separate bridge module; new code should prefer Zustand setters/actions.
export function notifyAppStateChanged() {
    useAppStore.getState().notify();
}

export function subscribeToVersion(listener) {
    return useAppStore.subscribe((state, previousState) => {
        if (state.version !== previousState.version) listener();
    });
}

export function getStoreVersion() {
    return useAppStore.getState().version;
}

export function getPortfolioBoardRecord(boardId) {
    return useAppStore.getState().portfolioBoards.find((board) => board.id === boardId) || null;
}
