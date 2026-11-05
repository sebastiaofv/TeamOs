// Polling and broadcast checks use exactly the same conditional save/reconcile
// path as manual saves. Conflict detection never opens a modal on its own.
import type { BoardRecord } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { enqueueProjectSave, refreshProjectFileBaseline } from './projectFiles';

export type ConflictCallbacks = { onReload: (boardId: string) => void };
let watchRunning = false;
export async function primeProjectFileBaselines(records: readonly (BoardRecord | null | undefined)[] | null | undefined): Promise<void> {
    for (const record of records || []) {
        if (record?.handle) await refreshProjectFileBaseline(record, { markError: true });
    }
}
export async function checkProjectFilesNow({ onReload = () => {} }: Partial<ConflictCallbacks> = {}): Promise<boolean> {
    if (watchRunning) return false;
    watchRunning = true;
    try {
        // Projects are independent: a paused project does not block another.
        for (const board of useAppStore.getState().portfolioBoards) {
            if (board.handle) await enqueueProjectSave(board, { checkOnly: true, onReload });
        }
        return true;
    } finally { watchRunning = false; }
}
