import type { LooseBoardData, TaskInput } from './types';

/** v1 → v2: legacy allocations are participants; responsibility stays undefined.
 * History and IDs are preserved rather than fabricating assignment events.
 * Task normalization resolves legacy assignee/assignees and name duplicates.
 */
export function migrateBoardData(input: LooseBoardData): LooseBoardData {
    if (input.meta?.schemaVersion !== 1) return input;
    return {
        ...input,
        meta: { ...input.meta, schemaVersion: 2 },
        board: {
            ...input.board,
            tasks: Array.isArray(input.board?.tasks)
                ? input.board.tasks.map((task: TaskInput) => ({ ...task, responsible: task.responsible ?? '' })) : input.board?.tasks
        }
    };
}
