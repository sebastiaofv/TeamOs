// Project file persistence: save queueing, save/watch status, and detection of
// external changes made to a board file outside the app.
//
// This layer owns no DOM. Four of these functions need the project chips
// re-rendered after a status change, which is a UI concern, so they call a
// registered notifier instead of importing a render function. src/legacy/main.js
// registers the real one at startup; until then it is a no-op, which keeps this
// module usable from tests without a document.

import { appState, getPortfolioBoardRecord } from '../state/store.js';
import { PROJECT_FILE_EXTERNAL_BADGE_MS, PROJECT_FILE_CONFLICT_SUPPRESS_MS } from '../domain/constants.js';
import { nextPortfolioProjectId } from '../domain/board.js';
import { serializeBoardDataFromObject } from '../domain/serialize.js';
import { formatErrorMessage, nowIso } from '../domain/util.js';
import { createProjectSaveState } from '../domain/persistence.js';
import { BoardRepository } from './boardRepository.js';
import { Logger } from '../logger.js';

// The two seams where persistence has to hand control back to the UI. The host
// supplies real implementations; the defaults are no-ops so this module can be
// exercised without a document.
const host = {
    // Called when a board's save or watch status changes and the project chips
    // need to reflect it.
    onStatusChanged: () => {},
    // Called with a board record and a snapshot read from disk, to apply that
    // snapshot to app state and re-render. Persistence detects the external
    // change; deciding how to surface it is the UI's job.
    applySnapshot: () => {}
};

/** Register the UI implementations for the seams above. */
export function setPersistenceHost(impl = {}) {
    for (const key of Object.keys(host)) {
        if (typeof impl[key] === 'function') host[key] = impl[key];
    }
}

const notifyProjectStatusChanged = (...args) => host.onStatusChanged(...args);
const applySnapshotToBoardRecord = (...args) => host.applySnapshot(...args);

export function getProjectSaveState(boardId, options = {}) {
    if (!boardId) return null;
    const createIfMissing = options.create !== false;
    let state = appState.projectSaveStateById.get(boardId) || null;
    if (!state && createIfMissing) {
        state = createProjectSaveState();
        appState.projectSaveStateById.set(boardId, state);
    }
    return state;
}

function getProjectFileState(boardId, options = {}) {
    if (!boardId) return null;
    const createIfMissing = options.create !== false;
    let state = appState.projectFileStateById.get(boardId) || null;
    if (!state && createIfMissing) {
        state = {
            lastModified: 0,
            size: 0,
            lastTextHash: '',
            checking: false,
            suppressedUntilMs: 0
        };
        appState.projectFileStateById.set(boardId, state);
    }
    return state;
}

function setProjectWatchStatus(boardId, status = 'idle', message = '', options = {}) {
    const state = getProjectSaveState(boardId, { create: false });
    if (!state) return;
    state.watchStatus = status || 'idle';
    state.watchMessage = message || '';
    state.watchStatusUntil = Number(options.untilMs) > 0 ? Number(options.untilMs) : 0;
    if (options.render !== false) {
        notifyProjectStatusChanged();
    }
}

function clearProjectWatchStatus(boardId, options = {}) {
    setProjectWatchStatus(boardId, 'idle', '', options);
}

export function syncProjectSaveStates() {
    const activeIds = new Set();
    appState.portfolioBoards.forEach((board) => {
        if (!board || !board.id) return;
        activeIds.add(board.id);
        getProjectSaveState(board.id);
    });
    Array.from(appState.projectSaveStateById.keys()).forEach((boardId) => {
        if (!activeIds.has(boardId)) {
            appState.projectSaveStateById.delete(boardId);
        }
    });
    Array.from(appState.projectFileStateById.keys()).forEach((boardId) => {
        if (!activeIds.has(boardId)) {
            appState.projectFileStateById.delete(boardId);
        }
    });
}

async function refreshProjectFileBaseline(boardRecord, options = {}) {
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
            clearProjectWatchStatus(boardId, { render: false });
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

export async function primeProjectFileBaselines(records) {
    const list = Array.isArray(records) ? records : [];
    for (const boardRecord of list) {
        if (!boardRecord || !boardRecord.handle) continue;
        await refreshProjectFileBaseline(boardRecord, { markError: true, clearWatchError: true });
    }
}

async function checkProjectFileForExternalChanges(boardRecord) {
    if (!boardRecord || !boardRecord.id || !boardRecord.handle) return false;
    const boardId = boardRecord.id;
    const saveState = getProjectSaveState(boardId, { create: false });
    if (saveState?.inFlight) return false;
    const fileState = getProjectFileState(boardId);
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
            clearProjectWatchStatus(boardId, { render: false });
            return false;
        }

        if (previousHash === snapshot.fileMeta.textHash) {
            clearProjectWatchStatus(boardId, { render: false });
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
            return resolveExternalChangeConflict(boardRecord, snapshot, fileState);
        }

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

export async function checkProjectFilesNow() {
    if (appState.projectWatchRunning) return false;
    appState.projectWatchRunning = true;
    try {
        const boards = appState.portfolioBoards.filter(board => board && board.handle);
        for (const board of boards) {
            await checkProjectFileForExternalChanges(board);
        }
        return true;
    } finally {
        appState.projectWatchRunning = false;
    }
}

export function stopProjectFileWatcher() {
    if (appState.projectWatchTimerId) {
        clearInterval(appState.projectWatchTimerId);
        appState.projectWatchTimerId = null;
    }
}

async function savePortfolioBoardRecord(boardRecord) {
    return BoardRepository.saveRecord(boardRecord);
}

async function runQueuedProjectSave(boardRecord) {
    if (!boardRecord || !boardRecord.id || !boardRecord.handle) return false;
    const state = getProjectSaveState(boardRecord.id);
    if (!state) return false;
    if (state.inFlight) return state.inFlight;

    state.inFlight = (async () => {
        while (projectHasUnsavedChanges(boardRecord.id)) {
            const targetRevision = state.revision;
            state.status = 'saving';
            state.lastErrorMessage = '';
            notifyProjectStatusChanged();
            try {
                await savePortfolioBoardRecord(boardRecord);
                await refreshProjectFileBaseline(boardRecord, {
                    markError: false,
                    clearWatchError: true,
                    force: true
                });
                clearProjectWatchStatus(boardRecord.id, { render: false });
            } catch (error) {
                Logger.error('Project autosave failed', { boardId: boardRecord.id, error });
                state.status = 'error';
                state.lastErrorMessage = formatErrorMessage(error, 'Save failed.');
                notifyProjectStatusChanged();
                return false;
            }

            state.savedRevision = Math.max(state.savedRevision, targetRevision);
            state.lastSavedAt = nowIso();
            state.queued = state.revision > state.savedRevision;
        }

        state.status = 'idle';
        state.queued = false;
        state.lastErrorMessage = '';
        notifyProjectStatusChanged();
        return true;
    })();

    try {
        return await state.inFlight;
    } finally {
        state.inFlight = null;
        if (state.status !== 'error' && projectHasUnsavedChanges(boardRecord.id)) {
            state.status = 'dirty';
        }
        notifyProjectStatusChanged();
    }
}

export async function enqueueProjectSave(boardRecord) {
    if (!boardRecord || !boardRecord.handle) return false;
    const state = getProjectSaveState(boardRecord.id);
    if (!state) return false;
    if (state.inFlight) {
        state.queued = true;
        notifyProjectStatusChanged();
        return state.inFlight;
    }
    return runQueuedProjectSave(boardRecord);
}

export function retryProjectSave(boardId) {
    const boardRecord = getPortfolioBoardRecord(boardId);
    if (!boardRecord || !boardRecord.handle) return false;
    const state = getProjectSaveState(boardId);
    if (!state) return false;
    if (!projectHasUnsavedChanges(boardId) && state.status !== 'error') return false;
    enqueueProjectSave(boardRecord);
    return true;
}

export function createPortfolioRecord({ handle = null, fileName = '', data }) {
    const payload = serializeBoardDataFromObject(data);
    return {
        id: nextPortfolioProjectId(),
        colorSeed: appState.nextPortfolioProjectColorSeed++,
        handle,
        fileName,
        title: payload.board.settings.title,
        data: payload
    };
}

async function resolveExternalChangeConflict(boardRecord, snapshot, fileState) {
    const boardId = boardRecord.id;
    setProjectWatchStatus(
        boardId,
        'conflict',
        'External file updates detected while this project has unsaved local edits.'
    );

    const answer = window.prompt(
        'Project file changed on disk while this app has unsaved edits.\n' +
        'Type "local" to keep local edits and save.\n' +
        'Type "reload" to reload from disk and discard unsaved edits.',
        'local'
    );

    if (answer === null) {
        fileState.suppressedUntilMs = Date.now() + PROJECT_FILE_CONFLICT_SUPPRESS_MS;
        return false;
    }

    const choice = String(answer).trim().toLowerCase();
    if (choice === 'reload' || choice === 'r') {
        applySnapshotToBoardRecord(boardRecord, snapshot.parsed, { discardLocalChanges: true });
        setProjectWatchStatus(
            boardId,
            'external',
            'Reloaded from disk after conflict.',
            { untilMs: Date.now() + PROJECT_FILE_EXTERNAL_BADGE_MS }
        );
        return true;
    }

    if (choice === 'local' || choice === 'l' || choice === 'keep') {
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

export function projectHasUnsavedChanges(boardId) {
    const state = getProjectSaveState(boardId, { create: false });
    return Boolean(state && state.revision > state.savedRevision);
}
