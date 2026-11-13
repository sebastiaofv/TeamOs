import { withProjectIdentityLock } from './projectLock';
import { validateBoardData } from '@/domain/board';
import { getDirectoryProject, isDirectoryHistoryLoaded, markDirectoryHistoryLoaded, readDirectoryHistory, mergeDirectoryTimeline, attachHistoryArchives } from './projectDirectory';
import { parseConversations } from '@/domain/comments';
import { inheritLegacyTaskIdentities } from '@/domain/taskIdentity';
import type { BoardData, LooseBoardData } from '@/domain/types';
// Project file persistence: save queueing and save/watch state.
//
// This module owns the conditional save/reconciliation path shared by user
// saves, autosave and the polling/broadcast watcher.

import type { BoardRecord } from '@/features/portfolio/types';
import {
    canRetrySave,
    createProjectSaveState,
    hasUnsavedChanges,
    isInConflict,
    transitionProjectSave,
    type ProjectSaveEvent,
    type ProjectSaveState
} from './projectSaveLifecycle';
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
export { createProjectSaveState };

export function applySnapshotToBoardRecord(boardRecord: BoardRecord | null | undefined, parsed: unknown): boolean {
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
    return true;
}

export function getProjectSaveState(boardId: string | null | undefined, options: { create?: boolean } = {}): ProjectSaveState | null {
    if (!boardId) return null;
    const current = useAppStore.getState().projectSaveStateById.get(boardId);
    if (current || options.create === false) return current || null;
    const created = createProjectSaveState();
    publishSaveState(boardId, created);
    return created;
}

function publishSaveState(boardId: string, next: ProjectSaveState): void {
    useAppStore.setState((state) => ({
        projectSaveStateById: new Map(state.projectSaveStateById).set(boardId, next)
    }));
}

// The only writer of a project's save state: every change is a named
// lifecycle event. A refused event is a caller bug and leaves the state as is.
function dispatchProjectSave(boardId: string, event: ProjectSaveEvent): ProjectSaveState | null {
    const current = getProjectSaveState(boardId, { create: false });
    if (!current) return null;
    const result = transitionProjectSave(current, event);
    if ('refused' in result) {
        Logger.warn('Project save event refused', { boardId, event: event.type, phase: current.phase.kind, reason: result.refused });
        return current;
    }
    publishSaveState(boardId, result.state);
    const notice = result.state.notice;
    if (notice?.badge && notice !== current.notice) {
        // The badge fades by event, so every reader sees the same moment.
        setTimeout(() => {
            if (getProjectSaveState(boardId, { create: false })?.notice === notice) dispatchProjectSave(boardId, { type: 'noticeExpired' });
        }, PROJECT_FILE_EXTERNAL_BADGE_MS);
    }
    return result.state;
}

export function markProjectDirty(boardId: string): ProjectSaveState | null {
    if (!getProjectSaveState(boardId)) return null;
    const next = dispatchProjectSave(boardId, { type: 'edited' });
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
        dispatchProjectSave(boardId, { type: 'recoveryStored' });
    }).catch((error: unknown) => {
        dispatchProjectSave(boardId, { type: 'recoveryFailed', error: formatErrorMessage(error, 'Local recovery failed.') });
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
        if (options.markError !== false) dispatchProjectSave(boardRecord.id, { type: 'diskUnreadable', error: formatErrorMessage(error) });
        return null;
    }
}

function isValidRecoveryVersion(value: unknown): boolean {
    try { validateBoardData(BoardRepository.serialize(value)); return true; }
    catch (error) { Logger.error('Project recovery draft is invalid', { error }); return false; }
}

export function restoreProjectRecovery(boardId: string, draft: ProjectRecovery): boolean {
    const board = getPortfolioBoardRecord(boardId);
    if (!board?.handle || board.data.extensions.project?.id !== draft.projectId) return false;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.inFlight || projectHasUnsavedChanges(boardId)) return false;
    // Drafts come from IndexedDB, which other tabs and earlier app versions also write.
    if (!isValidRecoveryVersion(draft.base) || !isValidRecoveryVersion(draft.local)) return false;
    runtime.base = cloneSerializable(draft.base);
    // A draft from before the format conversion refers to the file that became this version.
    const storage = getDirectoryProject(board.handle);
    const metadata = board.data.extensions.projectStorage;
    runtime.lastTextHash = storage?.projectHash && metadata?.convertedFromHash === draft.baseHash ? storage.projectHash : draft.baseHash;
    applySnapshotToBoardRecord(board, draft.local);
    // A recovered draft always requires an explicit reconciliation/check.
    dispatchProjectSave(boardId, { type: 'draftRestored' });
    persistLocalRecovery(boardId);
    runtime.recovery = runtime.recovery.then(async () => {
        if (!getProjectSaveState(boardId)?.recoveryError) await removeProjectRecovery(draft.id);
    }).catch((error: unknown) => { dispatchProjectSave(boardId, { type: 'recoveryFailed', error: formatErrorMessage(error) }); }).then(() => {});
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
    return withProjectIdentityLock(id, operation);
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
        dispatchProjectSave(boardId, { type: 'conflicted', merge: result });
        persistLocalRecovery(boardId);
        return false;
    }
    appendTimelineEvent(result.merged, { kind: 'board.reconciled', entityType: 'board', entityId: 'board',
        summary: 'Concurrent project changes reconciled', snapshot: createBoardStateSnapshot(result.merged) });
    publishData(boardId, result.merged);
    setBaseline(runtime, snapshot, current.data);
    runtime.external = null;
    dispatchProjectSave(boardId, { type: 'merged', merge: result });
    persistLocalRecovery(boardId);
    return true;
}

type SaveOptions = { checkOnly?: boolean; decisions?: MergeDecisions; onReload?: (id: string) => void };
export async function enqueueProjectSave(boardRecord: BoardRecord | null | undefined, options: SaveOptions = {}): Promise<boolean> {
    if (!boardRecord?.handle) return false;
    const boardId = boardRecord.id;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.inFlight) return runtime.inFlight;
    if (!options.checkOnly && !options.decisions && isInConflict(getProjectSaveState(boardId))) {
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
                    if (!projectHasUnsavedChanges(boardId) && !isInConflict(getProjectSaveState(boardId))
                        && (disk.parsed.meta.revision || 0) > (runtime.base.meta.revision || 0)) {
                        options.onReload?.(boardId);
                        publishData(boardId, normalizeProjectVersion(disk.parsed, current.data));
                        setBaseline(runtime, disk, current.data);
                        dispatchProjectSave(boardId, { type: 'reloaded' });
                        return true;
                    }
                    if (!reconcile(boardId, disk, options.decisions)) return false;
                    // Re-read before writing: recovery storage and validation may
                    // have yielded to another machine's write in the meantime.
                    continue;
                }
                // The external version can be reverted while a dialog is open.
                // With no difference left, only the current local draft remains.
                if (isInConflict(getProjectSaveState(boardId))) runtime.external = null;
                dispatchProjectSave(boardId, { type: 'diskInSync' });
                if (!projectHasUnsavedChanges(boardId)) return true;
                await runtime.recovery;
                current = getPortfolioBoardRecord(boardId);
                if (!current?.handle) return false;
                const targetRevision = getProjectSaveState(boardId)!.revision;
                const source = current.data;
                const payload = BoardRepository.serialize(source);
                payload.meta.revision = Math.max(runtime.base.meta.revision || 0, source.meta.revision || 0) + 1;
                validateBoardData(payload);
                await validateConversationPixels(payload);
                // Pixel validation may be asynchronous; the final conditional
                // check is immediately before opening the writable stream.
                const before = await BoardRepository.readHandleSnapshot(current.handle);
                if (before.fileMeta.textHash !== runtime.lastTextHash) continue;
                dispatchProjectSave(boardId, { type: 'writeStarted' });
                const written = await writeJsonToFileHandle(current.handle, payload);
                const savedPayload = written?.data || payload;
                const text = written?.text || JSON.stringify(payload, null, 2);
                // Our base is exactly what we wrote, never what another writer
                // may put on disk between close() and the verification read.
                setBaseline(runtime, { parsed: savedPayload, fileMeta: { textHash: hashTextContent(text), lastModified: 0, size: text.length } });
                const latest = getPortfolioBoardRecord(boardId);
                if (!latest) return false;
                publishData(boardId, latest.data === source ? savedPayload : { ...latest.data, meta: { ...latest.data.meta, revision: payload.meta.revision } });
                dispatchProjectSave(boardId, { type: 'written', revision: targetRevision, at: nowIso() });
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
                    dispatchProjectSave(boardId, { type: 'recoveryFailed', error: formatErrorMessage(error) });
                });
                dispatchProjectSave(boardId, { type: 'settled' });
                return true;
            }
            dispatchProjectSave(boardId, { type: 'settled' });
            return false;
        } catch (error) {
            Logger.error('Project file check/save failed', { boardId, error });
            dispatchProjectSave(boardId, options.checkOnly && !projectHasUnsavedChanges(boardId)
                ? { type: 'diskUnreadable', error: formatErrorMessage(error) }
                : { type: 'saveFailed', error: formatErrorMessage(error, 'Save failed.') });
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
    if (!canRetrySave(getProjectSaveState(boardId))) return false;
    enqueueProjectSave(boardRecord);
    return true;
}

export function projectHasUnsavedChanges(boardId: string): boolean {
    return hasUnsavedChanges(getProjectSaveState(boardId, { create: false }));
}

/** Hydration is a read, never a mutation or a new recovery revision. */
export async function ensureProjectHistoryLoaded(boardId: string): Promise<void> {
    const board = getPortfolioBoardRecord(boardId);
    if (!board?.handle || !getDirectoryProject(board.handle) || isDirectoryHistoryLoaded(board.handle)) return;
    const handle = board.handle;
    const runtime = getProjectFileState(boardId)!;
    if (runtime.historyInFlight) return runtime.historyInFlight;
    runtime.historyInFlight = (async () => {
        if (runtime.inFlight) await runtime.inFlight;
        if (getPortfolioBoardRecord(boardId)?.handle !== handle) return;
        const persisted = await readDirectoryHistory(handle);
        const current = getPortfolioBoardRecord(boardId);
        if (!persisted || current?.handle !== handle) return;
        const timeline = mergeDirectoryTimeline(persisted.timeline, current.data.extensions.timeline, false);
        parseConversations(current.data.extensions.conversations, timeline.events);
        const hydrated = cloneBoardForMutation(current.data);
        hydrated.extensions.timeline = timeline;
        attachHistoryArchives(hydrated, persisted.archives);
        validateBoardData(hydrated);
        // Synchronous from validation on: saves made while reading join the loaded history here.
        const loaded = markDirectoryHistoryLoaded(handle, persisted)!;
        if (runtime.base) {
            runtime.base = { ...runtime.base, extensions: { ...runtime.base.extensions, timeline: loaded.timeline } };
            attachHistoryArchives(runtime.base, loaded.archives);
        }
        publishData(boardId, hydrated);
        useAppStore.setState({ portfolioTimelineSelection: { boardId, eventIndex: Math.max(0, timeline.events.length - 1) } });
    })().finally(() => { runtime.historyInFlight = undefined; });
    return runtime.historyInFlight;
}
