import type { BoardData, LooseBoardData, Workflow, WorkflowCategory, WorkflowKind } from './types';
import { cloneSerializable } from './serializable';
import { isRecord, nowIso } from './util';

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = ['backlog', 'to-do', 'in-progress', 'completed', 'cancelled'];
export const BOARD_WORKFLOW_CATEGORIES: WorkflowCategory[] = ['to-do', 'in-progress', 'completed'];

export function defaultWorkflow(): Workflow {
    const states: Workflow['states'] = [
        { id: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'backlog' },
        { id: 'to-do', name: 'To Do', color: '#60a5fa', category: 'to-do' },
        { id: 'doing', name: 'In progress', color: '#fbbf24', category: 'in-progress' },
        { id: 'ready-to-test', name: 'Ready to test', color: '#a78bfa', category: 'in-progress' },
        { id: 'testing', name: 'Testing', color: '#38bdf8', category: 'in-progress' },
        { id: 're-analysis', name: 'Re-analysis', color: '#fb923c', category: 'in-progress' },
        { id: 'done', name: 'Done', color: '#34d399', category: 'completed' },
        { id: 'cancelled', name: 'Cancelled', color: '#f87171', category: 'cancelled' },
        { id: 'duplication', name: 'Duplication', color: '#e879f9', category: 'cancelled' }
    ];
    const cancel = ['cancelled', 'duplication'];
    return { version: 2, states, entryStateId: 'to-do', references: { backlog: 'backlog', 'to-do': 'to-do', 'in-progress': 'doing', completed: 'done', cancelled: 'cancelled' },
        transitions: {
            backlog: ['to-do', ...cancel], 'to-do': ['doing', ...cancel], doing: ['ready-to-test', 'done', ...cancel],
            'ready-to-test': ['testing', ...cancel], testing: ['done', 're-analysis', ...cancel], 're-analysis': ['doing', ...cancel],
            done: [], cancelled: [], duplication: []
        } };
}

/** Existing files keep their states, labels and permissive transitions, not a new process imposed retroactively. */
export function legacyWorkflow(columns?: unknown): Workflow {
    const workflow = defaultWorkflow();
    const defaults = workflow.states.filter((state) => ['backlog', 'to-do', 'doing', 'done'].includes(state.id));
    defaults.find((state) => state.id === 'doing')!.name = 'Doing';
    workflow.states = [];
    const ids = new Set<string>();
    for (const column of Array.isArray(columns) ? columns : []) {
        if (!column || typeof column.status !== 'string' || !column.status.trim() || ids.has(column.status)) continue;
        const known = defaults.find((state) => state.id === column.status);
        workflow.states.push({ ...(known || { color: '#60a5fa', category: 'to-do' as const }), id: column.status,
            name: typeof column.title === 'string' && column.title.trim() ? column.title.trim() : known?.name || column.status });
        ids.add(column.status);
    }
    workflow.states.push(...defaults.filter((state) => !ids.has(state.id)));
    const names = new Set<string>();
    for (const state of workflow.states) {
        if (names.has(state.name.toLowerCase())) state.name += ` [${state.id}]`;
        names.add(state.name.toLowerCase());
    }
    delete workflow.references.cancelled;
    workflow.transitions = Object.fromEntries(workflow.states.map((state) => [state.id, workflow.states.filter((other) => other.id !== state.id).map((other) => other.id)]));
    return workflow;
}

/** v1's shared Not started category is split by stable Backlog ID; IDs, labels, order and transitions remain unchanged. */
export function parseWorkflow(value: unknown): Workflow {
    if (!isRecord(value)) throw new Error('Invalid workflow structure.');
    const input = cloneSerializable(value);
    if (input.version === 1 && Array.isArray(input.states) && isRecord(input.references)) {
        input.version = 2;
        input.states = input.states.map((state) => ({ ...state, category: state.category === 'not-started' ? state.id === 'backlog' ? 'backlog' : 'to-do' : state.category }));
        const references: Record<string, unknown> = { ...input.references, backlog: 'backlog', 'to-do': input.references['not-started'] || input.entryStateId };
        delete references['not-started'];
        input.references = references;
    }
    assertWorkflow(input);
    return input;
}

export type WorkflowSubject = WorkflowKind | { type?: unknown };

export function workflowKind(subject?: WorkflowSubject | null): WorkflowKind {
    return typeof subject === 'string' ? subject : subject?.type === 'story' || subject?.type === 'epic' ? 'functional' : 'technical';
}

/** Older projects share their existing process until either workflow is edited. */
export function getWorkflow(data?: LooseBoardData | null, subject?: WorkflowSubject | null): Workflow {
    if (workflowKind(subject) === 'functional' && data?.extensions?.functionalWorkflow !== undefined) return parseWorkflow(data.extensions.functionalWorkflow);
    return data?.extensions?.workflow ? parseWorkflow(data.extensions.workflow) : legacyWorkflow(data?.board?.columns);
}

export function allWorkflowStates(data?: LooseBoardData | null) {
    return [...new Map([...getWorkflow(data).states, ...getWorkflow(data, 'functional').states].map((state) => [state.id, state])).values()];
}

export function unreachableWorkflowStateIds(workflow: Workflow): Set<string> {
    const reachable = new Set(['backlog']);
    const queue = ['backlog'];
    while (queue.length) for (const target of workflow.transitions[queue.shift()!] || []) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
    return new Set(workflow.states.filter((state) => !reachable.has(state.id)).map((state) => state.id));
}

export function workflowErrors(workflow: Workflow): string[] {
    const errors: string[] = [];
    if (!workflow || workflow.version !== 2 || !Array.isArray(workflow.states) || !workflow.transitions || !workflow.references) return ['Invalid workflow structure.'];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const state of workflow.states) {
        if (!state || typeof state.id !== 'string' || !state.id.trim() || ids.has(state.id)) errors.push('State IDs must be unique and non-empty.');
        if (typeof state?.name !== 'string' || !state.name.trim() || names.has(state.name.trim().toLocaleLowerCase())) errors.push('State names must be unique and non-empty.');
        if (!/^#[0-9a-f]{6}$/i.test(state?.color || '')) errors.push('Choose a valid state color.');
        if (!WORKFLOW_CATEGORIES.includes(state?.category)) errors.push('Invalid state category.');
        ids.add(state?.id); names.add(state?.name?.trim().toLocaleLowerCase());
    }
    if (workflow.states.find((s) => s.id === 'backlog')?.category !== 'backlog') errors.push('Backlog is reserved and must belong to Backlog.');
    if (workflow.entryStateId === 'backlog' || workflow.states.find((s) => s.id === workflow.entryStateId)?.category !== 'to-do') errors.push('Choose a To do Board entry other than Backlog.');
    if (!workflow.states.some((s) => s.category === 'completed')) errors.push('At least one Completed state is required.');
    for (const category of WORKFLOW_CATEGORIES) {
        if (workflow.states.some((s) => s.category === category) && workflow.states.find((s) => s.id === workflow.references[category])?.category !== category) errors.push(`Choose a reference state: ${category}.`);
    }
    for (const [category, id] of Object.entries(workflow.references)) {
        if (!WORKFLOW_CATEGORIES.includes(category as WorkflowCategory) || !workflow.states.some((state) => state.id === id && state.category === category)) errors.push(`Invalid reference state: ${category}.`);
    }
    if (workflow.references['to-do'] !== workflow.entryStateId || workflow.references.backlog !== 'backlog') errors.push('The To do reference must equal the Board entry; Backlog must reference the reserved state.');
    for (const [id, targets] of Object.entries(workflow.transitions)) {
        if (!ids.has(id) || !Array.isArray(targets) || targets.some((target) => !ids.has(target) || target === id) || new Set(targets).size !== targets.length) errors.push('Invalid transitions.');
    }
    const unreachableIds = unreachableWorkflowStateIds(workflow);
    const unreachable = workflow.states.filter((state) => unreachableIds.has(state.id));
    if (unreachable.length) errors.push(`Every state must be reachable from Backlog: ${unreachable.map((state) => state.name || state.id).join(', ')}.`);
    return [...new Set(errors)];
}

export function assertWorkflow(value: unknown): asserts value is Workflow {
    const errors = workflowErrors(value as Workflow);
    if (errors.length) throw new Error(errors.join(' '));
}

export function statusCategory(status: string, data?: LooseBoardData | null, subject?: WorkflowSubject): WorkflowCategory {
    return getWorkflow(data, subject).states.find((s) => s.id === status)?.category || 'to-do';
}

export function allowedWorkflowDestinations(data: LooseBoardData, status: string, category?: WorkflowCategory, subject?: WorkflowSubject) {
    const workflow = getWorkflow(data, subject);
    return workflow.states.filter((state) => (!category || state.category === category) && (workflow.transitions[status] || []).includes(state.id));
}

export function canTransition(data: LooseBoardData, from: string, to: string, subject?: WorkflowSubject): boolean {
    return from !== to && (getWorkflow(data, subject).transitions[from] || []).includes(to);
}

export function applyWorkflow(data: BoardData, workflow: Workflow, relocations: Record<string, string>, kind: WorkflowKind = 'technical'): void {
    assertWorkflow(workflow);
    const tasks = data.board.tasks.filter((task) => workflowKind(task) === kind);
    const ids = new Set(workflow.states.map((state) => state.id));
    if (tasks.some((task) => !ids.has(task.status) && !ids.has(relocations[task.status]))) throw new Error('Choose a destination for every removed state in use.');
    // Freeze the old shared process before changing the technical workflow.
    if (kind === 'technical' && !data.extensions.functionalWorkflow) data.extensions.functionalWorkflow = getWorkflow(data, 'functional');
    const at = nowIso();
    tasks.forEach((task) => { if (!ids.has(task.status)) { task.status = relocations[task.status]; task.updatedAt = at; } });
    if (kind === 'functional') data.extensions.functionalWorkflow = cloneSerializable(workflow);
    else {
        data.extensions.workflow = cloneSerializable(workflow);
        data.board.columns = workflow.states.map((state) => ({ status: state.id, title: state.name }));
    }
    if (data.extensions.boardView) {
        const key = kind === 'functional' ? 'functionalHiddenStateIds' : 'hiddenStateIds';
        const hidden = data.extensions.boardView[key];
        if (hidden) data.extensions.boardView[key] = hidden.filter((id) => ids.has(id));
    }
}
