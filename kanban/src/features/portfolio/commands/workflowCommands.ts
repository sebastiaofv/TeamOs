import { WorkitemError } from '@/domain/workitems';
import type { Workflow, WorkflowCategory, WorkitemAutomation } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import { allowedWorkflowDestinations, applyWorkflow, getWorkflow, statusCategory } from '@/domain/workflow';
import { appendTimelineEvent } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { translateCurrent } from '@/shared/i18n';
import { setBoardColumnVisibility } from '@/domain/boardView';
import { cloneSerializable } from '@/domain/serializable';

export function createWorkflowActions({ runPortfolioBoardMutation, getBoardRecord, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable, alert, choose }: BoardMutationContext,
    moveTask: (boardId: string, taskId: number, status: unknown) => Promise<boolean>) {
    async function movePortfolioTaskToCategory(boardId: string, taskId: number, category: WorkflowCategory): Promise<boolean> {
        if (!canUsePortfolioTaskMutations(boardId)) { notifyPortfolioMutationUnavailable(boardId); return false; }
        const data = getBoardRecord(boardId)?.data;
        const task = data?.board.tasks.find((item) => item.id === taskId);
        if (!data || !task || statusCategory(task.status, data) === category) return false;
        const eligible = allowedWorkflowDestinations(data, task.status, category);
        if (!eligible.length) { await alert(translateCurrent('workflow.transitionDenied')); return false; }
        const target = eligible.length === 1 ? eligible[0].id : await choose(translateCurrent('workflow.chooseDestination'), eligible.map((state) => ({ value: state.id, label: state.name })));
        if (!target) return false;
        if (getBoardRecord(boardId)?.data.board.tasks.find((item) => item.id === taskId)?.status !== task.status) return false;
        return moveTask(boardId, taskId, target);
    }
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
    function setPortfolioBoardColumnVisibility(boardId: string, stateId: string, visible: boolean) {
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = cloneSerializable(data.extensions.boardView || { version: 1, hiddenStateIds: [] });
            if (!setBoardColumnVisibility(data, stateId, visible)) return false;
            appendTimelineEvent(data, { kind: 'board.columns.visibility.changed', entityType: 'board', entityId: 'board', summary: translateCurrent('board.columnVisibilityChanged'),
                changes: { boardView: { before, after: cloneSerializable(data.extensions.boardView) } } });
            return true;
        });
    }
    function saveWorkitemAutomation(boardId: string, config: WorkitemAutomation, expected?: string) {
        return runPortfolioBoardMutation(boardId, (data) => {
            if (expected !== undefined && JSON.stringify(data.extensions.workitemAutomation ?? null) !== expected) throw new WorkitemError('stale');
            data.extensions.workitemAutomation = cloneSerializable(config);
            appendTimelineEvent(data, { kind: 'board.workitems.updated', entityType: 'board', entityId: 'board', summary: translateCurrent('workitems.automation'), snapshot: createBoardStateSnapshot(data) });
            return true;
        });
    }
    return { saveWorkitemAutomation, saveWorkflow, movePortfolioTaskToCategory, setPortfolioBoardColumnVisibility };
}
