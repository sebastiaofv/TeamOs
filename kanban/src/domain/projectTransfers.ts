import type { BoardData, Task, TimelineEvent } from './types';
import type { TaskHistoryEntry } from './taskHistory';
import { projectTaskHistory } from './taskHistory';
import { cloneSerializable } from './serializable';
import { isRecord, nowIso } from './util';
import { createProjectIdentity, projectNameKey } from './projectData';
import { nextTaskIdForBoard } from './task';
import { createWorkitemDisplayId, reservedTaskHighWaterMark, reserveTaskIdentities } from './taskIdentity';
import { getWorkflow, statusCategory } from './workflow';
import { effectivePlanning, assertWorkitemTransfer, assertAcceptance, transferredAcceptance } from './workitems';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from './timeline';
import { conversationWorkitemKey, visibleComments, getComments, type WorkitemComment } from './comments';
import { allPermanentRelations, assertPermanentGraph, parseWorkitemReference, referenceFor, type WorkitemReference, type RelationProject, type PermanentRelation } from './permanentRelations';
import { removeTaskRelation } from './taskRelations';
import { createBoardStateSnapshot, hashTextContent } from './serialize';

export type TransferMode = 'copy' | 'move';
export type TransferMapping = { members: Record<string, string>; tags: Record<string, string> };
export type TransferRemoval = { kind: 'phases' | 'milestones' | 'sprints' | 'sprintHistory' | 'planner' | 'parent' | 'child'; id: string; title: string; date?: string; start?: string; end?: string };
export type TransferOperation = {
    id: string; mode: TransferMode; status: 'pending' | 'complete'; at: string;
    from: WorkitemReference; to: WorkitemReference; sourceTask: Task;
    sourceSignature: string; mapping: TransferMapping; removed: TransferRemoval[];
    history: TaskHistoryEntry[]; originalEvents: TimelineEvent[];
};
export type ProjectTransfers = { version: 1; operations: TransferOperation[] };
export class TransferError extends Error {
    constructor(public readonly code: 'product' | 'state' | 'mapping' | 'stale' | 'unavailable' | 'invalid') { super(code); }
}

export function parseProjectTransfers(value: unknown): ProjectTransfers | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.operations) || Object.keys(value).some((key) => !['version', 'operations'].includes(key))) throw new TransferError('invalid');
    const ids = new Set<string>();
    for (const op of value.operations) {
        if (!isRecord(op) || typeof op.id !== 'string' || !op.id || ids.has(op.id) || !['copy', 'move'].includes(String(op.mode)) || !['pending', 'complete'].includes(String(op.status))
            || typeof op.sourceSignature !== 'string' || !op.sourceSignature
            || typeof op.at !== 'string' || Number.isNaN(Date.parse(op.at)) || !isRecord(op.sourceTask) || !isRecord(op.mapping) || !isRecord(op.mapping.members) || !isRecord(op.mapping.tags)
            || !Object.values(op.mapping.members).every((item) => typeof item === 'string') || !Object.values(op.mapping.tags).every((item) => typeof item === 'string')
            || !Array.isArray(op.removed) || !op.removed.every((item) => isRecord(item) && ['kind', 'id', 'title'].every((key) => typeof item[key] === 'string'))
            || !Array.isArray(op.history) || !op.history.every((entry) => isRecord(entry) && typeof entry.id === 'string' && Array.isArray(entry.changes) && Array.isArray(entry.eventIds) && Array.isArray(entry.categories))
            || !Array.isArray(op.originalEvents) || !op.originalEvents.every((event) => isRecord(event) && typeof event.id === 'string' && typeof event.kind === 'string')
            || Object.keys(op).some((key) => !['id', 'mode', 'status', 'at', 'from', 'to', 'sourceTask', 'sourceSignature', 'mapping', 'removed', 'history', 'originalEvents'].includes(key))) throw new TransferError('invalid');
        const from = parseWorkitemReference(op.from), to = parseWorkitemReference(op.to);
        if (from.projectId === to.projectId || (op.mode === 'move' ? from.permanentId !== to.permanentId : from.permanentId === to.permanentId)
            || op.sourceTask.id !== from.taskId || op.sourceTask.permanentId !== from.permanentId) throw new TransferError('invalid');
        ids.add(op.id);
    }
    return cloneSerializable(value) as ProjectTransfers;
}

export function sameProduct(a: BoardData, b: BoardData): boolean {
    const key = projectNameKey(a.extensions.project?.productName || '');
    return Boolean(key) && key === projectNameKey(b.extensions.project?.productName || '') && a.extensions.project?.id !== b.extensions.project?.id;
}

export function transferMemberInputs(task: Task): { id: string; name: string }[] {
    return task.assignees.map((name, index) => ({ id: task.assigneeIds?.[index] || name, name }));
}

export function transferRemovals(data: BoardData, task: Task): TransferRemoval[] {
    const roadmap = data.extensions.roadmap;
    const result: TransferRemoval[] = [];
    for (const [kind, id] of [['phases', effectivePlanning(data, task, 'phaseId')], ['milestones', effectivePlanning(data, task, 'milestoneId')], ['sprints', task.sprintId]] as const) {
        let current = id;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
            seen.add(current); const entry = roadmap?.[kind].find((item) => item.id === current);
            result.push({ kind, id: current, title: entry?.title || current });
            current = kind === 'phases' ? entry?.parentId || '' : '';
        }
    }
    for (const entry of task.sprintHistory || []) result.push({ kind: 'sprintHistory', id: entry.sprintId, title: roadmap?.sprints.find((sprint) => sprint.id === entry.sprintId)?.title || entry.sprintId, date: entry.at });
    for (const block of data.extensions.dayPlanner?.blocks || []) if (block.taskId === task.id) result.push({ kind: 'planner', id: block.id, title: task.title, date: block.date, start: block.start, end: block.end });
    if (task.parentId) { const parent = data.board.tasks.find((item) => item.id === task.parentId); result.push({ kind: 'parent', id: String(task.parentId), title: parent?.title || String(task.parentId) }); }
    for (const child of data.board.tasks.filter((item) => item.parentId === task.id)) result.push({ kind: 'child', id: String(child.id), title: child.title });
    return result;
}

/** Canonical key order survives a save/reopen; comments and planning are part of the recovery precondition. */
function transferSourceSignature(data: BoardData, task: Task): string {
    const value = { task, comments: visibleComments(data, task),
        planning: transferRemovals(data, task),
        relations: allPermanentRelations([{ id: 'source', data }]).filter((edge) => edge.source.permanentId === task.permanentId || edge.target.permanentId === task.permanentId),
        events: data.extensions.timeline?.events.filter((event) => event.entityType === 'task' && event.entityId === String(task.id)) || [] };
    return hashTextContent(JSON.stringify(value, (_key, entry) => isRecord(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry));
}

function commentContentSignature(comment: WorkitemComment): string {
    const { id, at, workitemCreatedAt, author, text, images } = comment;
    return JSON.stringify({ id, at, workitemCreatedAt, author, text, images }, (_key, value) => isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value);
}

/** Build both drafts before publishing either. No catalog or workflow changes are allowed. */
export function prepareProjectTransfer(source: RelationProject, destination: RelationProject, taskId: number, mode: TransferMode, stateId: string, mapping: TransferMapping, projects: readonly RelationProject[], operationId = createProjectIdentity('transfer'), unavailable: readonly PermanentRelation[] = [], acceptanceAuthor?: string) {
    if (!sameProduct(source.data, destination.data)) throw new TransferError('product');
    const task = source.data.board.tasks.find((item) => item.id === taskId);
    if (!task?.permanentId) throw new TransferError('stale');
    assertWorkitemTransfer(source.data, taskId, mode);
    if (!getWorkflow(destination.data, task).states.some((state) => state.id === stateId)) throw new TransferError('state');
    const catalog = destination.data.extensions.project!;
    const members = transferMemberInputs(task).map((member) => {
        if (!Object.hasOwn(mapping.members, member.id) || typeof mapping.members[member.id] !== 'string') throw new TransferError('mapping');
        const to = mapping.members[member.id];
        if (to && !catalog.members.some((entry) => entry.id === to)) throw new TransferError('mapping');
        return to;
    }).filter(Boolean);
    const tags = task.tags.map((tag) => {
        if (!Object.hasOwn(mapping.tags, tag) || typeof mapping.tags[tag] !== 'string') throw new TransferError('mapping');
        const to = mapping.tags[tag]; if (to && !catalog.tags.includes(to)) throw new TransferError('mapping'); return to;
    }).filter(Boolean);
    const target = cloneSerializable(destination.data);
    ensureBoardTimelineBaseline(target);
    const id = task.id > reservedTaskHighWaterMark(target) ? task.id : nextTaskIdForBoard({ data: target });
    const now = nowIso();
    const transferred: Task = { ...cloneSerializable(task), id, permanentId: mode === 'move' ? task.permanentId : createProjectIdentity('workitem'),
        status: stateId, assigneeIds: [...new Set(members)], assignees: [...new Set(members)].map((id) => catalog.members.find((member) => member.id === id)!.name),
        responsibleId: '', responsible: '', tags: [...new Set(tags)], parentId: null, phaseId: '', phaseMode: 'none', milestoneId: '', milestoneMode: 'none', sprintId: '' };
    const responsible = transferMemberInputs(task).find((member) => member.id === task.responsibleId || member.name === task.responsible);
    const responsibleId = responsible && mapping.members[responsible.id];
    if (responsibleId) { transferred.responsibleId = responsibleId; transferred.responsible = catalog.members.find((member) => member.id === responsibleId)!.name; }
    delete transferred.sprintHistory;
    if (mode === 'copy') { transferred.createdAt = now; transferred.updatedAt = now; delete transferred.acceptance; delete transferred.statusChangedAt; }
    if (catalog.acronym) transferred.displayId = createWorkitemDisplayId(catalog.acronym, transferred);
    else delete transferred.displayId;
    target.board.tasks.push(transferred);
    const completed = statusCategory(stateId, target, transferred) === 'completed';
    if (completed) assertAcceptance(target, transferred);
    const acceptance = transferredAcceptance(task, mode, completed, acceptanceAuthor);
    if (acceptance) transferred.acceptance = acceptance;
    else delete transferred.acceptance;
    const from = referenceFor(source, task), to = referenceFor({ ...destination, data: target }, transferred);
    const operation: TransferOperation = { id: operationId, mode, status: 'pending', at: now, from, to, sourceTask: cloneSerializable(task), sourceSignature: transferSourceSignature(source.data, task), mapping: cloneSerializable(mapping), removed: transferRemovals(source.data, task),
        history: mode === 'move' ? cloneSerializable(projectTaskHistory(source.data, task).entries) : [],
        originalEvents: mode === 'move' ? cloneSerializable(source.data.extensions.timeline?.events.filter((event) => event.entityType === 'task' && event.entityId === String(task.id)) || []) : [] };
    target.extensions.projectTransfers = { version: 1, operations: [...(target.extensions.projectTransfers?.operations || []), operation] };
    appendTimelineEvent(target, { id: `${operationId}-created`, at: mode === 'move' ? task.createdAt : now, kind: 'task.created', entityType: 'task', entityId: String(id), summary: mode === 'move' ? 'Workitem received' : 'Workitem copied', snapshot: cloneSerializable(transferred) });
    if (mode === 'move') {
        const key = conversationWorkitemKey(target, transferred)!;
        const comments = visibleComments(source.data, task);
        const existing = new Map(getComments(target).map((comment) => [comment.id, comment]));
        const preservedEventIds = new Set(operation.history.flatMap((entry) => entry.eventIds));
        for (const comment of comments) {
            const previous = existing.get(comment.id);
            // A return trip reuses the canonical publication. Keep its original lifecycle
            // intact for historical views and add a reference in the arriving lifecycle.
            const previouslyMoved = previous && target.extensions.timeline?.events.some((event) => {
                const transfer = event.meta?.transfer;
                if (event.kind !== 'board.workitems.updated' || !isRecord(transfer) || !isRecord(transfer.from)) return false;
                return transfer.from.projectId === target.extensions.project!.id && transfer.from.permanentId === task.permanentId && transfer.from.taskId === previous.taskId;
            });
            if (previous && (!previouslyMoved || !preservedEventIds.has(previous.eventId) || commentContentSignature(previous) !== commentContentSignature(comment))) throw new TransferError('invalid');
            const eventId = `${operationId}-comment-${comment.id}`;
            appendTimelineEvent(target, { id: eventId, at: comment.at, kind: previous ? 'task.comment.referenced' : 'task.comment.published', entityType: 'task', entityId: String(id), summary: 'Comment preserved on move', meta: { commentId: comment.id, workitemKey: key, author: comment.author } });
            if (!previous) existing.set(comment.id, { ...cloneSerializable(comment), taskId: id, workitemKey: key, eventId });
        }
        if (comments.length) target.extensions.conversations = { version: 1, entries: [...existing.values()] };
    }
    appendTimelineEvent(target, { id: `${operationId}-received`, kind: 'task.transferred', entityType: 'task', entityId: String(id), summary: `${mode === 'move' ? 'Moved' : 'Copied'}: ${from.projectTitle} → ${to.projectTitle}`, meta: { transfer: { mode, from, to, removed: operation.removed, mapping } } });
    const all = allPermanentRelations(projects, unavailable);
    const incident = all.filter((edge) => edge.source.permanentId === task.permanentId || edge.target.permanentId === task.permanentId).map((edge) => ({ ...cloneSerializable(edge), source: edge.source.permanentId === task.permanentId ? to : edge.source, target: edge.target.permanentId === task.permanentId ? to : edge.target }));
    target.extensions.permanentRelations = { version: 1, relations: [...(target.extensions.permanentRelations?.relations || []).filter((edge) => mode !== 'move' || (edge.source.permanentId !== task.permanentId && edge.target.permanentId !== task.permanentId)), ...incident] };
    // Replicas in other projects are deduplicated before validating the loaded graph.
    assertPermanentGraph(allPermanentRelations([...projects.filter((project) => project.id !== destination.id), { ...destination, data: target }], unavailable));
    reserveTaskIdentities(target);
    return { destination: target, operation };
}

/** Called only after destination persistence succeeds; retrying an already removed source is safe. */
export function removeTransferredSource(data: BoardData, operation: TransferOperation, destination: BoardData): BoardData {
    const task = data.board.tasks.find((item) => item.permanentId === operation.from.permanentId);
    if (!task) return data;
    if (transferSourceSignature(data, task) !== operation.sourceSignature) throw new TransferError('stale');
    assertWorkitemTransfer(data, task.id, 'move');
    const result = cloneSerializable(data);
    ensureBoardTimelineBaseline(result);
    result.board.tasks = result.board.tasks.filter((item) => item.permanentId !== task.permanentId);
    removeTaskRelation(result, task.id);
    const edges = allPermanentRelations([{ id: 'destination', data: destination }]).filter((edge) => edge.source.permanentId === task.permanentId || edge.target.permanentId === task.permanentId);
    result.extensions.permanentRelations = { version: 1, relations: [...(result.extensions.permanentRelations?.relations || []).filter((edge) => edge.source.permanentId !== task.permanentId && edge.target.permanentId !== task.permanentId), ...cloneSerializable(edges)] };
    if (result.extensions.dayPlanner) result.extensions.dayPlanner.blocks = result.extensions.dayPlanner.blocks.filter((block) => block.taskId !== task.id);
    appendTimelineEvent(result, { kind: 'board.workitems.updated', entityType: 'board', entityId: result.extensions.project!.id, summary: `Moved: ${operation.from.projectTitle} → ${operation.to.projectTitle}`, snapshot: createBoardStateSnapshot(result), meta: { transfer: { operationId: operation.id, from: operation.from, to: operation.to } } });
    reserveTaskIdentities(result, data);
    return result;
}
