import type { BoardData, TimelineExtension } from '@/domain/types';
import type { BoardFileHandle, ProjectDirectoryHandle } from '@/infrastructure/browser/types';
import { parseAttachmentReference } from '@/domain/attachmentReferences';
import { normalizeTimelineExtension, normalizeTimelineEvent } from '@/domain/timelineSchema';
import { validateBoardData } from '@/domain/board';
import { serializeBoardDataFromObject, hashTextContent } from '@/domain/serialize';
import { cloneSerializable } from '@/domain/serializable';
import { controlRecords } from '@/domain/projectControl';
import { formatErrorMessage, isRecord } from '@/domain/util';

type Archives = Record<string, { history: { id: string }[]; originalEvents?: { id: string }[] }>;
type HistoryStage = { kind: 'stage'; id: string; projectHash: string; events: TimelineExtension['events']; archives: Archives; baselineEventId: string };
type HistoryCommit = { kind: 'commit'; id: string };
type HistoryEntry = HistoryStage | HistoryCommit;
type DirectoryProject = {
    directory: ProjectDirectoryHandle;
    history: BoardFileHandle;
    attachments: ProjectDirectoryHandle;
    projectId: string;
    projectHash?: string;
    baselineEventId: string;
    historyTransactionId?: string;
    commitKnown: boolean;
    loaded: boolean;
    archives?: Archives;
    bufferArchives?: Archives;
    sessionArchiveIds: Set<string>;
    timeline?: TimelineExtension;
    buffer?: TimelineExtension;
    // IDs imported/created in this session, including events already persisted.
    sessionEventIds: Set<string>;
};
const projects = new WeakMap<BoardFileHandle, DirectoryProject>();
const attachmentDirectories = new Map<string, ProjectDirectoryHandle>();
const emptyTimeline = (): TimelineExtension => ({ version: 1, baselineEventId: '', events: [] });
const json = (value: unknown) => JSON.stringify(value, null, 2);
async function write(handle: BoardFileHandle, value: unknown) {
    const stream = await handle.createWritable();
    await stream.write(json(value));
    await stream.close();
}
export function getDirectoryProject(handle: BoardFileHandle | null | undefined) {
    return handle ? projects.get(handle) : undefined;
}

/** Structural validation opens handles only; history and binary contents remain unread. */
export async function openProjectDirectory(directory: ProjectDirectoryHandle): Promise<BoardFileHandle> {
    try {
        const required = async <T>(name: string, operation: () => Promise<T>) => {
            try { return await operation(); } catch (error) { throw new Error(`${name}: ${formatErrorMessage(error)}`); }
        };
        const handle = await required('project.json', () => directory.getFileHandle('project.json'));
        const history = await required('history.json', () => directory.getFileHandle('history.json'));
        const attachments = await required('attachments/', () => directory.getDirectoryHandle('attachments'));
        const projectText = await (await handle.getFile()).text();
        const data: unknown = JSON.parse(projectText);
        if (!isRecord(data) || !isRecord(data.extensions) || data.extensions.timeline !== undefined) throw new Error('project.json must contain current state without a timeline.');
        validateBoardData(data);
        const storageMetadata = data.extensions.projectStorage;
        if (!isRecord(storageMetadata) || storageMetadata.version !== 1 || typeof storageMetadata.baselineEventId !== 'string' || (storageMetadata.historyTransactionId !== undefined && (typeof storageMetadata.historyTransactionId !== 'string' || !storageMetadata.historyTransactionId))) throw new Error('project.json has invalid projectStorage metadata.');
        for (const record of controlRecords(data as BoardData)) if (record.history.length) throw new Error('Project Control history belongs in history.json.');
        for (const operation of (data as BoardData).extensions.projectTransfers?.operations || []) if (operation.history.length || operation.originalEvents.length) throw new Error('Transfer history belongs in history.json.');
        const projectId = (data as BoardData).extensions.project?.id;
        if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error('project.json has no valid project identity.');
        validateStoredReferences(data, projectId);
        const metadata = isRecord(data.extensions.projectStorage) ? data.extensions.projectStorage : {};
        projects.set(handle, { directory, history, attachments, projectId, projectHash: hashTextContent(projectText), baselineEventId: typeof metadata.baselineEventId === 'string' ? metadata.baselineEventId : '', historyTransactionId: typeof metadata.historyTransactionId === 'string' ? metadata.historyTransactionId : undefined, commitKnown: false, loaded: false, sessionArchiveIds: new Set(), sessionEventIds: new Set() });
        return handle;
    } catch (error) {
        throw new Error(`${directory.name}: invalid project structure (project.json file, history.json file, attachments/ directory): ${formatErrorMessage(error)}`);
    }
}

export async function findProjectDirectories(root: ProjectDirectoryHandle): Promise<{ handles: BoardFileHandle[]; errors: string[] }> {
    if (root.requestPermission && await root.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error(`${root.name}: read/write permission denied.`);
    const handles: BoardFileHandle[] = []; const errors: string[] = [];
    const entries = new Map<string, 'file' | 'directory'>();
    for await (const [name, entry] of root.entries()) entries.set(name, entry.kind);
    const candidates: ProjectDirectoryHandle[] = [];
    if (entries.has('project.json')) candidates.push(root);
    else for (const [name, kind] of entries) {
        if (kind !== 'directory') continue;
        try {
            const directory = await root.getDirectoryHandle(name);
            for await (const [child] of directory.entries()) {
                if (child === 'project.json') { candidates.push(directory); break; }
            }
        } catch (error) { errors.push(`${root.name}/${name}: ${formatErrorMessage(error)}`); }
    }
    for (const directory of candidates) {
        try { handles.push(await openProjectDirectory(directory)); }
        catch (error) { errors.push(formatErrorMessage(error)); }
    }
    if (!candidates.length) errors.push(`${root.name}: no project.json found in this folder or its direct subfolders.`);
    return { handles, errors };
}

function parseArchives(value: unknown): Archives {
    if (value === undefined) return {};
    if (!isRecord(value) || Object.values(value).some((entry) => !isRecord(entry) || !Array.isArray(entry.history) || entry.history.some((item) => !isRecord(item) || typeof item.id !== 'string') || (entry.originalEvents !== undefined && (!Array.isArray(entry.originalEvents) || entry.originalEvents.some((item) => !isRecord(item) || typeof item.id !== 'string'))))) throw new Error('Invalid record history.');
    return value as Archives;
}
async function readHistory(handle: BoardFileHandle, storage: DirectoryProject): Promise<TimelineExtension> {
    try {
        const raw: unknown = JSON.parse(await (await storage.history.getFile()).text());
        if (!isRecord(raw) || raw.version !== 1) throw new Error('Unsupported history format.');
        validateStoredReferences(raw, storage.projectId);
        const timeline = normalizeTimelineExtension(raw.timeline);
        if (!timeline || (timeline.events.length && (timeline.events[0].kind !== 'board.baseline' || timeline.baselineEventId !== timeline.events[0].id))) throw new Error('Invalid timeline.');
        const projectHash = hashTextContent(await (await handle.getFile()).text());
        let archives = parseArchives(raw.archives);
        if (raw.transactions !== undefined && !Array.isArray(raw.transactions)) throw new Error('Invalid history transactions.');
        const stages: HistoryStage[] = []; const committed = new Set<string>();
        const transactionIds = new Set<string>();
        for (const entry of raw.transactions || []) {
            if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) throw new Error('Invalid history transaction.');
            if (entry.kind === 'commit') {
                if (!transactionIds.has(entry.id)) throw new Error('History commit has no matching transaction.');
                committed.add(entry.id); continue;
            }
            if (transactionIds.has(entry.id)) throw new Error('Duplicate history transaction.');
            transactionIds.add(entry.id);
            if (entry.kind !== 'stage' || typeof entry.projectHash !== 'string' || typeof entry.baselineEventId !== 'string' || !Array.isArray(entry.events)) throw new Error('Invalid history transaction.');
            const events = entry.events.map((event: unknown) => { const parsed = normalizeTimelineEvent(event); if (!parsed) throw new Error('Invalid history event.'); return parsed; });
            stages.push({ kind: 'stage', id: entry.id, projectHash: entry.projectHash, baselineEventId: entry.baselineEventId, events, archives: parseArchives(entry.archives) });
        }
        const known = new Map(timeline.events.map((event) => [event.id, event]));
        if (known.size !== timeline.events.length) throw new Error('Duplicate history event.');
        for (const stage of stages) {
            if (!committed.has(stage.id) && stage.projectHash !== projectHash) continue;
            for (const event of stage.events) {
                const previous = known.get(event.id);
                if (previous && json(previous) !== json(event)) throw new Error(`Conflicting history event ${event.id}.`);
                known.set(event.id, event);
            }
            archives = mergeArchives(archives, stage.archives);
        }
        timeline.events = [...known.values()]; timeline.baselineEventId = timeline.events[0]?.id || '';
        if (timeline.events.length && timeline.events[0].kind !== 'board.baseline') throw new Error('Timeline baseline is missing.');
        if (storage.baselineEventId && timeline.baselineEventId !== storage.baselineEventId) throw new Error('History baseline does not match project.json.');
        storage.archives = archives;
        return timeline;
    } catch (error) { throw new Error(`${storage.directory.name}/history.json: ${formatErrorMessage(error)}`); }
}

/** Append valid JSON by replacing only the closing array/object bytes. No full-history read. */
async function appendHistory(storage: DirectoryProject, entry: HistoryEntry): Promise<void> {
    const file = await storage.history.getFile();
    if (!file.slice || file.size === undefined) throw new Error('This browser cannot append project history.');
    const tail = await file.slice(Math.max(0, file.size - 32)).text();
    const ending = /\]\s*}\s*$/.exec(tail);
    if (!ending) throw new Error(`${storage.directory.name}/history.json: invalid journal ending.`);
    const offset = file.size - new Blob([tail.slice(ending.index)]).size;
    const suffix = `${tail.slice(0, ending.index).trimEnd().endsWith('[') ? '' : ','}\n${JSON.stringify(entry)}\n]}\n`;
    const stream = await storage.history.createWritable({ keepExistingData: true });
    if (!stream.seek || !stream.truncate) { await stream.close(); throw new Error('This browser cannot append project history.'); }
    await stream.seek(offset); await stream.write(suffix);
    await stream.truncate(offset + new Blob([suffix]).size); await stream.close();
}
async function finishHistoryCommit(storage: DirectoryProject): Promise<void> {
    if (!storage.historyTransactionId || storage.commitKnown) return;
    // A successful project write whose final commit marker failed is still
    // identifiable after reopening, using only the small end of history.json.
    const file = await storage.history.getFile();
    if (!file.slice) throw new Error('This browser cannot read the history journal.');
    const tail = await file.slice(Math.max(0, (file.size || 0) - 256)).text();
    const expected = JSON.stringify({ kind: 'commit', id: storage.historyTransactionId });
    if (!tail.endsWith(`${expected}\n]}\n`)) await appendHistory(storage, { kind: 'commit', id: storage.historyTransactionId });
    storage.commitKnown = true;
}

/** Only history consumers call this. New local events merge without replacing older events. */
export async function loadDirectoryHistory(handle: BoardFileHandle): Promise<TimelineExtension | undefined> {
    const storage = projects.get(handle);
    if (!storage) return undefined;
    const timeline = await readHistory(handle, storage);
    storage.timeline = timeline;
    for (const event of timeline.events) storage.sessionEventIds.add(event.id);
    for (const [key, archive] of Object.entries(storage.archives || {})) for (const entry of [...archive.history, ...(archive.originalEvents || [])]) storage.sessionArchiveIds.add(`${key}:${entry.id}`);
    // The caller marks history loaded only after validating the combined board.
    return cloneSerializable(timeline);
}
export function attachDirectoryHistory(handle: BoardFileHandle, data: BoardData): BoardData {
    const storage = projects.get(handle);
    if (storage) {
        const timeline = storage.loaded ? storage.timeline : storage.buffer;
        if (timeline) data.extensions.timeline = cloneSerializable(timeline);
        attachHistoryArchives(data, storage.loaded ? storage.archives : storage.bufferArchives);
    }
    return data;
}
export function mergeDirectoryTimeline(persisted: TimelineExtension, local: TimelineExtension | undefined, loaded: boolean): TimelineExtension {
    const result = cloneSerializable(persisted);
    const ids = new Set(result.events.map((event) => event.id));
    for (const event of local?.events || []) {
        // An unopened project seeds a local checkpoint for ordinary commands.
        // Existing history already has its own canonical baseline.
        if (!loaded && event.kind === 'board.baseline' && result.events.length) continue;
        if (!ids.has(event.id)) { result.events.push(cloneSerializable(event)); ids.add(event.id); }
    }
    result.baselineEventId = result.events[0]?.id || '';
    return result;
}

export async function resolveAttachmentBlob(reference: string): Promise<Blob> {
    const parsed = parseAttachmentReference(reference);
    if (!parsed) {
        if (!reference.startsWith('data:')) throw new Error('Invalid attachment reference.');
        return await (await fetch(reference)).blob();
    }
    const directory = attachmentDirectories.get(parsed.projectId);
    if (!directory) throw new Error(`Attachment project ${parsed.projectId} is not open. Open its folder first.`);
    try {
        const file = await (await directory.getFileHandle(parsed.fileName)).getFile();
        if (!file.arrayBuffer) throw new Error('Attachment is not readable.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== parsed.fileName) throw new Error('Attachment content does not match its reference.');
        return new Blob([bytes]);
    } catch (error) { throw new Error(`attachments/${parsed.fileName}: ${formatErrorMessage(error)}`); }
}

/** Extract every attachment, including snapshots, changes, comments and transfer receipts. */
async function externalize(value: unknown, storage: DirectoryProject, seen = new Map<string, Promise<string>>()): Promise<unknown> {
    if (Array.isArray(value)) {
        const result: unknown[] = [];
        for (const entry of value) result.push(await externalize(entry, storage, seen));
        return result;
    }
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
        if (key !== 'dataUrl' || typeof child !== 'string') { result[key] = await externalize(child, storage, seen); continue; }
        const reference = parseAttachmentReference(child);
        if (reference?.projectId === storage.projectId) { result[key] = child; continue; }
        let next = seen.get(child);
        if (!next) {
            next = (async () => {
                const blob = await resolveAttachmentBlob(child);
                const bytes = new Uint8Array(await blob.arrayBuffer());
                const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
                let exists = false;
                try { await storage.attachments.getFileHandle(digest); exists = true; }
                catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
                if (!exists) {
                    const stream = await (await storage.attachments.getFileHandle(digest, { create: true })).createWritable();
                    await stream.write(bytes); await stream.close();
                }
                return `teamos-attachment:${storage.projectId}/${digest}`;
            })();
            seen.set(child, next);
        }
        result[key] = await next;
    }
    return result;
}

export async function writeDirectoryProject(handle: BoardFileHandle, input: BoardData): Promise<{ text: string; data: BoardData }> {
    const storage = projects.get(handle)!;
    const expectedProjectHash = storage.projectHash;
    const data = await externalize(input, storage) as BoardData;
    const incomingArchives = detachHistoryArchives(data);
    const deltaArchives: Archives = {};
    for (const [key, entry] of Object.entries(incomingArchives)) {
        const history = entry.history.filter((item) => !storage.sessionArchiveIds.has(`${key}:${item.id}`));
        const originalEvents = entry.originalEvents?.filter((item) => !storage.sessionArchiveIds.has(`${key}:${item.id}`));
        if (history.length || originalEvents?.length) deltaArchives[key] = { history, ...(originalEvents ? { originalEvents } : {}) };
    }
    const local = data.extensions.timeline;
    const newEvents = (local?.events || []).filter((event) => !storage.sessionEventIds.has(event.id) && !(event.kind === 'board.baseline' && storage.baselineEventId));
    const changed = newEvents.length > 0 || Object.keys(deltaArchives).length > 0;
    const transactionId = changed ? crypto.randomUUID() : storage.historyTransactionId;
    const baselineEventId = storage.baselineEventId || local?.baselineEventId || '';
    delete data.extensions.timeline;
    data.extensions.projectStorage = { version: 1, baselineEventId, ...(transactionId ? { historyTransactionId: transactionId } : {}) };
    const text = json(data);
    const checkProject = async () => {
        if (expectedProjectHash && hashTextContent(await (await handle.getFile()).text()) !== expectedProjectHash) throw new Error(`${storage.directory.name}/project.json changed during save. Retry to reconcile changes.`);
    };
    await checkProject();
    await finishHistoryCommit(storage);
    if (changed) await appendHistory(storage, { kind: 'stage', id: transactionId!, projectHash: hashTextContent(text), baselineEventId, events: newEvents, archives: deltaArchives });
    await checkProject();
    const stream = await handle.createWritable(); await stream.write(text); await stream.close();
    storage.projectHash = hashTextContent(text);
    storage.historyTransactionId = transactionId;
    storage.commitKnown = !changed;
    if (changed) await finishHistoryCommit(storage);
    storage.baselineEventId = baselineEventId;
    for (const event of local?.events || []) storage.sessionEventIds.add(event.id);
    for (const [key, entry] of Object.entries(incomingArchives)) for (const item of [...entry.history, ...(entry.originalEvents || [])]) storage.sessionArchiveIds.add(`${key}:${item.id}`);
    storage.buffer = local; storage.bufferArchives = incomingArchives;
    if (storage.loaded) {
        storage.timeline = mergeDirectoryTimeline(storage.timeline || emptyTimeline(), local, true);
        storage.archives = mergeArchives(storage.archives || {}, incomingArchives);
    }
    attachHistoryArchives(data, storage.loaded ? storage.archives : incomingArchives);
    if (storage.loaded) data.extensions.timeline = cloneSerializable(storage.timeline);
    else if (local) data.extensions.timeline = local;
    return { text, data };
}

export class ProjectFolderExistsError extends Error {}
async function createProjectDirectoryUnlocked(parent: ProjectDirectoryHandle, name: string, input: BoardData): Promise<BoardFileHandle> {
    if (!name.trim() || /[\\/<>:"|?*]/.test(name) || name === '.' || name === '..' || /[. ]$/.test(name)) throw new Error('Invalid project folder name.');
    if (parent.requestPermission && await parent.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error(`${parent.name}: read/write permission denied.`);
    for await (const [entry] of parent.entries()) if (entry.toLocaleLowerCase() === name.toLocaleLowerCase()) throw new ProjectFolderExistsError(`${name}: this folder already exists. Choose another name.`);
    const directory = await parent.getDirectoryHandle(name, { create: true });
    for await (const _entry of directory.entries()) { void _entry; throw new ProjectFolderExistsError(`${name}: this folder already exists. Choose another name.`); }
    const handle = await directory.getFileHandle('project.json', { create: true });
    const history = await directory.getFileHandle('history.json', { create: true });
    const attachments = await directory.getDirectoryHandle('attachments', { create: true });
    const data = serializeBoardDataFromObject(input);
    const projectId = data.extensions.project!.id;
    const storage: DirectoryProject = { directory, history, attachments, projectId, baselineEventId: '', commitKnown: true, loaded: true, timeline: emptyTimeline(), sessionArchiveIds: new Set(), sessionEventIds: new Set() };
    projects.set(handle, storage);
    if (!attachmentDirectories.has(projectId)) attachmentDirectories.set(projectId, attachments);
    const separated = await externalize(data, storage) as BoardData;
    const archives = detachHistoryArchives(separated);
    const timeline = separated.extensions.timeline || emptyTimeline();
    storage.timeline = timeline; storage.archives = archives; storage.baselineEventId = timeline.baselineEventId;
    for (const event of timeline.events) storage.sessionEventIds.add(event.id);
    for (const [key, archive] of Object.entries(archives)) for (const entry of [...archive.history, ...(archive.originalEvents || [])]) storage.sessionArchiveIds.add(`${key}:${entry.id}`);
    delete separated.extensions.timeline;
    separated.extensions.projectStorage = { version: 1, baselineEventId: timeline.baselineEventId };
    const header = json({ version: 1, timeline, archives });
    const historyStream = await history.createWritable();
    await historyStream.write(`${header.slice(0, -2)},\n  "transactions": [\n]}\n`); await historyStream.close();
    await write(handle, separated); storage.projectHash = hashTextContent(json(separated));
    return handle;
}

function mergeArchives(persisted: Archives, incoming: Archives): Archives {
    const result = cloneSerializable(persisted);
    for (const [key, entry] of Object.entries(incoming)) {
        const existing = result[key];
        const merge = (before: { id: string }[] = [], after: { id: string }[] = []) => [...new Map([...before, ...after].map((item) => [item.id, item])).values()];
        result[key] = { history: merge(existing?.history, entry.history), ...(entry.originalEvents ? { originalEvents: merge(existing?.originalEvents, entry.originalEvents) } : {}) };
    }
    return result;
}
function detachHistoryArchives(data: BoardData): Archives {
    const archives: Archives = {};
    for (const record of controlRecords(data)) {
        archives[`control:${record.id}`] = { history: record.history };
        record.history = [];
    }
    for (const operation of data.extensions.projectTransfers?.operations || []) {
        archives[`transfer:${operation.id}`] = { history: operation.history, originalEvents: operation.originalEvents };
        operation.history = []; operation.originalEvents = [];
    }
    return archives;
}
export function attachHistoryArchives(data: BoardData, archives: Archives = {}): void {
    for (const record of controlRecords(data)) {
        const history = archives[`control:${record.id}`]?.history;
        if (history) record.history = [...new Map([...history, ...record.history].map((entry) => [entry.id, entry])).values()] as typeof record.history;
    }
    for (const operation of data.extensions.projectTransfers?.operations || []) {
        const archive = archives[`transfer:${operation.id}`];
        if (archive) {
            operation.history = [...new Map([...archive.history, ...operation.history].map((entry) => [entry.id, entry])).values()] as typeof operation.history;
            operation.originalEvents = [...new Map([...(archive.originalEvents || []), ...operation.originalEvents].map((entry) => [entry.id, entry])).values()] as typeof operation.originalEvents;
        }
    }
}

function validateStoredReferences(value: unknown, projectId: string): void {
    if (Array.isArray(value)) { value.forEach((item) => validateStoredReferences(item, projectId)); return; }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
        if (key === 'dataUrl' && parseAttachmentReference(child)?.projectId !== projectId) throw new Error('Attachment must reference a file in this project’s attachments/ directory.');
        validateStoredReferences(child, projectId);
    }
}

export async function refreshDirectoryHistory(handle: BoardFileHandle, projectHash: string, data: BoardData): Promise<void> {
    const storage = projects.get(handle);
    if (!storage) return;
    if (storage.projectHash !== projectHash) {
        if (storage.loaded) await loadDirectoryHistory(handle);
        const metadata = data.extensions.projectStorage;
        storage.historyTransactionId = isRecord(metadata) && typeof metadata.historyTransactionId === 'string' ? metadata.historyTransactionId : undefined;
        storage.commitKnown = false;
    }
    storage.projectHash = projectHash;
}

/** Activate only records accepted into the session; ignored copies cannot redirect attachment reads. */
export function activateDirectoryProject(handle: BoardFileHandle | null): void {
    const storage = getDirectoryProject(handle);
    if (storage) attachmentDirectories.set(storage.projectId, storage.attachments);
}

export async function createProjectDirectory(parent: ProjectDirectoryHandle, name: string, input: BoardData): Promise<BoardFileHandle> {
    const create = () => createProjectDirectoryUnlocked(parent, name, input);
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`teamos:create-project:${parent.name}:${name.toLowerCase()}`, create);
    return create();
}
