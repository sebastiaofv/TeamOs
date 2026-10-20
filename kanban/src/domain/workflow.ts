import type { BoardData, LooseBoardData, Workflow, WorkflowCategory } from './types';
import { cloneSerializable } from './serializable';

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = ['not-started', 'in-progress', 'completed', 'cancelled'];

export function defaultWorkflow(): Workflow {
    const states: Workflow['states'] = [
        { id: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'not-started' },
        { id: 'to-do', name: 'To Do', color: '#60a5fa', category: 'not-started' },
        { id: 'doing', name: 'Doing', color: '#fbbf24', category: 'in-progress' },
        { id: 'done', name: 'Done', color: '#34d399', category: 'completed' }
    ];
    return { version: 1, states, entryStateId: 'to-do', references: { 'not-started': 'to-do', 'in-progress': 'doing', completed: 'done' },
        transitions: Object.fromEntries(states.map((state) => [state.id, states.filter((other) => other.id !== state.id).map((other) => other.id)])) };
}

export function getWorkflow(data?: LooseBoardData | null): Workflow {
    return (data?.extensions?.workflow as Workflow | undefined) || defaultWorkflow();
}

export function workflowErrors(workflow: Workflow): string[] {
    const errors: string[] = [];
    if (!workflow || workflow.version !== 1 || !Array.isArray(workflow.states) || !workflow.transitions || !workflow.references) return ['Invalid workflow structure.'];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const state of workflow.states) {
        if (!state || typeof state.id !== 'string' || !state.id.trim() || ids.has(state.id)) errors.push('State IDs must be unique and non-empty.');
        if (typeof state?.name !== 'string' || !state.name.trim() || names.has(state.name.trim().toLocaleLowerCase())) errors.push('State names must be unique and non-empty.');
        if (!/^#[0-9a-f]{6}$/i.test(state?.color || '')) errors.push('Choose a valid state color.');
        if (!WORKFLOW_CATEGORIES.includes(state?.category)) errors.push('Invalid state category.');
        ids.add(state?.id); names.add(state?.name?.trim().toLocaleLowerCase());
    }
    if (workflow.states.find((s) => s.id === 'backlog')?.category !== 'not-started') errors.push('Backlog is reserved and must be Not started.');
    if (workflow.entryStateId === 'backlog' || workflow.states.find((s) => s.id === workflow.entryStateId)?.category !== 'not-started') errors.push('Choose a Not started Board entry other than Backlog.');
    if (!workflow.states.some((s) => s.category === 'completed')) errors.push('At least one Completed state is required.');
    for (const category of WORKFLOW_CATEGORIES) {
        if (workflow.states.some((s) => s.category === category) && workflow.states.find((s) => s.id === workflow.references[category])?.category !== category) errors.push(`Choose a reference state: ${category}.`);
    }
    if (workflow.references['not-started'] !== workflow.entryStateId) errors.push('The Not started reference must equal the Board entry.');
    for (const [id, targets] of Object.entries(workflow.transitions)) {
        if (!ids.has(id) || !Array.isArray(targets) || targets.some((target) => !ids.has(target) || target === id) || new Set(targets).size !== targets.length) errors.push('Invalid transitions.');
    }
    const reachable = new Set(['backlog']);
    const queue = ['backlog'];
    while (queue.length) for (const target of workflow.transitions[queue.shift()!] || []) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
    if (workflow.states.some((s) => !reachable.has(s.id))) errors.push('Every state must be reachable from Backlog.');
    return [...new Set(errors)];
}

export function assertWorkflow(value: unknown): asserts value is Workflow {
    const errors = workflowErrors(value as Workflow);
    if (errors.length) throw new Error(errors.join(' '));
}

export function statusCategory(status: string, data?: LooseBoardData | null): WorkflowCategory {
    return getWorkflow(data).states.find((s) => s.id === status)?.category || 'not-started';
}

export function canTransition(data: LooseBoardData, from: string, to: string): boolean {
    return from !== to && (getWorkflow(data).transitions[from] || []).includes(to);
}

export function applyWorkflow(data: BoardData, workflow: Workflow, relocations: Record<string, string>): void {
    assertWorkflow(workflow);
    const previous = getWorkflow(data);
    const ids = new Set(workflow.states.map((s) => s.id));
    for (const state of previous.states) {
        if (ids.has(state.id)) continue;
        if (data.board.tasks.some((t) => t.status === state.id) && !ids.has(relocations[state.id])) throw new Error('Choose a destination for every removed state in use.');
    }
    data.board.tasks.forEach((task) => { if (!ids.has(task.status)) task.status = relocations[task.status]; });
    data.extensions.workflow = cloneSerializable(workflow);
    data.board.columns = workflow.states.map((s) => ({ status: s.id, title: s.name }));
}
