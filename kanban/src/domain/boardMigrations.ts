import type { LooseBoardData, TaskInput } from './types';
import { defaultWorkflow } from './workflow';

/** v1 → v2: legacy allocations are participants; responsibility stays undefined.
 * History and IDs are preserved rather than fabricating assignment events.
 * Task normalization resolves legacy assignee/assignees and name duplicates.
 */
export function migrateBoardData(input: LooseBoardData): LooseBoardData {
    if (input.meta?.schemaVersion !== 1 && input.meta?.schemaVersion !== 2) return input;
    const workflow = defaultWorkflow();
    return {
        ...input,
        meta: { ...input.meta, schemaVersion: 3 },
        extensions: { ...input.extensions, workflow: input.extensions?.workflow || workflow },
        board: {
            ...input.board,
            columns: workflow.states.map((s) => ({ status: s.id, title: s.name })),
            tasks: Array.isArray(input.board?.tasks)
                ? input.board.tasks.map((task: TaskInput) => ({ ...task, responsible: task.responsible ?? '' })) : input.board?.tasks
        }
    };
}
