import type { BoardData, Task, TaskStatus } from './types';

export const WORKITEM_TYPES = ['epic', 'story', 'task', 'bug'] as const;
export type WorkitemType = typeof WORKITEM_TYPES[number];
export type WorkContext = 'project' | 'maintenance';
export function taskWorkContext(task: Pick<Task, 'workContext'>): WorkContext { return task.workContext || 'project'; }

export function workitemType(task: Pick<Task, 'workitemType'>): WorkitemType { return task.workitemType || 'task'; }
// Epic and Story status is derived from their children, never set directly.
export function isAggregateWorkitem(task: Pick<Task, 'workitemType'>): boolean {
    const type = workitemType(task);
    return type === 'epic' || type === 'story';
}
export function canParent(parent: Task, child: Task): boolean {
    const p = workitemType(parent), c = workitemType(child);
    return p === 'epic' && (c === 'story' || c === 'bug') || p === 'story' && (c === 'task' || c === 'bug');
}

export function validateWorkitems(data: BoardData, previous?: BoardData): void {
    const byId = new Map(data.board.tasks.map((task) => [task.id, task]));
    const previousById = new Map(previous?.board.tasks.map((task) => [task.id, task]) || []);
    for (const task of data.board.tasks) {
        if (!WORKITEM_TYPES.includes(workitemType(task))) throw new Error('Invalid workitem type.');
        const before = previousById.get(task.id);
        if (before && workitemType(before) !== workitemType(task)) throw new Error('Workitem type cannot be changed.');
        if (!task.parentId) continue;
        const parent = byId.get(task.parentId);
        if (!parent || !canParent(parent, task)) throw new Error('Hierarchy must be Epic → Story → Task; Bugs may belong to Epic or Story.');
        if (taskWorkContext(parent) !== taskWorkContext(task)) throw new Error('Parent and child must share a work context.');
        const seen = new Set([task.id]);
        let ancestor: Task | undefined = parent;
        while (ancestor) {
            if (seen.has(ancestor.id)) throw new Error('Hierarchy cannot contain cycles.');
            seen.add(ancestor.id);
            ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
        }
    }
}

export function synchronizeParentCompletion(data: BoardData, isDone = (task: Task) => task.status === 'done', doneStatus: TaskStatus = 'done', openStatus: TaskStatus = 'doing', context: WorkContext = 'project'): void {
    const childrenByParent = new Map<number, Task[]>();
    for (const task of data.board.tasks) if (task.parentId) childrenByParent.set(task.parentId, [...(childrenByParent.get(task.parentId) || []), task]);
    for (let pass = 0; pass < 2; pass++) for (const type of ['story', 'epic']) {
        for (const parent of data.board.tasks.filter((task) => workitemType(task) === type && taskWorkContext(task) === context)) {
            const children = childrenByParent.get(parent.id) || [];
            if (children.length) parent.status = children.every(isDone) ? doneStatus : openStatus;
        }
    }
}

export function eligibleLeafTasks(data: BoardData, context: WorkContext = 'project'): Task[] {
    const parents = new Set(data.board.tasks.map((task) => task.parentId).filter(Boolean));
    return data.board.tasks.filter((task) => taskWorkContext(task) === context && !task.archived && !parents.has(task.id) && !isAggregateWorkitem(task));
}
