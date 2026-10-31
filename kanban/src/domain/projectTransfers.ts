import type { BoardData, Task, TimelineEvent } from './types';
import type { TaskHistoryEntry } from './taskHistory';
import { projectTaskHistory } from './taskHistory';
import { cloneSerializable } from './serializable';
import { isRecord, nowIso } from './util';
import { createProjectIdentity, projectNameKey } from './projectData';
import { nextTaskIdForBoard } from './task';
import { createWorkitemDisplayId, reservedTaskHighWaterMark, reserveTaskIdentities } from './taskIdentity';
import { getWorkflow, statusCategory } from './workflow';
import { effectivePlanning, assertWorkitemTransfer, assertAcceptance, transferredAcceptance, transferDescendants, validParent, workitemType, eligibleSprint } from './workitems';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from './timeline';
import { conversationWorkitemKey, visibleComments, getComments, type WorkitemComment } from './comments';
import { allPermanentRelations, assertPermanentGraph, parseWorkitemReference, referenceFor, type WorkitemReference, type RelationProject, type PermanentRelation } from './permanentRelations';
import { isValidRoadmapAssignment } from './roadmap';
import { removeTaskRelation } from './taskRelations';
import { createBoardStateSnapshot, hashTextContent } from './serialize';

export type TransferMode = 'copy' | 'move';
export type TransferMapping = { members: Record<string, string>; tags: Record<string, string>; associations?: Record<string, string> };
export type ChildTransferChoice = { stateId: string; mapping: TransferMapping };
export type TransferRemoval = { kind: 'phases' | 'milestones' | 'sprints' | 'sprintHistory' | 'planner' | 'parent' | 'child'; id: string; title: string; date?: string; start?: string; end?: string };
export type TransferOperation = {
    id: string; batchId?: string; mode: TransferMode; status: 'pending' | 'complete'; at: string;
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
            || (op.batchId !== undefined && (typeof op.batchId !== 'string' || !op.batchId))
            || (op.mapping.associations !== undefined && (!isRecord(op.mapping.associations) || !Object.values(op.mapping.associations).every((item) => typeof item === 'string')))
            || !Array.isArray(op.removed) || !op.removed.every((item) => isRecord(item) && ['kind', 'id', 'title'].every((key) => typeof item[key] === 'string'))
            || !Array.isArray(op.history) || !op.history.every((entry) => isRecord(entry) && typeof entry.id === 'string' && Array.isArray(entry.changes) && Array.isArray(entry.eventIds) && Array.isArray(entry.categories))
            || !Array.isArray(op.originalEvents) || !op.originalEvents.every((event) => isRecord(event) && typeof event.id === 'string' && typeof event.kind === 'string')
            || Object.keys(op).some((key) => !['id', 'batchId', 'mode', 'status', 'at', 'from', 'to', 'sourceTask', 'sourceSignature', 'mapping', 'removed', 'history', 'originalEvents'].includes(key))) throw new TransferError('invalid');
        const from = parseWorkitemReference(op.from), to = parseWorkitemReference(op.to);
        if (from.projectId === to.projectId || (op.mode === 'move' ? from.permanentId !== to.permanentId : from.permanentId === to.permanentId)
            || op.sourceTask.id !== from.taskId || op.sourceTask.permanentId !== from.permanentId) throw new TransferError('invalid');
        ids.add(op.id);
    }
    for (const op of value.operations) {
        if (!op.batchId) continue;
        const root = value.operations.find((entry) => entry.id === op.batchId);
        if (!root || root.batchId !== root.id || op.mode !== 'move' || root.mode !== 'move'
            || op.from.projectId !== root.from.projectId || op.to.projectId !== root.to.projectId) throw new TransferError('invalid');
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

/** Prepare a whole hierarchy before either file can be changed. Each member keeps its own recovery receipt. */
export function prepareProjectTransfer(source: RelationProject, destination: RelationProject, taskId: number, mode: TransferMode, stateId: string, mapping: TransferMapping, projects: readonly RelationProject[], operationId = createProjectIdentity('transfer'), unavailable: readonly PermanentRelation[] = [], acceptanceAuthor?: string, children: Record<string, ChildTransferChoice> = {}) {
    assertWorkitemTransfer(source.data, taskId, mode);
    const descendants = mode === 'move' ? transferDescendants(source.data, taskId) : [];
    const root = prepareSingleTransfer(source, destination, taskId, mode, stateId, mapping, projects, operationId, unavailable, acceptanceAuthor);
    if (!descendants.length) return root;
    root.operation.batchId = operationId;
    let target = root.destination;
    const moved = new Map([[taskId, root.operation.to.taskId]]);
    for (const child of descendants) {
        const choice = children[child.permanentId!];
        if (!choice) throw new TransferError('mapping');
        // Children keep their early execution category in the destination as well.
        if (!['backlog', 'to-do'].includes(statusCategory(choice.stateId, target, child))) throw new TransferError('state');
        const prepared = prepareSingleTransfer(source, { ...destination, data: target }, child.id, mode, choice.stateId, choice.mapping,
            projects.map((project) => project.id === destination.id ? { ...project, data: target } : project), createProjectIdentity('transfer'), unavailable);
        prepared.operation.batchId = operationId;
        target = prepared.destination;
        moved.set(child.id, prepared.operation.to.taskId);
    }
    const operations = target.extensions.projectTransfers!.operations.filter((op) => op.batchId === operationId);
    for (const op of operations) {
        const item = target.board.tasks.find((task) => task.permanentId === op.to.permanentId)!;
        if (op.sourceTask.parentId != null && moved.has(op.sourceTask.parentId)) item.parentId = moved.get(op.sourceTask.parentId)!;
        // Internal parent-child links are preserved; they are not removals.
        op.removed = op.removed.filter((entry) => !(entry.kind === 'parent' && moved.has(Number(entry.id))) && !(entry.kind === 'child' && moved.has(Number(entry.id))));
        if (statusCategory(item.status, target, item) === 'completed') assertAcceptance(target, item);
    }
    appendTimelineEvent(target, { kind: 'board.workitems.updated', entityType: 'board', entityId: target.extensions.project!.id,
        summary: 'Workitem hierarchy received', snapshot: createBoardStateSnapshot(target) });
    return { destination: target, operation: operations.find((op) => op.id === operationId)! };
}

export function transferBatch(destination: BoardData, operation: TransferOperation): TransferOperation[] {
    return operation.batchId ? (destination.extensions.projectTransfers?.operations || []).filter((op) => op.batchId === operation.batchId) : (destination.extensions.projectTransfers?.operations || []).filter((op) => op.id === operation.id);
}

/** Build one member receipt without publishing. No catalog or workflow changes are allowed. */
function prepareSingleTransfer(source: RelationProject, destination: RelationProject, taskId: number, mode: TransferMode, stateId: string, mapping: TransferMapping, projects: readonly RelationProject[], operationId = createProjectIdentity('transfer'), unavailable: readonly PermanentRelation[] = [], acceptanceAuthor?: string) {
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
    const associations = mapping.associations;
    if (associations) {
        for (const entry of transferRemovals(source.data, task).filter((entry) => entry.kind !== 'child')) {
            const key = `${entry.kind}:${entry.id}`;
            if (!Object.hasOwn(associations, key) || typeof associations[key] !== 'string') throw new TransferError('mapping');
            const to = associations[key];
            if (!to) continue;
            if (entry.kind === 'phases') {
                if (!isValidRoadmapAssignment(target.extensions.roadmap, 'phaseId', to)) throw new TransferError('mapping');
                transferred.phaseId = to; transferred.phaseMode = 'explicit';
            } else if (entry.kind === 'milestones') {
                if (!isValidRoadmapAssignment(target.extensions.roadmap, 'milestoneId', to)) throw new TransferError('mapping');
                transferred.milestoneId = to; transferred.milestoneMode = 'explicit';
            } else if (entry.kind === 'sprints') {
                if (workitemType(task) === 'epic' || !eligibleSprint(target, to)) throw new TransferError('mapping');
                transferred.sprintId = to;
            } else if (entry.kind === 'parent') {
                const parent = target.board.tasks.find((item) => String(item.id) === to);
                if (!parent || !validParent(workitemType(task), parent)) throw new TransferError('mapping');
                transferred.parentId = parent.id;
            } else throw new TransferError('mapping');
        }
    }
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
    const batch = transferBatch(destination, operation);
    const tasks = batch.map((op) => data.board.tasks.find((item) => item.permanentId === op.from.permanentId));
    if (tasks.every((task) => !task)) return data;
    if (tasks.some((task) => !task)) throw new TransferError('stale');
    for (const [index, task] of tasks.entries()) {
        if (transferSourceSignature(data, task!) !== batch[index].sourceSignature) throw new TransferError('stale');
        assertWorkitemTransfer(data, task!.id, 'move');
        if (!destination.board.tasks.some((item) => item.permanentId === batch[index].to.permanentId)) throw new TransferError('stale');
    }
    const permanentIds = new Set(batch.map((op) => op.from.permanentId));
    const ids = new Set(tasks.map((task) => task!.id));
    // A changed hierarchy must never leave a child behind with a missing parent.
    if (data.board.tasks.some((task) => task.parentId != null && ids.has(task.parentId) && !ids.has(task.id))) throw new TransferError('stale');
    const result = cloneSerializable(data);
    ensureBoardTimelineBaseline(result);
    result.board.tasks = result.board.tasks.filter((item) => !permanentIds.has(item.permanentId!));
    for (const task of tasks) removeTaskRelation(result, task!.id);
    const edges = allPermanentRelations([{ id: 'destination', data: destination }]).filter((edge) => permanentIds.has(edge.source.permanentId) || permanentIds.has(edge.target.permanentId));
    result.extensions.permanentRelations = { version: 1, relations: [...(result.extensions.permanentRelations?.relations || []).filter((edge) => !permanentIds.has(edge.source.permanentId) && !permanentIds.has(edge.target.permanentId)), ...cloneSerializable(edges)] };
    if (result.extensions.dayPlanner) result.extensions.dayPlanner.blocks = result.extensions.dayPlanner.blocks.filter((block) => !ids.has(block.taskId));
    for (const op of batch) appendTimelineEvent(result, { kind: 'board.workitems.updated', entityType: 'board', entityId: result.extensions.project!.id, summary: `Moved: ${op.from.projectTitle} → ${op.to.projectTitle}`, snapshot: createBoardStateSnapshot(result), meta: { transfer: { operationId: op.id, from: op.from, to: op.to } } });
    reserveTaskIdentities(result, data);
    return result;
}
