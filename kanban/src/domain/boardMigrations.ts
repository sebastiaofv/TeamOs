import type { LooseBoardData, TaskInput } from './types';
import { DEFAULT_FUNCTIONAL_TYPES, getWorkflow, LEGACY_FUNCTIONAL_TYPES, statusCategory } from './workflow';

/** v1/v2 → v3: keep legacy participants/responsibility and default missing PR links to an empty list.
 * History and IDs are preserved rather than fabricating assignment events.
 * Task normalization resolves legacy assignee/assignees and name duplicates.
 */
export function migrateBoardData(input: LooseBoardData): LooseBoardData {
    // v4 → v5 added display IDs; v6 adds product/transfer support. Permanent
    // identities are assigned after project migration during normalization.
    if ([4, 5].includes(Number(input.meta?.schemaVersion))) return { ...input, meta: { ...input.meta, schemaVersion: 6 } };
    if (![1, 2, 3].includes(Number(input.meta?.schemaVersion))) return input;
    const workflow = getWorkflow(input);
    return {
        ...input,
        meta: { ...input.meta, schemaVersion: 6 },
        extensions: { ...input.extensions, workflow: input.extensions?.workflow || workflow },
        board: {
            ...input.board,
            columns: workflow.states.map((s) => ({ status: s.id, title: s.name })),
            tasks: Array.isArray(input.board?.tasks)
                ? input.board.tasks.map((task: TaskInput) => ({ ...task, type: task.type ?? 'task', parentId: task.parentId ?? null, phaseMode: task.phaseMode ?? (task.phaseId ? 'explicit' : 'none'), milestoneMode: task.milestoneMode ?? (task.milestoneId ? 'explicit' : 'none'), responsible: task.responsible ?? '', pullRequests: task.pullRequests === undefined ? [] : task.pullRequests })) : input.board?.tasks
        }
    };
}

/** Projects saved before workitem types could choose their workflow adopt the
 * default association, which moves Bugs to the functional workflow. A Bug whose
 * status is not part of that workflow moves to the state of the same category. */
export function migrateWorkflowTypes(input: LooseBoardData): LooseBoardData {
    if (!input.extensions || input.extensions.workflowTypes !== undefined || !Array.isArray(input.board?.tasks)) return input;
    const workflowTypes = { version: 1, functional: [...DEFAULT_FUNCTIONAL_TYPES] };
    if (input.extensions.functionalWorkflow === undefined) return { ...input, extensions: { ...input.extensions, workflowTypes } };
    const legacy = { ...input, extensions: { ...input.extensions, workflowTypes: { version: 1, functional: [...LEGACY_FUNCTIONAL_TYPES] } } };
    const functional = getWorkflow({ ...input, extensions: { ...input.extensions, workflowTypes } }, 'functional');
    const tasks = (input.board.tasks as TaskInput[]).map((task) => {
        if (task?.type !== 'bug' || typeof task.status !== 'string' || functional.states.some((state) => state.id === task.status)) return task;
        const category = statusCategory(task.status, legacy, { type: 'bug' });
        return { ...task, status: functional.references[category] || functional.states.find((state) => state.category === category)?.id || functional.entryStateId };
    });
    return { ...input, extensions: { ...input.extensions, workflowTypes }, board: { ...input.board, tasks } };
}
