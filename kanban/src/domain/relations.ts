import type { BoardData, Task } from './types';
import { getProjectInfo, newLocalId } from './project';
import { isTaskCompleted } from './workflow';

export type TaskRef = { projectId: string; taskId: number };
export type WorkitemRelation = { id: string; kind: 'related' | 'blocks'; from: TaskRef; to: TaskRef };
export type RelationsExtension = { version: 1; links: WorkitemRelation[] };
export const refKey = (ref: TaskRef) => `${ref.projectId}:${ref.taskId}`;
export const taskRef = (data: BoardData, taskId: number): TaskRef => ({ projectId: getProjectInfo(data).id, taskId });
export function getRelations(data: BoardData): WorkitemRelation[] {
    const extension = data.extensions.relations as RelationsExtension | undefined;
    if (!extension) return [];
    if (extension.version !== 1 || !Array.isArray(extension.links)) throw new Error('Unsupported relations data.');
    for (const link of extension.links) {
        if (!link || typeof link.id !== 'string' || !['related', 'blocks'].includes(link.kind) || !link.from?.projectId || !link.to?.projectId || !Number.isSafeInteger(link.from.taskId) || !Number.isSafeInteger(link.to.taskId) || link.from.taskId <= 0 || link.to.taskId <= 0) throw new Error('Invalid workitem relation.');
    }
    return extension.links;
}
export function findReferencedTask(boards: readonly BoardData[], ref: TaskRef): { data: BoardData; task: Task } | null {
    const data = boards.find((data) => getProjectInfo(data).id === ref.projectId);
    const task = data?.board.tasks.find((task) => task.id === ref.taskId);
    return data && task ? { data, task } : null;
}
export function validateRelation(boards: readonly BoardData[], link: WorkitemRelation): void {
    const source = findReferencedTask(boards, link.from), target = findReferencedTask(boards, link.to);
    if (!source || !target) throw new Error('Both workitems must be loaded.');
    if (refKey(link.from) === refKey(link.to)) throw new Error('A workitem cannot link to itself.');
    const p1 = getProjectInfo(source.data), p2 = getProjectInfo(target.data);
    const sourceApplication = source.task.applicationId || p1.productId || p1.product.trim().toLowerCase();
    const targetApplication = target.task.applicationId || p2.productId || p2.product.trim().toLowerCase();
    if (p1.id !== p2.id && (!sourceApplication || sourceApplication !== targetApplication)) throw new Error('Cross-project links require the same product.');
    const links = boards.flatMap(getRelations);
    for (const existing of links) {
        const direct = refKey(existing.from) === refKey(link.from) && refKey(existing.to) === refKey(link.to);
        const reverse = refKey(existing.from) === refKey(link.to) && refKey(existing.to) === refKey(link.from);
        if (existing.kind === link.kind && (direct || link.kind === 'related' && reverse)) throw new Error('This relation already exists.');
    }
    if (link.kind === 'blocks') {
        const edges = new Map<string, string[]>();
        for (const edge of links.filter((l) => l.kind === 'blocks')) edges.set(refKey(edge.from), [...(edges.get(refKey(edge.from)) || []), refKey(edge.to)]);
        const seen = new Set<string>(), pending = [refKey(link.to)];
        while (pending.length) {
            const key = pending.pop()!;
            if (key === refKey(link.from)) throw new Error('Blocking dependencies cannot contain cycles.');
            if (seen.has(key)) continue;
            seen.add(key);
            pending.push(...(edges.get(key) || []));
        }
    }
}
export function addRelation(owner: BoardData, boards: readonly BoardData[], input: Omit<WorkitemRelation, 'id'>): WorkitemRelation {
    const link = { ...input, id: newLocalId('relation') };
    validateRelation(boards, link);
    owner.extensions.relations = { version: 1, links: [...getRelations(owner), link] } satisfies RelationsExtension;
    return link;
}
// A deleted workitem must not keep blocking or linking from this board.
export function removeTaskRelations(owner: BoardData, ref: TaskRef): void {
    const links = getRelations(owner), key = refKey(ref);
    const kept = links.filter((link) => refKey(link.from) !== key && refKey(link.to) !== key);
    if (kept.length !== links.length) owner.extensions.relations = { version: 1, links: kept } satisfies RelationsExtension;
}
export function dependencyBlockers(boards: readonly BoardData[], ref: TaskRef): TaskRef[] {
    return boards.flatMap(getRelations).filter((link) => link.kind === 'blocks' && refKey(link.to) === refKey(ref)).filter((link) => {
        const predecessor = findReferencedTask(boards, link.from);
        return !predecessor || !isTaskCompleted(predecessor.data, predecessor.task);
    }).map((link) => link.from);
}

export function dependencyBlockedKeys(boards: readonly BoardData[]): Set<string> {
    const tasks = new Map(boards.flatMap((data) => data.board.tasks.map((task) => [refKey(taskRef(data, task.id)), { data, task }] as const)));
    return new Set(boards.flatMap(getRelations).filter((link) => {
        const source = tasks.get(refKey(link.from));
        return link.kind === 'blocks' && (!source || !isTaskCompleted(source.data, source.task));
    }).map((link) => refKey(link.to)));
}
