import type { LooseBoardData, TaskInput } from './types';

/** v1/v2 → v3: keep legacy participants/responsibility and default missing PR links to an empty list.
 * History and IDs are preserved rather than fabricating assignment events.
 * Task normalization resolves legacy assignee/assignees and name duplicates.
 */
export function migrateBoardData(input: LooseBoardData): LooseBoardData {
    if (input.meta?.schemaVersion !== 1 && input.meta?.schemaVersion !== 2) return input;
    return {
        ...input,
        meta: { ...input.meta, schemaVersion: 3 },
        board: {
            ...input.board,
            tasks: Array.isArray(input.board?.tasks)
                ? input.board.tasks.map((task: TaskInput) => ({ ...task, responsible: task.responsible ?? '', pullRequests: task.pullRequests === undefined ? [] : task.pullRequests })) : input.board?.tasks
        }
    };
}
