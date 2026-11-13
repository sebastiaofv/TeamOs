// Workitem numbers are a local projection; the permanent ID is the identity.
// Two replicas that each create a workitem take the same next number, so before
// merging, a workitem created only on the external side is renumbered when its
// number is already used by a different workitem of the merged result.
import type { BoardData, Task } from './types';
import { cloneSerializable } from './serializable';
import { parseTaskIdentityReservation } from './taskIdentity';

const key = (task: Task) => task.permanentId || `legacy:${task.id}:${task.createdAt}`;

/** Which number each local workitem will have after the merge. */
function mergedLocalIds(base: BoardData, local: BoardData, external: BoardData): Map<number, string> {
    const baseIds = new Map(base.board.tasks.map((task) => [key(task), task.id]));
    const externalIds = new Map(external.board.tasks.map((task) => [key(task), task.id]));
    const used = new Map<number, string>();
    for (const task of local.board.tasks) {
        const k = key(task);
        const before = baseIds.get(k);
        const id = before !== undefined && before !== task.id ? task.id : externalIds.get(k) ?? task.id;
        used.set(id, k);
    }
    return used;
}

const highWaterMark = (data: BoardData) => Math.max(parseTaskIdentityReservation(data.extensions.taskIdentity)?.highWaterMark || 0, ...data.board.tasks.map((task) => task.id));

/** Returns `external`, or a renumbered copy, with every number-based reference updated. */
export function renumberConcurrentWorkitems(base: BoardData, local: BoardData, external: BoardData): BoardData {
    const known = new Set([...base.board.tasks, ...local.board.tasks].map(key));
    const used = mergedLocalIds(base, local, external);
    const collisions = external.board.tasks.filter((task) => !known.has(key(task)) && used.has(task.id) && used.get(task.id) !== key(task));
    if (!collisions.length) return external;
    let next = Math.max(highWaterMark(base), highWaterMark(local), highWaterMark(external));
    const renumbered = new Map<number, number>();
    for (const task of collisions) renumbered.set(task.id, ++next);
    const pids = new Map(collisions.map((task) => [key(task), renumbered.get(task.id)!]));
    const map = (id: number | null | undefined) => (id != null && renumbered.has(id) ? renumbered.get(id)! : id);
    const display = (displayId: string | undefined, from: number, to: number) => displayId?.replace(new RegExp(`-${from}$`), `-${to}`);
    const rewriteTask = (task: Task) => {
        const to = renumbered.get(task.id);
        if (to !== undefined) { task.displayId = display(task.displayId, task.id, to); task.id = to; }
        if (task.parentId != null) task.parentId = map(task.parentId);
        for (const entry of task.sprintHistory || []) if (entry.parentId != null) entry.parentId = map(entry.parentId);
    };

    const data = cloneSerializable(external);
    const ext = data.extensions;
    data.board.tasks.forEach(rewriteTask);
    for (const relation of ext.taskRelations?.relations || []) {
        relation.sourceId = map(relation.sourceId)!; relation.targetId = map(relation.targetId)!;
        if (relation.kind === 'related' && relation.sourceId > relation.targetId) [relation.sourceId, relation.targetId] = [relation.targetId, relation.sourceId];
    }
    for (const block of ext.dayPlanner?.blocks || []) block.taskId = map(block.taskId)!;
    for (const comment of ext.conversations?.entries || []) comment.taskId = map(comment.taskId)!;
    for (const entry of ext.sprintParticipation?.entries || []) rewriteTask(entry.task);
    for (const credit of ext.sprintResults?.credits || []) credit.taskId = map(credit.taskId)!;
    for (const closure of ext.sprintResults?.closures || []) {
        closure.tasks.forEach(rewriteTask);
        closure.completedIds = closure.completedIds.map((id) => map(id)!);
        closure.carryOverIds = closure.carryOverIds.map((id) => map(id)!);
    }
    const reference = (ref: { permanentId: string; taskId: number; displayId?: string }) => {
        const to = pids.get(ref.permanentId);
        if (to === undefined) return;
        if (ref.displayId) ref.displayId = display(ref.displayId, ref.taskId, to);
        ref.taskId = to;
    };
    for (const relation of ext.permanentRelations?.relations || []) { reference(relation.source); reference(relation.target); }
    for (const operation of ext.projectTransfers?.operations || []) { reference(operation.from); reference(operation.to); }
    for (const event of ext.timeline?.events || []) {
        if (event.entityType === 'task' && renumbered.has(Number(event.entityId))) event.entityId = String(renumbered.get(Number(event.entityId)));
        if (event.snapshot && typeof event.snapshot.id === 'number' && renumbered.has(event.snapshot.id)) rewriteTask(event.snapshot as Task);
        if (Array.isArray(event.meta?.taskIds)) event.meta.taskIds = event.meta.taskIds.map((id) => typeof id === 'number' ? map(id) : id);
    }
    ext.taskIdentity = { version: 1, highWaterMark: next };
    return data;
}
