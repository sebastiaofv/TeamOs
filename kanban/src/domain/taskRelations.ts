import type { BoardData, Task, TaskRelation, TaskRelationKind, TaskRelationsExtension } from '@/domain/types';
import { hasExactKeys } from '@/domain/util';

export class TaskRelationError extends Error {
    constructor(public readonly code: 'self' | 'missing' | 'duplicate' | 'cycle' | 'invalid') {
        super(code);
    }
}

export function getRelations(data: BoardData): TaskRelation[] {
    return data.extensions.taskRelations?.relations || [];
}

// An absent extension is the legacy-to-v1 migration: no fabricated links or IDs.
// A present but invalid/future version is rejected rather than silently losing links.
export function parseTaskRelations(value: unknown, taskIds?: ReadonlySet<number>): TaskRelationsExtension | undefined {
    if (value === undefined) return undefined;
    if (!hasExactKeys(value, ['version', 'relations']) || value.version !== 1 || !Array.isArray(value.relations)) {
        throw new Error('Invalid extensions.taskRelations: expected version 1 and relations array.');
    }
    const pairs = new Set<string>();
    const edges = new Map<number, number[]>();
    const inDegree = new Map<number, number>();
    const relations: TaskRelation[] = [];
    for (const entry of value.relations) {
        if (!hasExactKeys(entry, ['sourceId', 'targetId', 'kind'])
            || typeof entry.sourceId !== 'number' || !Number.isSafeInteger(entry.sourceId) || entry.sourceId <= 0
            || typeof entry.targetId !== 'number' || !Number.isSafeInteger(entry.targetId) || entry.targetId <= 0
            || entry.sourceId === entry.targetId || (entry.kind !== 'related' && entry.kind !== 'blocks')
            || (taskIds && (!taskIds.has(entry.sourceId) || !taskIds.has(entry.targetId)))) {
            throw new Error('Invalid extensions.taskRelations: invalid workitem reference or relation.');
        }
        const { sourceId, targetId, kind } = entry;
        const pair = `${Math.min(sourceId, targetId)}:${Math.max(sourceId, targetId)}`;
        if (pairs.has(pair)) throw new Error('Invalid extensions.taskRelations: duplicate pair.');
        pairs.add(pair);
        relations.push({ sourceId, targetId, kind });
        if (kind === 'blocks') {
            edges.set(sourceId, [...(edges.get(sourceId) || []), targetId]);
            if (!inDegree.has(sourceId)) inDegree.set(sourceId, 0);
            inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
        }
    }
    const pending = [...inDegree].filter(([, count]) => count === 0).map(([id]) => id);
    let visited = 0;
    while (pending.length) {
        const id = pending.pop()!;
        visited += 1;
        for (const target of edges.get(id) || []) {
            const count = inDegree.get(target)! - 1;
            inDegree.set(target, count);
            if (count === 0) pending.push(target);
        }
    }
    if (visited !== inDegree.size) throw new Error('Invalid extensions.taskRelations: circular dependency.');
    return { version: 1, relations };
}

function samePair(relation: TaskRelation, a: number, b: number): boolean {
    return (relation.sourceId === a && relation.targetId === b) || (relation.sourceId === b && relation.targetId === a);
}

export function getTaskRelations(data: BoardData, taskId: number): Record<TaskRelationKind, Task[]> {
    const groups: Record<TaskRelationKind, Task[]> = { related: [], blocks: [], blockedBy: [] };
    const tasks = new Map(data.board.tasks.map((task) => [task.id, task]));
    for (const relation of getRelations(data)) {
        if (relation.sourceId !== taskId && relation.targetId !== taskId) continue;
        const outgoing = relation.sourceId === taskId;
        const other = tasks.get(outgoing ? relation.targetId : relation.sourceId);
        if (other) groups[relation.kind === 'related' ? 'related' : outgoing ? 'blocks' : 'blockedBy'].push(other);
    }
    return groups;
}

export function getDependencyBlockedTaskIds(data: BoardData): Set<number> {
    const tasks = new Map(data.board.tasks.map((task) => [task.id, task]));
    const blocked = new Set<number>();
    for (const relation of getRelations(data)) {
        const blocker = tasks.get(relation.sourceId);
        if (relation.kind === 'blocks' && blocker && blocker.status !== 'done' && tasks.has(relation.targetId)) blocked.add(relation.targetId);
    }
    return blocked;
}

export function isTaskBlocked(data: BoardData, taskId: number): boolean {
    return Boolean(data.board.tasks.find((task) => task.id === taskId)?.blocked) || getDependencyBlockedTaskIds(data).has(taskId);
}

export function removeTaskRelation(data: BoardData, taskId: number, otherId?: number): void {
    const relations = getRelations(data).filter((relation) => otherId === undefined
        ? relation.sourceId !== taskId && relation.targetId !== taskId
        : !samePair(relation, taskId, otherId));
    if (relations.length) data.extensions.taskRelations = { version: 1, relations };
    else delete data.extensions.taskRelations;
}

export function setTaskRelation(data: BoardData, taskId: number, otherId: number, kind: TaskRelationKind, replace = false): void {
    if (!['related', 'blocks', 'blockedBy'].includes(kind)) throw new TaskRelationError('invalid');
    if (taskId === otherId) throw new TaskRelationError('self');
    if (![taskId, otherId].every((id) => data.board.tasks.some((task) => task.id === id))) throw new TaskRelationError('missing');
    const current = getRelations(data);
    if (!replace && current.some((relation) => samePair(relation, taskId, otherId))) throw new TaskRelationError('duplicate');
    const remaining = current.filter((relation) => !samePair(relation, taskId, otherId));
    const relation: TaskRelation = kind === 'related'
        ? { sourceId: Math.min(taskId, otherId), targetId: Math.max(taskId, otherId), kind: 'related' }
        : { sourceId: kind === 'blocks' ? taskId : otherId, targetId: kind === 'blocks' ? otherId : taskId, kind: 'blocks' };
    if (relation.kind === 'blocks') {
        const edges = new Map<number, number[]>();
        for (const edge of remaining) {
            if (edge.kind === 'blocks') edges.set(edge.sourceId, [...(edges.get(edge.sourceId) || []), edge.targetId]);
        }
        const visited = new Set<number>();
        const pending = [relation.targetId];
        while (pending.length) {
            const id = pending.pop()!;
            if (id === relation.sourceId) throw new TaskRelationError('cycle');
            if (visited.has(id)) continue;
            visited.add(id);
            pending.push(...(edges.get(id) || []));
        }
    }
    data.extensions.taskRelations = { version: 1, relations: [...remaining, relation] };
}
