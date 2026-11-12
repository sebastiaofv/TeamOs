import type { BoardData, LooseBoardData, Workflow, WorkflowCategory, WorkflowKind, WorkflowTypes, WorkitemType } from './types';
import { cloneSerializable } from './serializable';
import { isRecord, nowIso } from './util';

/** Testing sits between In progress and Completed: development is finished but the workitem is not complete. */
export const WORKFLOW_CATEGORIES: WorkflowCategory[] = ['backlog', 'to-do', 'in-progress', 'testing', 'completed', 'cancelled'];
export const BOARD_WORKFLOW_CATEGORIES: WorkflowCategory[] = ['to-do', 'in-progress', 'testing', 'completed'];

export function defaultWorkflow(): Workflow {
    const states: Workflow['states'] = [
        { id: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'backlog' },
        { id: 'to-do', name: 'To Do', color: '#60a5fa', category: 'to-do' },
        { id: 'doing', name: 'In progress', color: '#fbbf24', category: 'in-progress' },
        { id: 'ready-to-test', name: 'Ready to test', color: '#a78bfa', category: 'testing' },
        { id: 'testing', name: 'Testing', color: '#38bdf8', category: 'testing' },
        { id: 're-analysis', name: 'Re-analysis', color: '#fb923c', category: 'in-progress' },
        { id: 'done', name: 'Done', color: '#34d399', category: 'completed' },
        { id: 'cancelled', name: 'Cancelled', color: '#f87171', category: 'cancelled' },
        { id: 'duplication', name: 'Duplication', color: '#e879f9', category: 'cancelled' }
    ];
    const cancel = ['cancelled', 'duplication'];
    return { version: 2, states, entryStateId: 'to-do', references: { backlog: 'backlog', 'to-do': 'to-do', 'in-progress': 'doing', testing: 'ready-to-test', completed: 'done', cancelled: 'cancelled' },
        transitions: {
            backlog: ['to-do', ...cancel], 'to-do': ['doing', ...cancel], doing: ['ready-to-test', 'done', ...cancel],
            'ready-to-test': ['testing', 'doing', ...cancel], testing: ['done', 're-analysis', ...cancel], 're-analysis': ['doing', ...cancel],
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
    delete workflow.references.testing;
    workflow.transitions = Object.fromEntries(workflow.states.map((state) => [state.id, workflow.states.filter((other) => other.id !== state.id).map((other) => other.id)]));
    return workflow;
}

const parsedWorkflows = new Map<string, string>();
let workflowReadCache: { configured: Map<unknown, Workflow>; legacy: Map<unknown, Workflow> } | undefined;

/** Synchronous read-only projections can resolve each workflow once. The cache
 * ends before control returns to an editor, so in-place draft edits stay fresh. */
export function withWorkflowReadCache<T>(read: () => T): T {
    if (workflowReadCache) return read();
    workflowReadCache = { configured: new Map(), legacy: new Map() };
    try { return read(); }
    finally { workflowReadCache = undefined; }
}

/** v1's shared Not started category is split by stable Backlog ID; IDs, labels, order and transitions remain unchanged. */
export function parseWorkflow(value: unknown): Workflow {
    if (!isRecord(value)) throw new Error('Invalid workflow structure.');
    // Key by content: settings drafts can edit the same object in place. Return
    // a detached value so editing a returned workflow cannot corrupt the cache.
    const key = JSON.stringify(value);
    const cached = parsedWorkflows.get(key);
    if (cached) return JSON.parse(cached);
    const input: Record<string, unknown> = JSON.parse(key);
    if (input.version === 1 && Array.isArray(input.states) && isRecord(input.references)) {
        input.version = 2;
        input.states = input.states.map((state) => ({ ...state, category: state.category === 'not-started' ? state.id === 'backlog' ? 'backlog' : 'to-do' : state.category }));
        const references: Record<string, unknown> = { ...input.references, backlog: 'backlog', 'to-do': input.references['not-started'] || input.entryStateId };
        delete references['not-started'];
        input.references = references;
    }
    assertWorkflow(input);
    if (parsedWorkflows.size >= 64) parsedWorkflows.delete(parsedWorkflows.keys().next().value!);
    parsedWorkflows.set(key, JSON.stringify(input));
    return input;
}

export type WorkflowSubject = WorkflowKind | { type?: unknown };

const WORKFLOW_TYPE_IDS: readonly WorkitemType[] = ['epic', 'story', 'task', 'bug'];
/** Projects follow this association unless their settings say otherwise. */
export const DEFAULT_FUNCTIONAL_TYPES: readonly WorkitemType[] = ['epic', 'story', 'bug'];
/** The association before it became configurable, kept for Sprint closures recorded under it. */
export const LEGACY_FUNCTIONAL_TYPES: readonly WorkitemType[] = ['epic', 'story'];

export function parseWorkflowTypes(value: unknown): WorkflowTypes | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value) || value.version !== 1 || Object.keys(value).length !== 2 || !Array.isArray(value.functional)
        || value.functional.some((type) => !WORKFLOW_TYPE_IDS.includes(type as WorkitemType)) || new Set(value.functional).size !== value.functional.length) throw new Error('Invalid extensions.workflowTypes.');
    return { version: 1, functional: WORKFLOW_TYPE_IDS.filter((type) => (value.functional as unknown[]).includes(type)) };
}

export function functionalWorkitemTypes(data?: LooseBoardData | null): WorkitemType[] {
    return [...(parseWorkflowTypes(data?.extensions?.workflowTypes)?.functional ?? DEFAULT_FUNCTIONAL_TYPES)];
}

export function workflowKind(subject?: WorkflowSubject | null, data?: LooseBoardData | null): WorkflowKind {
    if (typeof subject === 'string') return subject;
    // No subject means the project's own process: the technical workflow, which is the Board's columns.
    // Resolving it as a Task would pick the functional workflow when Tasks are configured to follow it.
    if (subject == null) return 'technical';
    const type = WORKFLOW_TYPE_IDS.includes(subject?.type as WorkitemType) ? subject!.type as WorkitemType : 'task';
    return functionalWorkitemTypes(data).includes(type) ? 'functional' : 'technical';
}

/** Moves each workitem whose type changes workflow to the state with the same
 * category in its new workflow (the category reference, else the Board entry),
 * keeping its status when that state already exists there. */
export function applyWorkflowTypes(data: BoardData, functional: readonly WorkitemType[]): number[] {
    const before = { extensions: { ...data.extensions }, board: { columns: data.board.columns } };
    const next: WorkflowTypes = { version: 1, functional: WORKFLOW_TYPE_IDS.filter((type) => functional.includes(type)) };
    const after = { ...before, extensions: { ...before.extensions, workflowTypes: next } };
    const moved: number[] = [];
    const at = nowIso();
    for (const task of data.board.tasks) {
        if (workflowKind(task, before) === workflowKind(task, after)) continue;
        const target = getWorkflow(after, task);
        if (target.states.some((state) => state.id === task.status)) continue;
        const category = statusCategory(task.status, before, task);
        task.status = target.references[category] || target.states.find((state) => state.category === category)?.id || target.entryStateId;
        task.updatedAt = at;
        moved.push(task.id);
    }
    data.extensions.workflowTypes = next;
    return moved;
}

/** Older projects share their existing process until either workflow is edited. */
export function getWorkflow(data?: LooseBoardData | null, subject?: WorkflowSubject | null): Workflow {
    const functional = workflowKind(subject, data) === 'functional' && data?.extensions?.functionalWorkflow !== undefined;
    const value = functional ? data?.extensions?.functionalWorkflow : data?.extensions?.workflow;
    const configured = functional || Boolean(value);
    const key = configured ? value : data?.board?.columns;
    const cache = configured ? workflowReadCache?.configured : workflowReadCache?.legacy;
    const cached = cache?.get(key);
    if (cached) return cached;
    const workflow = configured ? parseWorkflow(value) : legacyWorkflow(data?.board?.columns);
    cache?.set(key, workflow);
    return workflow;
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
    const tasks = data.board.tasks.filter((task) => workflowKind(task, data) === kind);
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

/** Prefer the first configured forward transition; loops can return to an earlier active state. */
export function nextWorkflowState(data: LooseBoardData, task: { type?: unknown; status: string }) {
    const workflow = getWorkflow(data, task);
    const current = workflow.states.findIndex((state) => state.id === task.status);
    if (['completed', 'cancelled'].includes(workflow.states[current]?.category)) return undefined;
    const targets = (workflow.transitions[task.status] || []).flatMap((id) => {
        const state = workflow.states.find((entry) => entry.id === id);
        return state && !['cancelled', 'backlog'].includes(state.category) ? [state] : [];
    });
    return targets.find((state) => workflow.states.indexOf(state) > current) || targets[0];
}
