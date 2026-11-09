import { getDirectoryProject, loadDirectoryHistory, mergeDirectoryTimeline, attachHistoryArchives } from './projectDirectory';
import { parseConversations } from '@/domain/comments';
import { inheritLegacyTaskIdentities } from '@/domain/taskIdentity';
import type { BoardData, LooseBoardData } from '@/domain/types';
// Project file persistence: save queueing and save/watch state.
//
// This module owns the conditional save/reconciliation path shared by user
// saves, autosave and the polling/broadcast watcher.

import type { BoardRecord, ProjectSaveState, WatchStatus } from '@/features/portfolio/types';
import { useAppStore, getPortfolioBoardRecord, type AppStore } from '@/features/portfolio/state/store';
import { hashTextContent, serializeBoardDataFromObject } from '@/domain/serialize';
import { PROJECT_FILE_EXTERNAL_BADGE_MS } from '@/domain/constants';
import { formatErrorMessage, nowIso } from '@/domain/util';
import { BoardRepository, importedProjectSnapshots, writeJsonToFileHandle, type BoardSnapshot } from './boardRepository';
import { mergeProject, type MergeDecisions } from '@/domain/projectMerge';
import { appendTimelineEvent } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { cloneSerializable } from '@/domain/serializable';
import { cloneBoardForMutation } from '@/domain/boardMutation';
import { recoveryId, removeProjectRecovery, saveProjectRecovery, type ProjectRecovery } from './projectRecovery';
import { validateConversationPixels } from '@/infrastructure/browser/commentImages';
import { Logger } from '@/infrastructure/logging/logger';

export type ProjectFileState = {
    base: BoardData | null;
    external: BoardSnapshot | null;
    recovery: Promise<void>;
    inFlight: Promise<boolean> | null;
    historyInFlight?: Promise<void>;
    lastModified: number;
    size: number;
    lastTextHash: string;
};

type BaselineOptions = {
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
    const raw = parsed as LooseBoardData;
    if (!raw.extensions?.project && boardRecord.data.extensions.project) payload.extensions.project!.id = boardRecord.data.extensions.project.id;
    inheritLegacyTaskIdentities(payload, raw, payload.extensions.project?.id === boardRecord.data.extensions.project?.id ? boardRecord.data : undefined);
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
    const next = updateProjectSaveState(boardId, {
        revision: state.revision + 1,
        status: saving ? 'saving' : state.status === 'error' ? 'error' : 'dirty',
        ...(state.watchStatus === 'external'
            ? { watchStatus: 'idle', watchMessage: '', watchStatusUntil: 0 } : {})
    });
    persistLocalRecovery(boardId);
    return next;
}

export function getProjectFileState(boardId: string | null | undefined, options: { create?: boolean } = {}): ProjectFileState | null {
    if (!boardId) return null;
    const createIfMissing = options.create !== false;
    let state = fileStateById.get(boardId) || null;
    if (!state && createIfMissing) {
        state = {
            base: null,
            external: null,
            recovery: Promise.resolve(),
            inFlight: null,
            lastModified: 0,
            size: 0,
            lastTextHash: '',
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

/** Normalize legacy input without making its import time a content change. */
export function normalizeProjectVersion(parsed: BoardData, current?: BoardData): BoardData {
    const data = serializeBoardDataFromObject(parsed, { reuseTimeline: true });
    data.meta.updatedAt = parsed.meta.updatedAt;
    if (!parsed.extensions.project && current?.extensions.project) data.extensions.project!.id = current.extensions.project.id;
    inheritLegacyTaskIdentities(data, parsed, current);
    return data;
}

function setBaseline(runtime: ProjectFileState, snapshot: BoardSnapshot, current?: BoardData): void {
    runtime.base = normalizeProjectVersion(snapshot.parsed, current);
    runtime.lastTextHash = snapshot.fileMeta.textHash;
    runtime.lastModified = snapshot.fileMeta.lastModified;
    runtime.size = snapshot.fileMeta.size;
}

function persistLocalRecovery(boardId: string): void {
    const current = getPortfolioBoardRecord(boardId);
    const runtime = getProjectFileState(boardId, { create: false });
    if (!current || !runtime?.base) return;
    const draft = { projectId: current.data.extensions.project!.id, fileName: current.fileName,
        base: cloneBoardForMutation(runtime.base), baseHash: runtime.lastTextHash, local: cloneBoardForMutation(current.data) };
    runtime.recovery = runtime.recovery.then(() => saveProjectRecovery(draft)).then(() => {
        updateProjectSaveState(boardId, { recoveryError: '' });
    }).catch((error: unknown) => {
        updateProjectSaveState(boardId, { recoveryError: formatErrorMessage(error, 'Local recovery failed.') });
    });
}

export async function refreshProjectFileBaseline(boardRecord: BoardRecord | null | undefined, options: BaselineOptions = {}): Promise<BoardSnapshot | null> {
    if (!boardRecord?.handle) return null;
    const runtime = getProjectFileState(boardRecord.id)!;
    if (runtime.base) return null; // Never adopt an unknown disk version as our own.
    const imported = importedProjectSnapshots.get(boardRecord.handle);
    if (imported) setBaseline(runtime, imported, boardRecord.data);
    try {
        const snapshot = await BoardRepository.readHandleSnapshot(boardRecord.handle);
        if (!runtime.base) setBaseline(runtime, snapshot, boardRecord.data);
        return imported || snapshot;
    } catch (error) {
        if (options.markError !== false) setProjectWatchStatus(boardRecord.id, 'watch-error', formatErrorMessage(error));
        return null;
    }
}

export function restoreProjectRecovery(boardId: string, draft: ProjectRecovery): boolean {
    const board = getPortfolioBoardRecord(boardId);
    if (!board?.handle || board.data.extensions.project?.id !== draft.projectId) return false;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.inFlight || projectHasUnsavedChanges(boardId)) return false;
    runtime.base = cloneSerializable(draft.base);
    runtime.lastTextHash = draft.baseHash;
    applySnapshotToBoardRecord(board, draft.local);
    markProjectDirty(boardId);
    // A recovered draft always requires an explicit reconciliation/check.
    setProjectWatchStatus(boardId, 'conflict');
    runtime.recovery = runtime.recovery.then(async () => {
        if (!getProjectSaveState(boardId)?.recoveryError) await removeProjectRecovery(draft.id);
    }).catch((error: unknown) => updateProjectSaveState(boardId, { recoveryError: formatErrorMessage(error) })).then(() => {});
    return true;
}

function publishData(boardId: string, data: BoardData): void {
    useAppStore.setState((state) => {
        const selection = state.portfolioTimelineSelection;
        const previous = state.portfolioBoards.find((board) => board.id === boardId)?.data.extensions.timeline?.events || [];
        const events = data.extensions.timeline?.events || [];
        const selectedId = selection.eventIndex === null ? undefined : previous[selection.eventIndex]?.id;
        const preview = selection.boardId === boardId && selection.eventIndex !== null && selection.eventIndex < previous.length - 1;
        const selectedIndex = preview ? events.findIndex((event) => event.id === selectedId) : -1;
        return {
            portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId ? { ...board, data, title: data.board.settings.title } : board),
            ...(selection.boardId === boardId ? { portfolioTimelineSelection: { boardId, eventIndex: selectedIndex >= 0 ? selectedIndex : Math.max(0, events.length - 1) } } : {})
        };
    });
}

export async function withProjectLock<T>(board: BoardRecord, operation: () => Promise<T>): Promise<T> {
    const id = board.data.extensions.project?.id || board.id;
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`teamos:project:${id}`, operation);
    return operation();
}

let notifications: BroadcastChannel | undefined;
export function subscribeProjectFileUpdates(check: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => {};
    const channel = new BroadcastChannel('teamos-project-files');
    notifications = channel;
    channel.onmessage = () => check();
    return () => { channel.close(); if (notifications === channel) notifications = undefined; };
}

/** Called by both autosave and the watcher under the same project lock. */
function reconcile(boardId: string, snapshot: BoardSnapshot, decisions?: MergeDecisions): boolean {
    const runtime = getProjectFileState(boardId)!;
    const current = getPortfolioBoardRecord(boardId)!;
    if (!runtime.base) throw new Error('Project file baseline is not ready. Retry the save.');
    const external = normalizeProjectVersion(snapshot.parsed, runtime.base);
    const result = mergeProject(runtime.base, current.data, external, {
        decisions,
        regression: (external.meta.revision || 0) <= (runtime.base.meta.revision || 0)
    });
    runtime.external = snapshot;
    if (result.conflicts.length) {
        updateProjectSaveState(boardId, { status: 'dirty', watchStatus: 'conflict', reconciliation: result });
        persistLocalRecovery(boardId);
        return false;
    }
    appendTimelineEvent(result.merged, { kind: 'board.reconciled', entityType: 'board', entityId: 'board',
        summary: 'Concurrent project changes reconciled', snapshot: createBoardStateSnapshot(result.merged) });
    publishData(boardId, result.merged);
    setBaseline(runtime, snapshot, current.data);
    runtime.external = null;
    updateProjectSaveState(boardId, { revision: getProjectSaveState(boardId)!.revision + 1,
        watchStatus: 'external', reconciliation: result, watchStatusUntil: Date.now() + PROJECT_FILE_EXTERNAL_BADGE_MS });
    persistLocalRecovery(boardId);
    return true;
}

type SaveOptions = { checkOnly?: boolean; decisions?: MergeDecisions; onReload?: (id: string) => void };
export async function enqueueProjectSave(boardRecord: BoardRecord | null | undefined, options: SaveOptions = {}): Promise<boolean> {
    if (!boardRecord?.handle) return false;
    const boardId = boardRecord.id;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.inFlight) return runtime.inFlight;
    if (!options.checkOnly && !options.decisions && getProjectSaveState(boardId)?.watchStatus === 'conflict') {
        persistLocalRecovery(boardId);
        return false;
    }
    runtime.inFlight = Promise.resolve().then(() => withProjectLock(boardRecord, async () => {
        try {
            // Bound retries in a continually changing shared folder. Pending
            // work stays dirty and recoverable for the next poll/retry.
            for (let attempt = 0; attempt < 8; attempt += 1) {
                let current = getPortfolioBoardRecord(boardId);
                if (!current?.handle) return false;
                if (!runtime.base) throw new Error('Project file baseline is not ready. Retry the save.');
                const disk = await BoardRepository.readHandleSnapshot(current.handle);
                current = getPortfolioBoardRecord(boardId);
                if (!current?.handle) return false;
                if (disk.fileMeta.textHash !== runtime.lastTextHash) {
                    if (!projectHasUnsavedChanges(boardId) && getProjectSaveState(boardId)?.watchStatus !== 'conflict'
                        && (disk.parsed.meta.revision || 0) > (runtime.base.meta.revision || 0)) {
                        options.onReload?.(boardId);
                        publishData(boardId, normalizeProjectVersion(disk.parsed, current.data));
                        setBaseline(runtime, disk, current.data);
                        updateProjectSaveState(boardId, { status: 'idle', lastErrorMessage: '', reconciliation: undefined });
                        setProjectWatchStatus(boardId, 'external', '', { untilMs: Date.now() + PROJECT_FILE_EXTERNAL_BADGE_MS });
                        return true;
                    }
                    if (!reconcile(boardId, disk, options.decisions)) return false;
                    // Re-read before writing: recovery storage and validation may
                    // have yielded to another machine's write in the meantime.
                    continue;
                }
                if (getProjectSaveState(boardId)?.watchStatus === 'conflict') {
                    // The external version can be reverted while a dialog is open.
                    // With no difference left, only the current local draft remains.
                    runtime.external = null;
                    updateProjectSaveState(boardId, { watchStatus: 'idle', reconciliation: undefined });
                }
                if (!projectHasUnsavedChanges(boardId)) {
                    if (getProjectSaveState(boardId)?.watchStatus === 'watch-error') clearProjectWatchStatus(boardId);
                    return true;
                }
                await runtime.recovery;
                current = getPortfolioBoardRecord(boardId);
                if (!current?.handle) return false;
                const targetRevision = getProjectSaveState(boardId)!.revision;
                const source = current.data;
                const payload = BoardRepository.serialize(source);
                payload.meta.revision = Math.max(runtime.base.meta.revision || 0, source.meta.revision || 0) + 1;
                BoardRepository.validate(payload);
                await validateConversationPixels(payload);
                // Pixel validation may be asynchronous; the final conditional
                // check is immediately before opening the writable stream.
                const before = await BoardRepository.readHandleSnapshot(current.handle);
                if (before.fileMeta.textHash !== runtime.lastTextHash) continue;
                updateProjectSaveState(boardId, { status: 'saving', lastErrorMessage: '' });
                const written = await writeJsonToFileHandle(current.handle, payload);
                const savedPayload = written?.data || payload;
                const text = written?.text || JSON.stringify(payload, null, 2);
                // Our base is exactly what we wrote, never what another writer
                // may put on disk between close() and the verification read.
                setBaseline(runtime, { parsed: savedPayload, fileMeta: { textHash: hashTextContent(text), lastModified: 0, size: text.length } });
                const latest = getPortfolioBoardRecord(boardId);
                if (!latest) return false;
                publishData(boardId, latest.data === source ? savedPayload : { ...latest.data, meta: { ...latest.data.meta, revision: payload.meta.revision } });
                updateProjectSaveState(boardId, { savedRevision: targetRevision, lastSavedAt: nowIso() });
                notifications?.postMessage({ projectId: payload.extensions.project?.id });
                const verification = await BoardRepository.readHandleSnapshot(current.handle);
                if (verification.fileMeta.textHash !== runtime.lastTextHash) {
                    // Force local-dirty semantics even when this write was the
                    // last edit: its content still participates in reconciliation.
                    if (!reconcile(boardId, verification, options.decisions)) return false;
                    continue;
                }
                if (projectHasUnsavedChanges(boardId)) continue;
                await runtime.recovery;
                // Do not let a recovery delete race a new edit during IndexedDB I/O.
                const saved = getProjectSaveState(boardId)!;
                if (saved.revision !== targetRevision) continue;
                const projectId = payload.extensions.project!.id;
                runtime.recovery = runtime.recovery.then(() => removeProjectRecovery(recoveryId(projectId))).catch((error: unknown) => {
                    updateProjectSaveState(boardId, { recoveryError: formatErrorMessage(error) });
                });
                updateProjectSaveState(boardId, { status: 'idle', lastErrorMessage: '' });
                return true;
            }
            updateProjectSaveState(boardId, { status: 'dirty' });
            return false;
        } catch (error) {
            Logger.error('Project file check/save failed', { boardId, error });
            updateProjectSaveState(boardId, options.checkOnly && !projectHasUnsavedChanges(boardId)
                ? { watchStatus: 'watch-error', watchMessage: formatErrorMessage(error) }
                : { status: 'error', lastErrorMessage: formatErrorMessage(error, 'Save failed.') });
            return false;
        }
    })).finally(() => { runtime.inFlight = null; });
    return runtime.inFlight;
}

export async function resolveProjectConflicts(boardId: string, decisions: MergeDecisions): Promise<boolean> {
    const board = getPortfolioBoardRecord(boardId);
    if (!board) return false;
    const inFlight = getProjectFileState(boardId)!.inFlight;
    if (inFlight) await inFlight;
    return enqueueProjectSave(board, { decisions });
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

/** Hydration is a read, never a mutation or a new recovery revision. */
export async function ensureProjectHistoryLoaded(boardId: string): Promise<void> {
    const board = getPortfolioBoardRecord(boardId);
    const storage = getDirectoryProject(board?.handle);
    if (!board?.handle || !storage || storage.loaded) return;
    const handle = board.handle;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.historyInFlight) return runtime.historyInFlight;
    runtime.historyInFlight = (async () => {
        if (runtime.inFlight) await runtime.inFlight;
        if (getPortfolioBoardRecord(boardId)?.handle !== handle) return;
        const persisted = await loadDirectoryHistory(handle);
        const current = getPortfolioBoardRecord(boardId);
        if (!persisted || current?.handle !== handle) return;
        const timeline = mergeDirectoryTimeline(persisted, current.data.extensions.timeline, false);
        parseConversations(current.data.extensions.conversations, timeline.events);
        const hydrated = cloneBoardForMutation(current.data);
        hydrated.extensions.timeline = timeline;
        attachHistoryArchives(hydrated, storage.archives);
        BoardRepository.validate(hydrated);
        storage.loaded = true;
        if (runtime.base) {
            runtime.base = { ...runtime.base, extensions: { ...runtime.base.extensions, timeline: persisted } };
            attachHistoryArchives(runtime.base, storage.archives);
        }
        publishData(boardId, hydrated);
        useAppStore.setState({ portfolioTimelineSelection: { boardId, eventIndex: Math.max(0, timeline.events.length - 1) } });
    })().finally(() => { runtime.historyInFlight = undefined; });
    return runtime.historyInFlight;
}
