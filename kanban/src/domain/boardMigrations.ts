import type { LooseBoardData, TaskInput } from './types';
import { getWorkflow } from './workflow';

/** v1/v2 → v3: keep legacy participants/responsibility and default missing PR links to an empty list.
 * History and IDs are preserved rather than fabricating assignment events.
 * Task normalization resolves legacy assignee/assignees and name duplicates.
 */
export function migrateBoardData(input: LooseBoardData): LooseBoardData {
    // v4 → v5 adds optional persisted display IDs. Never synthesize IDs for old items.
    if (input.meta?.schemaVersion === 4) return { ...input, meta: { ...input.meta, schemaVersion: 5 } };
    if (![1, 2, 3].includes(Number(input.meta?.schemaVersion))) return input;
    const workflow = getWorkflow(input);
    return {
        ...input,
        meta: { ...input.meta, schemaVersion: 5 },
        extensions: { ...input.extensions, workflow: input.extensions?.workflow || workflow },
        board: {
            ...input.board,
            columns: workflow.states.map((s) => ({ status: s.id, title: s.name })),
            tasks: Array.isArray(input.board?.tasks)
                ? input.board.tasks.map((task: TaskInput) => ({ ...task, type: task.type ?? 'task', parentId: task.parentId ?? null, phaseMode: task.phaseMode ?? (task.phaseId ? 'explicit' : 'none'), milestoneMode: task.milestoneMode ?? (task.milestoneId ? 'explicit' : 'none'), responsible: task.responsible ?? '', pullRequests: task.pullRequests === undefined ? [] : task.pullRequests })) : input.board?.tasks
        }
    };
}
