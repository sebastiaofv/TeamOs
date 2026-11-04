import type { LooseBoardData, TaskInput } from './types';
import { getWorkflow } from './workflow';

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
