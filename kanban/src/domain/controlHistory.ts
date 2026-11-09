import type { BoardData, LooseBoardData, TimelineEvent } from './types';
import type { ProjectControl } from './projectControl';
import { isRecord, normalizeTimestamp } from './util';
import type { ControlComment, ControlHistory } from './projectControl';
import { validateCommentInput } from './comments';

/** Publication evidence only. Comment bodies and record history remain canonical. */
export type ControlReferences = Record<string, { comments: string[]; history: string[] }>;

export function assertControlComment(value: unknown): asserts value is ControlComment {
    if (!isRecord(value) || !normalizeTimestamp(value.at) || !isRecord(value.author) || value.author.kind !== 'local') throw new Error('Invalid canonical Project Control comment.');
    validateCommentInput({ id: value.id as string, author: value.author.name as string, text: value.text as string, images: value.images as ControlComment['images'] });
}

export function assertControlCatalog(value: unknown): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new Error('Invalid canonical Project Control comments.');
    const ids = new Set<string>();
    for (const item of value) {
        if (!isRecord(item) || typeof item.recordId !== 'string' || !item.recordId) throw new Error('Invalid canonical Project Control identity.');
        assertControlComment(item.comment);
        const id = `${item.recordId}:${item.comment.id}`;
        if (ids.has(id)) throw new Error('Duplicate canonical Project Control comment.');
        ids.add(id);
    }
}

export function isControlReferences(value: unknown): value is ControlReferences {
    return isRecord(value) && Object.values(value).every((refs) => isRecord(refs) && Object.keys(refs).every((key) => key === 'comments' || key === 'history') && [refs.comments, refs.history].every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id) && new Set(ids).size === ids.length));
}

const records = (state: unknown) => (state as LooseBoardData | undefined)?.extensions?.projectControl as ProjectControl | undefined;

/** Preserve canonical bodies independently of the current record roster. Conversion
 * recovers older bodies from snapshots; ordinary restores retain the existing catalog. */
export function retainControlContext(target: BoardData, source: LooseBoardData, events: readonly TimelineEvent[] = []): void {
    const comments = new Map<string, { recordId: string; comment: ControlComment }>();
    const history = new Map<string, Map<string, ControlHistory>>();
    const include = (state: LooseBoardData | undefined) => {
        for (const item of state?.extensions?.controlComments as BoardData['extensions']['controlComments'] || []) comments.set(`${item.recordId}:${item.comment.id}`, item);
        const addHistory = (id: string, entries: readonly ControlHistory[]) => {
            let stored = history.get(id);
            if (!stored) { stored = new Map(); history.set(id, stored); }
            entries.forEach((entry) => stored.set(entry.id, entry));
        };
        for (const [id, entries] of Object.entries(state?.extensions?.controlRecordHistory as BoardData['extensions']['controlRecordHistory'] || {})) addHistory(id, entries);
        for (const record of records(state)?.records || []) {
            record.comments.forEach((comment) => comments.set(`${record.id}:${comment.id}`, { recordId: record.id, comment }));
            addHistory(record.id, record.history);
        }
    };
    events.forEach((event) => include(event.snapshot));
    include(source); include(target);
    if (comments.size) target.extensions.controlComments = [...comments.values()];
    if (history.size) target.extensions.controlRecordHistory = Object.fromEntries([...history].map(([id, entries]) => [id, [...entries.values()]]));
}

export function allControlReferences(state: unknown): ControlReferences {
    return Object.fromEntries((records(state)?.records || []).map((record) => [record.id, { comments: record.comments.map((comment) => comment.id), history: record.history.map((entry) => entry.id) }]));
}

export function controlReferenceDelta(before: unknown, after: unknown): ControlReferences | undefined {
    const previous = new Map(records(before)?.records.map((record) => [record.id, record]));
    const result: ControlReferences = {};
    for (const record of records(after)?.records || []) {
        const old = previous.get(record.id);
        const comments = new Set(old?.comments.map((comment) => comment.id));
        const history = new Set(old?.history.map((entry) => entry.id));
        const added = { comments: record.comments.filter((comment) => !comments.has(comment.id)).map((comment) => comment.id), history: record.history.filter((entry) => !history.has(entry.id)).map((entry) => entry.id) };
        if (added.comments.length || added.history.length) result[record.id] = added;
    }
    return Object.keys(result).length ? result : undefined;
}

export function controlReferencesThrough(events: readonly TimelineEvent[], index: number) {
    const result = new Map<string, { comments: Set<string>; history: Set<string> }>();
    const include = (id: string, refs: { comments: readonly string[]; history: readonly string[] }) => {
        let entry = result.get(id);
        if (!entry) { entry = { comments: new Set(), history: new Set() }; result.set(id, entry); }
        refs.comments.forEach((key) => entry.comments.add(key));
        refs.history.forEach((key) => entry.history.add(key));
    };
    for (let position = 0; position <= index; position++) {
        const event = events[position];
        if (event.meta?.controlRefsReset) {
            result.clear();
            for (const [id, refs] of Object.entries(event.meta.controlRefsReset)) include(id, refs);
        }
        for (const [id, refs] of Object.entries(event.meta?.controlRefs || {})) include(id, refs);
        // Unconverted in-memory events already carry exact publication evidence.
        if (!event.meta?.controlRefsReset && ['board.restored', 'board.reconciled'].includes(event.kind) && event.snapshot?.board) result.clear();
        for (const record of records(event.snapshot as BoardData)?.records || []) include(record.id, { comments: record.comments.map((comment) => comment.id), history: record.history.map((entry) => entry.id) });
    }
    return result;
}
