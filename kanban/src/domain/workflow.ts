import type { BoardData, LooseBoardData, Task } from './types';
import { isRecord } from './util';
import { defaultColumns } from './constants';
import { workitemType } from './workitems';

export const WORKFLOW_CATEGORIES = ['not-started', 'in-progress', 'completed', 'cancelled'] as const;
export type WorkflowCategory = typeof WORKFLOW_CATEGORIES[number];
export type WorkflowState = { id: string; name: string; color: string; category: WorkflowCategory };
export type Workflow = { version: 1; initialStateId: string; states: WorkflowState[]; transitions: { from: string; to: string }[] };

export function declaredWorkflowStatuses(data: LooseBoardData): ReadonlySet<string> {
    const maintenance = data.extensions?.maintenance;
    const values = [data.extensions?.workflow, isRecord(maintenance) ? maintenance.workflow : null];
    const ids = new Set<string>();
    for (const value of values) if (isRecord(value) && Array.isArray(value.states)) {
        for (const state of value.states) if (isRecord(state) && typeof state.id === 'string') ids.add(state.id);
    }
    return ids;
}

export function getWorkflow(data: BoardData): Workflow {
    if (data.extensions?.workflow) return data.extensions.workflow as Workflow;
    const states: WorkflowState[] = (data.board.columns?.length ? data.board.columns : defaultColumns).map((column) => ({
        id: column.status, name: column.title, color: '#6688aa',
        category: column.status === 'done' ? 'completed' : column.status === 'doing' ? 'in-progress' : 'not-started'
    }));
    return { version: 1, states, initialStateId: states[0].id, transitions: states.flatMap((from) => states.filter((to) => to.id !== from.id).map((to) => ({ from: from.id, to: to.id }))) };
}

export function validateWorkflow(workflow: Workflow): void {
    if (workflow.version !== 1 || !Array.isArray(workflow.states) || !workflow.states.length || workflow.states.length > 20) throw new Error('Workflow must have 1–20 states.');
    const ids = new Set<string>();
    for (const state of workflow.states) {
        if (typeof state.id !== 'string' || !state.id.trim() || ['__proto__', 'prototype', 'constructor'].includes(state.id) || ids.has(state.id) || typeof state.name !== 'string' || !state.name.trim() || !/^#[0-9a-f]{6}$/i.test(state.color) || !WORKFLOW_CATEGORIES.includes(state.category)) throw new Error('Invalid workflow state.');
        ids.add(state.id);
    }
    if (!ids.has(workflow.initialStateId)) throw new Error('Choose a valid initial state.');
    if (!workflow.states.some((state) => state.category === 'completed')) throw new Error('A completed state is required.');
    for (const transition of workflow.transitions) if (!ids.has(transition.from) || !ids.has(transition.to) || transition.from === transition.to) throw new Error('Invalid workflow transition.');
}

export function statusCategory(data: BoardData, status: string): WorkflowCategory {
    return getWorkflow(data).states.find((state) => state.id === status)?.category || 'not-started';
}
export function getTaskWorkflow(data: BoardData, task: Pick<Task, 'workContext'>): Workflow {
    const maintenance = data.extensions.maintenance as { workflow?: Workflow } | undefined;
    return task.workContext === 'maintenance' ? maintenance?.workflow || getWorkflow(data) : getWorkflow(data);
}
export function isTaskCompleted(data: BoardData, task: Task): boolean { return getTaskWorkflow(data, task).states.find((state) => state.id === task.status)?.category === 'completed'; }
export function assertTaskTransition(data: BoardData, task: Task, target: string): void {
    if (target === task.status) return;
    if (['epic', 'story'].includes(workitemType(task))) throw new Error('Epic and Story status is derived from children.');
    if (!getTaskWorkflow(data, task).transitions.some((transition) => transition.from === task.status && transition.to === target)) throw new Error('This workflow transition is not allowed.');
}

export function applyWorkflow(data: BoardData, workflow: Workflow, mapping: Record<string, string>): void {
    validateWorkflow(workflow);
    const ids = new Set(workflow.states.map((state) => state.id));
    for (const task of data.board.tasks) if (task.workContext !== 'maintenance' && !ids.has(task.status)) {
        if (!mapping[task.status] || !ids.has(mapping[task.status])) throw new Error('Map every state in use before removing it.');
        task.status = mapping[task.status];
    }
    data.extensions.workflow = workflow;
    data.board.columns = workflow.states.map((state) => ({ status: state.id, title: state.name }));
}

export function applyMaintenanceWorkflow(data: BoardData, workflow: Workflow, mapping: Record<string, string>): void {
    validateWorkflow(workflow);
    const ids = new Set(workflow.states.map((state) => state.id));
    for (const task of data.board.tasks) if (task.workContext === 'maintenance' && !ids.has(task.status)) {
        if (!mapping[task.status] || !ids.has(mapping[task.status])) throw new Error('Map every maintenance state in use before removing it.');
        task.status = mapping[task.status];
    }
    data.extensions.maintenance = { version: 1, enabled: true, workflow };
}
