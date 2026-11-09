import type { BoardData, TimelineExtension } from '@/domain/types';
import type { BoardFileHandle, ProjectDirectoryHandle } from '@/infrastructure/browser/types';
import { parseAttachmentReference } from '@/domain/attachmentReferences';
import { isNormalizedTimeline, rememberNormalizedTimeline, normalizeTimelineExtension, normalizeTimelineEvent } from '@/domain/timelineSchema';
import { validateBoardData } from '@/domain/board';
import { serializeBoardDataFromObject, hashTextContent } from '@/domain/serialize';
import { cloneSerializable } from '@/domain/serializable';
import { controlRecords } from '@/domain/projectControl';
import { formatErrorMessage, isRecord } from '@/domain/util';
import { attachmentsFromHashes, attachmentsToHashes, fromProjectFile, isLegacyProjectFile, isProjectFileV1, toProjectFile, type ProjectStorageMetadata } from '@/domain/projectFormat';
import { archivesFromRecordHistory, archivesToRecordHistory, convertLegacyProject, createHistoryWriter, eventFromFile, eventToFile, isHistoryFileV1, isLegacyHistoryFile, serializeHistoryFile, type Archives } from '@/domain/projectHistoryFormat';

type RawEvent = Record<string, unknown> & { id: string };
type HistoryStage = { kind: 'stage'; id: string; projectHash: string; events: RawEvent[]; archives: Archives };
type DirectoryProject = {
    directory: ProjectDirectoryHandle;
    history: BoardFileHandle;
    attachments: ProjectDirectoryHandle;
    projectId: string;
    legacyFileName?: string;
    projectHash?: string;
    baselineEventId: string;
    historyTransactionId?: string;
    checkpointBytes: number;
    patchBytes: number;
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
async function writeText(handle: BoardFileHandle, text: string) {
    const stream = await handle.createWritable();
    await stream.write(text);
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
        let projectText = await (await handle.getFile()).text();
        let raw: unknown = JSON.parse(projectText);
        if (isLegacyProjectFile(raw)) {
            projectText = await convertLegacyDirectory(directory, handle, history, projectText, raw);
            raw = JSON.parse(projectText);
        }
        if (!isProjectFileV1(raw)) throw new Error('Unsupported project.json format.');
        const data = fromProjectFile(attachmentsFromHashes(raw, String(raw.project.id)));
        validateBoardData(data);
        const metadata = data.extensions.projectStorage;
        if (!metadata || typeof metadata.baselineEventId !== 'string') throw new Error('project.json has invalid storage metadata.');
        const projectId = data.extensions.project?.id;
        if (!projectId) throw new Error('project.json has no valid project identity.');
        projects.set(handle, { directory, history, attachments, projectId, ...(metadata.legacyFileName ? { legacyFileName: metadata.legacyFileName } : {}), projectHash: hashTextContent(projectText), baselineEventId: metadata.baselineEventId, historyTransactionId: metadata.historyTransactionId, checkpointBytes: metadata.checkpointBytes || 0, patchBytes: metadata.patchBytes || 0, commitKnown: false, loaded: false, sessionArchiveIds: new Set(), sessionEventIds: new Set() });
        return handle;
    } catch (error) {
        throw new Error(`${directory.name}: invalid project structure (project.json file, history.json file, attachments/ directory): ${formatErrorMessage(error)}`);
    }
}

export async function findProjectDirectories(root: ProjectDirectoryHandle): Promise<{ handles: BoardFileHandle[]; legacyHandles: BoardFileHandle[]; errors: string[] }> {
    if (root.requestPermission && await root.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error(`${root.name}: read/write permission denied.`);
    const handles: BoardFileHandle[] = []; const legacyHandles: BoardFileHandle[] = []; const errors: string[] = [];
    const entries = new Map<string, 'file' | 'directory'>();
    for await (const [name, entry] of root.entries()) entries.set(name, entry.kind);
    const candidates: ProjectDirectoryHandle[] = [];
    if (entries.has('project.json')) candidates.push(root);
    else for (const [name, kind] of entries) {
        if (kind === 'file' && /\.board\.json$/i.test(name)) {
            try { legacyHandles.push(await root.getFileHandle(name)); }
            catch (error) { errors.push(`${root.name}/${name}: ${formatErrorMessage(error)}`); }
            continue;
        }
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
    const convertedFiles = new Set(handles.map((handle) => getDirectoryProject(handle)?.legacyFileName).filter(Boolean));
    if (!candidates.length && !legacyHandles.length) errors.push(`${root.name}: no project.json found in this folder or its direct subfolders.`);
    return { handles, legacyHandles: legacyHandles.filter((handle) => !convertedFiles.has(handle.name)), errors };
}

/** Applies the journal: committed stages, plus an uncommitted stage only when project.json proves it was written. */
function mergeJournal(baseEvents: RawEvent[], baseArchives: Archives, transactions: unknown, projectHash: string, stageArchives: (entry: Record<string, unknown>) => Archives): { events: RawEvent[]; archives: Archives } {
    if (transactions !== undefined && !Array.isArray(transactions)) throw new Error('Invalid history transactions.');
    let archives = baseArchives;
    const stages: HistoryStage[] = []; const committed = new Set<string>();
    const transactionIds = new Set<string>();
    for (const entry of (transactions || []) as unknown[]) {
        if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) throw new Error('Invalid history transaction.');
        if (entry.kind === 'commit') {
            if (!transactionIds.has(entry.id)) throw new Error('History commit has no matching transaction.');
            committed.add(entry.id); continue;
        }
        if (transactionIds.has(entry.id)) throw new Error('Duplicate history transaction.');
        transactionIds.add(entry.id);
        if (entry.kind !== 'stage' || typeof entry.projectHash !== 'string' || !Array.isArray(entry.events)) throw new Error('Invalid history transaction.');
        for (const event of entry.events) if (!isRecord(event) || typeof event.id !== 'string') throw new Error('Invalid history event.');
        stages.push({ kind: 'stage', id: entry.id, projectHash: entry.projectHash, events: entry.events as RawEvent[], archives: stageArchives(entry) });
    }
    const known = new Map(baseEvents.map((event) => [event.id, event]));
    if (known.size !== baseEvents.length) throw new Error('Duplicate history event.');
    for (const stage of stages) {
        if (!committed.has(stage.id) && stage.projectHash !== projectHash) continue;
        for (const event of stage.events) {
            const previous = known.get(event.id);
            if (previous && json(previous) !== json(event)) throw new Error(`Conflicting history event ${event.id}.`);
            known.set(event.id, event);
        }
        archives = mergeArchives(archives, stage.archives);
    }
    return { events: [...known.values()], archives };
}

async function readHistory(handle: BoardFileHandle, storage: DirectoryProject): Promise<TimelineExtension> {
    try {
        const raw: unknown = JSON.parse(await (await storage.history.getFile()).text());
        if (!isHistoryFileV1(raw)) throw new Error('Unsupported history format.');
        if (raw.projectId !== storage.projectId) throw new Error('History belongs to a different project.');
        const projectHash = hashTextContent(await (await handle.getFile()).text());
        const merged = mergeJournal(raw.events as RawEvent[], archivesFromRecordHistory(raw.recordHistory), raw.transactions, projectHash, (entry) => archivesFromRecordHistory(entry.recordHistory));
        const timeline = normalizeTimelineExtension({ version: 1, baselineEventId: merged.events[0]?.id || '', events: merged.events.map((event) => eventFromFile(attachmentsFromHashes(event, storage.projectId))) });
        if (!timeline || (timeline.events.length && timeline.events[0].kind !== 'board.baseline')) throw new Error('Invalid timeline.');
        if (storage.baselineEventId && timeline.baselineEventId !== storage.baselineEventId) throw new Error('History baseline does not match project.json.');
        storage.archives = attachmentsFromHashes(merged.archives, storage.projectId);
        return timeline;
    } catch (error) { throw new Error(`${storage.directory.name}/history.json: ${formatErrorMessage(error)}`); }
}

const BACKUP_FOLDER = ['backup', 'schema-6'] as const;
async function backupDirectory(directory: ProjectDirectoryHandle, create: boolean): Promise<ProjectDirectoryHandle | null> {
    try {
        let current = directory;
        for (const name of BACKUP_FOLDER) current = await current.getDirectoryHandle(name, { create });
        return current;
    } catch (error) {
        if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null;
        throw error;
    }
}
const readText = async (handle: BoardFileHandle) => (await handle.getFile()).text();

/** The single conversion of a project folder. project.json is written last, so a
 * legacy project.json always means the conversion can restart from the backup. */
async function convertLegacyDirectory(directory: ProjectDirectoryHandle, handle: BoardFileHandle, history: BoardFileHandle, projectText: string, rawProject: unknown): Promise<string> {
    validateBoardData(rawProject);
    let historyText = await readText(history);
    let rawHistory: unknown;
    try { rawHistory = JSON.parse(historyText); } catch (error) { throw new Error(`history.json: ${formatErrorMessage(error)}`); }
    if (isHistoryFileV1(rawHistory)) {
        // An earlier conversion stopped between the two writes.
        const backup = await backupDirectory(directory, false);
        if (!backup) throw new Error('history.json: already converted but no backup exists; the folder is inconsistent.');
        historyText = await readText(await backup.getFileHandle('history.json'));
        rawHistory = JSON.parse(historyText);
    }
    if (!isLegacyHistoryFile(rawHistory)) throw new Error('history.json: unsupported history format.');
    const legacy = rawHistory as { timeline: unknown; archives?: unknown; transactions?: unknown };
    const projectId = (rawProject as BoardData).extensions.project?.id;
    if (!projectId) throw new Error('project.json has no valid project identity.');
    validateStoredReferences(rawProject, projectId);
    validateStoredReferences(rawHistory, projectId);
    const parseLegacyArchives = (value: unknown): Archives => Object.fromEntries(Object.entries(isRecord(value) ? value : {}).map(([key, entry]) => {
        if (!isRecord(entry) || !Array.isArray(entry.history)) throw new Error('history.json: invalid record history.');
        return [key, { history: entry.history as { id: string }[] }];
    }));
    const base = normalizeTimelineExtension(legacy.timeline);
    if (!base) throw new Error('history.json: invalid timeline.');
    const merged = mergeJournal(base.events as unknown as RawEvent[], parseLegacyArchives(legacy.archives), legacy.transactions, hashTextContent(projectText), (entry) => parseLegacyArchives(entry.archives));
    const events = merged.events.map((event) => normalizeTimelineEvent(event));
    if (events.some((event) => !event)) throw new Error('history.json: invalid event.');
    const converted = convertLegacyProject({ project: rawProject as BoardData, events: events as TimelineExtension['events'], archives: merged.archives, projectHash: hashTextContent(projectText) });
    const backup = (await backupDirectory(directory, true))!;
    for (const [name, text] of [['project.json', projectText], ['history.json', historyText]] as const) {
        const target = await backup.getFileHandle(name, { create: true });
        await writeText(target, text);
        if (await readText(target) !== text) throw new Error(`backup/${name}: verification failed.`);
    }
    await writeText(history, converted.historyText);
    await writeText(handle, converted.projectText);
    if (await readText(handle) !== converted.projectText || await readText(history) !== converted.historyText) throw new Error('Project conversion could not be verified.');
    return converted.projectText;
}

/** Append valid JSON by replacing only the closing array/object bytes. No full-history read. */
async function appendHistory(storage: DirectoryProject, entry: Record<string, unknown>): Promise<void> {
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
    for (const [key, archive] of Object.entries(storage.archives || {})) for (const entry of archive.history) storage.sessionArchiveIds.add(`${key}:${entry.id}`);
    // The caller marks history loaded only after validating the combined board.
    return cloneSerializable(timeline);
}
export function attachDirectoryHistory(handle: BoardFileHandle, data: BoardData): BoardData {
    const storage = projects.get(handle);
    if (storage) {
        const timeline = storage.loaded ? storage.timeline : storage.buffer;
        if (timeline) data.extensions.timeline = rememberNormalizedTimeline({ ...timeline, events: timeline.events.slice() });
        attachHistoryArchives(data, storage.loaded ? storage.archives : storage.bufferArchives);
    }
    return data;
}
export function mergeDirectoryTimeline(persisted: TimelineExtension, local: TimelineExtension | undefined, loaded: boolean): TimelineExtension {
    const result = { ...persisted, events: persisted.events.slice() };
    const ids = new Set(result.events.map((event) => event.id));
    for (const event of local?.events || []) {
        // An unopened project seeds a local checkpoint for ordinary commands.
        // Existing history already has its own canonical baseline.
        if (!loaded && event.kind === 'board.baseline' && result.events.length) continue;
        if (!ids.has(event.id)) { result.events.push(cloneSerializable(event)); ids.add(event.id); }
    }
    result.baselineEventId = result.events[0]?.id || '';
    if (isNormalizedTimeline(persisted) && (!local || isNormalizedTimeline(local))) rememberNormalizedTimeline(result);
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
                return `teamos-attachment:${encodeURIComponent(storage.projectId)}/${digest}`;
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
    // Persisted event payloads already contain canonical attachment references.
    // Only traverse current state and new events, regardless of history size.
    const { timeline: inputTimeline, ...extensions } = input.extensions;
    const data = await externalize({ ...input, extensions }, storage) as BoardData;
    const incomingArchives = detachHistoryArchives(data);
    const deltaArchives: Archives = {};
    for (const [key, entry] of Object.entries(incomingArchives)) {
        const history = entry.history.filter((item) => !storage.sessionArchiveIds.has(`${key}:${item.id}`));
        if (history.length) deltaArchives[key] = { history };
    }
    let local: TimelineExtension | undefined;
    if (inputTimeline) {
        const events: TimelineExtension['events'] = [];
        for (const event of inputTimeline.events) events.push(storage.sessionEventIds.has(event.id)
            ? event : await externalize(event, storage) as typeof event);
        local = rememberNormalizedTimeline({ ...inputTimeline, events });
    }
    const newEvents = (local?.events || []).filter((event) => !storage.sessionEventIds.has(event.id) && !(event.kind === 'board.baseline' && storage.baselineEventId));
    const changed = newEvents.length > 0 || Object.keys(deltaArchives).length > 0;
    const transactionId = changed ? crypto.randomUUID() : storage.historyTransactionId;
    const baselineEventId = storage.baselineEventId || local?.baselineEventId || '';
    delete data.extensions.timeline;
    const diskText = newEvents.length ? await readText(handle) : '';
    const diskFile: unknown = diskText ? JSON.parse(diskText) : undefined;
    // Patches diff against the state of the last write, then follow each new event.
    const writer = createHistoryWriter(isProjectFileV1(diskFile) ? fromProjectFile(attachmentsFromHashes(diskFile, storage.projectId)) : undefined, storage);
    const eventsOnDisk = newEvents.map((event) => attachmentsToHashes(eventToFile(event, writer)));
    const convertedFromHash = isRecord(input.extensions.projectStorage) ? (input.extensions.projectStorage as ProjectStorageMetadata).convertedFromHash : undefined;
    data.extensions.projectStorage = { version: 1, baselineEventId, ...(storage.legacyFileName ? { legacyFileName: storage.legacyFileName } : {}), ...(transactionId ? { historyTransactionId: transactionId } : {}), ...(convertedFromHash ? { convertedFromHash } : {}), checkpointBytes: writer.checkpointBytes, patchBytes: writer.patchBytes };
    const text = json(attachmentsToHashes(toProjectFile(data)));
    const checkProject = async () => {
        if (expectedProjectHash && hashTextContent(await (await handle.getFile()).text()) !== expectedProjectHash) throw new Error(`${storage.directory.name}/project.json changed during save. Retry to reconcile changes.`);
    };
    await checkProject();
    await finishHistoryCommit(storage);
    if (changed) await appendHistory(storage, { kind: 'stage', id: transactionId!, projectHash: hashTextContent(text), events: eventsOnDisk, recordHistory: attachmentsToHashes(archivesToRecordHistory(deltaArchives)) });
    await checkProject();
    const stream = await handle.createWritable(); await stream.write(text); await stream.close();
    storage.projectHash = hashTextContent(text);
    storage.historyTransactionId = transactionId;
    storage.commitKnown = !changed;
    if (changed) await finishHistoryCommit(storage);
    storage.baselineEventId = baselineEventId;
    storage.checkpointBytes = writer.checkpointBytes; storage.patchBytes = writer.patchBytes;
    for (const event of local?.events || []) storage.sessionEventIds.add(event.id);
    for (const [key, entry] of Object.entries(incomingArchives)) for (const item of entry.history) storage.sessionArchiveIds.add(`${key}:${item.id}`);
    storage.buffer = local; storage.bufferArchives = incomingArchives;
    if (storage.loaded) {
        storage.timeline = mergeDirectoryTimeline(storage.timeline || emptyTimeline(), local, true);
        storage.archives = mergeArchives(storage.archives || {}, incomingArchives);
    }
    attachHistoryArchives(data, storage.loaded ? storage.archives : incomingArchives);
    if (storage.loaded && storage.timeline) data.extensions.timeline = rememberNormalizedTimeline({ ...storage.timeline, events: storage.timeline.events.slice() });
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
    const storage: DirectoryProject = { directory, history, attachments, projectId, baselineEventId: '', checkpointBytes: 0, patchBytes: 0, commitKnown: true, loaded: true, timeline: emptyTimeline(), sessionArchiveIds: new Set(), sessionEventIds: new Set() };
    if (data.extensions.projectStorage?.legacyFileName) storage.legacyFileName = data.extensions.projectStorage.legacyFileName;
    projects.set(handle, storage);
    if (!attachmentDirectories.has(projectId)) attachmentDirectories.set(projectId, attachments);
    const separated = await externalize(data, storage) as BoardData;
    const archives = detachHistoryArchives(separated);
    const timeline = separated.extensions.timeline || emptyTimeline();
    storage.timeline = timeline; storage.archives = archives; storage.baselineEventId = timeline.baselineEventId;
    for (const event of timeline.events) storage.sessionEventIds.add(event.id);
    for (const [key, archive] of Object.entries(archives)) for (const entry of archive.history) storage.sessionArchiveIds.add(`${key}:${entry.id}`);
    delete separated.extensions.timeline;
    const writer = createHistoryWriter(undefined);
    const historyEvents = timeline.events.map((event) => eventToFile(event, writer));
    storage.checkpointBytes = writer.checkpointBytes; storage.patchBytes = writer.patchBytes;
    separated.extensions.projectStorage = { version: 1, baselineEventId: timeline.baselineEventId, ...(storage.legacyFileName ? { legacyFileName: storage.legacyFileName } : {}), checkpointBytes: writer.checkpointBytes, patchBytes: writer.patchBytes };
    await writeText(history, serializeHistoryFile(projectId, timeline.baselineEventId, historyEvents, archives));
    const projectText = json(attachmentsToHashes(toProjectFile(separated)));
    await writeText(handle, projectText); storage.projectHash = hashTextContent(projectText);
    return handle;
}

function mergeArchives(persisted: Archives, incoming: Archives): Archives {
    const result = cloneSerializable(persisted);
    for (const [key, entry] of Object.entries(incoming)) {
        const existing = result[key];
        const merge = (before: { id: string }[] = [], after: { id: string }[] = []) => [...new Map([...before, ...after].map((item) => [item.id, item])).values()];
        result[key] = { history: merge(existing?.history, entry.history) };
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
        archives[`transfer:${operation.id}`] = { history: operation.history };
        operation.history = [];
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
        storage.historyTransactionId = data.extensions.projectStorage?.historyTransactionId;
        storage.checkpointBytes = data.extensions.projectStorage?.checkpointBytes || 0;
        storage.patchBytes = data.extensions.projectStorage?.patchBytes || 0;
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
