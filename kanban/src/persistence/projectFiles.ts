// Project file persistence: save queueing, save/watch status, and detection of
// external changes made to a board file outside the app.
//
// This layer owns file I/O and save/watch state. The file actions provide
// conflict choices and close dialogs; the React hook schedules checks.

import type { BoardFileHandle, BoardRecord, ProjectSaveState, WatchStatus } from '../types';
import { useAppStore, getPortfolioBoardRecord, type AppStore } from '../state/store';
import {
    PROJECT_FILE_CONFLICT_SUPPRESS_MS,
    PROJECT_FILE_EXTERNAL_BADGE_MS
} from '../domain/constants';
import { nextPortfolioProjectId } from '../domain/board';
import { serializeBoardDataFromObject } from '../domain/serialize';
import { formatErrorMessage, nowIso } from '../domain/util';
import { BoardRepository, type BoardSnapshot } from './boardRepository';
import { Logger } from '../logger';

type ProjectFileState = {
    inFlight: Promise<boolean> | null;
    lastModified: number;
    size: number;
    lastTextHash: string;
    checking: boolean;
    suppressedUntilMs: number;
};

// `chooseConflict` resolves to 'local', 'reload', null (dismissed) or anything
// else (unresolved).
export type ConflictCallbacks = {
    chooseConflict: (boardId: string) => unknown;
    onReload: (boardId: string) => void;
};

type BaselineOptions = {
    force?: boolean;
    resetSuppress?: boolean;
    clearWatchError?: boolean;
    markError?: boolean;
};

// Watcher bookkeeping never renders, so it stays out of the store.
const fileStateById = new Map<string, ProjectFileState>();
let watchRunning = false;

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
    useAppStore.setState((state) => ({
        portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId
            ? { ...board, data: payload, title: payload.board.settings.title } : board)
    }));
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

function getProjectFileState(boardId: string | null | undefined, options: { create?: boolean } = {}): ProjectFileState | null {
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

function setProjectWatchStatus(boardId: string, status: WatchStatus = 'idle', message = '', options: { untilMs?: number } = {}): void {
    if (!getProjectSaveState(boardId, { create: false })) return;
    updateProjectSaveState(boardId, {
        watchStatus: status || 'idle',
        watchMessage: message || '',
        watchStatusUntil: Number(options.untilMs) > 0 ? Number(options.untilMs) : 0
    });
}

function clearProjectWatchStatus(boardId: string): void {
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

async function refreshProjectFileBaseline(boardRecord: BoardRecord | null | undefined, options: BaselineOptions = {}): Promise<BoardSnapshot | null> {
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

export async function primeProjectFileBaselines(records: readonly (BoardRecord | null | undefined)[] | null | undefined): Promise<void> {
    const list = Array.isArray(records) ? records : [];
    for (const boardRecord of list) {
        if (!boardRecord || !boardRecord.handle) continue;
        await refreshProjectFileBaseline(boardRecord, { markError: true, clearWatchError: true });
    }
}

async function checkProjectFileForExternalChanges(boardRecord: BoardRecord | null | undefined, callbacks: ConflictCallbacks): Promise<boolean> {
    if (!boardRecord || !boardRecord.id || !boardRecord.handle) return false;
    const boardId = boardRecord.id;
    const fileState = getProjectFileState(boardId);
    if (fileState?.inFlight) return false;
    if (!fileState || fileState.checking) return false;

    fileState.checking = true;
    try {
        const { file, lastModified, size } = await BoardRepository.readHandleFileMeta(boardRecord.handle);
        const hasBaseline = Boolean(fileState.lastTextHash);
        const metaUnchanged = hasBaseline && fileState.lastModified === lastModified && fileState.size === size;
        if (metaUnchanged) {
            return false;
        }

        const snapshot = await BoardRepository.readFileSnapshot(file);
        const previousHash = fileState.lastTextHash;
        fileState.lastModified = snapshot.fileMeta.lastModified;
        fileState.size = snapshot.fileMeta.size;
        fileState.lastTextHash = snapshot.fileMeta.textHash;

        if (!previousHash) {
            clearProjectWatchStatus(boardId);
            return false;
        }

        if (previousHash === snapshot.fileMeta.textHash) {
            clearProjectWatchStatus(boardId);
            return false;
        }

        if (projectHasUnsavedChanges(boardId)) {
            if (fileState.suppressedUntilMs > Date.now()) {
                setProjectWatchStatus(
                    boardId,
                    'conflict',
                    'External and local changes both exist. Resolve conflict to continue.'
                );
                return true;
            }
            return await resolveExternalChangeConflict(boardRecord, snapshot, fileState, callbacks);
        }

        callbacks.onReload(boardId);
        applySnapshotToBoardRecord(boardRecord, snapshot.parsed);
        setProjectWatchStatus(
            boardId,
            'external',
            'Project reloaded from disk.',
            { untilMs: Date.now() + PROJECT_FILE_EXTERNAL_BADGE_MS }
        );
        return true;
    } catch (error) {
        setProjectWatchStatus(
            boardId,
            'watch-error',
            `Could not watch file: ${formatErrorMessage(error, 'Read failed.')}`
        );
        return false;
    } finally {
        fileState.checking = false;
    }
}

// The caller owns user interaction. Persistence only consumes a canonical
// conflict choice (local/reload/null/unresolved) and reports impending reloads.
export async function checkProjectFilesNow({ chooseConflict = () => null, onReload = () => {} }: Partial<ConflictCallbacks> = {}): Promise<boolean> {
    if (watchRunning) return false;
    watchRunning = true;
    try {
        const boards = useAppStore.getState().portfolioBoards.filter(board => board && board.handle);
        for (const board of boards) {
            await checkProjectFileForExternalChanges(board, { chooseConflict, onReload });
        }
        return true;
    } finally {
        watchRunning = false;
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

export function createPortfolioRecord({ handle = null, fileName = '', data }: {
    handle?: BoardFileHandle | null;
    fileName?: string;
    data: unknown;
}): BoardRecord {
    const payload = serializeBoardDataFromObject(data);
    const colorSeed = useAppStore.getState().nextPortfolioProjectColorSeed;
    useAppStore.setState({ nextPortfolioProjectColorSeed: colorSeed + 1 });
    return {
        id: nextPortfolioProjectId(),
        colorSeed,
        handle,
        fileName,
        title: payload.board.settings.title,
        data: payload
    };
}

async function resolveExternalChangeConflict(
    boardRecord: BoardRecord,
    snapshot: BoardSnapshot,
    fileState: ProjectFileState,
    { chooseConflict, onReload }: ConflictCallbacks
): Promise<boolean> {
    const boardId = boardRecord.id;
    setProjectWatchStatus(
        boardId,
        'conflict',
        'External file updates detected while this project has unsaved local edits.'
    );

    const choice = await chooseConflict(boardId);

    if (choice === null) {
        fileState.suppressedUntilMs = Date.now() + PROJECT_FILE_CONFLICT_SUPPRESS_MS;
        return false;
    }

    if (choice === 'reload') {
        onReload(boardId);
        applySnapshotToBoardRecord(boardRecord, snapshot.parsed, { discardLocalChanges: true });
        setProjectWatchStatus(
            boardId,
            'external',
            'Reloaded from disk after conflict.',
            { untilMs: Date.now() + PROJECT_FILE_EXTERNAL_BADGE_MS }
        );
        return true;
    }

    if (choice === 'local') {
        const saved = await enqueueProjectSave(boardRecord);
        if (!saved) {
            fileState.suppressedUntilMs = Date.now() + PROJECT_FILE_CONFLICT_SUPPRESS_MS;
            setProjectWatchStatus(
                boardId,
                'conflict',
                'Conflict persists because local save failed. Fix save issues and retry.'
            );
            return false;
        }
        await refreshProjectFileBaseline(boardRecord, { markError: true, clearWatchError: true, force: true });
        clearProjectWatchStatus(boardId);
        return true;
    }

    fileState.suppressedUntilMs = Date.now() + PROJECT_FILE_CONFLICT_SUPPRESS_MS;
    setProjectWatchStatus(
        boardId,
        'conflict',
        'Conflict unresolved. Type "local" or "reload" when prompted again.'
    );
    return false;
}

export function projectHasUnsavedChanges(boardId: string): boolean {
    const state = getProjectSaveState(boardId, { create: false });
    return Boolean(state && state.revision > state.savedRevision);
}
