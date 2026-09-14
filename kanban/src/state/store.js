import { create } from 'zustand';
import { createBoardSlice, createFilesSlice, createPortfolioSlice, createUiSlice } from './slices.js';

// Zustand is the source of truth for application state. The proxy below is a
// short-lived compatibility surface for the persistence and action modules
// that still use the old `appState.field` spelling while Phase 2.7 moves those
// functions into hooks and store actions. It forwards reads and top-level
// writes into the store; nested board mutations are followed by the normal
// store notification tick.
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

export const appState = new Proxy({}, {
    get(_target, property) {
        return useAppStore.getState()[property];
    },
    set(_target, property, value) {
        useAppStore.setState({ [property]: value });
        return true;
    },
    has(_target, property) {
        return Object.prototype.hasOwnProperty.call(useAppStore.getState(), property);
    },
    ownKeys() {
        return Reflect.ownKeys(useAppStore.getState());
    },
    getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
    }
});

export function getPortfolioBoardRecord(boardId) {
    return useAppStore.getState().portfolioBoards.find((board) => board.id === boardId) || null;
}
