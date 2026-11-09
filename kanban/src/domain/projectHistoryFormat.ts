// history.json v1: event translation, checkpoint policy and the single legacy conversion.

import { reserveHistoricalControlNumber } from './legacySequences';
import type { BoardData, LooseBoardData, TimelineEvent } from './types';
import { fromProjectFile, toProjectCheckpoint, toProjectFile, attachmentsToHashes, type ProjectCheckpoint, type ProjectFileV1, type ProjectStorageMetadata } from './projectFormat';
import { diffProjectState, isProjectSnapshot } from './projectPatch';
import { applyTimelineEventToState } from './timeline';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from './serialize';
import { isRecord } from './util';
import { allControlReferences, controlReferenceDelta, retainControlContext } from './controlHistory';
import { validateBoardData } from './board';
import { inheritLegacyTaskIdentities } from './taskIdentity';

type Rec = Record<string, unknown>;
export const HISTORY_FILE_SCHEMA_VERSION = 1;
export type RecordHistory = { control: Record<string, unknown[]>; transfers: Record<string, unknown[]> };
export type Archives = Record<string, { history: { id: string }[] }>;

export const isHistoryFileV1 = (raw: unknown): raw is Rec & { events: Rec[] } => isRecord(raw) && raw.schemaVersion === HISTORY_FILE_SCHEMA_VERSION && Array.isArray(raw.events) && !('timeline' in raw) && !('version' in raw);
export const isLegacyHistoryFile = (raw: unknown): boolean => isRecord(raw) && raw.version === 1 && isRecord(raw.timeline) && !('schemaVersion' in raw) && !('events' in raw);

// A merge of two event streams has no reliable replay order; the others reset state outright.
const MANDATORY_CHECKPOINTS = new Set(['board.baseline', 'board.restored', 'board.reconciled', 'board.converted']);
export type HistoryWriter = { state: unknown; identityContext?: LooseBoardData; checkpointBytes: number; patchBytes: number };
export const createHistoryWriter = (state: unknown, storage?: Pick<ProjectStorageMetadata, 'checkpointBytes' | 'patchBytes'>, identityContext = state as LooseBoardData | undefined): HistoryWriter => ({ state, identityContext, checkpointBytes: storage?.checkpointBytes || 0, patchBytes: storage?.patchBytes || 0 });

const checkpointOf = (state: unknown, context?: LooseBoardData): ProjectCheckpoint => {
    const snapshot = createBoardStateSnapshot(state);
    const projectId = (context?.extensions?.project as BoardData['extensions']['project'])?.id;
    if (projectId && snapshot.extensions.project) snapshot.extensions.project.id = projectId;
    inheritLegacyTaskIdentities(snapshot, state as LooseBoardData, context);
    return toProjectCheckpoint(snapshot);
};
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** Runtime event → v1. Keep task operations readable even when they also checkpoint. */
export function eventToFile(event: TimelineEvent, writer: HistoryWriter): Rec {
    const { snapshot, checkpoint: runtimeCheckpoint, changes, patch: _patch, ...common } = event;
    void _patch;
    const projectSnapshot = runtimeCheckpoint || (isProjectSnapshot(snapshot) ? snapshot : undefined);
    const next = projectSnapshot || applyTimelineEventToState(writer.state as never, event);
    const controlRefs = controlReferenceDelta(writer.state, next);
    if (controlRefs) common.meta = { ...common.meta, controlRefs };
    if (MANDATORY_CHECKPOINTS.has(event.kind) && !event.meta?.controlRefsReset) common.meta = { ...common.meta, controlRefsReset: allControlReferences(next) };
    const boardChange = isProjectSnapshot(snapshot) || Boolean(runtimeCheckpoint && event.entityType === 'board') || event.kind === 'sprint.results.updated' || event.kind === 'sprint.participation.updated';
    let result: Rec = boardChange && next && writer.state
        ? { ...common, patch: diffProjectState(checkpointOf(writer.state, writer.identityContext), checkpointOf(next, writer.identityContext)) }
        : { ...common, ...(changes ? { changes } : {}), ...(snapshot && !isProjectSnapshot(snapshot) ? { task: snapshot } : {}), ...(event.patch ? { patch: event.patch } : {}) };
    // Only patches accumulate towards a checkpoint: field-level events stay cheap however many there are.
    const patchBytes = result.patch ? byteLength(result.patch) : 0;
    const checkpointDue = !writer.state || MANDATORY_CHECKPOINTS.has(event.kind)
        || (patchBytes > 0 && writer.patchBytes + patchBytes >= writer.checkpointBytes);
    if (next && checkpointDue) {
        const checkpoint = checkpointOf(next, writer.identityContext);
        if (!(next as LooseBoardData).extensions?.project) checkpoint.project.derived = true;
        // Preserve the operation's task/changes for lifecycle and history consumers.
        result = boardChange ? { ...common, checkpoint } : { ...result, checkpoint };
        writer.checkpointBytes = byteLength(checkpoint);
        writer.patchBytes = 0;
    } else writer.patchBytes += patchBytes;
    writer.state = next;
    return result;
}

/** v1 event → runtime. Attachments must already be references. */
export function eventFromFile(raw: Rec): Rec {
    const { checkpoint, task, ...event } = raw;
    if (checkpoint) {
        const state = fromProjectFile(checkpoint as ProjectCheckpoint);
        validateBoardData(state);
        return { ...event, checkpoint: state, ...(task ? { snapshot: task } : MANDATORY_CHECKPOINTS.has(String(raw.kind)) ? { snapshot: state } : {}) };
    }
    if (task) return { ...event, snapshot: task };
    return event;
}

export function archivesToRecordHistory(archives: Archives): RecordHistory {
    const result: RecordHistory = { control: {}, transfers: {} };
    for (const [key, { history }] of Object.entries(archives)) {
        if (!history.length) continue;
        if (key.startsWith('control:')) result.control[key.slice(8)] = history;
        else if (key.startsWith('transfer:')) result.transfers[key.slice(9)] = history;
    }
    return result;
}
export function archivesFromRecordHistory(value: unknown): Archives {
    if (value === undefined) return {};
    if (!isRecord(value) || !isRecord(value.control) || !isRecord(value.transfers)) throw new Error('Invalid record history.');
    const archives: Archives = {};
    for (const [prefix, group] of [['control', value.control], ['transfer', value.transfers]] as const) {
        for (const [id, history] of Object.entries(group)) {
            if (!Array.isArray(history) || history.some((entry) => !isRecord(entry) || typeof entry.id !== 'string')) throw new Error('Invalid record history.');
            archives[`${prefix}:${id}`] = { history: history as { id: string }[] };
        }
    }
    return archives;
}

/** One entry per line; `transactions` stays last because appends rewrite only the tail. */
export function serializeHistoryFile(projectId: string, baselineEventId: string, events: readonly unknown[], archives: Archives): string {
    const body = events.map((event) => JSON.stringify(attachmentsToHashes(event))).join(',\n');
    const header = `{"schemaVersion":${HISTORY_FILE_SCHEMA_VERSION},"projectId":${JSON.stringify(projectId)},"baselineEventId":${JSON.stringify(baselineEventId)},\n`;
    return `${header}"events":[\n${body}${body ? '\n' : ''}],\n"recordHistory":${JSON.stringify(attachmentsToHashes(archivesToRecordHistory(archives)))},\n"transactions":[\n]}\n`;
}

/** Pure legacy → v1 step of the folder conversion. Same input, same output. */
export function convertLegacyProject(input: { project: LooseBoardData; events: readonly TimelineEvent[]; archives: Archives; projectHash: string }): { project: ProjectFileV1; projectText: string; historyText: string; data: BoardData } {
    const raw = input.project;
    const { projectStorage, ...extensions } = (raw.extensions || {}) as Rec & { projectStorage?: ProjectStorageMetadata };
    // Without projectStorage the serializer reserves every number found in the old history.
    const data = serializeBoardDataFromObject({ ...raw, extensions: { ...extensions, timeline: { version: 1, baselineEventId: input.events[0]?.id || '', events: input.events } } }, { reuseTimeline: false });
    data.meta.updatedAt = raw.meta?.updatedAt as string || data.meta.updatedAt;
    delete data.extensions.timeline;
    reserveHistoricalControlNumber(data, input.events);
    retainControlContext(data, raw, input.events);
    const archives = { ...input.archives };
    for (const [id, entries] of Object.entries(data.extensions.controlRecordHistory || {})) archives[`control:${id}`] = { history: [...new Map([...(archives[`control:${id}`]?.history || []), ...entries].map((entry) => [entry.id, entry])).values()] };
    const projectId = data.extensions.project!.id;
    const writer = createHistoryWriter(undefined, undefined, data);
    const events = input.events.map((event) => eventToFile(event, writer));
    const baselineEventId = input.events[0]?.id || '';
    const lastAt = input.events.at(-1)?.at;
    if (lastAt) events.push(eventToFile({ id: `project-converted-${input.projectHash}`, at: lastAt > data.meta.updatedAt ? lastAt : data.meta.updatedAt, kind: 'board.converted', entityType: 'board', entityId: 'board', summary: 'Project converted to format v1', snapshot: createBoardStateSnapshot(data) } as TimelineEvent, writer));
    data.extensions.projectStorage = { version: 1, baselineEventId, ...(projectStorage?.legacyFileName ? { legacyFileName: projectStorage.legacyFileName } : {}), convertedFromHash: input.projectHash, checkpointBytes: writer.checkpointBytes, patchBytes: writer.patchBytes };
    for (const record of data.extensions.projectControl?.records || []) record.history = [];
    for (const operation of data.extensions.projectTransfers?.operations || []) operation.history = [];
    const project = attachmentsToHashes(toProjectFile(data));
    return { project, projectText: JSON.stringify(project, null, 2), historyText: serializeHistoryFile(projectId, baselineEventId, events, archives), data };
}
