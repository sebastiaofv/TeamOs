import type { Workflow } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import { applyWorkflow, getWorkflow } from '@/domain/workflow';
import { appendTimelineEvent } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';

export function createWorkflowActions({ runPortfolioBoardMutation }: BoardMutationContext) {
    function saveWorkflow(boardId: string, workflow: Workflow, relocations: Record<string, string>, onMutated: () => void) {
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = getWorkflow(data);
            const beforeStatuses = Object.fromEntries(data.board.tasks.map((task) => [task.id, task.status]));
            applyWorkflow(data, workflow, relocations);
            appendTimelineEvent(data, { kind: 'workflow.updated', entityType: 'board', entityId: 'board', summary: 'Workflow updated',
                snapshot: createBoardStateSnapshot(data), meta: { beforeWorkflow: before, beforeStatuses } });
            return true;
        }, { onMutated });
    }
    return { saveWorkflow };
}
