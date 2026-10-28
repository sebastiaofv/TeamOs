import { WorkitemError } from '@/domain/workitems';
import type { WorkflowCategory, WorkflowKind, WorkitemAutomation } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import { allowedWorkflowDestinations, statusCategory } from '@/domain/workflow';
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
        if (!data || !task || statusCategory(task.status, data, task) === category) return false;
        const eligible = allowedWorkflowDestinations(data, task.status, category, task);
        if (!eligible.length) { await alert(translateCurrent('workflow.transitionDenied')); return false; }
        const target = eligible.length === 1 ? eligible[0].id : await choose(translateCurrent('workflow.chooseDestination'), eligible.map((state) => ({ value: state.id, label: state.name })));
        if (!target) return false;
        if (getBoardRecord(boardId)?.data.board.tasks.find((item) => item.id === taskId)?.status !== task.status) return false;
        return moveTask(boardId, taskId, target);
    }
    function setPortfolioBoardColumnVisibility(boardId: string, stateId: string, visible: boolean, kind: WorkflowKind = 'technical') {
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = cloneSerializable(data.extensions.boardView || { version: 1, hiddenStateIds: [] });
            if (!setBoardColumnVisibility(data, stateId, visible, kind)) return false;
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
    return { saveWorkitemAutomation, movePortfolioTaskToCategory, setPortfolioBoardColumnVisibility };
}
