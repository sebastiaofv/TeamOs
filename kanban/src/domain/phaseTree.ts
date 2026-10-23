import type { BoardData, LooseBoardData, RoadmapItem, Task } from './types';
import { nowIso } from './util';

export function phaseDescendants(phases: readonly RoadmapItem[], id: string): Set<string> {
    const result = new Set([id]);
    const queue = [id];
    while (queue.length) {
        const parent = queue.shift();
        phases.forEach((phase) => { if (phase.parentId === parent && !result.has(phase.id)) { result.add(phase.id); queue.push(phase.id); } });
    }
    return result;
}

export function isLeafPhase(phases: readonly RoadmapItem[], id: string): boolean {
    return phases.some((phase) => phase.id === id) && !phases.some((phase) => phase.parentId === id);
}

export function validatePhaseTree(phases: readonly RoadmapItem[]): void {
    const byId = new Map(phases.map((phase) => [phase.id, phase]));
    for (const phase of phases) {
        const visited = new Set([phase.id]);
        let parent = phase.parentId;
        while (parent) {
            if (!byId.has(parent)) throw new Error('Parent phase does not exist in this project.');
            if (visited.has(parent)) throw new Error('A phase cannot be its own ancestor.');
            visited.add(parent); parent = byId.get(parent)!.parentId;
        }
    }
}

/** Bottom-up, without a recursive call stack or an artificial depth limit. */
export function recalculatePhaseDates(phases: RoadmapItem[]): void {
    validatePhaseTree(phases);
    const remaining = new Set(phases.map((phase) => phase.id));
    while (remaining.size) {
        for (const phase of phases) {
            if (!remaining.has(phase.id)) continue;
            const children = phases.filter((child) => child.parentId === phase.id);
            if (children.some((child) => remaining.has(child.id))) continue;
            if (children.length) {
                phase.startDate = children.map((child) => child.startDate!).sort()[0];
                phase.endDate = children.map((child) => child.endDate!).sort().at(-1);
            }
            remaining.delete(phase.id);
        }
    }
}

export function phaseTreeRows(phases: readonly RoadmapItem[], collapsed: ReadonlySet<string> = new Set()): { item: RoadmapItem; depth: number; hasChildren: boolean }[] {
    const compare = (a: RoadmapItem, b: RoadmapItem) => (a.startDate || '').localeCompare(b.startDate || '') || a.title.localeCompare(b.title);
    const stack = phases.filter((p) => !p.parentId).sort(compare).reverse().map((item) => ({ item, depth: 0 }));
    const rows: ReturnType<typeof phaseTreeRows> = [];
    while (stack.length) {
        const row = stack.pop()!;
        const children = phases.filter((phase) => phase.parentId === row.item.id).sort(compare);
        rows.push({ ...row, hasChildren: children.length > 0 });
        if (!collapsed.has(row.item.id)) stack.push(...children.reverse().map((item) => ({ item, depth: row.depth + 1 })));
    }
    return rows;
}

/** A compatibility seam for US-4. Until merged, the persisted `done` state is completed. */
export function planningTaskCategory(task: Pick<Task, 'status'>, data?: LooseBoardData | null): string {
    const workflow = data?.extensions?.workflow as { states?: { id: string; category: string }[] } | undefined;
    return (Array.isArray(workflow?.states) ? workflow.states.find((state) => state.id === task.status)?.category : undefined) || (task.status === 'done' ? 'completed' : 'not-started');
}

export function planningProgress(tasks: readonly Task[], data?: LooseBoardData | null) {
    const unique = [...new Map(tasks.map((task) => [task.id, task])).values()];
    const cancelled = unique.filter((task) => planningTaskCategory(task, data) === 'cancelled').length;
    const eligible = unique.length - cancelled;
    const completed = unique.filter((task) => planningTaskCategory(task, data) === 'completed').length;
    return { associated: unique.length, eligible, completed, cancelled, percent: eligible ? completed / eligible * 100 : null };
}

export type PlanningProgress = ReturnType<typeof planningProgress>;

export function updatePhase(data: BoardData, next: RoadmapItem, relocation?: string): void {
    const roadmap = data.extensions.roadmap!;
    const index = roadmap.phases.findIndex((phase) => phase.id === next.id);
    const previous = index >= 0 ? roadmap.phases[index] : null;
    // A parent is a calculated interval; form input cannot reschedule its leaves.
    if (previous && roadmap.phases.some((phase) => phase.parentId === next.id)) { next.startDate = previous.startDate; next.endDate = previous.endDate; }
    const phases = roadmap.phases.filter((phase) => phase.id !== next.id).concat(next);
    validatePhaseTree(phases);
    const affected = next.parentId ? data.board.tasks.filter((task) => task.phaseId === next.parentId) : [];
    if (affected.length) {
        const branch = phaseDescendants(phases, next.id);
        if (relocation === undefined || (relocation && (!branch.has(relocation) || !isLeafPhase(phases, relocation)))) throw new Error('Choose a leaf in the introduced branch, or explicitly clear the affected assignments.');
        const at = nowIso();
        affected.forEach((task) => { task.phaseId = relocation; task.updatedAt = at; });
    }
    roadmap.phases = phases;
    recalculatePhaseDates(roadmap.phases);
}

export function deletePlanningGroup(data: BoardData, kind: 'phases' | 'milestones', id: string, relocation?: string): void {
    const roadmap = data.extensions.roadmap!;
    if (kind === 'phases' && roadmap.phases.some((phase) => phase.parentId === id)) throw new Error('Move or delete subphases first. Branches are never deleted in cascade.');
    const field = kind === 'phases' ? 'phaseId' : 'milestoneId';
    const affected = data.board.tasks.filter((task) => task[field] === id);
    const destinations = roadmap[kind].filter((item) => item.id !== id && (kind !== 'phases' || isLeafPhase(roadmap.phases, item.id)));
    if (affected.length && (relocation === undefined || (relocation && !destinations.some((item) => item.id === relocation)))) throw new Error('Choose a valid destination, or explicitly clear the affected assignments.');
    const at = nowIso();
    affected.forEach((task) => { task[field] = relocation || ''; task.updatedAt = at; });
    roadmap[kind] = roadmap[kind].filter((item) => item.id !== id);
    recalculatePhaseDates(roadmap.phases);
}
