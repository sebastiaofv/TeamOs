// history.json v1: event translation, checkpoint policy and the single legacy conversion.

import type { BoardData, LooseBoardData, TimelineEvent } from './types';
import { fromProjectFile, toProjectCheckpoint, toProjectFile, attachmentsToHashes, type ProjectCheckpoint, type ProjectFileV1, type ProjectStorageMetadata } from './projectFormat';
import { diffProjectState, isProjectSnapshot } from './projectPatch';
import { applyTimelineEventToState } from './timeline';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from './serialize';
import { isRecord } from './util';

type Rec = Record<string, unknown>;
export const HISTORY_FILE_SCHEMA_VERSION = 1;
export type RecordHistory = { control: Record<string, unknown[]>; transfers: Record<string, unknown[]> };
export type Archives = Record<string, { history: { id: string }[] }>;

export const isHistoryFileV1 = (raw: unknown): raw is Rec & { events: Rec[] } => isRecord(raw) && raw.schemaVersion === HISTORY_FILE_SCHEMA_VERSION && Array.isArray(raw.events);
export const isLegacyHistoryFile = (raw: unknown): boolean => isRecord(raw) && raw.version === 1 && isRecord(raw.timeline);

// A merge of two event streams has no reliable replay order; the others reset state outright.
const MANDATORY_CHECKPOINTS = new Set(['board.baseline', 'board.restored', 'board.reconciled']);
// Small projects would otherwise checkpoint constantly for no measurable benefit.
const MIN_CHECKPOINT_BUDGET = 64 * 1024;

export type HistoryWriter = { state: unknown; checkpointBytes: number; patchBytes: number };
export const createHistoryWriter = (state: unknown, storage?: Pick<ProjectStorageMetadata, 'checkpointBytes' | 'patchBytes'>): HistoryWriter => ({ state, checkpointBytes: storage?.checkpointBytes || 0, patchBytes: storage?.patchBytes || 0 });

const checkpointOf = (state: unknown): ProjectCheckpoint => toProjectCheckpoint(createBoardStateSnapshot(state));

/** Runtime event → v1. `writer` tracks the replay state, so a patch is exact against it. */
export function eventToFile(event: TimelineEvent, writer: HistoryWriter): Rec {
    const { snapshot, changes, ...common } = event;
    const next = isProjectSnapshot(snapshot) ? snapshot
        : (event.kind === 'sprint.results.updated' || event.kind === 'sprint.participation.updated') && changes && writer.state ? applyTimelineEventToState(writer.state as never, event) : undefined;
    if (!next) {
        const result = { ...common, ...(changes ? { changes } : {}), ...(snapshot ? { task: snapshot } : {}) };
        writer.state = applyTimelineEventToState(writer.state as never, event);
        writer.patchBytes += JSON.stringify(result).length;
        return result;
    }
    const budget = Math.max(writer.checkpointBytes, MIN_CHECKPOINT_BUDGET);
    let result: Rec;
    if (!writer.state || MANDATORY_CHECKPOINTS.has(event.kind) || writer.patchBytes >= budget) {
        const checkpoint = checkpointOf(next);
        if (!(next as LooseBoardData).extensions?.project) checkpoint.project.derived = true;
        writer.checkpointBytes = JSON.stringify(checkpoint).length;
        writer.patchBytes = 0;
        result = { ...common, checkpoint };
    } else {
        result = { ...common, patch: diffProjectState(checkpointOf(writer.state), checkpointOf(next)) };
        writer.patchBytes += JSON.stringify(result).length;
    }
    writer.state = next;
    return result;
}

/** v1 event → runtime. Attachments must already be references. */
export function eventFromFile(raw: Rec): Rec {
    const { checkpoint, task, ...event } = raw;
    if (checkpoint) return { ...event, snapshot: fromProjectFile(checkpoint as ProjectCheckpoint) };
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
    const lastNumber = input.events.reduce((highest, event) => Math.max(highest, (event.snapshot as { extensions?: { projectControl?: { lastNumber?: number } } } | undefined)?.extensions?.projectControl?.lastNumber || 0), data.extensions.projectControl?.lastNumber || 0);
    if (data.extensions.projectControl) data.extensions.projectControl.lastNumber = lastNumber;
    const projectId = data.extensions.project!.id;
    const writer = createHistoryWriter(undefined);
    const events = input.events.map((event) => eventToFile(event, writer));
    const baselineEventId = input.events[0]?.id || '';
    data.extensions.projectStorage = { version: 1, baselineEventId, ...(projectStorage?.legacyFileName ? { legacyFileName: projectStorage.legacyFileName } : {}), convertedFromHash: input.projectHash, checkpointBytes: writer.checkpointBytes, patchBytes: writer.patchBytes };
    for (const record of data.extensions.projectControl?.records || []) record.history = [];
    for (const operation of data.extensions.projectTransfers?.operations || []) operation.history = [];
    const project = attachmentsToHashes(toProjectFile(data));
    return { project, projectText: JSON.stringify(project, null, 2), historyText: serializeHistoryFile(projectId, baselineEventId, events, input.archives), data };
}
