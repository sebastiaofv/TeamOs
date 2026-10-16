import type { BoardData, RoadmapKind, Task } from '@/domain/types';
import { PLAN_TASK_FIELD, planWorkitems } from '@/domain/projectPlan';

export type DrilldownNode = { task: Task; direct: boolean; children: DrilldownNode[] };
export function buildDrilldownTree(tasks: readonly Task[], directIds: ReadonlySet<number>): DrilldownNode[] {
    const nodes = new Map(tasks.map((task) => [task.id, { task, direct: directIds.has(task.id), children: [] as DrilldownNode[] }]));
    const roots: DrilldownNode[] = [];
    for (const node of nodes.values()) {
        const parent = node.task.parentId ? nodes.get(node.task.parentId) : null;
        const seen = new Set([node.task.id]); let cursor = parent;
        while (cursor && !seen.has(cursor.task.id)) { seen.add(cursor.task.id); cursor = cursor.task.parentId ? nodes.get(cursor.task.parentId) : undefined; }
        // A cursor left over means the ancestor chain loops; show the node as a root.
        if (cursor) { roots.push(node); continue; }
        if (parent) parent.children.push(node); else roots.push(node);
    }
    return roots;
}

export function planDrilldownTasks(data: BoardData, kind: RoadmapKind, id: string, includeArchived = false) {
    const tasks = planWorkitems(data, kind, id).filter((task) => includeArchived || !task.archived);
    return { tasks, directIds: new Set(tasks.filter((task) => task[PLAN_TASK_FIELD[kind]] === id).map((task) => task.id)) };
}

// Workitems with no phase, milestone or sprint on themselves or an ancestor.
// Nothing here is inherited, so every listed task is a direct entry.
export function unassociatedPlanTasks(data: BoardData, includeArchived = false): { tasks: Task[]; directIds: Set<number> } {
    const parents = new Map(data.board.tasks.map((task) => [task.id, task]));
    const tasks = data.board.tasks.filter((task) => {
        if (task.workContext === 'maintenance') return false;
        if (!includeArchived && task.archived) return false;
        let current: Task | undefined = task;
        const seen = new Set<number>();
        while (current && !seen.has(current.id)) {
            if (current.phaseId || current.milestoneId || current.sprintId) return false;
            seen.add(current.id); current = current.parentId ? parents.get(current.parentId) : undefined;
        }
        return true;
    });
    return { tasks, directIds: new Set(tasks.map((task) => task.id)) };
}
