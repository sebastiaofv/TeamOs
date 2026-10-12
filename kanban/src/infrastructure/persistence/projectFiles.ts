// Project file persistence: save queueing and save/watch state.
//
// External-file comparison and conflict resolution live in
// projectFileWatcher.ts; this module owns the state and write coordination
// that watcher builds on.

import type { BoardRecord, ProjectSaveState, WatchStatus } from '@/features/portfolio/types';
import { useAppStore, getPortfolioBoardRecord, type AppStore } from '@/features/portfolio/state/store';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { getBoardTimelineData } from '@/domain/timeline';
import { formatErrorMessage, nowIso } from '@/domain/util';
import { BoardRepository, type BoardSnapshot } from './boardRepository';
import { Logger } from '@/infrastructure/logging/logger';

export type ProjectFileState = {
    inFlight: Promise<boolean> | null;
    lastModified: number;
    size: number;
    lastTextHash: string;
    checking: boolean;
    suppressedUntilMs: number;
};

type BaselineOptions = {
    force?: boolean;
    resetSuppress?: boolean;
    clearWatchError?: boolean;
    markError?: boolean;
};

// Watcher bookkeeping never renders, so it stays out of the store.
const fileStateById = new Map<string, ProjectFileState>();
export function createProjectSaveState(): ProjectSaveState {
    return {
        status: 'idle',
        lastErrorMessage: '',
        lastSavedAt: '',
        revision: 0,
        savedRevision: 0,
        watchStatus: 'idle',
        watchMessage: '',
        watchStatusUntil: 0
    };
}

export function applySnapshotToBoardRecord(
    boardRecord: BoardRecord | null | undefined,
    parsed: unknown,
    options: { discardLocalChanges?: boolean } = {}
): boolean {
    if (!boardRecord || !parsed) return false;
    const boardId = boardRecord.id;
    const payload = serializeBoardDataFromObject(parsed);
    useAppStore.setState((state) => {
        const selection = state.portfolioTimelineSelection;
        const previous = state.portfolioBoards.find(board => board.id === boardId);
        const previousLatest = (getBoardTimelineData(previous?.data)?.events.length || 1) - 1;
        const followingLatest = selection.boardId === boardId
            && (selection.eventIndex === null || selection.eventIndex >= previousLatest);
        return {
            portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId
                ? { ...board, data: payload, title: payload.board.settings.title } : board),
            ...(followingLatest ? { portfolioTimelineSelection: {
                boardId, eventIndex: (getBoardTimelineData(payload)?.events.length || 1) - 1
            } } : {})
        };
    });
    if (options.discardLocalChanges) {
        const saveState = getProjectSaveState(boardId, { create: false });
        if (saveState) updateProjectSaveState(boardId, {
            revision: saveState.savedRevision, status: 'idle', lastErrorMessage: ''
        });
    }
    return true;
}

export function getProjectSaveState(boardId: string | null | undefined, options: { create?: boolean } = {}): ProjectSaveState | null {
    if (!boardId) return null;
    const current = useAppStore.getState().projectSaveStateById.get(boardId);
    if (current || options.create === false) return current || null;
    return updateProjectSaveState(boardId, createProjectSaveState());
}

function updateProjectSaveState(boardId: string, changes: Partial<ProjectSaveState>): ProjectSaveState {
    const current = getProjectSaveState(boardId, { create: false });
    const next = { ...current, ...changes } as ProjectSaveState;
    useAppStore.setState((state) => ({
        projectSaveStateById: new Map(state.projectSaveStateById).set(boardId, next)
    }));
    return next;
}

export function markProjectDirty(boardId: string): ProjectSaveState | null {
    const state = getProjectSaveState(boardId);
    if (!state) return null;
    const saving = Boolean(getProjectFileState(boardId)!.inFlight);
    return updateProjectSaveState(boardId, {
        revision: state.revision + 1,
        status: saving ? 'saving' : state.status === 'error' ? 'error' : 'dirty',
        ...(['external', 'conflict'].includes(state.watchStatus)
            ? { watchStatus: 'idle', watchMessage: '', watchStatusUntil: 0 } : {})
    });
}

export function getProjectFileState(boardId: string | null | undefined, options: { create?: boolean } = {}): ProjectFileState | null {
    if (!boardId) return null;
    const createIfMissing = options.create !== false;
    let state = fileStateById.get(boardId) || null;
    if (!state && createIfMissing) {
        state = {
            inFlight: null,
            lastModified: 0,
            size: 0,
            lastTextHash: '',
            checking: false,
            suppressedUntilMs: 0
        };
        fileStateById.set(boardId, state);
    }
    return state;
}

export function forgetProjectFileState(boardId: string): void {
    fileStateById.delete(boardId);
}

export function setProjectWatchStatus(boardId: string, status: WatchStatus = 'idle', message = '', options: { untilMs?: number } = {}): void {
    if (!getProjectSaveState(boardId, { create: false })) return;
    updateProjectSaveState(boardId, {
        watchStatus: status || 'idle',
        watchMessage: message || '',
        watchStatusUntil: Number(options.untilMs) > 0 ? Number(options.untilMs) : 0
    });
}

export function clearProjectWatchStatus(boardId: string): void {
    setProjectWatchStatus(boardId, 'idle', '');
}

export function syncProjectSaveStates(store: AppStore = useAppStore): void {
    const current = store.getState();
    const saveStates = new Map(current.projectSaveStateById);
    const activeIds = new Set(current.portfolioBoards.map((board) => board.id));
    let changed = false;
    activeIds.forEach((id) => {
        if (!saveStates.has(id)) {
            saveStates.set(id, createProjectSaveState());
            changed = true;
        }
    });
    saveStates.forEach((_, id) => {
        if (!activeIds.has(id)) {
            saveStates.delete(id);
            changed = true;
        }
    });
    fileStateById.forEach((_, id) => {
        if (!activeIds.has(id)) fileStateById.delete(id);
    });
    if (changed) store.setState({ projectSaveStateById: saveStates });
}

export async function refreshProjectFileBaseline(boardRecord: BoardRecord | null | undefined, options: BaselineOptions = {}): Promise<BoardSnapshot | null> {
    if (!boardRecord || !boardRecord.id || !boardRecord.handle) return null;
    const boardId = boardRecord.id;
    const state = getProjectFileState(boardId);
    if (!state) return null;
    if (state.checking && options.force !== true) return null;
    state.checking = true;
    try {
        const snapshot = await BoardRepository.readHandleSnapshot(boardRecord.handle);
        state.lastModified = snapshot.fileMeta.lastModified;
        state.size = snapshot.fileMeta.size;
        state.lastTextHash = snapshot.fileMeta.textHash;
        if (options.resetSuppress !== false) {
            state.suppressedUntilMs = 0;
        }
        if (options.clearWatchError !== false) {
            clearProjectWatchStatus(boardId);
        }
        return snapshot;
    } catch (error) {
        if (options.markError !== false) {
            setProjectWatchStatus(
                boardId,
                'watch-error',
                `Could not watch file: ${formatErrorMessage(error, 'Read failed.')}`
            );
        }
        return null;
    } finally {
        state.checking = false;
    }
}

export async function enqueueProjectSave(boardRecord: BoardRecord | null | undefined): Promise<boolean> {
    if (!boardRecord?.handle) return false;
    const boardId = boardRecord.id;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.inFlight) {
        return runtime.inFlight;
    }
    // Read the current immutable record on each iteration: edits made during a
    // write must be included in the next write, not the original queued snapshot.
    runtime.inFlight = Promise.resolve().then(async () => {
        try {
            while (projectHasUnsavedChanges(boardId)) {
                const current = getPortfolioBoardRecord(boardId);
                if (!current?.handle) return false;
                const targetRevision = getProjectSaveState(boardId)!.revision;
                updateProjectSaveState(boardId, { status: 'saving', lastErrorMessage: '' });
                try {
                    await BoardRepository.saveRecord(current);
                    await refreshProjectFileBaseline(current, {
                        markError: false, clearWatchError: true, force: true
                    });
                    clearProjectWatchStatus(boardId);
                } catch (error) {
                    Logger.error('Project autosave failed', { boardId, error });
                    if (getProjectSaveState(boardId, { create: false })) {
                        updateProjectSaveState(boardId, {
                            status: 'error', lastErrorMessage: formatErrorMessage(error, 'Save failed.')
                        });
                    }
                    return false;
                }
                const state = getProjectSaveState(boardId, { create: false });
                if (!state) return false;
                updateProjectSaveState(boardId, {
                    savedRevision: Math.max(state.savedRevision, targetRevision),
                    lastSavedAt: nowIso()
                });
            }
            if (getProjectSaveState(boardId, { create: false })) {
                updateProjectSaveState(boardId, { status: 'idle', lastErrorMessage: '' });
            }
            return true;
        } finally {
            runtime.inFlight = null;
        }
    });
    return runtime.inFlight;
}

export function retryProjectSave(boardId: string): boolean {
    const boardRecord = getPortfolioBoardRecord(boardId);
    if (!boardRecord || !boardRecord.handle) return false;
    const state = getProjectSaveState(boardId);
    if (!state) return false;
    if (!projectHasUnsavedChanges(boardId) && state.status !== 'error') return false;
    enqueueProjectSave(boardRecord);
    return true;
}

export function projectHasUnsavedChanges(boardId: string): boolean {
    const state = getProjectSaveState(boardId, { create: false });
    return Boolean(state && state.revision > state.savedRevision);
}
