import type { BoardData, Task, TaskRelationKind } from './types';
import { isRecord } from './util';
import { getRelations, TaskRelationError } from './taskRelations';
import { cloneSerializable } from './serializable';
import { statusCategory } from './workflow';

export type WorkitemReference = {
    permanentId: string; projectId: string; projectTitle: string; fileName: string;
    taskId: number; title: string; displayId?: string;
};
export type PermanentRelation = { source: WorkitemReference; target: WorkitemReference; kind: 'related' | 'blocks' };
export type PermanentRelations = { version: 1; relations: PermanentRelation[] };
export type RelationProject = { id: string; data: BoardData; fileName?: string };

export function parseWorkitemReference(value: unknown): WorkitemReference {
    if (!isRecord(value) || !['permanentId', 'projectId', 'projectTitle', 'fileName', 'title'].every((key) => typeof value[key] === 'string')
        || !value.permanentId || !value.projectId || !Number.isSafeInteger(value.taskId) || Number(value.taskId) <= 0
        || (value.displayId !== undefined && typeof value.displayId !== 'string')
        || Object.keys(value).some((key) => !['permanentId', 'projectId', 'projectTitle', 'fileName', 'taskId', 'title', 'displayId'].includes(key))) throw new TaskRelationError('invalid');
    return cloneSerializable(value) as WorkitemReference;
}

export const relationPairKey = (edge: PermanentRelation) => [edge.source.permanentId, edge.target.permanentId].sort().join('\u0000');

export function assertPermanentGraph(relations: readonly PermanentRelation[]): void {
    const pairs = new Set<string>();
    const edges = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    for (const edge of relations) {
        const a = edge.source.permanentId, b = edge.target.permanentId;
        if (a === b) throw new TaskRelationError('self');
        const key = relationPairKey(edge);
        if (pairs.has(key)) throw new TaskRelationError('duplicate');
        pairs.add(key);
        if (edge.kind !== 'blocks') continue;
        edges.set(a, [...(edges.get(a) || []), b]);
        if (!indegree.has(a)) indegree.set(a, 0);
        indegree.set(b, (indegree.get(b) || 0) + 1);
    }
    const pending = [...indegree].filter(([, degree]) => !degree).map(([id]) => id);
    let visited = 0;
    while (pending.length) {
        const id = pending.pop()!; visited++;
        for (const next of edges.get(id) || []) { const degree = indegree.get(next)! - 1; indegree.set(next, degree); if (!degree) pending.push(next); }
    }
    if (visited !== indegree.size) throw new TaskRelationError('cycle');
}

export function parsePermanentRelations(value: unknown): PermanentRelations | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.relations) || Object.keys(value).some((key) => !['version', 'relations'].includes(key))) throw new TaskRelationError('invalid');
    const relations = value.relations.map((edge: unknown): PermanentRelation => {
        if (!isRecord(edge) || !['related', 'blocks'].includes(String(edge.kind)) || Object.keys(edge).some((key) => !['source', 'target', 'kind'].includes(key))) throw new TaskRelationError('invalid');
        return { source: parseWorkitemReference(edge.source), target: parseWorkitemReference(edge.target), kind: edge.kind as PermanentRelation['kind'] };
    });
    assertPermanentGraph(relations);
    return { version: 1, relations };
}

export function referenceFor(project: RelationProject, task: Task): WorkitemReference {
    if (!task.permanentId) throw new TaskRelationError('invalid');
    return { permanentId: task.permanentId, projectId: project.data.extensions.project!.id, projectTitle: project.data.board.settings.title,
        fileName: project.fileName || '', taskId: task.id, title: task.title, ...(task.displayId ? { displayId: task.displayId } : {}) };
}

/** Merge replicas by pair. A loaded task's location is always resolved by permanent identity. */
export function allPermanentRelations(projects: readonly RelationProject[], unavailable: readonly PermanentRelation[] = []): PermanentRelation[] {
    const result = new Map<string, PermanentRelation>(unavailable.map((edge) => [relationPairKey(edge), edge]));
    for (const project of projects) {
        for (const relation of project.data.extensions.permanentRelations?.relations || []) result.set(relationPairKey(relation), relation);
        const byId = new Map(project.data.board.tasks.map((task) => [task.id, task]));
        for (const relation of getRelations(project.data)) {
            const a = byId.get(relation.sourceId);
            const b = byId.get(relation.targetId);
            if (a?.permanentId && b?.permanentId) {
                const edge = { source: referenceFor(project, a), target: referenceFor(project, b), kind: relation.kind };
                result.set(relationPairKey(edge), edge);
            }
        }
    }
    return [...result.values()];
}

export function locateWorkitem(projects: readonly RelationProject[], permanentId: string): { project: RelationProject; task: Task } | undefined {
    // Pending moves can temporarily have two copies. Prefer the destination receipt.
    const receivedAt = (project: RelationProject) => Math.max(0, ...(project.data.extensions.projectTransfers?.operations.filter((op) => op.to.permanentId === permanentId).map((op) => Date.parse(op.at)) || []));
    const ordered = [...projects].sort((a, b) => receivedAt(b) - receivedAt(a));
    for (const project of ordered) { const task = project.data.board.tasks.find((item) => item.permanentId === permanentId); if (task) return { project, task }; }
}

export function permanentTaskRelations(projects: readonly RelationProject[], permanentId: string, unavailable: readonly PermanentRelation[] = []): { kind: TaskRelationKind; reference: WorkitemReference; location: ReturnType<typeof locateWorkitem> }[] {
    return allPermanentRelations(projects, unavailable).filter((edge) => edge.source.permanentId === permanentId || edge.target.permanentId === permanentId).map((edge) => {
        const outgoing = edge.source.permanentId === permanentId;
        const reference = outgoing ? edge.target : edge.source;
        return { kind: edge.kind === 'related' ? 'related' : outgoing ? 'blocks' : 'blockedBy', reference, location: locateWorkitem(projects, reference.permanentId) };
    });
}

export function permanentBlockedIds(data: BoardData, projects: readonly RelationProject[], unavailable: readonly PermanentRelation[] = []): Set<number> {
    const blocked = new Set<number>();
    const local = new Map(data.board.tasks.filter((task) => task.permanentId).map((task) => [task.permanentId!, task.id]));
    const loaded = new Map<string, { task: Task; project: RelationProject; receivedAt: number }>();
    for (const project of projects) for (const task of project.data.board.tasks) {
        if (!task.permanentId) continue;
        const receivedAt = Math.max(0, ...(project.data.extensions.projectTransfers?.operations.filter((op) => op.to.permanentId === task.permanentId).map((op) => Date.parse(op.at)) || []));
        if (!loaded.has(task.permanentId) || loaded.get(task.permanentId)!.receivedAt <= receivedAt) loaded.set(task.permanentId, { task, project, receivedAt });
    }
    for (const edge of allPermanentRelations(projects, unavailable)) {
        const id = local.get(edge.target.permanentId);
        if (edge.kind !== 'blocks' || id === undefined) continue;
        const blocker = loaded.get(edge.source.permanentId);
        if (!blocker || statusCategory(blocker.task.status, blocker.project.data, blocker.task) !== 'completed') blocked.add(id);
    }
    return blocked;
}
