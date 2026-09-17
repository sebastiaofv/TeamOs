import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { BoardRecord } from '@/features/portfolio/types';
import { createBoardSlice, createFilesSlice, createPortfolioSlice, createUiSlice, type AppState } from './slices';
import { derivePortfolioState } from './portfolioViewState';

export type { AppState } from './slices';
export type AppStore = UseBoundStore<StoreApi<AppState>>;

type StatePatch = AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>);

// All writes use this setter, including external actions and file reloads.
// Persisted records are immutable snapshots; derived fields are read-only caches.
export function createAppStore(initial: Partial<AppState> = {}): AppStore {
    return create<AppState>()((set, get, api) => {
        api.setState = (partial: StatePatch, replace?: boolean) => {
            const previous = get();
            const changes = typeof partial === 'function' ? partial(previous) : partial;
            if (Object.is(changes, previous)) return;
            const next = replace ? changes as AppState : { ...previous, ...changes };
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

export function getPortfolioBoardRecord(boardId: string | null | undefined): BoardRecord | null {
    return useAppStore.getState().portfolioBoards.find((board) => board.id === boardId) || null;
}
