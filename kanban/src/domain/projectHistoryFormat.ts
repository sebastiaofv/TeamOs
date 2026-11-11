// history.json v1: event translation, checkpoint policy and the single legacy conversion.

import { reserveHistoricalControlNumber } from './legacySequences';
import type { BoardData, LooseBoardData, TimelineEvent } from './types';
import {
    fromProjectFile, toProjectCheckpoint, toProjectFile, attachmentsToHashes,
    type ProjectCheckpoint, type ProjectFileV1, type ProjectStorageMetadata
} from './projectFormat';
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

export const isHistoryFileV1 = (raw: unknown): raw is Rec & { events: Rec[] } =>
    isRecord(raw) && raw.schemaVersion === HISTORY_FILE_SCHEMA_VERSION && Array.isArray(raw.events)
    && !('timeline' in raw) && !('version' in raw);
export const isLegacyHistoryFile = (raw: unknown): boolean =>
    isRecord(raw) && raw.version === 1 && isRecord(raw.timeline) && !('schemaVersion' in raw) && !('events' in raw);

// A merge of two event streams has no reliable replay order; the others reset state outright.
const MANDATORY_CHECKPOINTS = new Set(['board.baseline', 'board.restored', 'board.reconciled', 'board.converted']);
/** Carries the project state and the checkpoint budget from one written event to the next. */
export type HistoryWriter = {
    /** The project as of the last event written; undefined before the baseline. */
    state: unknown;
    identityContext?: LooseBoardData;
    /** Size of the last checkpoint, and the patch bytes written since. */
    checkpointBytes: number;
    patchBytes: number;
};
export function createHistoryWriter(
    state: unknown,
    storage?: Pick<ProjectStorageMetadata, 'checkpointBytes' | 'patchBytes'>,
    identityContext = state as LooseBoardData | undefined
): HistoryWriter {
    return { state, identityContext, checkpointBytes: storage?.checkpointBytes || 0, patchBytes: storage?.patchBytes || 0 };
}

const checkpointOf = (state: unknown, context?: LooseBoardData): ProjectCheckpoint => {
    const snapshot = createBoardStateSnapshot(state);
    const projectId = (context?.extensions?.project as BoardData['extensions']['project'])?.id;
    if (projectId && snapshot.extensions.project) snapshot.extensions.project.id = projectId;
    inheritLegacyTaskIdentities(snapshot, state as LooseBoardData, context);
    return toProjectCheckpoint(snapshot);
};
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const SPRINT_STRUCTURE_KINDS = new Set(['sprint.results.updated', 'sprint.participation.updated']);

// The in-memory model still says "task" and "board". The file uses the product's words:
// workitem events are `workitem.*`, project-wide events `project.*`, and Project Control
// events `control.*`. Kinds without one of these prefixes are stored unchanged.
const PROJECT_DETAILS = { runtime: 'board.project.updated', file: 'project.details.updated' };
const FILE_ONLY_PREFIXES = ['workitem.', 'control.', 'project.'];

export function eventKindToFile(kind: string): string {
    if (FILE_ONLY_PREFIXES.some((prefix) => kind.startsWith(prefix)) || kind === 'board.details.updated') {
        throw new Error(`Event kind ${kind} would be ambiguous in history.json.`);
    }
    if (kind === PROJECT_DETAILS.runtime) return PROJECT_DETAILS.file;
    if (kind.startsWith('task.')) return `workitem.${kind.slice(5)}`;
    if (kind.startsWith('board.control.')) return `control.${kind.slice(14)}`;
    if (kind.startsWith('board.')) return `project.${kind.slice(6)}`;
    return kind;
}
export function eventKindFromFile(kind: string): string {
    if (kind === PROJECT_DETAILS.file) return PROJECT_DETAILS.runtime;
    if (kind.startsWith('workitem.')) return `task.${kind.slice(9)}`;
    if (kind.startsWith('control.')) return `board.control.${kind.slice(8)}`;
    if (kind.startsWith('project.')) return `board.${kind.slice(8)}`;
    return kind;
}

const ENTITY_TO_FILE: Record<string, string> = { task: 'workitem', board: 'project' };
const ENTITY_FROM_FILE: Record<string, string> = { workitem: 'task', project: 'board' };

/** Rename keys in place of their position, so the stored order stays readable. */
function renameKeys(value: Rec, names: Record<string, string>): Rec {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [names[key] ?? key, child]));
}

/** Runtime vocabulary → file vocabulary, for the envelope fields of one event. */
function eventVocabularyToFile(event: Rec): Rec {
    const entityType = ENTITY_TO_FILE[String(event.entityType)] ?? event.entityType;
    const meta = isRecord(event.meta) && 'taskIds' in event.meta ? renameKeys(event.meta, { taskIds: 'workitemIds' }) : event.meta;
    return {
        ...renameKeys(event, { task: 'workitem' }),
        kind: eventKindToFile(String(event.kind)),
        entityType,
        ...(entityType === 'project' && event.entityId === 'board' ? { entityId: 'project' } : {}),
        ...(meta === undefined ? {} : { meta })
    };
}
function eventVocabularyFromFile(event: Rec): Rec {
    const entityType = ENTITY_FROM_FILE[String(event.entityType)] ?? event.entityType;
    const meta = isRecord(event.meta) && 'workitemIds' in event.meta ? renameKeys(event.meta, { workitemIds: 'taskIds' }) : event.meta;
    return {
        ...renameKeys(event, { workitem: 'task' }),
        kind: eventKindFromFile(String(event.kind)),
        entityType,
        ...(entityType === 'board' && event.entityId === 'project' ? { entityId: 'board' } : {}),
        ...(meta === undefined ? {} : { meta })
    };
}

/** Runtime event → v1. Keep task operations readable even when they also checkpoint. */
export function eventToFile(event: TimelineEvent, writer: HistoryWriter): Rec {
    const { snapshot, checkpoint: runtimeCheckpoint, changes, patch: runtimePatch, ...common } = event;
    const projectSnapshot = runtimeCheckpoint || (isProjectSnapshot(snapshot) ? snapshot : undefined);
    const next = projectSnapshot || applyTimelineEventToState(writer.state as never, event);
    const mandatory = MANDATORY_CHECKPOINTS.has(event.kind);

    const controlRefs = controlReferenceDelta(writer.state, next);
    if (controlRefs) common.meta = { ...common.meta, controlRefs };
    if (mandatory && !event.meta?.controlRefsReset) common.meta = { ...common.meta, controlRefsReset: allControlReferences(next) };

    // A board-level change is stored as the difference between the two project states.
    const boardChange = isProjectSnapshot(snapshot)
        || Boolean(runtimeCheckpoint && event.entityType === 'board')
        || SPRINT_STRUCTURE_KINDS.has(event.kind);
    let result: Rec;
    if (boardChange && next && writer.state) {
        const before = checkpointOf(writer.state, writer.identityContext);
        const after = checkpointOf(next, writer.identityContext);
        result = { ...common, patch: diffProjectState(before, after) };
    } else {
        result = {
            ...common,
            ...(changes ? { changes } : {}),
            ...(snapshot && !isProjectSnapshot(snapshot) ? { task: snapshot } : {}),
            ...(runtimePatch ? { patch: runtimePatch } : {})
        };
    }

    // Only patches accumulate towards a checkpoint: field-level events stay cheap however many there are.
    const patchBytes = result.patch ? byteLength(result.patch) : 0;
    const volumeReached = patchBytes > 0 && writer.patchBytes + patchBytes >= writer.checkpointBytes;
    if (next && (!writer.state || mandatory || volumeReached)) {
        const checkpoint = checkpointOf(next, writer.identityContext);
        if (!(next as LooseBoardData).extensions?.project) checkpoint.project.derived = true;
        // Preserve the operation's task/changes for lifecycle and history consumers.
        result = boardChange ? { ...common, checkpoint } : { ...result, checkpoint };
        writer.checkpointBytes = byteLength(checkpoint);
        writer.patchBytes = 0;
    } else writer.patchBytes += patchBytes;
    writer.state = next;
    return eventVocabularyToFile(result);
}

/** v1 event → runtime. Attachments must already be references. */
export function eventFromFile(stored: Rec): Rec {
    const raw = eventVocabularyFromFile(stored);
    const { checkpoint, task, ...event } = raw;
    if (checkpoint) {
        const state = fromProjectFile(checkpoint as ProjectCheckpoint);
        validateBoardData(state);
        // The runtime still reads `snapshot`: the workitem of a task event, or the project of a mandatory checkpoint.
        const snapshot = task || (MANDATORY_CHECKPOINTS.has(String(raw.kind)) ? state : undefined);
        return { ...event, checkpoint: state, ...(snapshot ? { snapshot } : {}) };
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
            const valid = Array.isArray(history) && history.every((entry) => isRecord(entry) && typeof entry.id === 'string');
            if (!valid) throw new Error('Invalid record history.');
            archives[`${prefix}:${id}`] = { history: history as { id: string }[] };
        }
    }
    return archives;
}

/** One entry per line; `transactions` stays last because appends rewrite only the tail. */
export function serializeHistoryFile(projectId: string, baselineEventId: string, events: readonly unknown[], archives: Archives, transactions: readonly unknown[] = []): string {
    const body = events.map((event) => JSON.stringify(attachmentsToHashes(event))).join(',\n');
    const recordHistory = JSON.stringify(attachmentsToHashes(archivesToRecordHistory(archives)));
    return [
        `{"schemaVersion":${HISTORY_FILE_SCHEMA_VERSION},"projectId":${JSON.stringify(projectId)},"baselineEventId":${JSON.stringify(baselineEventId)},`,
        `"events":[\n${body}${body ? '\n' : ''}],`,
        `"recordHistory":${recordHistory},`,
        `"transactions":[\n${transactions.map((entry) => JSON.stringify(entry)).join(',\n')}${transactions.length ? '\n' : ''}]}\n`
    ].join('\n');
}

type LegacyProject = { project: LooseBoardData; events: readonly TimelineEvent[]; archives: Archives; projectHash: string };
type ConvertedProject = { project: ProjectFileV1; projectText: string; historyText: string; data: BoardData };

/** Pure legacy → v1 step of the folder conversion. Same input, same output. */
export function convertLegacyProject(input: LegacyProject): ConvertedProject {
    const raw = input.project;
    const { projectStorage, ...extensions } = (raw.extensions || {}) as Rec & { projectStorage?: ProjectStorageMetadata };
    const baselineEventId = input.events[0]?.id || '';

    // Without projectStorage the serializer reserves every number found in the old history.
    const timeline = { version: 1, baselineEventId, events: input.events };
    const data = serializeBoardDataFromObject({ ...raw, extensions: { ...extensions, timeline } }, { reuseTimeline: false });
    data.meta.updatedAt = raw.meta?.updatedAt as string || data.meta.updatedAt;
    delete data.extensions.timeline;
    reserveHistoricalControlNumber(data, input.events);
    retainControlContext(data, raw, input.events);

    // Record histories recovered from old snapshots join those already archived.
    const archives = { ...input.archives };
    for (const [id, entries] of Object.entries(data.extensions.controlRecordHistory || {})) {
        const merged = new Map([...(archives[`control:${id}`]?.history || []), ...entries].map((entry) => [entry.id, entry]));
        archives[`control:${id}`] = { history: [...merged.values()] };
    }

    const writer = createHistoryWriter(undefined, undefined, data);
    const events = input.events.map((event) => eventToFile(event, writer));
    const lastAt = input.events.at(-1)?.at;
    if (lastAt) {
        const converted = {
            id: `project-converted-${input.projectHash}`,
            at: lastAt > data.meta.updatedAt ? lastAt : data.meta.updatedAt,
            kind: 'board.converted',
            entityType: 'board',
            entityId: 'board',
            summary: 'Project converted to format v1',
            snapshot: createBoardStateSnapshot(data)
        } as TimelineEvent;
        events.push(eventToFile(converted, writer));
    }

    data.extensions.projectStorage = {
        version: 1,
        baselineEventId,
        ...(projectStorage?.legacyFileName ? { legacyFileName: projectStorage.legacyFileName } : {}),
        convertedFromHash: input.projectHash,
        checkpointBytes: writer.checkpointBytes,
        patchBytes: writer.patchBytes
    };
    for (const record of data.extensions.projectControl?.records || []) record.history = [];
    for (const operation of data.extensions.projectTransfers?.operations || []) operation.history = [];
    const project = attachmentsToHashes(toProjectFile(data));
    const projectId = data.extensions.project!.id;
    return { project, projectText: JSON.stringify(project, null, 2), historyText: serializeHistoryFile(projectId, baselineEventId, events, archives), data };
}
