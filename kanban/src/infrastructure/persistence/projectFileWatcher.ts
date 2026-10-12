// External project-file watching and conflict resolution.
//
// Save coordination lives in projectFiles.ts. This module owns the separate
// concern of comparing disk state with the last baseline and deciding whether
// to reload, save local edits, or defer to the next check.

import type { BoardRecord } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import {
    PROJECT_FILE_CONFLICT_SUPPRESS_MS,
    PROJECT_FILE_EXTERNAL_BADGE_MS
} from '@/domain/constants';
import { formatErrorMessage } from '@/domain/util';
import { hashTextContent } from '@/domain/serialize';
import { BoardRepository, type BoardSnapshot } from './boardRepository';
import {
    applySnapshotToBoardRecord,
    clearProjectWatchStatus,
    enqueueProjectSave,
    getProjectFileState,
    getProjectSaveState,
    projectHasUnsavedChanges,
    refreshProjectFileBaseline,
    setProjectWatchStatus,
    type ProjectFileState
} from './projectFiles';

// `chooseConflict` resolves to 'local', 'reload', null (dismissed) or anything
// else (unresolved).
export type ConflictCallbacks = {
    chooseConflict: (boardId: string) => unknown;
    onReload: (boardId: string) => void;
};

let watchRunning = false;

function updateFileBaseline(fileState: ProjectFileState, snapshot: BoardSnapshot): void {
    fileState.lastModified = snapshot.fileMeta.lastModified;
    fileState.size = snapshot.fileMeta.size;
    fileState.lastTextHash = snapshot.fileMeta.textHash;
}

export async function primeProjectFileBaselines(records: readonly (BoardRecord | null | undefined)[] | null | undefined): Promise<void> {
    const list = Array.isArray(records) ? records : [];
    for (const boardRecord of list) {
        if (!boardRecord || !boardRecord.handle) continue;
        await refreshProjectFileBaseline(boardRecord, { markError: true, clearWatchError: true });
    }
}

// True means the read completed and any detected external change was resolved.
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
        let snapshot: BoardSnapshot;
        if (metaUnchanged) {
            const text = await file.text();
            if (hashTextContent(text) === fileState.lastTextHash) {
                if (getProjectSaveState(boardId, { create: false })?.watchStatus === 'watch-error') clearProjectWatchStatus(boardId);
                return true;
            }
            snapshot = await BoardRepository.readFileSnapshot(file, text);
        } else {
            snapshot = await BoardRepository.readFileSnapshot(file);
        }
        const previousHash = fileState.lastTextHash;
        // A write or handle replacement during the read invalidates the check.
        const current = useAppStore.getState().portfolioBoards.find(board => board.id === boardId);
        if (fileState.inFlight || current?.handle !== boardRecord.handle) return false;

        if (!previousHash) {
            updateFileBaseline(fileState, snapshot);
            clearProjectWatchStatus(boardId);
            return true;
        }

        if (previousHash === snapshot.fileMeta.textHash) {
            updateFileBaseline(fileState, snapshot);
            clearProjectWatchStatus(boardId);
            return true;
        }

        if (projectHasUnsavedChanges(boardId)) {
            if (fileState.suppressedUntilMs > Date.now()) {
                setProjectWatchStatus(
                    boardId,
                    'conflict',
                    'External and local changes both exist. Resolve conflict to continue.'
                );
                return false;
            }
            return await resolveExternalChangeConflict(boardRecord, snapshot, fileState, callbacks);
        }

        updateFileBaseline(fileState, snapshot);
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

// A fiche save must read this project's disk state even before the next watcher
// tick. Never treat a skipped/failed check or an unknown baseline as permission
// to overwrite. Existing unresolved local edits stay in the save/conflict flow.
export async function preflightProjectFileSave(boardId: string, { onReload = () => {} }: Pick<Partial<ConflictCallbacks>, 'onReload'> = {}): Promise<boolean> {
    const board = useAppStore.getState().portfolioBoards.find(record => record.id === boardId);
    const runtime = getProjectFileState(boardId, { create: false });
    const saveState = getProjectSaveState(boardId, { create: false });
    if (!board?.handle || !runtime?.lastTextHash || runtime.checking || runtime.inFlight || saveState?.status === 'error') return false;
    const checked = await checkProjectFileForExternalChanges(board, { chooseConflict: () => null, onReload });
    const current = useAppStore.getState().portfolioBoards.find(record => record.id === boardId);
    const latestSave = getProjectSaveState(boardId, { create: false });
    return checked && current?.handle === board.handle && !runtime.inFlight && !runtime.checking
        && !projectHasUnsavedChanges(boardId) && latestSave?.status !== 'error'
        && latestSave?.watchStatus !== 'conflict' && latestSave?.watchStatus !== 'watch-error';
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
        updateFileBaseline(fileState, snapshot);
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
